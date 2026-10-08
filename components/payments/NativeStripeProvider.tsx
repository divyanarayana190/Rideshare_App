import type { ReactNode } from "react";

/** Fallback when platform-specific file is not resolved (same as web). */
export function NativeStripeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
