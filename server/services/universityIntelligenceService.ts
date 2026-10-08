/**
 * University intelligence — auto-discovered from user_profiles.studentUniversityDomain.
 */
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  emergencyAlerts,
  ratings,
} from "../../drizzle/schema";
import { listUniversities } from "./marketplaceOpsService";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function universityRideFilter(domain: string) {
  return sql`(
    ${rides.driverId} IN (SELECT userId FROM user_profiles WHERE studentUniversityDomain = ${domain})
    OR ${rides.id} IN (
      SELECT rp.rideId FROM ride_passengers rp
      INNER JOIN user_profiles up ON rp.passengerId = up.userId
      WHERE up.studentUniversityDomain = ${domain}
    )
  )`;
}

export async function getUniversityIntelligence(domain: string, days = 30) {
  const since = daysAgo(days);
  const rideFilter = universityRideFilter(domain);

  const [profileRow] = await db
    .select({
      name: userProfiles.studentUniversityName,
      students: count(),
    })
    .from(userProfiles)
    .where(eq(userProfiles.studentUniversityDomain, domain))
    .groupBy(userProfiles.studentUniversityName)
    .limit(1);

  if (!profileRow) return null;

  const [
    [studentStats],
    [driverStats],
    [tripStats],
    [revenueRow],
    popularRoutes,
    peakHours,
    [safetyStats],
    [ratingStats],
    tripsTrend,
    retention,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        verified: sql<number>`SUM(CASE WHEN ${userProfiles.isStudentVerified} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.studentUniversityDomain, domain)),
    db
      .select({ drivers: count() })
      .from(userProfiles)
      .where(and(eq(userProfiles.studentUniversityDomain, domain), eq(userProfiles.isDriver, true))),
    db
      .select({
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      })
      .from(rides)
      .where(and(gte(rides.createdAt, since), rideFilter)),
    db
      .select({ gmv: sum(rides.totalFare) })
      .from(rides)
      .where(and(gte(rides.createdAt, since), eq(rides.status, "completed"), rideFilter)),
    db
      .select({
        pickup: rides.pickupAddress,
        dropoff: rides.dropoffAddress,
        trips: count(),
        avgFare: sql<string>`AVG(${rides.totalFare})`,
      })
      .from(rides)
      .where(and(gte(rides.createdAt, since), eq(rides.status, "completed"), rideFilter))
      .groupBy(rides.pickupAddress, rides.dropoffAddress)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        hour: sql<number>`HOUR(${rides.createdAt})`,
        trips: count(),
      })
      .from(rides)
      .where(and(gte(rides.createdAt, since), rideFilter))
      .groupBy(sql`HOUR(${rides.createdAt})`)
      .orderBy(sql`HOUR(${rides.createdAt})`),
    db
      .select({ alerts: count() })
      .from(emergencyAlerts)
      .innerJoin(userProfiles, eq(emergencyAlerts.userId, userProfiles.userId))
      .where(and(eq(userProfiles.studentUniversityDomain, domain), gte(emergencyAlerts.createdAt, since))),
    db
      .select({
        avg: sql<string>`AVG(${ratings.score})`,
        low: sql<number>`SUM(CASE WHEN ${ratings.score} <= 2 THEN 1 ELSE 0 END)`,
      })
      .from(ratings)
      .innerJoin(userProfiles, eq(ratings.ratedUserId, userProfiles.userId))
      .where(and(eq(userProfiles.studentUniversityDomain, domain), gte(ratings.createdAt, since))),
    db
      .select({
        date: sql<string>`DATE(${rides.createdAt})`,
        trips: count(),
        completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
      })
      .from(rides)
      .where(and(gte(rides.createdAt, since), rideFilter))
      .groupBy(sql`DATE(${rides.createdAt})`)
      .orderBy(sql`DATE(${rides.createdAt})`),
    computeUniversityRetention(domain),
  ]);

  const totalTrips = Number(tripStats?.total ?? 0);
  const completedTrips = Number(tripStats?.completed ?? 0);

  return {
    domain,
    name: profileRow.name || domain,
    periodDays: days,
    students: {
      total: Number(studentStats?.total ?? 0),
      verified: Number(studentStats?.verified ?? 0),
    },
    drivers: Number(driverStats?.drivers ?? 0),
    trips: {
      total: totalTrips,
      completed: completedTrips,
      cancelled: Number(tripStats?.cancelled ?? 0),
      completionRate: totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 1000) / 10 : 0,
    },
    revenue: {
      gmv: parseFloat(String(revenueRow?.gmv ?? "0")),
    },
    popularRoutes: popularRoutes.map((r) => ({
      pickup: (r.pickup || "").slice(0, 60),
      dropoff: (r.dropoff || "").slice(0, 60),
      trips: Number(r.trips),
      avgFare: parseFloat(r.avgFare || "0").toFixed(2),
    })),
    peakHours: peakHours.map((h) => ({
      hour: Number(h.hour),
      label: `${String(h.hour).padStart(2, "0")}:00`,
      trips: Number(h.trips),
    })),
    safety: {
      emergencyAlerts: Number(safetyStats?.alerts ?? 0),
      lowRatings: Number(ratingStats?.low ?? 0),
    },
    ratings: {
      average: parseFloat(ratingStats?.avg || "0").toFixed(1),
    },
    tripsTrend: tripsTrend.map((t) => ({
      date: t.date,
      trips: Number(t.trips),
      completed: Number(t.completed),
    })),
    retention,
    timestamp: new Date().toISOString(),
  };
}

async function computeUniversityRetention(domain: string) {
  const cohorts: Array<{ week: string; cohortSize: number; retention: number[] }> = [];

  for (let w = 4; w >= 0; w--) {
    const cohortStart = new Date(Date.now() - (w + 1) * 7 * 86400000);
    const cohortEnd = new Date(Date.now() - w * 7 * 86400000);

    const [cohortRow] = await db
      .select({ c: count() })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.studentUniversityDomain, domain),
          gte(userProfiles.createdAt, cohortStart),
          sql`${userProfiles.createdAt} < ${cohortEnd}`,
        ),
      );
    const cohortSize = Number(cohortRow?.c ?? 0);
    if (cohortSize === 0) continue;

    const retention: number[] = [];
    for (let wk = 0; wk < 4; wk++) {
      const actStart = new Date(cohortEnd.getTime() + wk * 7 * 86400000);
      const actEnd = new Date(actStart.getTime() + 7 * 86400000);
      const [activeRow] = await db
        .select({ c: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})` })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .innerJoin(userProfiles, eq(ridePassengers.passengerId, userProfiles.userId))
        .where(
          and(
            eq(userProfiles.studentUniversityDomain, domain),
            gte(userProfiles.createdAt, cohortStart),
            sql`${userProfiles.createdAt} < ${cohortEnd}`,
            gte(rides.createdAt, actStart),
            sql`${rides.createdAt} < ${actEnd}`,
          ),
        );
      retention.push(Math.round((Number(activeRow?.c ?? 0) / cohortSize) * 100));
    }

    cohorts.push({
      week: cohortStart.toISOString().slice(0, 10),
      cohortSize,
      retention,
    });
  }

  return cohorts;
}

export { listUniversities };
