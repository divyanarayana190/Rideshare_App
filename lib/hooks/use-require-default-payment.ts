import { isCardExpired } from "@/lib/payment/format-payment-method";
import { useDefaultPaymentMethod } from "@/lib/hooks/use-payment-queries";
import { useRouter, type Href } from "expo-router";
import { useCallback } from "react";

type ToastFn = (message: string, type?: "success" | "error" | "info" | "warning") => void;

/**
 * Returns a guard that blocks an action until user has a valid default payment method.
 */
export function useRequireDefaultPaymentMethod(toast?: ToastFn) {
  const router = useRouter();
  const { defaultCard, hasDefaultCard, stripeEnabled, isStripeLoading } = useDefaultPaymentMethod();

  const requirePayment = useCallback((): boolean => {
    if (!stripeEnabled) {
      toast?.("Payments are not configured. Please try again later.", "error");
      return false;
    }
    if (isStripeLoading) {
      toast?.("Loading payment methods…", "info");
      return false;
    }
    if (!hasDefaultCard || !defaultCard) {
      toast?.("Add a payment method before continuing.", "error");
      router.push("/stripe-add-card" as Href);
      return false;
    }
    if (isCardExpired(defaultCard.expMonth, defaultCard.expYear)) {
      toast?.("Your default card has expired. Please add a new card.", "error");
      router.push("/stripe-add-card" as Href);
      return false;
    }
    return true;
  }, [stripeEnabled, isStripeLoading, hasDefaultCard, defaultCard, toast, router]);

  return { requirePayment, defaultCard, hasDefaultCard, stripeEnabled, isStripeLoading };
}
