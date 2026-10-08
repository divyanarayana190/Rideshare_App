import { STRIPE_MERCHANT_ID, STRIPE_PUBLISHABLE_KEY, isStripePublishableKeyConfigured } from "@/lib/stripe-client";
import { StripeProvider } from "@stripe/stripe-react-native";
import type { ReactNode } from "react";
import { Fragment } from "react";

export function NativeStripeProvider({ children }: { children: ReactNode }) {
  if (!isStripePublishableKeyConfigured()) {
    return <>{children}</>;
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier={STRIPE_MERCHANT_ID}>
      <Fragment>{children}</Fragment>
    </StripeProvider>
  );
}
