import type { ReactNode } from "react";

/** Web never loads @stripe/stripe-react-native — pass children through. */
export function NativeStripeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
