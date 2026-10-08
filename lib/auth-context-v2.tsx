// lib/auth-context-v2.tsx
import * as AuthToken from "@/lib/_core/auth";
import { clearOtpSession, setOtpSession } from "@/lib/otp-session";
import { setSentryUser } from "@/lib/sentry";
import { resetAllStores } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { devLog } from "@/lib/dev-log";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Method = "phone" | "email";
type Purpose = "signup" | "login";

export type User = {
  id: string;
  email?: string;
  phone?: string;

  firstName: string;
  lastName: string;
  name?: string;

  createdAt: string;

  isDriver?: boolean;
  gender?: string;
  isStudent?: boolean;
  collegeEmail?: string;
  studentFreeRidesUsed?: number;
  studentFreeRidesEarned?: number;
  isStudentVerified?: boolean;
  studentUniversityName?: string;
  studentUniversityDomain?: string;

  averageRating?: number;
  totalRides?: number;
  totalEarnings?: number;

  profilePhoto?: string;
};

type AuthContextType = {
  user: User | null;

  // means we called /me at least once this boot
  sessionChecked: boolean;

  isLoading: boolean;
  isSignedIn: boolean;

  /** True right after OTP verify succeeds — used to show post-login loading screen */
  justLoggedIn: boolean;
  clearJustLoggedIn: () => void;

  requestOtp: (input: {
    method: Method;
    destination: string;
    purpose: Purpose;
  }) => Promise<void>;

  loginWithPassword: (input: {
    method: Method;
    destination: string;
    password: string;
  }) => Promise<{ passwordNotConfigured: true } | void>;

  registerWithPassword: (input: {
    method: Method;
    destination: string;
    password: string;
    firstName: string;
    lastName: string;
    email?: string;
    gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
    role?: "user" | "driver";
    isStudent?: boolean;
    collegeEmail?: string;
  }) => Promise<void>;

  verifyOtp: (input: {
    method: Method;
    destination: string;
    code: string;
    purpose: Purpose;
    firstName?: string;
    lastName?: string;
    email?: string;
    gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
    role?: "user" | "driver";
    isStudent?: boolean;
    collegeEmail?: string;
    password?: string;
    card?: {
      cardType: "visa" | "mastercard" | "amex" | "discover";
      last4: string;
      holderName: string;
      expiryMonth: number;
      expiryYear: number;
    };
    legalVersion?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    acceptCommunity?: boolean;
    termsAcceptedAt?: string;
    privacyAcceptedAt?: string;
    communityAcceptedAt?: string;
    deviceInfo?: string;
  }) => Promise<{ cardSaved?: boolean }>;

  requestPasswordReset: (input: { method: Method; destination: string }) => Promise<void>;
  verifyPasswordResetOtp: (input: { method: Method; destination: string; code: string }) => Promise<string>;
  resetPassword: (input: { method: Method; destination: string; resetToken: string; newPassword: string }) => Promise<void>;

  socialAuth: (input: {
    provider: "google" | "apple";
    idToken: string;
    firstName?: string;
    lastName?: string;
    legalVersion?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    acceptCommunity?: boolean;
    termsAcceptedAt?: string;
    privacyAcceptedAt?: string;
    communityAcceptedAt?: string;
    deviceInfo?: string;
  }) => Promise<{ isNewUser: boolean }>;

  refetchUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_CACHE_KEY = "auth_user_cache_v1";

function toNumber(v: unknown, fallback = 0) {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function normalizeUser(raw: any): User | null {
  if (!raw || typeof raw !== "object") return null;

  const id = raw.id != null ? String(raw.id) : "";
  if (!id) return null;

  const firstName = typeof raw.firstName === "string" ? raw.firstName : "";
  const lastName = typeof raw.lastName === "string" ? raw.lastName : "";
  const name = typeof raw.name === "string" ? raw.name : undefined;

  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.length > 0
      ? raw.createdAt
      : new Date().toISOString();

  return {
    id,
    email: typeof raw.email === "string" ? raw.email : undefined,
    phone: typeof raw.phone === "string" ? raw.phone : undefined,

    firstName,
    lastName,
    name,

    createdAt,

    isDriver: typeof raw.isDriver === "boolean" ? raw.isDriver : undefined,
    gender: typeof raw.gender === "string" ? raw.gender : undefined,
    isStudent: typeof raw.isStudent === "boolean" ? raw.isStudent : undefined,
    collegeEmail: typeof raw.collegeEmail === "string" ? raw.collegeEmail : undefined,
    studentFreeRidesUsed: toNumber(raw.studentFreeRidesUsed, undefined as any),
    studentFreeRidesEarned: toNumber(raw.studentFreeRidesEarned, undefined as any),
    isStudentVerified: typeof raw.isStudentVerified === "boolean" ? raw.isStudentVerified : undefined,
    studentUniversityName: typeof raw.studentUniversityName === "string" ? raw.studentUniversityName : undefined,
    studentUniversityDomain: typeof raw.studentUniversityDomain === "string" ? raw.studentUniversityDomain : undefined,

    averageRating: toNumber(raw.averageRating, undefined as any),
    totalRides: toNumber(raw.totalRides, undefined as any),
    totalEarnings: toNumber(raw.totalEarnings, undefined as any),

    profilePhoto:
      typeof raw.profilePhoto === "string" ? raw.profilePhoto : undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [booting, setBooting] = useState(true);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    enabled: false,
    // Never auto-fire — the session check runs once on mount via refetchUser()
    // and is skipped entirely when no session token exists. Everything else is explicit.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const utils = trpc.useUtils();

  const requestOtpMutation = trpc.auth.requestOtp.useMutation();
  const verifyOtpMutation = trpc.auth.verifyOtp.useMutation();
  const loginWithPasswordMutation = trpc.auth.loginWithPassword.useMutation();
  const registerWithPasswordMutation = trpc.auth.registerWithPassword.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const requestPasswordResetMutation = trpc.auth.requestPasswordReset.useMutation();
  const verifyPasswordResetOtpMutation = trpc.auth.verifyPasswordResetOtp.useMutation();
  const resetPasswordMutation = trpc.auth.resetPassword.useMutation();
  const socialAuthMutation = trpc.auth.socialAuth.useMutation();

  const isSignedIn = sessionChecked && !!user;

  useEffect(() => {
    (async () => {
      // Skip the /me round-trip entirely when no session token exists.
      // A user landing on /auth/sign-in-v2 (or any public auth page) never
      // has a token, so calling /me would always return 401 and spam the server.
      const token = await AuthToken.getSessionToken();
      if (!token) {
        devLog("[Auth] no session token — skipping /me check");
        // Clear any stale cache that survived a crash or partial sign-out.
        await AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
        setSessionChecked(true);
        setBooting(false);
        return;
      }

      let hadCachedUser = false;

      try {
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const normalized = normalizeUser(parsed);
          if (normalized) {
            hadCachedUser = true;
            setUser(normalized);
            devLog("[Auth] restored user from cache, id:", normalized.id);
            setSessionChecked(true);
            setBooting(false);
          }
        }
      } catch {}

      try {
        await refetchUser();
      } finally {
        if (!hadCachedUser) setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refetchUser() {
    devLog("[Auth] checking session…");
    try {
      const res = await meQuery.refetch();
      setSessionChecked(true);

      const rawUser = (res.data as any)?.user;
      const normalized = normalizeUser(rawUser);

      if (normalized) {
        setUser(normalized);
        devLog("[Auth] session valid, user id:", normalized.id);
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized));
      } else {
        // Server returned success but no user => session expired/revoked
        setUser(null);
        devLog("[Auth] /me returned no user — clearing session");
        await AsyncStorage.removeItem(USER_CACHE_KEY);
      }
    } catch (err: any) {
      setSessionChecked(true);

      // Only clear user on explicit auth errors (401/UNAUTHORIZED)
      // Network errors, timeouts, server errors should NOT log user out
      const isAuthError =
        err?.data?.code === "UNAUTHORIZED" ||
        err?.message?.includes("10001") ||
        err?.message?.includes("Please login") ||
        err?.shape?.data?.code === "UNAUTHORIZED";

      if (isAuthError) {
        // Session truly expired or was revoked — clear everything
        setUser(null);
        devLog("[Auth] 401 from /me — session expired or invalid");
        await AsyncStorage.removeItem(USER_CACHE_KEY);
      }
      // Network / server error: keep cached user logged in (offline-friendly)
    }
  }

  async function requestOtp(input: {
    method: Method;
    destination: string;
    purpose: Purpose;
  }) {
    await requestOtpMutation.mutateAsync(input);
    setOtpSession(input);
  }

  async function verifyOtp(input: {
    method: Method;
    destination: string;
    code: string;
    purpose: Purpose;
    firstName?: string;
    lastName?: string;
    email?: string;
    gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
    role?: "user" | "driver";
    isStudent?: boolean;
    collegeEmail?: string;
    legalVersion?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    acceptCommunity?: boolean;
    termsAcceptedAt?: string;
    privacyAcceptedAt?: string;
    communityAcceptedAt?: string;
    deviceInfo?: string;
    password?: string;
    card?: {
      cardType: "visa" | "mastercard" | "amex" | "discover";
      last4: string;
      holderName: string;
      expiryMonth: number;
      expiryYear: number;
    };
  }) {
    const result = await verifyOtpMutation.mutateAsync(input);
    clearOtpSession();

    // Store session token for native Bearer auth (cookies don't work cross-origin)
    if (result.sessionToken) {
      await AuthToken.setSessionToken(result.sessionToken);
    }

    // Use returned user data directly — avoids auth.me round-trip race condition
    if (result.user) {
      const normalized = normalizeUser(result.user);
      if (normalized) {
        // Batch ALL three setState calls together before any further await.
        // On Android, React 18 may commit state updates between microtask
        // boundaries, so setJustLoggedIn must land in the same batch as
        // setUser/setSessionChecked to prevent sign-in's isSignedIn watcher
        // from seeing justLoggedIn=false and firing a competing navigation.
        setUser(normalized);
        setSessionChecked(true);
        setJustLoggedIn(true);
        setSentryUser({ id: Number(normalized.id), name: normalized.name, email: normalized.email ?? undefined });
        // Fire-and-forget — cache write must not block the state commit above
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized)).catch(() => {});
      } else {
        await refetchUser();
        setJustLoggedIn(true);
      }
    } else {
      await refetchUser();
      setJustLoggedIn(true);
    }

    return { cardSaved: (result as any).cardSaved ?? false };
  }

  async function loginWithPassword(input: {
    method: Method;
    destination: string;
    password: string;
  }): Promise<{ passwordNotConfigured: true } | void> {
    const result = await loginWithPasswordMutation.mutateAsync(input);
    if ((result as any).status === "PASSWORD_NOT_CONFIGURED") {
      return { passwordNotConfigured: true };
    }
    const r = result as any;
    if (r.sessionToken) {
      await AuthToken.setSessionToken(r.sessionToken);
    }
    if (r.user) {
      const normalized = normalizeUser(r.user);
      if (normalized) {
        setUser(normalized);
        setSessionChecked(true);
        setJustLoggedIn(true);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized)).catch(() => {});
      } else {
        await refetchUser();
        setJustLoggedIn(true);
      }
    } else {
      await refetchUser();
      setJustLoggedIn(true);
    }
    return;
  }

  async function registerWithPassword(input: {
    method: Method;
    destination: string;
    password: string;
    firstName: string;
    lastName: string;
    email?: string;
    gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
    role?: "user" | "driver";
    isStudent?: boolean;
    collegeEmail?: string;
  }) {
    const result = await registerWithPasswordMutation.mutateAsync(input);
    if (result.sessionToken) {
      await AuthToken.setSessionToken(result.sessionToken);
    }
    if (result.user) {
      const normalized = normalizeUser(result.user);
      if (normalized) {
        setUser(normalized);
        setSessionChecked(true);
        setJustLoggedIn(true);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized)).catch(() => {});
      } else {
        await refetchUser();
        setJustLoggedIn(true);
      }
    } else {
      await refetchUser();
      setJustLoggedIn(true);
    }
  }

  async function requestPasswordReset(input: { method: Method; destination: string }) {
    await requestPasswordResetMutation.mutateAsync(input);
  }

  async function verifyPasswordResetOtp(input: { method: Method; destination: string; code: string }): Promise<string> {
    const result = await verifyPasswordResetOtpMutation.mutateAsync(input);
    return result.resetToken;
  }

  async function resetPassword(input: { method: Method; destination: string; resetToken: string; newPassword: string }) {
    await resetPasswordMutation.mutateAsync(input);
  }

  async function socialAuth(input: {
    provider: "google" | "apple";
    idToken: string;
    firstName?: string;
    lastName?: string;
    legalVersion?: string;
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    acceptCommunity?: boolean;
    termsAcceptedAt?: string;
    privacyAcceptedAt?: string;
    communityAcceptedAt?: string;
    deviceInfo?: string;
  }): Promise<{ isNewUser: boolean }> {
    const result = await socialAuthMutation.mutateAsync(input);
    await refetchUser();
    setJustLoggedIn(true);
    return { isNewUser: result.isNewUser };
  }

  async function signOut() {
    devLog("[Auth] signing out");
    try {
      await logoutMutation.mutateAsync();
    } catch {}

    clearOtpSession();
    setSentryUser(null);
    resetAllStores();
    setUser(null);
    // Invalidate all cached tRPC queries so stale authenticated data cannot
    // appear on any screen after sign-out
    utils.invalidate();
    await AsyncStorage.removeItem(USER_CACHE_KEY);

    try {
      await AuthToken.removeSessionToken?.();
    } catch {}

    setSessionChecked(true);
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      sessionChecked,

      // loading until we've attempted /me at least once
      isLoading: booting || !sessionChecked,

      isSignedIn,
      justLoggedIn,
      clearJustLoggedIn: () => setJustLoggedIn(false),
      requestOtp,
      loginWithPassword,
      registerWithPassword,
      verifyOtp,
      requestPasswordReset,
      verifyPasswordResetOtp,
      resetPassword,
      socialAuth,
      refetchUser,
      signOut,
    }),
    [user, sessionChecked, booting, isSignedIn, justLoggedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
