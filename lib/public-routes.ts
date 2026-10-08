/**
 * Centralized public-route detection used by auth-context and auth-guard.
 * Any route that does NOT require authentication must be listed here.
 * Add new public auth routes to PUBLIC_AUTH_PATHS only.
 */

const PUBLIC_AUTH_PATHS = new Set([
  "/auth",
  "/auth/sign-in",
  "/auth/sign-in-v2",
  "/auth/sign-up",
  "/auth/sign-up-v2",
  "/auth/otp",
  "/auth/verify-otp",
  "/auth/create-password",
  "/auth/enroll-password",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

// Root navigator segment names (Expo Router) that are public.
// "auth" covers all /auth/* screens; "oauth" covers the OAuth callback flow.
const PUBLIC_AUTH_SEGMENTS = new Set(["auth", "oauth"]);

/** Returns true when the full Expo Router pathname is a public auth screen. */
export function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

/** Returns true when the root-navigator segment name is a public auth segment. */
export function isPublicAuthSegment(segment: string | null | undefined): boolean {
  return segment == null || PUBLIC_AUTH_SEGMENTS.has(segment);
}
