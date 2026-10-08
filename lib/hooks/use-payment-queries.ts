import { isStripeClientConfigured } from "@/lib/stripe-client";
import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

/** Invalidate all payment-related queries after add/set-default/remove. */
export function useInvalidatePaymentQueries() {
  const utils = trpc.useUtils();
  return useCallback(async () => {
    await Promise.all([
      utils.payment.listPaymentMethods.invalidate(),
      utils.payment.getDefaultPaymentMethod.invalidate(),
    ]);
  }, [utils]);
}

/** Whether Stripe payments are available (client + server keys). */
export function useStripePaymentsEnabled() {
  const clientReady = isStripeClientConfigured();
  const { data: serverConfig, isLoading } = trpc.payment.isConfigured.useQuery(undefined, {
    enabled: clientReady,
  });
  return {
    clientReady,
    serverConfigured: serverConfig?.configured ?? false,
    enabled: clientReady && (serverConfig?.configured ?? false),
    isLoading: clientReady && isLoading,
  };
}

/** Default payment method from backend (source of truth). */
export function useDefaultPaymentMethod(queryEnabled = true) {
  const { enabled, isLoading: stripeLoading } = useStripePaymentsEnabled();
  const query = trpc.payment.getDefaultPaymentMethod.useQuery(undefined, {
    enabled: queryEnabled && enabled,
    staleTime: 30_000,
  });
  return {
    ...query,
    defaultCard: query.data ?? null,
    hasDefaultCard: !!query.data,
    stripeEnabled: enabled,
    isStripeLoading: stripeLoading || query.isLoading,
  };
}

/** All saved payment methods from backend. */
export function usePaymentMethodsList(queryEnabled = true) {
  const { enabled } = useStripePaymentsEnabled();
  const query = trpc.payment.listPaymentMethods.useQuery(undefined, {
    enabled: queryEnabled && enabled,
    staleTime: 30_000,
  });
  return {
    ...query,
    cards: query.data ?? [],
    stripeEnabled: enabled,
  };
}
