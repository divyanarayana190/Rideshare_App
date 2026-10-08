/**
 * Stripe Payment Service — Production-grade marketplace payments
 *
 * Handles:
 * - Customer management (riders)
 * - Connected accounts (drivers)
 * - SetupIntents (save cards)
 * - PaymentIntents with destination charges (ride payments)
 * - Refunds with reverse transfers
 * - Webhook event processing
 */

import Stripe from "stripe";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db, createNotification } from "../db";
import logger from "../logger";
import crypto from "crypto";
import {
  stripeCustomers,
  connectedAccounts,
  stripePaymentMethods,
  stripePayments,
  stripeTransfers,
  stripeRefunds,
  webhookEvents,
  users,
  rides,
  ridePassengers,
} from "../../drizzle/schema";
import { sendNotification } from "./notificationService";
import {
  applyReservedCredits,
  getReservedCreditTotal,
  releaseReservedCredits,
} from "./walletCreditService";

// ── Stripe Client ─────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === "sk_test_YOUR_KEY_HERE") {
  logger.warn("[stripe] STRIPE_SECRET_KEY is not configured. Payments will fail.");
}
if (!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET.includes("REPLACE") || STRIPE_WEBHOOK_SECRET === "whsec_YOUR_WEBHOOK_SECRET_HERE") {
  logger.warn("[stripe] STRIPE_WEBHOOK_SECRET is not configured. Webhooks will fail signature verification.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

const APP_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";
const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 15) / 100;

export { stripe };

export function isStripeConfigured(): boolean {
  return !!(STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== "sk_test_YOUR_KEY_HERE");
}

export type SavedPaymentMethodDto = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

function toSavedPaymentMethodDto(row: typeof stripePaymentMethods.$inferSelect): SavedPaymentMethodDto {
  return {
    id: row.stripePmId,
    brand: row.cardBrand,
    last4: row.cardLast4,
    expMonth: row.cardExpMonth,
    expYear: row.cardExpYear,
    isDefault: row.isDefault,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function genPayId(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = `${prefix}_`;
  for (let i = 0; i < 16; i++) id += chars[crypto.randomInt(chars.length)];
  return id;
}

// ── Customer Management (Riders) ──────────────────────────────────────────

export async function getOrCreateStripeCustomer(userId: number) {
  const existing = await db.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, userId),
  });
  if (existing) return existing;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("User not found");

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { userId: String(userId), platform: "rideshare" },
  });

  const [inserted] = await db.insert(stripeCustomers).values({
    userId,
    stripeCustomerId: customer.id,
  });

  return db.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, userId),
  });
}

export async function getStripeCustomer(userId: number) {
  return db.query.stripeCustomers.findFirst({
    where: eq(stripeCustomers.userId, userId),
  });
}

// ── Connected Accounts (Drivers) ──────────────────────────────────────────

export async function createConnectedAccount(userId: number) {
  const existing = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, userId),
  });
  if (existing) return existing;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("User not found");

  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: user.email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { userId: String(userId), platform: "rideshare" },
  });

  await db.insert(connectedAccounts).values({
    userId,
    stripeAccountId: account.id,
  });

  return db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, userId),
  });
}

export async function getConnectedAccount(userId: number) {
  return db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, userId),
  });
}

export async function generateOnboardingLink(stripeAccountId: string) {
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${APP_URL}/driver/onboarding?refresh=true`,
    return_url: `${APP_URL}/driver/onboarding?complete=true`,
    type: "account_onboarding",
  });
  return link.url;
}

export async function generateDashboardLink(stripeAccountId: string) {
  const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
  return loginLink.url;
}

export async function syncConnectedAccountStatus(userId: number) {
  const acct = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, userId),
  });
  if (!acct) return null;

  const stripeAcct = await stripe.accounts.retrieve(acct.stripeAccountId);

  await db.update(connectedAccounts)
    .set({
      chargesEnabled: stripeAcct.charges_enabled ?? false,
      payoutsEnabled: stripeAcct.payouts_enabled ?? false,
      detailsSubmitted: stripeAcct.details_submitted ?? false,
      onboardingComplete: (stripeAcct.charges_enabled && stripeAcct.payouts_enabled) ?? false,
    })
    .where(eq(connectedAccounts.id, acct.id));

  return {
    ...acct,
    chargesEnabled: stripeAcct.charges_enabled,
    payoutsEnabled: stripeAcct.payouts_enabled,
    onboardingComplete: stripeAcct.charges_enabled && stripeAcct.payouts_enabled,
    requiresAction: (stripeAcct.requirements?.currently_due?.length ?? 0) > 0,
  };
}

// ── SetupIntents (Save Cards) ─────────────────────────────────────────────

export async function createSetupIntent(userId: number) {
  const customer = await getOrCreateStripeCustomer(userId);
  if (!customer) throw new Error("Could not create Stripe customer");

  const setupIntent = await stripe.setupIntents.create({
    customer: customer.stripeCustomerId,
    usage: "off_session",
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "never",
    },
    metadata: { userId: String(userId) },
  });

  return {
    clientSecret: setupIntent.client_secret!,
    setupIntentId: setupIntent.id,
  };
}

// ── Payment Methods ───────────────────────────────────────────────────────

export async function listPaymentMethods(userId: number) {
  const rows = await db.query.stripePaymentMethods.findMany({
    where: and(
      eq(stripePaymentMethods.userId, userId),
      eq(stripePaymentMethods.isActive, true),
    ),
    orderBy: [desc(stripePaymentMethods.isDefault), desc(stripePaymentMethods.createdAt)],
  });
  // Dedupe by stripePmId (keep default / newest)
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.stripePmId)) return false;
    seen.add(r.stripePmId);
    return true;
  });
}

export async function getDefaultPaymentMethod(userId: number) {
  const methods = await listPaymentMethods(userId);
  return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
}

async function findDuplicateByFingerprint(userId: number, fingerprint: string | undefined | null) {
  if (!fingerprint) return null;
  const customer = await getStripeCustomer(userId);
  if (!customer) return null;
  const stripeList = await stripe.paymentMethods.list({
    customer: customer.stripeCustomerId,
    type: "card",
    limit: 20,
  });
  return stripeList.data.find((p) => p.card?.fingerprint === fingerprint) ?? null;
}

/** Persist a Stripe payment method to our DB — idempotent, fingerprint-aware. */
async function savePaymentMethodToDb(
  userId: number,
  stripePmId: string,
  opts: { setDefault?: boolean; setDefaultIfFirst?: boolean } = {},
): Promise<SavedPaymentMethodDto & { alreadyExists?: boolean }> {
  const existingRow = await db.query.stripePaymentMethods.findFirst({
    where: eq(stripePaymentMethods.stripePmId, stripePmId),
  });
  if (existingRow?.isActive) {
    return { ...toSavedPaymentMethodDto(existingRow), alreadyExists: true };
  }

  const pm = await stripe.paymentMethods.retrieve(stripePmId);
  const customer = await getOrCreateStripeCustomer(userId);
  if (!customer) throw new Error("Could not create Stripe customer");

  const duplicate = await findDuplicateByFingerprint(userId, pm.card?.fingerprint);
  if (duplicate && duplicate.id !== stripePmId) {
    if (pm.customer === customer.stripeCustomerId) {
      try { await stripe.paymentMethods.detach(stripePmId); } catch { /* ignore */ }
    }
    const dupRow = await db.query.stripePaymentMethods.findFirst({
      where: eq(stripePaymentMethods.stripePmId, duplicate.id),
    });
    if (dupRow?.isActive) {
      return { ...toSavedPaymentMethodDto(dupRow), alreadyExists: true };
    }
    return savePaymentMethodToDb(userId, duplicate.id, opts);
  }

  if (pm.customer !== customer.stripeCustomerId) {
    await stripe.paymentMethods.attach(stripePmId, { customer: customer.stripeCustomerId });
  }

  const activeMethods = await listPaymentMethods(userId);
  const isFirst = activeMethods.length === 0;
  const makeDefault = opts.setDefault || (opts.setDefaultIfFirst && isFirst);

  if (makeDefault) {
    await db.update(stripePaymentMethods)
      .set({ isDefault: false })
      .where(eq(stripePaymentMethods.userId, userId));
    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePmId },
    });
    await db.update(stripeCustomers)
      .set({ defaultPaymentMethodId: stripePmId })
      .where(eq(stripeCustomers.id, customer.id));
  }

  if (existingRow) {
    await db.update(stripePaymentMethods)
      .set({
        isActive: true,
        cardBrand: pm.card?.brand ?? existingRow.cardBrand,
        cardLast4: pm.card?.last4 ?? existingRow.cardLast4,
        cardExpMonth: pm.card?.exp_month ?? existingRow.cardExpMonth,
        cardExpYear: pm.card?.exp_year ?? existingRow.cardExpYear,
        isDefault: makeDefault || existingRow.isDefault,
      })
      .where(eq(stripePaymentMethods.id, existingRow.id));
    const updated = await db.query.stripePaymentMethods.findFirst({
      where: eq(stripePaymentMethods.id, existingRow.id),
    });
    return toSavedPaymentMethodDto(updated!);
  }

  await db.insert(stripePaymentMethods).values({
    userId,
    stripePmId: pm.id,
    type: "card",
    cardBrand: pm.card?.brand ?? null,
    cardLast4: pm.card?.last4 ?? null,
    cardExpMonth: pm.card?.exp_month ?? null,
    cardExpYear: pm.card?.exp_year ?? null,
    isDefault: makeDefault || isFirst,
    isActive: true,
  });

  return {
    id: pm.id,
    brand: pm.card?.brand ?? "card",
    last4: pm.card?.last4 ?? "****",
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
    isDefault: makeDefault || isFirst,
  };
}

export async function syncPaymentMethodFromSetupIntent(userId: number, setupIntentId: string) {
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  if (Number(si.metadata?.userId) !== userId) {
    throw new Error("SetupIntent does not belong to this user");
  }
  if (si.status !== "succeeded") {
    throw new Error("Card setup was not completed. Please try again.");
  }
  const pmId = typeof si.payment_method === "string"
    ? si.payment_method
    : si.payment_method?.id;
  if (!pmId) throw new Error("No payment method returned from Stripe");
  return savePaymentMethodToDb(userId, pmId, { setDefaultIfFirst: true });
}

const ACTIVE_RIDE_STATUSES = ["searching", "matched", "driver_arrived", "in_progress"] as const;

export async function assertCanRemovePaymentMethod(userId: number, _stripePmId: string) {
  const methods = await listPaymentMethods(userId);
  if (methods.length > 1) return;

  const [activeRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(
      eq(ridePassengers.passengerId, userId),
      inArray(rides.status, [...ACTIVE_RIDE_STATUSES]),
    ));

  if (Number(activeRow?.count ?? 0) > 0) {
    throw new Error("Cannot remove your only card while you have an active ride.");
  }

  const [scheduledRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(
      eq(ridePassengers.passengerId, userId),
      eq(rides.status, "searching"),
      sql`${rides.departureTime} IS NOT NULL AND ${rides.departureTime} > NOW()`,
    ));

  if (Number(scheduledRow?.count ?? 0) > 0) {
    throw new Error("Cannot remove your only card while you have a scheduled ride.");
  }
}

export async function setDefaultPaymentMethod(userId: number, stripePmId: string) {
  // Verify ownership
  const pm = await db.query.stripePaymentMethods.findFirst({
    where: and(
      eq(stripePaymentMethods.userId, userId),
      eq(stripePaymentMethods.stripePmId, stripePmId),
    ),
  });
  if (!pm) throw new Error("Payment method not found");

  // Unset all defaults
  await db.update(stripePaymentMethods)
    .set({ isDefault: false })
    .where(eq(stripePaymentMethods.userId, userId));

  // Set new default
  await db.update(stripePaymentMethods)
    .set({ isDefault: true })
    .where(eq(stripePaymentMethods.id, pm.id));

  // Update Stripe customer
  const customer = await getStripeCustomer(userId);
  if (customer) {
    await stripe.customers.update(customer.stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePmId },
    });
    await db.update(stripeCustomers)
      .set({ defaultPaymentMethodId: stripePmId })
      .where(eq(stripeCustomers.id, customer.id));
  }
}

export async function removePaymentMethod(userId: number, stripePmId: string) {
  await assertCanRemovePaymentMethod(userId, stripePmId);

  const pm = await db.query.stripePaymentMethods.findFirst({
    where: and(
      eq(stripePaymentMethods.userId, userId),
      eq(stripePaymentMethods.stripePmId, stripePmId),
      eq(stripePaymentMethods.isActive, true),
    ),
  });
  if (!pm) throw new Error("Payment method not found");

  await stripe.paymentMethods.detach(stripePmId);

  await db.update(stripePaymentMethods)
    .set({ isActive: false, isDefault: false })
    .where(eq(stripePaymentMethods.id, pm.id));

  if (pm.isDefault) {
    const remaining = await listPaymentMethods(userId);
    if (remaining.length > 0) {
      await setDefaultPaymentMethod(userId, remaining[0].stripePmId);
    } else {
      const customer = await getStripeCustomer(userId);
      if (customer) {
        await stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: { default_payment_method: "" },
        });
        await db.update(stripeCustomers)
          .set({ defaultPaymentMethodId: null })
          .where(eq(stripeCustomers.id, customer.id));
      }
    }
  }
}

/**
 * Attach a PaymentMethod (tokenized client-side via Stripe.js) to a customer.
 * This is PCI-compliant — we never handle raw card numbers.
 */
export async function attachPaymentMethod(params: {
  userId: number;
  paymentMethodId: string;
  setDefault?: boolean;
}) {
  const { userId, paymentMethodId, setDefault } = params;
  return savePaymentMethodToDb(userId, paymentMethodId, {
    setDefault: setDefault ?? false,
    setDefaultIfFirst: true,
  });
}

// ── Ride Payments (Destination Charges) ───────────────────────────────────

export async function chargeRide(params: {
  rideId: string;
  rideDbId: number;
  riderId: number;
  driverId: number | null;
  fareCents: number;
  tipCents?: number;
}) {
  const { rideId, rideDbId, riderId, driverId, fareCents, tipCents = 0 } = params;
  if (driverId == null) throw new Error("Cannot charge ride: no driver assigned");

  // Idempotency: one charge per rider per ride (shared rides have multiple passengers)
  const existing = await db.query.stripePayments.findFirst({
    where: and(eq(stripePayments.rideId, rideDbId), eq(stripePayments.riderId, riderId)),
  });
  if (existing && (existing.status === "succeeded" || existing.status === "processing")) {
    return existing;
  }

  const creditCents = await getReservedCreditTotal(riderId, rideDbId);
  const stripeFareCents = Math.max(0, fareCents - creditCents);
  const totalCents = stripeFareCents + tipCents;
  const idempotencyKey = `charge_ride_${rideId}_${riderId}`;

  // Credits cover the full fare — no Stripe charge required
  if (totalCents === 0 && creditCents > 0) {
    await applyReservedCredits({ userId: riderId, rideId: rideDbId });
    const paymentId = genPayId("pay");
    await db.insert(stripePayments).values({
      paymentId,
      rideId: rideDbId,
      riderId,
      driverId,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      amountCents: creditCents,
      platformFeeCents: 0,
      driverAmountCents: 0,
      tipCents: 0,
      status: "succeeded",
      paymentMethodId: null,
      idempotencyKey,
      paidAt: new Date(),
    });
    return {
      paymentId,
      stripePaymentIntentId: null,
      amountCents: creditCents,
      creditCents,
      platformFeeCents: 0,
      driverAmountCents: 0,
      status: "succeeded",
    };
  }

  // Get rider's payment info
  const riderStripe = await getStripeCustomer(riderId);
  if (!riderStripe) throw new Error("Rider has no Stripe customer");
  const defaultPm = await db.query.stripePaymentMethods.findFirst({
    where: and(
      eq(stripePaymentMethods.userId, riderId),
      eq(stripePaymentMethods.isDefault, true),
      eq(stripePaymentMethods.isActive, true),
    ),
  });
  if (!defaultPm) throw new Error("Rider has no default payment method");

  // Get driver's connected account
  const driverAcct = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.userId, driverId),
  });
  if (!driverAcct?.chargesEnabled) throw new Error("Driver account not payment-ready");

  // Platform fee on gross fare; cap to totalCents so Stripe application_fee_amount ≤ charge amount
  const platformFeeCents = Math.min(Math.round(fareCents * PLATFORM_FEE_PERCENT), totalCents);
  const driverAmountCents = totalCents - platformFeeCents;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      customer: riderStripe.stripeCustomerId,
      payment_method: defaultPm.stripePmId,
      off_session: true,
      confirm: true,
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: driverAcct.stripeAccountId,
      },
      metadata: {
        rideId,
        riderId: String(riderId),
        driverId: String(driverId),
        fareCents: String(fareCents),
        creditCents: String(creditCents),
        stripeFareCents: String(stripeFareCents),
        tipCents: String(tipCents),
      },
      description: `YOO ride ${rideId}`,
      statement_descriptor_suffix: "RIDESHARE",
    }, {
      idempotencyKey,
    });

    if (paymentIntent.status === "succeeded" && creditCents > 0) {
      await applyReservedCredits({ userId: riderId, rideId: rideDbId });
    }

    const paymentId = genPayId("pay");
    await db.insert(stripePayments).values({
      paymentId,
      rideId: rideDbId,
      riderId,
      driverId,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: (paymentIntent.latest_charge as string) ?? null,
      amountCents: totalCents + creditCents,
      platformFeeCents,
      driverAmountCents,
      tipCents,
      status: paymentIntent.status === "succeeded" ? "succeeded" : "processing",
      paymentMethodId: defaultPm.stripePmId,
      idempotencyKey,
      paidAt: paymentIntent.status === "succeeded" ? new Date() : null,
    });

    const chargeObj = paymentIntent.latest_charge;
    if (chargeObj && typeof chargeObj === "string") {
      const charge = await stripe.charges.retrieve(chargeObj);
      if (charge.transfer && typeof charge.transfer === "string") {
        await db.insert(stripeTransfers).values({
          paymentId: (await db.query.stripePayments.findFirst({
            where: eq(stripePayments.paymentId, paymentId),
          }))!.id,
          stripeTransferId: charge.transfer,
          driverId,
          amountCents: driverAmountCents,
          status: "pending",
        });
      }
    }

    return {
      paymentId,
      stripePaymentIntentId: paymentIntent.id,
      amountCents: totalCents + creditCents,
      creditCents,
      platformFeeCents,
      driverAmountCents,
      status: paymentIntent.status,
    };
  } catch (err) {
    if (creditCents > 0) {
      await releaseReservedCredits({ userId: riderId, rideId: rideDbId }).catch((e) =>
        logger.warn({ err: e, rideId }, "[stripe] Failed to release credits after charge failure"),
      );
    }
    throw err;
  }
}

// ── Refunds ───────────────────────────────────────────────────────────────

export async function refundRidePayment(params: {
  rideId: string;
  rideDbId: number;
  amountCents?: number;
  reason: "rider_cancelled" | "driver_cancelled" | "wrong_route" | "overcharge" | "safety_issue" | "other";
  initiatedBy: "rider" | "driver" | "support" | "system";
}) {
  const payment = await db.query.stripePayments.findFirst({
    where: and(eq(stripePayments.rideId, params.rideDbId), eq(stripePayments.status, "succeeded")),
  });
  if (!payment) throw new Error("No successful payment found for this ride");

  const refundAmount = params.amountCents ?? payment.amountCents;

  const stripeRefund = await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntentId!,
    amount: refundAmount,
    reason: "requested_by_customer",
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: { rideId: params.rideId, reason: params.reason },
  });

  const refundId = genPayId("ref");
  await db.insert(stripeRefunds).values({
    refundId,
    paymentId: payment.id,
    rideId: params.rideDbId,
    stripeRefundId: stripeRefund.id,
    amountCents: refundAmount,
    reason: params.reason,
    status: stripeRefund.status === "succeeded" ? "succeeded" : "pending",
    initiatedBy: params.initiatedBy,
  });

  const newStatus = refundAmount >= payment.amountCents ? "refunded" : "partially_refunded";
  await db.update(stripePayments)
    .set({ status: newStatus as any })
    .where(eq(stripePayments.id, payment.id));

  return {
    refundId,
    stripeRefundId: stripeRefund.id,
    amountCents: refundAmount,
    status: stripeRefund.status,
  };
}

// ── Webhook Processing ────────────────────────────────────────────────────

export async function storeWebhookEvent(event: Stripe.Event) {
  await db.insert(webhookEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    stripeObjectId: (event.data.object as any).id ?? null,
    payload: event.data.object as any,
    status: "received",
  }).onDuplicateKeyUpdate({
    set: { attempts: (webhookEvents.attempts as any) },
  });
}

export async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const existing = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.stripeEventId, eventId),
  });
  return existing?.status === "processed";
}

export async function markWebhookProcessed(eventId: string) {
  await db.update(webhookEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(webhookEvents.stripeEventId, eventId));
}

export async function markWebhookFailed(eventId: string, error: string) {
  await db.update(webhookEvents)
    .set({ status: "failed", errorMessage: error })
    .where(eq(webhookEvents.stripeEventId, eventId));
}

// ── Webhook Event Handlers ────────────────────────────────────────────────

export async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  const pmId = setupIntent.payment_method as string;
  const userId = Number(setupIntent.metadata?.userId);
  if (!userId || !pmId) return;
  try {
    await savePaymentMethodToDb(userId, pmId, { setDefaultIfFirst: true });
  } catch (err) {
    logger.warn({ err, setupIntentId: setupIntent.id }, "[stripe] setup_intent.succeeded sync failed");
  }
}

export async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const payment = await db.query.stripePayments.findFirst({
    where: eq(stripePayments.stripePaymentIntentId, pi.id),
  });
  if (!payment) return;
  if (payment.status === "succeeded" || payment.status === "refunded") return;

  await db.update(stripePayments)
    .set({
      status: "succeeded",
      paidAt: new Date(),
      stripeChargeId: (pi.latest_charge as string) ?? payment.stripeChargeId,
    })
    .where(eq(stripePayments.id, payment.id));

  const amount = `$${(payment.amountCents / 100).toFixed(2)}`;
  const notifId = `notif_${crypto.randomBytes(8).toString("hex")}`;
  await createNotification({
    notificationId: notifId,
    userId: payment.riderId,
    type: "payment_received",
    title: "Payment successful",
    body: `${amount} was charged for your ride.`,
    data: { rideId: String(payment.rideId), paymentId: payment.paymentId },
    deepLink: `/trip-receipt?rideId=${payment.rideId}`,
  }).catch((err) => logger.error({ err }, "[stripe] Failed to save payment success notification"));
  sendNotification({
    userId: payment.riderId,
    type: "payment_received",
    title: "Payment successful",
    body: `${amount} was charged for your ride.`,
    data: { rideId: String(payment.rideId), paymentId: payment.paymentId },
    deepLink: `/trip-receipt?rideId=${payment.rideId}`,
  }).catch((err) => logger.error({ err }, "[stripe] Failed to push payment success notification"));
}

export async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const payment = await db.query.stripePayments.findFirst({
    where: eq(stripePayments.stripePaymentIntentId, pi.id),
  });
  if (!payment) return;

  const reason = (pi.last_payment_error?.message) ?? "Payment failed";
  await db.update(stripePayments)
    .set({
      status: "failed",
      failureReason: reason,
    })
    .where(eq(stripePayments.id, payment.id));

  const notifId = `notif_${crypto.randomBytes(8).toString("hex")}`;
  await createNotification({
    notificationId: notifId,
    userId: payment.riderId,
    type: "system",
    title: "Payment failed",
    body: `Your ride payment failed. ${reason}`,
    data: { rideId: String(payment.rideId), paymentId: payment.paymentId },
    deepLink: `/payment-methods`,
  }).catch((err) => logger.error({ err }, "[stripe] Failed to save payment failure notification"));
  sendNotification({
    userId: payment.riderId,
    type: "system",
    title: "Payment failed",
    body: `Your ride payment failed. ${reason}`,
    data: { rideId: String(payment.rideId), paymentId: payment.paymentId },
    deepLink: `/payment-methods`,
  }).catch((err) => logger.error({ err }, "[stripe] Failed to push payment failure notification"));
}

export async function handleAccountUpdated(account: Stripe.Account) {
  const acct = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.stripeAccountId, account.id),
  });
  if (!acct) return;

  await db.update(connectedAccounts)
    .set({
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      onboardingComplete: (account.charges_enabled && account.payouts_enabled) ?? false,
    })
    .where(eq(connectedAccounts.id, acct.id));
}

export async function handleChargeRefunded(charge: Stripe.Charge) {
  // Update refund status if we have a record
  if (charge.refunds?.data) {
    for (const refund of charge.refunds.data) {
      const existing = await db.query.stripeRefunds.findFirst({
        where: eq(stripeRefunds.stripeRefundId, refund.id),
      });
      if (existing) {
        await db.update(stripeRefunds)
          .set({ status: refund.status === "succeeded" ? "succeeded" : "pending" })
          .where(eq(stripeRefunds.id, existing.id));
      }
    }
  }
}

export async function handlePaymentMethodDetached(pm: Stripe.PaymentMethod) {
  await db.update(stripePaymentMethods)
    .set({ isActive: false })
    .where(eq(stripePaymentMethods.stripePmId, pm.id));
}

/**
 * Main webhook processor — routes events to handlers
 */
export async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "account.updated":
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    case "payment_method.detached":
      await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
      break;
    default:
      logger.debug({ eventType: event.type }, "[stripe-webhook] Unhandled event");
  }
}

/**
 * Verify and process a raw webhook request
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET.includes("REPLACE") || STRIPE_WEBHOOK_SECRET === "whsec_YOUR_WEBHOOK_SECRET_HERE") {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured. Set it in your .env file.");
  }
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    STRIPE_WEBHOOK_SECRET,
  );
}
