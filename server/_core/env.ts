import "dotenv/config";
import logger from "../logger";

const isProduction = process.env.NODE_ENV === "production";

// ── Known insecure placeholder values — reject in all environments ────────────
const PLACEHOLDER_SECRETS = new Set([
  "supersecret_dev_key_123",
  "supersecret_dev_key_change_me",
  "changeme",
  "secret",
  "password",
  "your_jwt_secret",
  "your-secret-key",
]);

// ── Production environment validation ────────────────────────────────────────
const REQUIRED_IN_PRODUCTION = [
  "JWT_SECRET",
  "DATABASE_URL",
  "STRIPE_WEBHOOK_SECRET",
] as const;

const RECOMMENDED_IN_PRODUCTION = [
  "REDIS_URL",
  "GOOGLE_MAPS_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "STRIPE_SECRET_KEY",
  "CORS_ALLOWED_ORIGINS",
  "ADMIN_JWT_SECRET",
] as const;

if (isProduction) {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}`
    );
  }

  const missingRecommended = RECOMMENDED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    logger.warn({ missing: missingRecommended }, "[env] Recommended env vars not set");
  }

  // Ensure JWT_SECRET is strong enough and not a placeholder
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  if (PLACEHOLDER_SECRETS.has(jwtSecret)) {
    throw new Error("JWT_SECRET is set to a known insecure placeholder value — set a real secret");
  }

  // Ensure STRIPE_WEBHOOK_SECRET is a real Stripe webhook secret
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!webhookSecret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET must start with 'whsec_' in production");
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY ?? "";
  if (!stripeSecret.startsWith("sk_live_") && !stripeSecret.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a valid Stripe secret key (sk_live_ or sk_test_) in production");
  }
  if (stripeSecret.startsWith("sk_test_")) {
    logger.warn("[env] STRIPE_SECRET_KEY is a test key — use sk_live_ for production payments");
  }
}

// Warn about placeholder secrets in development so devs notice early
if (!isProduction) {
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (PLACEHOLDER_SECRETS.has(jwtSecret)) {
    logger.warn("[env] JWT_SECRET is set to a placeholder — set a real secret before deploying");
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "rideshare-dev",
  cookieSecret: process.env.JWT_SECRET ?? "supersecret_dev_key_123",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Server config
  port: parseInt(process.env.PORT || "3001", 10),
  logLevel: process.env.LOG_LEVEL ?? (isProduction ? "warn" : "info"),
  // DB pool config
  dbPoolSize: parseInt(process.env.DB_POOL_SIZE || "20", 10),
  dbPoolIdleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "60000", 10),
  // External services
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:8081",
  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  // Sentry
  sentryDsn: process.env.SENTRY_DSN ?? "",
  // Google OAuth client IDs (used for token audience verification)
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_ID_IOS: process.env.GOOGLE_CLIENT_ID_IOS ?? "",
  GOOGLE_CLIENT_ID_ANDROID: process.env.GOOGLE_CLIENT_ID_ANDROID ?? "",
  // SMTP (student verification email)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@yoo.app",
  // Cloudflare R2 — private object storage
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  r2Endpoint: process.env.R2_ENDPOINT ?? "",
};
