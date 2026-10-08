import { Text, View } from "react-native";

const WEB_FALLBACK =
  "Stripe mobile card entry is available in iOS/Android app. Use saved payment methods or continue setup in browser.";

export type StripeCardEntryResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

/** Web uses Stripe.js inline — PaymentSheet is not available. */
export async function runNativeStripeCardSetup(_clientSecret: string): Promise<StripeCardEntryResult> {
  return { ok: false, cancelled: false, message: WEB_FALLBACK };
}

export function StripeCardEntryWebFallback({ mutedColor = "#9CA3AF" }: { mutedColor?: string }) {
  return (
    <View style={{ padding: 16, borderRadius: 12, backgroundColor: "#1C1C1C" }}>
      <Text style={{ fontSize: 14, color: mutedColor, lineHeight: 20, textAlign: "center" }}>
        {WEB_FALLBACK}
      </Text>
    </View>
  );
}
