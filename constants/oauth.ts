// constants/oauth.ts
import * as Linking from "expo-linking";
import { Platform } from "react-native";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "space.manus.rideshare.app.t20260228214552";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;

// If you set this in .env, it overrides everything.
// Example:
// EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
export const API_BASE_URL = env.apiBaseUrl;

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

/**
 * IMPORTANT:
 * Your backend is on port 3001 (NOT 3000).
 */
const API_PORT = 3001;

/**
 * If you are running on a REAL phone, set this to your laptop LAN IP, e.g.
 * const DEV_LAN_IP = "192.168.1.20";
 * and uncomment the return below.
 */
const DEV_LAN_IP = process.env.EXPO_PUBLIC_DEV_LAN_IP ?? ""; // set in .env for local real-device testing only

/**
 * Get the API base URL.
 * Priority:
 * 1) EXPO_PUBLIC_API_BASE_URL (recommended)
 * 2) Web: derive from window.location
 * 3) Native: choose based on platform (android emulator / ios sim / real device)
 */
export function getApiBaseUrl(): string {
  // 1) Explicit env wins
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, "");

  // 2) Web: derive from current window
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;

    // localhost / 127.0.0.1
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:${API_PORT}`;
    }

    // sandbox pattern: 8081-xxxxx -> 3001-xxxxx
    // Example: https://8081-abc.region.domain -> https://3001-abc.region.domain
    const apiHostname = hostname.replace(/^8081-/, `${API_PORT}-`);
    if (apiHostname !== hostname) return `${protocol}//${apiHostname}`;

    // If we reach here, we don't know how to derive it safely
    throw new Error(
      `[getApiBaseUrl] Unable to derive API URL from hostname="${hostname}". Set EXPO_PUBLIC_API_BASE_URL.`,
    );
  }

  // 3) Native
  // Real phone (LAN IP)
  if (DEV_LAN_IP) {
    return `http://${DEV_LAN_IP}:${API_PORT}`;
  }

  // Android emulator
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${API_PORT}`;
  }

  // iOS simulator
  return `http://localhost:${API_PORT}`;
}

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") return globalThis.btoa(value);
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) return BufferImpl.from(value, "utf-8").toString("base64");
  return value;
};

/**
 * Redirect URI:
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  }
  return Linking.createURL("/oauth/callback", { scheme: env.deepLinkScheme });
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = loginUrl;
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
