// Stripe Integration Service — Mock/Dev fallback
// Production code is in stripeService.ts which uses the real Stripe SDK
// This file provides mock implementations for development without Stripe keys

import logger from "../logger";

interface StripeConfig {
  publishableKey: string;
  secretKey: string;
}

const getStripeConfig = (): StripeConfig | null => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!publishableKey || !secretKey) {
    logger.warn("[Stripe] Missing credentials - Stripe features disabled");
    return null;
  }

  return { publishableKey, secretKey };
};

// ============================================================================
// Payment Intent Functions
// ============================================================================

/**
 * Create a payment intent for a ride
 * In production, use stripeService.ts instead
 */
export async function createPaymentIntent(
  amount: number,
  currency: string = "usd",
  metadata: Record<string, any> = {}
): Promise<{ clientSecret: string; intentId: string } | null> {
  try {
    const config = getStripeConfig();
    if (!config) return null;

    // Mock response for development
    const mockIntentId = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockClientSecret = `${mockIntentId}_secret_${Math.random().toString(36).substr(2, 20)}`;

    logger.info({ intentId: mockIntentId }, "[Stripe] Created payment intent");
    return {
      clientSecret: mockClientSecret,
      intentId: mockIntentId,
    };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error creating payment intent");
    return null;
  }
}

/**
 * Confirm a payment intent
 */
export async function confirmPaymentIntent(
  intentId: string,
  paymentMethodId: string
): Promise<{ success: boolean; status: string }> {
  try {
    const config = getStripeConfig();
    if (!config) return { success: false, status: "error" };

    logger.info({ intentId }, "[Stripe] Confirmed payment intent");
    return { success: true, status: "succeeded" };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error confirming payment");
    return { success: false, status: "error" };
  }
}

/**
 * Refund a payment
 */
export async function refundPayment(
  intentId: string,
  amount?: number
): Promise<{ success: boolean; refundId: string | null }> {
  try {
    const config = getStripeConfig();
    if (!config) return { success: false, refundId: null };

    const mockRefundId = `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info({ refundId: mockRefundId }, "[Stripe] Created refund");
    return { success: true, refundId: mockRefundId };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error refunding payment");
    return { success: false, refundId: null };
  }
}

// ============================================================================
// Stripe Connect (Driver Payouts)
// ============================================================================

/**
 * Create a Stripe Connect account for a driver
 */
export async function createConnectAccount(
  driverId: number,
  driverInfo: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
  }
): Promise<{ success: boolean; connectId: string | null }> {
  try {
    const config = getStripeConfig();
    if (!config) return { success: false, connectId: null };

    const mockConnectId = `acct_${Math.random().toString(36).substr(2, 20)}`;
    logger.info({ driverId, connectId: mockConnectId }, "[Stripe Connect] Created account for driver");
    return { success: true, connectId: mockConnectId };
  } catch (error) {
    logger.error({ err: error }, "[Stripe Connect] Error creating account");
    return { success: false, connectId: null };
  }
}

/**
 * Create a payout to a driver's bank account
 */
export async function createPayout(
  connectAccountId: string,
  amount: number,
  currency: string = "usd"
): Promise<{ success: boolean; payoutId: string | null }> {
  try {
    const config = getStripeConfig();
    if (!config) return { success: false, payoutId: null };

    const mockPayoutId = `po_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info({ payoutId: mockPayoutId }, "[Stripe] Created payout");
    return { success: true, payoutId: mockPayoutId };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error creating payout");
    return { success: false, payoutId: null };
  }
}

/**
 * Get balance for a driver's Connect account
 */
export async function getConnectBalance(
  connectAccountId: string
): Promise<{ available: number; pending: number } | null> {
  try {
    const config = getStripeConfig();
    if (!config) return null;

    logger.debug({ connectAccountId }, "[Stripe] Fetched balance");
    return { available: 0, pending: 0 };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error fetching balance");
    return null;
  }
}

// ============================================================================
// Payment Method Functions
// ============================================================================

/**
 * Create a payment method (mock)
 */
export async function createPaymentMethod(
  cardInfo: {
    cardNumber: string;
    expMonth: number;
    expYear: number;
    cvc: string;
    billingDetails: {
      name: string;
      email: string;
      address: string;
    };
  }
): Promise<{ success: boolean; paymentMethodId: string | null }> {
  try {
    const config = getStripeConfig();
    if (!config) return { success: false, paymentMethodId: null };

    const mockPaymentMethodId = `pm_${Math.random().toString(36).substr(2, 20)}`;
    logger.info({ paymentMethodId: mockPaymentMethodId }, "[Stripe] Created payment method");
    return { success: true, paymentMethodId: mockPaymentMethodId };
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error creating payment method");
    return { success: false, paymentMethodId: null };
  }
}

/**
 * Save a payment method to a customer
 */
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<boolean> {
  try {
    const config = getStripeConfig();
    if (!config) return false;

    logger.debug({ customerId }, "[Stripe] Attached payment method to customer");
    return true;
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Error attaching payment method");
    return false;
  }
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify webhook signature from Stripe
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    logger.debug("[Stripe] Webhook signature verified");
    return true;
  } catch (error) {
    logger.error({ err: error }, "[Stripe] Webhook verification failed");
    return false;
  }
}
