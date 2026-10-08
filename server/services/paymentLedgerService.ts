/**
 * Canonical payment ledger — stripe_payments is source of truth.
 * Legacy `payments` table is read-only fallback for pre-migration rows.
 */
import { and, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { payments, stripePayments } from "../../drizzle/schema";

export type LedgerPaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded" | "partially_refunded";

export type LedgerPaymentRow = {
  id: number;
  paymentId: string;
  rideId: number;
  riderId: number;
  driverId: number;
  amountCents: number;
  tipCents: number;
  status: LedgerPaymentStatus | string;
  stripePaymentIntentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  source: "stripe" | "legacy";
};

function mapStripeRow(row: typeof stripePayments.$inferSelect): LedgerPaymentRow {
  return {
    id: row.id,
    paymentId: row.paymentId,
    rideId: row.rideId,
    riderId: row.riderId,
    driverId: row.driverId,
    amountCents: row.amountCents,
    tipCents: row.tipCents ?? 0,
    status: row.status,
    stripePaymentIntentId: row.stripePaymentIntentId,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    source: "stripe",
  };
}

function mapLegacyRow(row: typeof payments.$inferSelect): LedgerPaymentRow {
  const amountCents = Math.round(parseFloat(String(row.amount ?? "0")) * 100);
  return {
    id: row.id,
    paymentId: row.paymentId,
    rideId: row.rideId,
    riderId: row.passengerId,
    driverId: 0,
    amountCents,
    tipCents: 0,
    status: row.status ?? "pending",
    stripePaymentIntentId: row.stripePaymentIntentId ?? null,
    paidAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    source: "legacy",
  };
}

/** @deprecated Legacy `payments` table — use stripe_payments via this service. */
export const LEGACY_PAYMENTS_TABLE = "payments" as const;

export function isSucceededStatus(status: string): boolean {
  return status === "succeeded" || status === "completed";
}

export function isRefundedStatus(status: string): boolean {
  return status === "refunded" || status === "partially_refunded";
}

/** Total succeeded revenue in dollars (stripe first, legacy fills gaps). */
export async function getLedgerRevenueTotal(since?: Date): Promise<number> {
  const stripeConds = since
    ? and(eq(stripePayments.status, "succeeded"), gte(stripePayments.createdAt, since))
    : eq(stripePayments.status, "succeeded");
  const [stripeRow] = await db
    .select({ total: sum(stripePayments.amountCents) })
    .from(stripePayments)
    .where(stripeConds);
  const stripeCents = Number(stripeRow?.total ?? 0);

  const legacyConds = since
    ? and(eq(payments.status, "completed"), gte(payments.createdAt, since))
    : eq(payments.status, "completed");
  const [legacyRow] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(legacyConds);
  const legacyCents = Math.round(parseFloat(String(legacyRow?.total ?? "0")) * 100);

  return (stripeCents + legacyCents) / 100;
}

export async function getLedgerRevenueByDay(since: Date): Promise<Array<{ date: string; revenue: number; rides: number }>> {
  const stripeRows = await db
    .select({
      date: sql<string>`DATE(${stripePayments.createdAt})`,
      revenue: sum(stripePayments.amountCents),
      rides: count(),
    })
    .from(stripePayments)
    .where(and(eq(stripePayments.status, "succeeded"), gte(stripePayments.createdAt, since)))
    .groupBy(sql`DATE(${stripePayments.createdAt})`);

  const legacyRows = await db
    .select({
      date: sql<string>`DATE(${payments.createdAt})`,
      revenue: sum(payments.amount),
      rides: count(),
    })
    .from(payments)
    .where(and(eq(payments.status, "completed"), gte(payments.createdAt, since)))
    .groupBy(sql`DATE(${payments.createdAt})`);

  const byDate = new Map<string, { revenue: number; rides: number }>();
  for (const r of stripeRows) {
    const d = r.date;
    const prev = byDate.get(d) ?? { revenue: 0, rides: 0 };
    byDate.set(d, {
      revenue: prev.revenue + Number(r.revenue ?? 0) / 100,
      rides: prev.rides + Number(r.rides ?? 0),
    });
  }
  for (const r of legacyRows) {
    const d = r.date;
    const prev = byDate.get(d) ?? { revenue: 0, rides: 0 };
    byDate.set(d, {
      revenue: prev.revenue + parseFloat(String(r.revenue ?? "0")),
      rides: prev.rides + Number(r.rides ?? 0),
    });
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, rides: v.rides }));
}

export async function listLedgerPayments(opts: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ payments: LedgerPaymentRow[]; total: number; page: number; totalPages: number }> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  const stripeStatus =
    opts.status && opts.status !== "all"
      ? opts.status === "completed"
        ? "succeeded"
        : (opts.status as LedgerPaymentStatus)
      : undefined;

  const stripeWhere = stripeStatus ? eq(stripePayments.status, stripeStatus as any) : undefined;
  const [stripeCount] = await db.select({ count: count() }).from(stripePayments).where(stripeWhere);
  const stripeRows = await db
    .select()
    .from(stripePayments)
    .where(stripeWhere)
    .orderBy(desc(stripePayments.createdAt))
    .limit(limit)
    .offset(offset);

  if (stripeRows.length > 0 || (stripeCount?.count ?? 0) > 0) {
    return {
      payments: stripeRows.map(mapStripeRow),
      total: stripeCount?.count ?? 0,
      page,
      totalPages: Math.ceil((stripeCount?.count ?? 0) / limit),
    };
  }

  // Legacy fallback when no stripe rows yet
  const legacyWhere =
    opts.status && opts.status !== "all" ? eq(payments.status, opts.status as any) : undefined;
  const [legacyCount] = await db.select({ count: count() }).from(payments).where(legacyWhere);
  const legacyRows = await db
    .select()
    .from(payments)
    .where(legacyWhere)
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    payments: legacyRows.map(mapLegacyRow),
    total: legacyCount?.count ?? 0,
    page,
    totalPages: Math.ceil((legacyCount?.count ?? 0) / limit),
  };
}

export async function getLedgerPaymentForRide(
  rideDbId: number,
  riderId?: number,
): Promise<LedgerPaymentRow | null> {
  const stripeWhere = riderId
    ? and(eq(stripePayments.rideId, rideDbId), eq(stripePayments.riderId, riderId))
    : eq(stripePayments.rideId, rideDbId);
  const [stripe] = await db
    .select()
    .from(stripePayments)
    .where(stripeWhere)
    .orderBy(desc(stripePayments.createdAt))
    .limit(1);
  if (stripe) return mapStripeRow(stripe);

  const legacyWhere = riderId
    ? and(eq(payments.rideId, rideDbId), eq(payments.passengerId, riderId))
    : eq(payments.rideId, rideDbId);
  const [legacy] = await db
    .select()
    .from(payments)
    .where(legacyWhere)
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return legacy ? mapLegacyRow(legacy) : null;
}

export async function getRecentLedgerPayments(limit = 5) {
  const stripeRows = await db
    .select()
    .from(stripePayments)
    .orderBy(desc(stripePayments.createdAt))
    .limit(limit);
  if (stripeRows.length > 0) return stripeRows.map(mapStripeRow);
  const legacyRows = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit);
  return legacyRows.map(mapLegacyRow);
}

export async function getLedgerPaymentsForRide(rideDbId: number) {
  const stripeRows = await db
    .select()
    .from(stripePayments)
    .where(eq(stripePayments.rideId, rideDbId));
  if (stripeRows.length > 0) return stripeRows.map(mapStripeRow);
  const legacyRows = await db.select().from(payments).where(eq(payments.rideId, rideDbId));
  return legacyRows.map(mapLegacyRow);
}

/** Payment stats for admin dashboard — stripe_payments canonical, legacy fallback. */
export async function getLedgerPaymentStats(commissionPct: number) {
  const succeededStripe = eq(stripePayments.status, "succeeded");
  const refundedStripe = inArray(stripePayments.status, ["refunded", "partially_refunded"] as const);
  const pendingStripe = inArray(stripePayments.status, ["pending", "processing"] as const);

  const [stripeRev] = await db
    .select({ total: sum(stripePayments.amountCents) })
    .from(stripePayments)
    .where(succeededStripe);
  const [stripeRefund] = await db
    .select({ total: sum(stripePayments.amountCents), count: count() })
    .from(stripePayments)
    .where(refundedStripe);
  const [stripePending] = await db
    .select({ total: sum(stripePayments.amountCents), count: count() })
    .from(stripePayments)
    .where(pendingStripe);

  const [legacyRev] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(eq(payments.status, "completed"));
  const [legacyRefund] = await db
    .select({ total: sum(payments.amount), count: count() })
    .from(payments)
    .where(eq(payments.status, "refunded"));
  const [legacyPending] = await db
    .select({ total: sum(payments.amount), count: count() })
    .from(payments)
    .where(eq(payments.status, "pending"));

  const totalRevenue =
    Number(stripeRev?.total ?? 0) / 100 + parseFloat(String(legacyRev?.total ?? "0"));
  const refundsTotal =
    Number(stripeRefund?.total ?? 0) / 100 + parseFloat(String(legacyRefund?.total ?? "0"));
  const pendingPayouts =
    Number(stripePending?.total ?? 0) / 100 + parseFloat(String(legacyPending?.total ?? "0"));
  const refundsCount = Number(stripeRefund?.count ?? 0) + Number(legacyRefund?.count ?? 0);
  const pendingCount = Number(stripePending?.count ?? 0) + Number(legacyPending?.count ?? 0);
  const commissionEarned = Math.round(totalRevenue * (commissionPct / 100) * 100) / 100;

  return {
    totalRevenue: totalRevenue.toFixed(2),
    pendingPayouts: pendingPayouts.toFixed(2),
    pendingCount,
    refundsTotal: refundsTotal.toFixed(2),
    refundsCount,
    commissionEarned: commissionEarned.toFixed(2),
    commissionPct,
  };
}

export async function getLedgerPaymentsForUser(userId: number, limit = 50) {
  const stripeRows = await db
    .select()
    .from(stripePayments)
    .where(eq(stripePayments.riderId, userId))
    .orderBy(desc(stripePayments.createdAt))
    .limit(limit);
  const legacyRows = await db
    .select()
    .from(payments)
    .where(eq(payments.passengerId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return [...stripeRows.map(mapStripeRow), ...legacyRows.map(mapLegacyRow)].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}
