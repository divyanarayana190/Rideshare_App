import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { stripeTransfers, stripePayments, transactions } from "../../drizzle/schema";
import { db } from "../db";
import {
  createTransaction,
  deductWalletBalanceAtomic,
  getOrCreateWallet,
  getUserTransactions,
} from "../db";
import {
  createConnectedAccount as createStripeConnectedAccount,
  generateOnboardingLink,
  getConnectedAccount,
  isStripeConfigured,
  syncConnectedAccountStatus,
} from "./stripeService";
import { ENV } from "../_core/env";

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDriverPayoutStatus(driverId: number) {
  const wallet = await getOrCreateWallet(driverId);
  const account = await getConnectedAccount(driverId);
  const synced = account ? await syncConnectedAccountStatus(driverId) : null;

  const availableBalanceCents = Math.max(0, Math.round(Number(wallet.balance ?? 0) * 100));
  const pendingRows = await db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.userId, driverId), eq(transactions.type, "payout")))
    .orderBy(desc(transactions.createdAt))
    .limit(5);
  const recentPending = pendingRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  let payoutState: "setup_required" | "onboarding_incomplete" | "ready" | "unavailable" = "setup_required";
  let instantPayoutSupported = false;
  let message = "Set up payouts to receive earnings";

  if (!account) {
    payoutState = "setup_required";
    message = "Set up payouts with Stripe Connect";
  } else if (!synced?.payoutsEnabled) {
    payoutState = "onboarding_incomplete";
    message = "Continue payout setup to enable cash out";
  } else if (availableBalanceCents <= 0) {
    payoutState = "ready";
    message = "No available balance to cash out";
  } else {
    payoutState = "ready";
    instantPayoutSupported = false;
    message = "Standard payout available";
  }

  return {
    availableBalanceCents,
    pendingBalanceCents: Math.round(recentPending * 100),
    payoutState,
    instantPayoutSupported,
    message,
    chargesEnabled: synced?.chargesEnabled ?? false,
    payoutsEnabled: synced?.payoutsEnabled ?? false,
    onboardingComplete: synced?.onboardingComplete ?? false,
    requiresAction: synced?.requiresAction ?? false,
    stripeAccountId: account?.stripeAccountId ?? null,
  };
}

export async function createDriverStripeConnectAccount(driverId: number) {
  const existing = await getConnectedAccount(driverId);
  if (existing) return { accountId: existing.stripeAccountId, created: false };
  const acct = await createStripeConnectedAccount(driverId);
  if (!acct) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create Stripe account" });
  return { accountId: acct.stripeAccountId, created: true };
}

export async function createDriverStripeAccountLink(driverId: number) {
  const account = await getConnectedAccount(driverId);
  if (!account) {
    const created = await createDriverStripeConnectAccount(driverId);
    const acct = await getConnectedAccount(driverId);
    if (!acct) throw new TRPCError({ code: "BAD_REQUEST", message: "Could not create payout account" });
    const url = await generateOnboardingLink(acct.stripeAccountId);
    return { url, type: "account_onboarding" as const };
  }
  const url = await generateOnboardingLink(account.stripeAccountId);
  return { url, type: "account_onboarding" as const };
}

export async function getDriverPayoutMethods(driverId: number) {
  const status = await getDriverPayoutStatus(driverId);
  const items = status.payoutsEnabled
    ? [{ type: "stripe_connect" as const, label: "Stripe Express", status: "active" as const }]
    : [];
  return {
    items,
    totalCount: items.length,
    payoutState: status.payoutState,
  };
}

export async function requestDriverPayout(driverId: number, amountCents: number) {
  if (amountCents < 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum payout is $1.00" });
  }

  const status = await getDriverPayoutStatus(driverId);
  if (status.payoutState === "setup_required") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set up payouts first" });
  }
  if (status.payoutState === "onboarding_incomplete") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete Stripe payout setup first" });
  }
  if (amountCents > status.availableBalanceCents) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient available balance" });
  }

  const amountDollars = amountCents / 100;

  if (isStripeConfigured() && ENV.stripeSecretKey && status.stripeAccountId) {
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2024-11-20.acacia" as any });
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: status.stripeAccountId,
        metadata: { driverId: String(driverId), type: "driver_payout" },
      });

      await deductWalletBalanceAtomic(driverId, amountDollars);
      await createTransaction({
        transactionId: genId("txn"),
        userId: driverId,
        type: "payout",
        amount: String(amountDollars),
        description: `Payout to Stripe (${transfer.id})`,
      });

      return {
        success: true,
        status: "paid" as const,
        transferId: transfer.id,
        amountCents,
        message: "Payout sent to your Stripe account",
      };
    } catch (err: any) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err?.message ?? "Payout failed — try again or use standard weekly payout",
      });
    }
  }

  await deductWalletBalanceAtomic(driverId, amountDollars);
  await createTransaction({
    transactionId: genId("txn"),
    userId: driverId,
    type: "payout",
    amount: String(amountDollars),
    description: "Payout requested (dev mode — Stripe not configured)",
  });

  return {
    success: true,
    status: "pending" as const,
    transferId: null,
    amountCents,
    message: "Payout recorded — Stripe not configured in this environment",
  };
}

export async function getDriverPayoutHistory(driverId: number, limit = 20) {
  const txns = await getUserTransactions(driverId, limit);
  const payouts = txns.filter((t) => t.type === "payout");

  const transfers = await db
    .select()
    .from(stripeTransfers)
    .where(eq(stripeTransfers.driverId, driverId))
    .orderBy(desc(stripeTransfers.createdAt))
    .limit(limit);

  const walletItems = payouts.map((p) => ({
    id: p.transactionId,
    amountCents: Math.round(Number(p.amount) * 100),
    status: "paid" as const,
    createdAt: p.createdAt?.toISOString() ?? null,
    description: p.description,
  }));

  const stripeItems = transfers.map((t) => ({
    id: t.stripeTransferId ?? String(t.id),
    amountCents: t.amountCents,
    status: t.status,
    createdAt: t.createdAt?.toISOString() ?? null,
    description: null as string | null,
  }));

  const items = [...walletItems, ...stripeItems].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return {
    items,
    totalCount: items.length,
  };
}

export async function getDriverTipsTotal(driverId: number, since: Date | null) {
  const conditions = [
    eq(stripePayments.driverId, driverId),
    eq(stripePayments.status, "succeeded"),
    sql`${stripePayments.tipCents} > 0`,
  ];
  if (since) conditions.push(sql`${stripePayments.paidAt} >= ${since}`);

  const rows = await db
    .select({ tipCents: stripePayments.tipCents, rideId: stripePayments.rideId, paidAt: stripePayments.paidAt })
    .from(stripePayments)
    .where(and(...conditions))
    .orderBy(desc(stripePayments.paidAt));

  const totalCents = rows.reduce((s, r) => s + Number(r.tipCents ?? 0), 0);
  return { totalCents, items: rows };
}
