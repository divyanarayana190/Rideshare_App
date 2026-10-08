import { Platform } from "react-native";

export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

const PLACEHOLDER_KEYS = new Set([
  "",
  "pk_test_YOUR_KEY_HERE",
  "pk_test_REPLACE_ME",
]);

export function isStripePublishableKeyConfigured(): boolean {
  return !PLACEHOLDER_KEYS.has(STRIPE_PUBLISHABLE_KEY);
}

export function isStripeClientConfigured(): boolean {
  return isStripePublishableKeyConfigured();
}

export const STRIPE_MERCHANT_ID =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? "merchant.com.yoo.rideshare";

export function getStripeUnavailableMessage(): string {
  if (!isStripePublishableKeyConfigured()) {
    return "Payments are unavailable. Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to your environment.";
  }
  if (Platform.OS === "web") {
    return "Stripe.js failed to load. Check your publishable key and network connection.";
  }
  return "Stripe is unavailable on this device. Rebuild the native app after installing @stripe/stripe-react-native.";
}
