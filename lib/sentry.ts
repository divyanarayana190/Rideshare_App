import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

const DSN = Constants.expoConfig?.extra?.sentryDsn as string | undefined;

export function initSentry() {
  if (!DSN) return; // No-op in dev when DSN is not configured
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? "development" : "production",
    // Capture 100% of transactions in dev, 20% in production
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // Attach JS stack traces to all logged errors
    attachStacktrace: true,
    // Ignore common non-actionable network errors
    ignoreErrors: [
      "Network request failed",
      "Load failed",
      "The network connection was lost",
    ],
  });
}

/** Identify the logged-in user so errors are linked to their account. */
export function setSentryUser(user: { id: number; name?: string; email?: string } | null) {
  if (!DSN) return;
  if (user) {
    Sentry.setUser({ id: String(user.id), username: user.name, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}

/** Manually capture an error (use in catch blocks for non-fatal errors). */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) {
    console.error("[Sentry disabled]", error, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

/** Log a breadcrumb for important user actions (helps trace errors). */
export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>) {
  if (!DSN) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };
