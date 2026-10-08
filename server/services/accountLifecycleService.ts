import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import {
  accountDeletionRequests,
  dataExportRequests,
  passengerRequests,
  rides,
  userProfiles,
  users,
  legalAcceptances,
  notifications,
  ridePassengers,
} from "../../drizzle/schema";
import { db } from "../db";
import {
  getUserById,
  getUserProfileByUserId,
  getUserRides,
  getUserTransactions,
  getPaymentMethodsByUserId,
} from "../db";
import { getCreditLedger, getCreditWalletBalance } from "./walletCreditService";

const DELETION_GRACE_DAYS = 30;
const EXPORT_TTL_DAYS = 7;

function genExportId() {
  return `export_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function requestAccountDeletion(userId: number, reason?: string) {
  const existing = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "pending")))
    .limit(1);

  if (existing[0]) {
    return {
      status: "pending" as const,
      scheduledFor: existing[0].scheduledFor.toISOString(),
      requestedAt: existing[0].requestedAt.toISOString(),
    };
  }

  const scheduledFor = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(accountDeletionRequests).values({
    userId,
    status: "pending",
    reason: reason ?? null,
    scheduledFor,
  });

  await cancelActiveUserRides(userId);
  await invalidateUserSessions(userId);

  return {
    status: "pending" as const,
    scheduledFor: scheduledFor.toISOString(),
    requestedAt: new Date().toISOString(),
  };
}

export async function cancelAccountDeletion(userId: number) {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "pending")))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No pending deletion request" });
  }

  await db
    .update(accountDeletionRequests)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(accountDeletionRequests.id, row.id));

  return { success: true, status: "cancelled" as const };
}

export async function getAccountDeletionStatus(userId: number) {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, userId))
    .orderBy(desc(accountDeletionRequests.requestedAt))
    .limit(1);

  if (!row) return { status: "none" as const };

  return {
    status: row.status,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    requestedAt: row.requestedAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    reason: row.reason ?? null,
  };
}

async function cancelActiveUserRides(userId: number) {
  await db
    .update(passengerRequests)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(passengerRequests.passengerId, userId),
        inArray(passengerRequests.status, ["broadcasting", "matched"]),
      ),
    );

  const activeRides = await db
    .select({ id: rides.id, rideId: rides.rideId })
    .from(rides)
    .innerJoin(ridePassengers, eq(rides.id, ridePassengers.rideId))
    .where(
      and(
        eq(ridePassengers.passengerId, userId),
        inArray(rides.status, ["searching", "matched", "in_progress"]),
      ),
    );

  for (const ride of activeRides) {
    await db
      .update(rides)
      .set({ status: "cancelled", rideStep: "cancelled", cancelledAt: new Date() })
      .where(eq(rides.id, ride.id));
  }
}

async function invalidateUserSessions(userId: number) {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}

export async function requestDataExport(userId: number) {
  const recent = await db
    .select()
    .from(dataExportRequests)
    .where(
      and(
        eq(dataExportRequests.userId, userId),
        inArray(dataExportRequests.status, ["requested", "processing", "ready"]),
      ),
    )
    .orderBy(desc(dataExportRequests.requestedAt))
    .limit(1);

  if (recent[0]?.status === "ready" && recent[0].expiresAt && recent[0].expiresAt > new Date()) {
    return {
      exportId: recent[0].exportId,
      status: "ready" as const,
      requestedAt: recent[0].requestedAt.toISOString(),
      completedAt: recent[0].completedAt?.toISOString() ?? null,
      expiresAt: recent[0].expiresAt.toISOString(),
    };
  }

  const exportId = genExportId();
  const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(dataExportRequests).values({
    exportId,
    userId,
    status: "processing",
  });

  try {
    const payload = await buildUserDataExport(userId);
    await db
      .update(dataExportRequests)
      .set({
        status: "ready",
        payloadJson: payload,
        completedAt: new Date(),
        expiresAt,
      })
      .where(eq(dataExportRequests.exportId, exportId));

    return {
      exportId,
      status: "ready" as const,
      requestedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  } catch (err) {
    await db
      .update(dataExportRequests)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Export failed",
      })
      .where(eq(dataExportRequests.exportId, exportId));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate data export" });
  }
}

export async function getDataExportStatus(userId: number) {
  const [row] = await db
    .select()
    .from(dataExportRequests)
    .where(eq(dataExportRequests.userId, userId))
    .orderBy(desc(dataExportRequests.requestedAt))
    .limit(1);

  if (!row) return { status: "none" as const };

  if (row.status === "ready" && row.expiresAt && row.expiresAt <= new Date()) {
    return { status: "expired" as const, exportId: row.exportId };
  }

  return {
    exportId: row.exportId,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    payload: row.status === "ready" ? row.payloadJson : null,
    errorMessage: row.errorMessage ?? null,
  };
}

async function buildUserDataExport(userId: number) {
  const [user, profile, userRideList, txns, payments, creditBalance, creditLedger, legalRows, notifs] =
    await Promise.all([
      getUserById(userId),
      getUserProfileByUserId(userId),
      getUserRides(userId),
      getUserTransactions(userId, 200),
      getPaymentMethodsByUserId(userId),
      getCreditWalletBalance(userId),
      getCreditLedger(userId, 100, 0),
      db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, userId)).limit(10),
      db
        .select({
          type: notifications.type,
          title: notifications.title,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(100),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          lastSignedIn: user.lastSignedIn,
        }
      : null,
    profile: profile
      ? {
          phoneNumber: profile.phoneNumber,
          gender: profile.gender,
          isDriver: profile.isDriver,
          averageRating: profile.averageRating,
          totalRides: profile.totalRides,
          isStudentVerified: profile.isStudentVerified,
        }
      : null,
    rides: userRideList.map((r) => ({
      rideId: r.ride.rideId,
      status: r.ride.status,
      mode: r.ride.mode,
      pickupAddress: r.ride.pickupAddress,
      dropoffAddress: r.ride.dropoffAddress,
      isDriver: r.isDriver,
      completedAt: r.ride.completedAt,
    })),
    transactions: txns.map((t) => ({
      type: t.type,
      amount: t.amount,
      description: t.description,
      createdAt: t.createdAt,
    })),
    paymentMethods: payments.map((p) => ({
      cardType: p.cardType,
      last4: p.last4,
      expiryMonth: p.expiryMonth,
      expiryYear: p.expiryYear,
      isDefault: p.isDefault,
    })),
    rideCredits: {
      balance: creditBalance,
      ledger: creditLedger.map((e) => ({
        entryType: e.entryType,
        amountCents: e.amountCents,
        balanceAfterCents: e.balanceAfterCents,
        notes: e.notes,
        createdAt: e.createdAt,
      })),
    },
    legalAcceptances: legalRows.map((l) => ({
      legalVersion: l.legalVersion,
      termsAcceptedAt: l.termsAcceptedAt,
      privacyAcceptedAt: l.privacyAcceptedAt,
      createdAt: l.createdAt,
    })),
    notifications: notifs.map((n) => ({
      type: n.type,
      title: n.title,
      createdAt: n.createdAt,
    })),
  };
}
