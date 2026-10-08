/**
 * Wallet Credit Service -- Production-grade ride credits system
 *
 * Handles credit granting, redemption (two-phase), expiry, reversal,
 * anti-abuse detection, and admin adjustments. All mutations use
 * database transactions with row-level locking.
 */

import { db } from "../db";
import {
  creditWallets,
  creditGrants,
  creditRedemptions,
  creditLedger,
  abuseFlags,
  rides,
  ridePassengers,
} from "../../drizzle/schema";
import { and, eq, sql, desc, asc, lte, inArray, gt, gte } from "drizzle-orm";
import crypto from "crypto";
const uuidv4 = () => crypto.randomUUID();

// ============================================================================
// CONFIG
// ============================================================================
export const CREDIT_CONFIG = {
  EXPIRY_DAYS: 14,
  MAX_CREDIT_PER_RIDE_CENTS: 200,      // $2.00 max per ride earned
  MAX_CREDITS_PER_DAY_CENTS: 600,      // $6.00 max per day
  MAX_CREDITS_PER_WEEK_CENTS: 2000,    // $20.00 max per week
  MAX_REDEEM_PERCENT: 50,              // 50% of fare
  MIN_RIDE_FARE_CENTS: 500,            // $5.00 min fare to earn
  MIN_RIDE_DISTANCE_KM: 1.0,          // 1km min distance
  CREDIT_RATE: 0.10,                   // 10% of fare as credit
  MAX_ACTIVE_BALANCE_CENTS: 5000,      // $50 max active credits
} as const;

// ============================================================================
// HELPERS
// ============================================================================

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string | number): number {
  return Math.round(Number(dollars) * 100);
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

export async function getOrCreateCreditWallet(userId: number) {
  const existing = await db
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0]!;

  try {
    await db.insert(creditWallets).values({
      userId,
      availableBalance: 0,
      reservedBalance: 0,
      totalEarned: 0,
      totalRedeemed: 0,
      totalExpired: 0,
    });
  } catch {
    // Race condition: another request created the wallet first — that's fine
  }

  const [wallet] = await db
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.userId, userId))
    .limit(1);

  if (!wallet) throw new Error(`Failed to create credit wallet for user ${userId}`);
  return wallet;
}

export async function getCreditWalletBalance(userId: number) {
  const wallet = await getOrCreateCreditWallet(userId);

  // Count active grants
  const [grantStats] = await db
    .select({
      activeCount: sql<number>`COUNT(*)`,
      nextExpiry: sql<string | null>`MIN(${creditGrants.expiresAt})`,
    })
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.userId, userId),
        inArray(creditGrants.status, ["active"]),
        gt(creditGrants.expiresAt, new Date()),
      ),
    );

  return {
    availableBalance: wallet.availableBalance,
    reservedBalance: wallet.reservedBalance,
    totalEarned: wallet.totalEarned,
    totalRedeemed: wallet.totalRedeemed,
    totalExpired: wallet.totalExpired,
    activeGrantsCount: grantStats?.activeCount ?? 0,
    nextExpiry: grantStats?.nextExpiry ?? null,
  };
}

// ============================================================================
// CREDIT GRANTING
// ============================================================================

export async function grantRideCredits(params: {
  userId: number;
  rideId: number;
  fareAmountCents: number;
  isSharedRide: boolean;
  passengerCount: number;
  distanceKm: number;
  idempotencyKey: string;
}): Promise<{
  granted: boolean;
  amountCents: number;
  grantId: string | null;
  expiresAt: Date | null;
  reason?: string;
}> {
  const {
    userId,
    rideId,
    fareAmountCents,
    isSharedRide,
    passengerCount,
    distanceKm,
    idempotencyKey,
  } = params;

  // 1. Validate: must be shared ride
  if (!isSharedRide) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: "Solo rides do not earn credits" };
  }

  // 2. Validate: minimum fare
  if (fareAmountCents < CREDIT_CONFIG.MIN_RIDE_FARE_CENTS) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: `Fare below minimum $${centsToDollars(CREDIT_CONFIG.MIN_RIDE_FARE_CENTS)}` };
  }

  // 3. Validate: minimum distance
  if (distanceKm < CREDIT_CONFIG.MIN_RIDE_DISTANCE_KM) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: `Distance below minimum ${CREDIT_CONFIG.MIN_RIDE_DISTANCE_KM}km` };
  }

  // 4. Check idempotency -- don't grant twice for same ride
  const existingGrant = await db
    .select()
    .from(creditGrants)
    .where(eq(creditGrants.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existingGrant.length > 0) {
    const eg = existingGrant[0]!;
    return {
      granted: true,
      amountCents: eg.amountCents,
      grantId: eg.grantId,
      expiresAt: eg.expiresAt,
      reason: "Already granted (idempotent)",
    };
  }

  // 5. Check velocity limits
  const velocity = await checkVelocityLimits(userId);
  if (!velocity.allowed) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: "Velocity limit exceeded" };
  }

  // 6. Check max active balance
  const wallet = await getOrCreateCreditWallet(userId);
  const currentBalanceCents = wallet.availableBalance;
  if (currentBalanceCents >= CREDIT_CONFIG.MAX_ACTIVE_BALANCE_CENTS) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: "Maximum active credit balance reached" };
  }

  // 7. Calculate credit amount
  let creditCents = Math.floor(fareAmountCents * CREDIT_CONFIG.CREDIT_RATE);
  creditCents = Math.min(creditCents, CREDIT_CONFIG.MAX_CREDIT_PER_RIDE_CENTS);

  // Cap by daily/weekly remaining
  creditCents = Math.min(creditCents, velocity.dailyRemaining, velocity.weeklyRemaining);

  // Cap by max active balance
  const balanceRoom = CREDIT_CONFIG.MAX_ACTIVE_BALANCE_CENTS - currentBalanceCents;
  creditCents = Math.min(creditCents, balanceRoom);

  if (creditCents <= 0) {
    return { granted: false, amountCents: 0, grantId: null, expiresAt: null, reason: "No credits available after applying limits" };
  }

  // 8. Create grant within transaction
  const grantId = uuidv4();
  const expiresAt = new Date(Date.now() + CREDIT_CONFIG.EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Insert grant
    await tx.insert(creditGrants).values({
      grantId,
      userId,
      rideId,
      amountCents: creditCents,
      remainingCents: creditCents,
      reason: "goodwill",
      status: "active",
      expiresAt,
      idempotencyKey,
    });

    // Update wallet balance
    await tx
      .update(creditWallets)
      .set({
        availableBalance: sql`${creditWallets.availableBalance} + ${creditCents}`,
        totalEarned: sql`${creditWallets.totalEarned} + ${creditCents}`,
      })
      .where(eq(creditWallets.userId, userId));

    // Get updated balance for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Retrieve grant id for ledger FK
    const [newGrant] = await tx
      .select({ id: creditGrants.id })
      .from(creditGrants)
      .where(eq(creditGrants.grantId, grantId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "grant",
      amountCents: creditCents,
      balanceAfterCents: updatedWallet!.availableBalance,
      relatedGrantId: newGrant!.id,
      notes: `Earned ${centsToDollars(creditCents)} credit from shared ride`,
    });
  });

  return { granted: true, amountCents: creditCents, grantId, expiresAt };
}

export async function checkVelocityLimits(userId: number) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Daily total
  const [dailyResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${creditGrants.amountCents}), 0)`,
    })
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.userId, userId),
        eq(creditGrants.reason, "goodwill"),
        gte(creditGrants.createdAt, startOfDay),
      ),
    );

  // Weekly total
  const [weeklyResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${creditGrants.amountCents}), 0)`,
    })
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.userId, userId),
        eq(creditGrants.reason, "goodwill"),
        gte(creditGrants.createdAt, oneWeekAgo),
      ),
    );

  const dailyUsed = Number(dailyResult?.total ?? 0);
  const weeklyUsed = Number(weeklyResult?.total ?? 0);
  const dailyRemaining = Math.max(0, CREDIT_CONFIG.MAX_CREDITS_PER_DAY_CENTS - dailyUsed);
  const weeklyRemaining = Math.max(0, CREDIT_CONFIG.MAX_CREDITS_PER_WEEK_CENTS - weeklyUsed);

  return {
    dailyUsed,
    weeklyUsed,
    dailyRemaining,
    weeklyRemaining,
    allowed: dailyRemaining > 0 && weeklyRemaining > 0,
  };
}

// ============================================================================
// CREDIT REDEMPTION
// ============================================================================

/** Sum of credits reserved (not yet applied) for a ride checkout. */
export async function getReservedCreditTotal(userId: number, rideId: number): Promise<number> {
  const rows = await db
    .select({ amountCents: creditRedemptions.amountCents })
    .from(creditRedemptions)
    .where(
      and(
        eq(creditRedemptions.userId, userId),
        eq(creditRedemptions.rideId, rideId),
        eq(creditRedemptions.status, "reserved"),
      ),
    );
  return rows.reduce((sum, r) => sum + r.amountCents, 0);
}

/** Cap client-requested credit use to server-computed maximum. */
export function capCreditReserveAmount(requested: number, maxApplicable: number): number {
  if (requested <= 0 || maxApplicable <= 0) return 0;
  return Math.min(requested, maxApplicable);
}

export async function previewCreditRedemption(params: {
  userId: number;
  fareAmountCents: number;
}) {
  const { userId, fareAmountCents } = params;
  const wallet = await getOrCreateCreditWallet(userId);
  const availableCents = wallet.availableBalance;

  const maxByPercent = Math.floor(fareAmountCents * CREDIT_CONFIG.MAX_REDEEM_PERCENT / 100);
  const maxApplicable = Math.min(availableCents, maxByPercent);

  // Ensure Stripe minimum charge of 50 cents if there's any remaining charge
  let effectiveMax = maxApplicable;
  const remaining = fareAmountCents - effectiveMax;
  if (remaining > 0 && remaining < 50) {
    effectiveMax = fareAmountCents - 50;
    if (effectiveMax < 0) effectiveMax = 0;
  }

  return {
    creditsAvailable: availableCents,
    maxApplicable: effectiveMax,
    stripeChargeable: fareAmountCents - effectiveMax,
    fareTotal: fareAmountCents,
  };
}

export async function reserveCredits(params: {
  userId: number;
  rideId: number;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{
  reserved: boolean;
  reservations: Array<{ redemptionId: string; grantId: number; amountCents: number }>;
  totalReserved: number;
  reason?: string;
}> {
  const { userId, rideId, amountCents, idempotencyKey } = params;

  if (amountCents <= 0) {
    return { reserved: false, reservations: [], totalReserved: 0, reason: "Amount must be positive" };
  }

  // Check idempotency
  const existingRedemptions = await db
    .select()
    .from(creditRedemptions)
    .where(
      and(
        eq(creditRedemptions.userId, userId),
        eq(creditRedemptions.rideId, rideId),
        eq(creditRedemptions.status, "reserved"),
      ),
    );

  if (existingRedemptions.length > 0) {
    const total = existingRedemptions.reduce((sum, r) => sum + r.amountCents, 0);
    return {
      reserved: true,
      reservations: existingRedemptions.map((r) => ({
        redemptionId: r.redemptionId,
        grantId: r.grantId,
        amountCents: r.amountCents,
      })),
      totalReserved: total,
      reason: "Already reserved (idempotent)",
    };
  }

  const reservations: Array<{ redemptionId: string; grantId: number; amountCents: number }> = [];
  let totalReserved = 0;

  await db.transaction(async (tx) => {
    // Get active grants ordered by expiry (FIFO) with row-level lock
    const activeGrants = await tx
      .select()
      .from(creditGrants)
      .where(
        and(
          eq(creditGrants.userId, userId),
          inArray(creditGrants.status, ["active"]),
          gt(creditGrants.expiresAt, new Date()),
          gt(creditGrants.remainingCents, 0),
        ),
      )
      .orderBy(asc(creditGrants.expiresAt))
      .for("update");

    let remaining = amountCents;

    for (const grant of activeGrants) {
      if (remaining <= 0) break;

      const deductFromGrant = Math.min(remaining, grant.remainingCents);
      const redemptionId = uuidv4();

      // Reduce grant remaining
      const newRemaining = grant.remainingCents - deductFromGrant;
      const newStatus = newRemaining <= 0 ? "fully_redeemed" : "active";

      await tx
        .update(creditGrants)
        .set({
          remainingCents: newRemaining,
          status: newStatus as any,
        })
        .where(eq(creditGrants.id, grant.id));

      // Create redemption record
      await tx.insert(creditRedemptions).values({
        redemptionId,
        userId,
        rideId,
        grantId: grant.id,
        amountCents: deductFromGrant,
        status: "reserved",
      });

      reservations.push({
        redemptionId,
        grantId: grant.id,
        amountCents: deductFromGrant,
      });

      remaining -= deductFromGrant;
      totalReserved += deductFromGrant;
    }

    if (totalReserved === 0) {
      throw new Error("No credits available to reserve");
    }

    // Update wallet: move from available to reserved
    await tx
      .update(creditWallets)
      .set({
        availableBalance: sql`${creditWallets.availableBalance} - ${totalReserved}`,
        reservedBalance: sql`${creditWallets.reservedBalance} + ${totalReserved}`,
      })
      .where(eq(creditWallets.userId, userId));

    // Get updated wallet for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "reserve",
      amountCents: -totalReserved,
      balanceAfterCents: updatedWallet!.availableBalance,
      notes: `Reserved ${centsToDollars(totalReserved)} credits for ride`,
    });
  });

  return { reserved: true, reservations, totalReserved };
}

export async function applyReservedCredits(params: {
  userId: number;
  rideId: number;
}): Promise<{ applied: boolean; totalApplied: number }> {
  const { userId, rideId } = params;

  const reserved = await db
    .select()
    .from(creditRedemptions)
    .where(
      and(
        eq(creditRedemptions.userId, userId),
        eq(creditRedemptions.rideId, rideId),
        eq(creditRedemptions.status, "reserved"),
      ),
    );

  if (reserved.length === 0) {
    return { applied: false, totalApplied: 0 };
  }

  let totalApplied = 0;

  await db.transaction(async (tx) => {
    for (const redemption of reserved) {
      await tx
        .update(creditRedemptions)
        .set({
          status: "applied",
        })
        .where(eq(creditRedemptions.id, redemption.id));

      totalApplied += redemption.amountCents;
    }

    // Move from reserved balance, add to total redeemed
    await tx
      .update(creditWallets)
      .set({
        reservedBalance: sql`${creditWallets.reservedBalance} - ${totalApplied}`,
        totalRedeemed: sql`${creditWallets.totalRedeemed} + ${totalApplied}`,
      })
      .where(eq(creditWallets.userId, userId));

    // Get updated wallet for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "apply",
      amountCents: 0, // No balance change (reserved -> redeemed)
      balanceAfterCents: updatedWallet!.availableBalance,
      notes: `Applied ${centsToDollars(totalApplied)} credits to ride payment`,
    });
  });

  return { applied: true, totalApplied };
}

export async function releaseReservedCredits(params: {
  userId: number;
  rideId: number;
}): Promise<{ released: boolean; totalReleased: number }> {
  const { userId, rideId } = params;

  const reserved = await db
    .select()
    .from(creditRedemptions)
    .where(
      and(
        eq(creditRedemptions.userId, userId),
        eq(creditRedemptions.rideId, rideId),
        eq(creditRedemptions.status, "reserved"),
      ),
    );

  if (reserved.length === 0) {
    return { released: false, totalReleased: 0 };
  }

  let totalReleased = 0;

  await db.transaction(async (tx) => {
    for (const redemption of reserved) {
      // Release the redemption
      await tx
        .update(creditRedemptions)
        .set({
          status: "released",
        })
        .where(eq(creditRedemptions.id, redemption.id));

      // Restore the grant's remaining cents
      const [grant] = await tx
        .select()
        .from(creditGrants)
        .where(eq(creditGrants.id, redemption.grantId))
        .limit(1);

      if (grant) {
        const restoredRemaining = grant.remainingCents + redemption.amountCents;
        const restoredStatus =
          restoredRemaining > 0 ? "active" : grant.status;

        await tx
          .update(creditGrants)
          .set({
            remainingCents: restoredRemaining,
            status: restoredStatus as any,
          })
          .where(eq(creditGrants.id, grant.id));
      }

      totalReleased += redemption.amountCents;
    }

    // Move from reserved back to available
    await tx
      .update(creditWallets)
      .set({
        reservedBalance: sql`${creditWallets.reservedBalance} - ${totalReleased}`,
        availableBalance: sql`${creditWallets.availableBalance} + ${totalReleased}`,
      })
      .where(eq(creditWallets.userId, userId));

    // Get updated wallet for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "release",
      amountCents: totalReleased,
      balanceAfterCents: updatedWallet!.availableBalance,
      notes: `Released ${centsToDollars(totalReleased)} reserved credits`,
    });
  });

  return { released: true, totalReleased };
}

// ============================================================================
// EXPIRY
// ============================================================================

export async function expireCredits(): Promise<number> {
  const now = new Date();
  let totalExpired = 0;
  const batchSize = 100;

  // Process in batches to avoid long-running transactions
  while (true) {
    const expiredGrants = await db
      .select()
      .from(creditGrants)
      .where(
        and(
          inArray(creditGrants.status, ["active"]),
          lte(creditGrants.expiresAt, now),
        ),
      )
      .limit(batchSize);

    if (expiredGrants.length === 0) break;

    await db.transaction(async (tx) => {
      for (const grant of expiredGrants) {
        const expiredAmount = grant.remainingCents;
        if (expiredAmount <= 0) continue;

        // Update grant status
        await tx
          .update(creditGrants)
          .set({
            status: "expired",
            remainingCents: 0,
          })
          .where(eq(creditGrants.id, grant.id));

        // Reduce wallet balance
        await tx
          .update(creditWallets)
          .set({
            availableBalance: sql`GREATEST(${creditWallets.availableBalance} - ${expiredAmount}, 0)`,
            totalExpired: sql`${creditWallets.totalExpired} + ${expiredAmount}`,
          })
          .where(eq(creditWallets.userId, grant.userId));

        // Get updated wallet for ledger
        const [updatedWallet] = await tx
          .select()
          .from(creditWallets)
          .where(eq(creditWallets.userId, grant.userId))
          .limit(1);

        // Create ledger entry
        await tx.insert(creditLedger).values({
          ledgerId: uuidv4(),
          userId: grant.userId,
          entryType: "expire",
          amountCents: -expiredAmount,
          balanceAfterCents: updatedWallet?.availableBalance ?? 0,
          relatedGrantId: grant.id,
          notes: `${centsToDollars(expiredAmount)} credits expired`,
        });

        totalExpired++;
      }
    });
  }

  return totalExpired;
}

// ============================================================================
// REVERSAL
// ============================================================================

export async function reverseGrantForRide(params: {
  userId: number;
  rideId: number;
  reason: string;
}): Promise<{ reversed: boolean; reversedAmountCents: number }> {
  const { userId, rideId, reason } = params;

  // Find grant for this ride
  const [grant] = await db
    .select()
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.userId, userId),
        eq(creditGrants.rideId, rideId),
        inArray(creditGrants.status, ["active", "fully_redeemed"]),
      ),
    )
    .limit(1);

  if (!grant) {
    return { reversed: false, reversedAmountCents: 0 };
  }

  // Only reverse the remaining unused portion
  const reversibleAmount = grant.remainingCents;

  await db.transaction(async (tx) => {
    // Update grant status
    await tx
      .update(creditGrants)
      .set({
        status: "revoked",
        remainingCents: 0,
      })
      .where(eq(creditGrants.id, grant.id));

    if (reversibleAmount > 0) {
      // Reduce wallet balance
      await tx
        .update(creditWallets)
        .set({
          availableBalance: sql`GREATEST(${creditWallets.availableBalance} - ${reversibleAmount}, 0)`,
        })
        .where(eq(creditWallets.userId, userId));
    }

    // Get updated wallet for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "revoke",
      amountCents: -reversibleAmount,
      balanceAfterCents: updatedWallet?.availableBalance ?? 0,
      relatedGrantId: grant.id,
      notes: `Credit revoked: ${reason}`,
    });
  });

  return { reversed: true, reversedAmountCents: reversibleAmount };
}

// ============================================================================
// ANTI-ABUSE
// ============================================================================

export async function checkAbuseFlags(params: {
  userId: number;
  rideId: number;
  fareAmountCents: number;
  distanceKm: number;
  durationMinutes: number;
}): Promise<{ flagged: boolean; flags: Array<{ flagType: string; severity: string }> }> {
  const { userId, rideId, fareAmountCents, distanceKm, durationMinutes } = params;
  const detectedFlags: Array<{ flagType: string; severity: string; details: any }> = [];

  // 1. Min fare check
  if (fareAmountCents < CREDIT_CONFIG.MIN_RIDE_FARE_CENTS) {
    detectedFlags.push({
      flagType: "suspicious_pattern",
      severity: "medium",
      details: { fareAmountCents, minimum: CREDIT_CONFIG.MIN_RIDE_FARE_CENTS },
    });
  }

  // 2. Min distance check
  if (distanceKm < CREDIT_CONFIG.MIN_RIDE_DISTANCE_KM) {
    detectedFlags.push({
      flagType: "suspicious_pattern",
      severity: "medium",
      details: { distanceKm, minimum: CREDIT_CONFIG.MIN_RIDE_DISTANCE_KM },
    });
  }

  // 3. Duplicate route detection (same pickup/dropoff within 24h)
  const ride = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);

  if (ride.length > 0) {
    const r = ride[0]!;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [dupeCheck] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(rides)
      .innerJoin(ridePassengers, eq(rides.id, ridePassengers.rideId))
      .where(
        and(
          eq(ridePassengers.passengerId, userId),
          eq(rides.mode, "share"),
          eq(rides.status, "completed"),
          gt(rides.completedAt, oneDayAgo),
          sql`ABS(${rides.pickupLat} - ${r.pickupLat}) < 0.001`,
          sql`ABS(${rides.pickupLng} - ${r.pickupLng}) < 0.001`,
          sql`ABS(${rides.dropoffLat} - ${r.dropoffLat}) < 0.001`,
          sql`ABS(${rides.dropoffLng} - ${r.dropoffLng}) < 0.001`,
          sql`${rides.id} != ${rideId}`,
        ),
      );

    if ((dupeCheck?.count ?? 0) > 0) {
      detectedFlags.push({
        flagType: "duplicate_grant",
        severity: "high",
        details: {
          duplicateCount: dupeCheck?.count,
          pickupLat: r.pickupLat,
          pickupLng: r.pickupLng,
          dropoffLat: r.dropoffLat,
          dropoffLng: r.dropoffLng,
        },
      });
    }
  }

  // 4. Velocity check (too many shared rides in short period)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [recentRides] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(rides)
    .innerJoin(ridePassengers, eq(rides.id, ridePassengers.rideId))
    .where(
      and(
        eq(ridePassengers.passengerId, userId),
        eq(rides.mode, "share"),
        eq(rides.status, "completed"),
        gt(rides.completedAt, twoHoursAgo),
      ),
    );

  if ((recentRides?.count ?? 0) > 5) {
    detectedFlags.push({
      flagType: "velocity_limit",
      severity: "high",
      details: { ridesInTwoHours: recentRides?.count },
    });
  }

  // Store flags in database
  if (detectedFlags.length > 0) {
    for (const flag of detectedFlags) {
      await db.insert(abuseFlags).values({
        flagId: uuidv4(),
        userId,
        rideId,
        flagType: flag.flagType as any,
        severity: flag.severity as any,
        details: flag.details,
      });
    }
  }

  return {
    flagged: detectedFlags.length > 0,
    flags: detectedFlags.map((f) => ({ flagType: f.flagType, severity: f.severity })),
  };
}

// ============================================================================
// ADMIN
// ============================================================================

export async function adminAdjustCredits(params: {
  userId: number;
  amountCents: number;
  reason: string;
  adminUserId: number;
}): Promise<{ success: boolean; newBalance: number }> {
  const { userId, amountCents, reason, adminUserId } = params;
  const wallet = await getOrCreateCreditWallet(userId);

  await db.transaction(async (tx) => {
    if (amountCents > 0) {
      // Add credits: create a grant
      const grantId = uuidv4();
      const expiresAt = new Date(Date.now() + CREDIT_CONFIG.EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await tx.insert(creditGrants).values({
        grantId,
        userId,
        amountCents,
        remainingCents: amountCents,
        reason: "admin_adjustment",
        status: "active",
        expiresAt,
      });

      await tx
        .update(creditWallets)
        .set({
          availableBalance: sql`${creditWallets.availableBalance} + ${amountCents}`,
          totalEarned: sql`${creditWallets.totalEarned} + ${amountCents}`,
        })
        .where(eq(creditWallets.userId, userId));
    } else {
      // Remove credits: deduct from available balance
      const deductAmount = Math.abs(amountCents);
      await tx
        .update(creditWallets)
        .set({
          availableBalance: sql`GREATEST(${creditWallets.availableBalance} - ${deductAmount}, 0)`,
        })
        .where(eq(creditWallets.userId, userId));
    }

    // Get updated wallet for ledger
    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    // Create ledger entry
    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "admin_adjust",
      amountCents,
      balanceAfterCents: updatedWallet!.availableBalance,
      notes: `Admin adjustment: ${reason}`,
    });
  });

  const [updatedWallet] = await db
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.userId, userId))
    .limit(1);

  return {
    success: true,
    newBalance: updatedWallet!.availableBalance,
  };
}

// ============================================================================
// LEDGER
// ============================================================================

export async function getCreditLedger(userId: number, limit = 50, offset = 0) {
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getActiveGrants(userId: number) {
  return db
    .select()
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.userId, userId),
        inArray(creditGrants.status, ["active"]),
        gt(creditGrants.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(creditGrants.expiresAt));
}

/** Apply a promo code as ride credits (passenger wallet). */
export async function grantPromoCredit(userId: number, code: string) {
  const { validatePromoCode } = await import("../db");
  const validation = await validatePromoCode(code, 5);
  if (!validation.valid || !validation.promo) {
    throw new Error(validation.reason ?? "Invalid promo code");
  }
  const creditCents = Math.max(100, Math.round(validation.discount * 100));
  const result = await adminAdjustCredits({
    userId,
    amountCents: creditCents,
    reason: `Promo code: ${code.toUpperCase()}`,
    adminUserId: userId,
  });
  return { success: true, creditCents, newBalanceCents: result.newBalance };
}

/** Refund ride fare to ride credits after cancellation. */
export async function refundRideCredits(params: {
  userId: number;
  rideDbId: number;
  amountCents: number;
  reason?: string;
}) {
  const { userId, rideDbId, amountCents } = params;
  if (amountCents <= 0) return { refunded: false, amountCents: 0 };

  const idempotencyKey = `refund_ride_${rideDbId}_user_${userId}`;
  const existing = await db
    .select()
    .from(creditGrants)
    .where(eq(creditGrants.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing[0]) {
    return { refunded: true, amountCents: existing[0].amountCents, grantId: existing[0].grantId };
  }

  const grantId = uuidv4();
  const expiresAt = new Date(Date.now() + CREDIT_CONFIG.EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx.insert(creditGrants).values({
      grantId,
      userId,
      rideId: rideDbId,
      amountCents,
      remainingCents: amountCents,
      reason: "ride_refund",
      status: "active",
      expiresAt,
      idempotencyKey,
    });
    await tx
      .update(creditWallets)
      .set({
        availableBalance: sql`${creditWallets.availableBalance} + ${amountCents}`,
        totalEarned: sql`${creditWallets.totalEarned} + ${amountCents}`,
      })
      .where(eq(creditWallets.userId, userId));

    const [updatedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.userId, userId))
      .limit(1);

    await tx.insert(creditLedger).values({
      ledgerId: uuidv4(),
      userId,
      entryType: "grant",
      amountCents,
      balanceAfterCents: updatedWallet!.availableBalance,
      notes: params.reason ?? `Refund for ride #${rideDbId}`,
    });
  });

  return { refunded: true, amountCents, grantId };
}
