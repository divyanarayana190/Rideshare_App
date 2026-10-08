/**
 * Passenger management — profile, rides, payments, risk signals from real DB.
 */
import { and, count, desc, eq, or, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  ratings,
  referrals,
  supportTickets,
  adminAuditLogs,
  fraudFlags,
  abuseFlags,
} from "../../drizzle/schema";
import { getLedgerPaymentsForUser } from "./paymentLedgerService";

export async function listPassengers(opts: {
  page?: number;
  limit?: number;
  search?: string;
  university?: string;
}) {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [eq(userProfiles.isDriver, false)];
  if (opts.search) {
    conditions.push(
      sql`(${users.name} LIKE ${`%${opts.search}%`} OR ${users.email} LIKE ${`%${opts.search}%`})`,
    );
  }
  if (opts.university) {
    conditions.push(eq(userProfiles.studentUniversityDomain, opts.university));
  }

  const where = and(...conditions);
  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(where);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      isBanned: userProfiles.isBanned,
      isStudentVerified: userProfiles.isStudentVerified,
      studentUniversityName: userProfiles.studentUniversityName,
      averageRating: userProfiles.averageRating,
      totalRides: userProfiles.totalRides,
    })
    .from(users)
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return { passengers: rows, total: Number(total), page, totalPages: Math.ceil(Number(total) / limit) };
}

export async function getPassengerDetail(passengerId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, passengerId)).limit(1);
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, passengerId))
    .limit(1);
  if (!profile || profile.isDriver) return null;

  const rideHistory = await db
    .select({
      id: rides.id,
      rideId: rides.rideId,
      status: rides.status,
      mode: rides.mode,
      pickupAddress: rides.pickupAddress,
      dropoffAddress: rides.dropoffAddress,
      totalFare: rides.totalFare,
      createdAt: rides.createdAt,
      cancelReason: rides.cancelReason,
    })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(eq(ridePassengers.passengerId, passengerId))
    .orderBy(desc(rides.createdAt))
    .limit(30);

  const payments = await getLedgerPaymentsForUser(passengerId, 30);

  const passengerRatings = await db
    .select()
    .from(ratings)
    .where(eq(ratings.ratedUserId, passengerId))
    .orderBy(desc(ratings.createdAt))
    .limit(15);

  const givenRatings = await db
    .select()
    .from(ratings)
    .where(eq(ratings.raterId, passengerId))
    .orderBy(desc(ratings.createdAt))
    .limit(10);

  const referralHistory = await db
    .select()
    .from(referrals)
    .where(or(eq(referrals.referrerId, passengerId), eq(referrals.referredUserId, passengerId)))
    .orderBy(desc(referrals.createdAt))
    .limit(10);

  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, passengerId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(10);

  const auditLogs = await db
    .select()
    .from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.entity, "user"), eq(adminAuditLogs.entityId, String(passengerId))))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(15);

  const [completedRow] = await db
    .select({ count: count() })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(eq(ridePassengers.passengerId, passengerId), eq(rides.status, "completed")));
  const [cancelledRow] = await db
    .select({ count: count() })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(eq(ridePassengers.passengerId, passengerId), eq(rides.status, "cancelled")));

  const completed = Number(completedRow?.count ?? 0);
  const cancelled = Number(cancelledRow?.count ?? 0);
  const totalTrips = completed + cancelled;
  const cancellationRate = totalTrips > 0 ? Math.round((cancelled / totalTrips) * 1000) / 10 : 0;

  const userFraudFlags = await db
    .select()
    .from(fraudFlags)
    .where(eq(fraudFlags.userId, passengerId))
    .orderBy(desc(fraudFlags.createdAt))
    .limit(10);

  const userAbuseFlags = await db
    .select()
    .from(abuseFlags)
    .where(eq(abuseFlags.userId, passengerId))
    .orderBy(desc(abuseFlags.createdAt))
    .limit(10);

  const { computeFraudScore } = await import("./fraudIntelligenceService");
  const fraudProfile = await computeFraudScore(passengerId);

  return {
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, lastSignedIn: user.lastSignedIn },
    profile,
    analytics: {
      completedRides: completed,
      cancelledRides: cancelled,
      cancellationRate,
      totalSpentCents: payments.reduce((s, p) => s + (p.status === "succeeded" ? p.amountCents : 0), 0),
      averageRating: profile.averageRating,
    },
    fraudProfile,
    rideHistory,
    payments,
    ratingsReceived: passengerRatings,
    ratingsGiven: givenRatings,
    referralHistory,
    supportTickets: tickets,
    fraudFlags: userFraudFlags,
    abuseFlags: userAbuseFlags,
    auditLogs,
  };
}
