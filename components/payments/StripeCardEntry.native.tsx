import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";

export type StripeCardEntryResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

/** Opens Stripe PaymentSheet for SetupIntent card entry (native only). */
export async function runNativeStripeCardSetup(clientSecret: string): Promise<StripeCardEntryResult> {
  const initResult = await initPaymentSheet({
    merchantDisplayName: "YOO",
    setupIntentClientSecret: clientSecret,
    returnURL: "yoo://stripe-redirect",
    allowsDelayedPaymentMethods: false,
  });

  if (initResult.error) {
    return { ok: false, cancelled: false, message: initResult.error.message ?? "Could not initialize payment form" };
  }

  const presentResult = await presentPaymentSheet();
  if (presentResult.error) {
    if (presentResult.error.code === "Canceled") {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, message: presentResult.error.message ?? "Card was declined" };
  }

  return { ok: true };
}
