import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { ForbiddenError } from "../../shared/_core/errors.js";
import {
  AXIOS_TIMEOUT_MS,
  COOKIE_NAME,
  ONE_YEAR_MS,
} from "../../shared/const.js";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
} from "./types/manusTypes";

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** Incremented on every password reset so old tokens are rejected after a reset. */
  sv?: number; // sessionVersion — short key keeps JWT compact
};

if (process.env.NODE_ENV !== "production") {
  process.stdout.write(`[Auth] COOKIE_NAME = ${COOKIE_NAME}\n`);
}

// OAuth endpoints (kept for code-exchange flows; NOT used for session recovery)
const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    if (process.env.NODE_ENV !== "production" && ENV.oAuthServerUrl) {
      process.stdout.write(`[OAuth] Initialized with baseURL: ${ENV.oAuthServerUrl}\n`);
    }
  }

  private decodeState(state: string): string {
    const redirectUri = atob(state);
    return redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string,
  ): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload,
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse,
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      },
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }


  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined,
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string"),
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  private inferLoginMethodFromOpenId(openId: string): string | null {
    // Matches your current openId format like: otp:phone:2015554365
    if (openId.startsWith("otp:phone:")) return "phone";
    if (openId.startsWith("otp:email:")) return "email";
    if (openId.startsWith("google:")) return "google";
    if (openId.startsWith("apple:")) return "apple";
    return null;
  }

  /**
   * Exchange OAuth authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null,
    );

    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; sessionVersion?: number } = {},
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name?.trim() || "User",
        sv: options.sessionVersion,
      },
      options,
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    const claims: Record<string, unknown> = {
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    };
    if (payload.sv !== undefined) claims.sv = payload.sv;

    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  /** Canonical openId + DB lookup (no auto-provision). Used by WebSocket auth. */
  async lookupUserByOpenId(rawOpenId: string): Promise<User | null> {
    const toCanonical = (oid: string) => {
      if (oid.startsWith("otp:")) return oid;
      if (oid.startsWith("phone:")) return `otp:${oid}`;
      if (oid.startsWith("email:")) return `otp:${oid}`;
      return oid;
    };

    const canonicalOpenId = toCanonical(rawOpenId);
    let user = await db.getUserByOpenId(canonicalOpenId);
    const legacyOpenId = canonicalOpenId.startsWith("otp:")
      ? canonicalOpenId.replace(/^otp:/, "")
      : canonicalOpenId;
    if (!user && legacyOpenId !== canonicalOpenId) {
      user = await db.getUserByOpenId(legacyOpenId);
    }
    return user ?? null;
  }

  async resolveUserFromToken(token: string): Promise<User | null> {
    const session = await this.verifySession(token);
    if (!session) return null;
    return this.lookupUserByOpenId(session.openId);
  }

  async verifySession(
    cookieValue: string | undefined | null,
  ): Promise<{ openId: string; appId: string; name: string; sv?: number } | null> {
    if (!cookieValue) return null;

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });

      const { openId, appId, name, sv } = payload as Record<string, unknown>;

      // Required for session validity
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId)) return null;

      return {
        openId,
        appId,
        name: typeof name === "string" ? name : "",
        sv: typeof sv === "number" ? sv : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Authenticate request from either:
   * - Bearer token (Authorization: Bearer <jwt>)
   * - Cookie (COOKIE_NAME)
   *
   * IMPORTANT:
   * - DO NOT call OAuth to "sync" user.
   * - If session is valid but DB user is missing (in-memory / restart), auto-create.
   */
  async authenticateRequest(req: Request): Promise<User> {
    const authHeader =
      req.headers.authorization || (req.headers as any).Authorization;

    let bearer: string | undefined;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      bearer = authHeader.slice("Bearer ".length).trim();
    }

    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = bearer || cookies.get(COOKIE_NAME);

    if (!sessionCookie) throw ForbiddenError("Missing session cookie");

    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session cookie");

    const signedInAt = new Date();

    // ✅ Canonicalize openId formats to avoid collisions
    const rawOpenId = session.openId;

    const toCanonical = (oid: string) => {
      if (oid.startsWith("otp:")) return oid;
      if (oid.startsWith("phone:")) return `otp:${oid}`; // phone:123 -> otp:phone:123
      if (oid.startsWith("email:")) return `otp:${oid}`;
      return oid;
    };

    const canonicalOpenId = toCanonical(rawOpenId);

    // ✅ Try canonical first
    let user = await db.getUserByOpenId(canonicalOpenId);

    // ✅ If not found, try legacy (for backward compatibility)
    // If canonical is otp:phone:xxxx -> legacy is phone:xxxx
    const legacyOpenId = canonicalOpenId.startsWith("otp:")
      ? canonicalOpenId.replace(/^otp:/, "")
      : canonicalOpenId;

    if (!user && legacyOpenId !== canonicalOpenId) {
      user = await db.getUserByOpenId(legacyOpenId);
    }

    // ✅ If we found legacy user, migrate it to canonical so future lookups are correct
    if (
      user &&
      user.openId === legacyOpenId &&
      legacyOpenId !== canonicalOpenId
    ) {
      await db.upsertUser({
        openId: canonicalOpenId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod:
          (user.loginMethod as any) ??
          this.inferLoginMethodFromOpenId(canonicalOpenId),
        lastSignedIn: signedInAt,
      });

      // reload canonical row
      user = await db.getUserByOpenId(canonicalOpenId);
    }

    // ✅ If still missing, auto-provision (rare)
    if (!user) {
      const loginMethod = this.inferLoginMethodFromOpenId(canonicalOpenId);

      await db.upsertUser({
        openId: canonicalOpenId,
        name: session.name?.trim() ? session.name.trim() : "User",
        email: null,
        loginMethod,
        lastSignedIn: signedInAt,
      });

      user = await db.getUserByOpenId(canonicalOpenId);
    }

    if (!user) throw ForbiddenError("User not found");

    // Session version check: if the JWT carries a version (sv), it must match the
    // DB's current sessionVersion. Tokens issued before this feature lack sv and
    // are still accepted for backward compatibility (they'll get a fresh sv on next login).
    if (session.sv !== undefined && user.sessionVersion !== session.sv) {
      throw ForbiddenError("Session invalidated. Please log in again.");
    }

    // Update lastSignedIn on the canonical openId
    await db.upsertUser({
      openId: canonicalOpenId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
