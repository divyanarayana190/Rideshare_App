import { isStripeConfigured } from "./stripeService";
import { ENV } from "../_core/env";

export type StripeDiagnostics = {
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookConfigured: boolean;
  connectEnabled: boolean;
  paymentMethodsEnabled: boolean;
  payoutsEnabled: boolean;
  environment: "production" | "development";
  notes: string[];
};

export function getStripeDiagnostics(): StripeDiagnostics {
  const publishableKey =
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ?? process.env.STRIPE_PUBLISHABLE_KEY
    ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const secretConfigured = isStripeConfigured();
  const webhookConfigured =
    !!webhookSecret
    && webhookSecret.startsWith("whsec_")
    && !webhookSecret.includes("REPLACE")
    && webhookSecret !== "whsec_YOUR_WEBHOOK_SECRET_HERE";

  const notes: string[] = [];
  if (!publishableKey) notes.push("Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (!secretConfigured) notes.push("Missing STRIPE_SECRET_KEY");
  if (!webhookConfigured) notes.push("Missing or invalid STRIPE_WEBHOOK_SECRET");
  if (secretConfigured && webhookConfigured) {
    notes.push("Stripe is configured for payments and Connect payouts");
  }

  return {
    publishableKeyConfigured: publishableKey.length > 10,
    secretKeyConfigured: secretConfigured,
    webhookConfigured,
    connectEnabled: secretConfigured,
    paymentMethodsEnabled: secretConfigured,
    payoutsEnabled: secretConfigured && webhookConfigured,
    environment: ENV.isProduction ? "production" : "development",
    notes,
  };
}
