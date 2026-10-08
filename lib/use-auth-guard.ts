import { devLog } from "@/lib/dev-log";
// ponytail: usePathname is in expo-router/build/hooks but missing from the index type chain in this project — import directly
import { usePathname } from "expo-router/build/hooks";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "./auth-context-v2";
import { trpc } from "./trpc";

/**
 * Global auth guard. Call once at the root layout level (RootLayoutNav).
 *
 * Unauthenticated on protected route → replace to /auth/sign-in-v2
 * Authenticated on auth route → replace to /(tabs)
 * Unauthenticated on public route → do nothing (no redirect, no auth.me loop)
 */
export function useAuthGuard() {
  const { isSignedIn, isLoading, sessionChecked, justLoggedIn } = useAuth();
  const router = useRouter();
  const utils = trpc.useUtils();
  const redirectingRef = useRef(false);
  const pathname = usePathname();

  const isAuthRoute =
    pathname?.startsWith("/auth") ||
    pathname?.startsWith("/(auth)") ||
    pathname?.includes("sign-in-v2") ||
    pathname?.includes("sign-up") ||
    pathname?.includes("verify-otp") ||
    pathname?.includes("enroll-password") ||
    pathname?.includes("forgot-password") ||
    pathname?.includes("reset-password") ||
    pathname?.includes("create-password");

  devLog("[AuthGuard] pathname:", pathname, "isAuthRoute:", isAuthRoute);

  useEffect(() => {
    if (isLoading || !sessionChecked || justLoggedIn) return;

    if (!isSignedIn && isAuthRoute) {
      // Unauthenticated on public auth screen — correct state, do nothing
      redirectingRef.current = false;
      return;
    }

    if (!isSignedIn && !isAuthRoute) {
      // Unauthenticated on protected route — redirect to sign-in
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      devLog("[AuthGuard] unauthenticated on protected route, redirecting to sign-in");
      utils.invalidate();
      router.replace("/auth/sign-in-v2");
      return;
    }

    if (isSignedIn && isAuthRoute) {
      // Authenticated user on auth route — redirect to app home
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      devLog("[AuthGuard] authenticated user on auth route, redirecting to home");
      router.replace("/(tabs)");
      return;
    }

    // isSignedIn && !isAuthRoute — normal authenticated app usage
    redirectingRef.current = false;
  }, [pathname, isAuthRoute, isSignedIn, isLoading, sessionChecked, justLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps -- router/utils are stable refs
}
