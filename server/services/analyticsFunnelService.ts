/**
 * Analytics funnels — conversion, cancellation, geographic, cohort from real DB.
 */
import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  driverApplications,
  stripePayments,
} from "../../drizzle/schema";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

export async function getAnalyticsFunnels(days = 30) {
  const since = daysAgo(days);

  const [
    [rideLifecycle],
    [passengerFunnel],
    [repeatRiders],
    [driverFunnel],
    [revenueFunnel],
    cancellationReasons,
    cancellationByHour,
    geographic,
    cohortRetention,
  ] = await Promise.all([
    db
      .select({
        requested: count(),
        matched: sql<number>`SUM(CASE WHEN ${rides.status} NOT IN ('searching') THEN 1 ELSE 0 END)`,
        driverAssigned: sql<number>`SUM(CASE WHEN ${rides.rideStep} IN ('driver_assigned','driver_en_route','driver_arrived','ride_started','ride_in_progress','completed') OR ${rides.status} IN ('matched','driver_arrived','in_progress','completed') THEN 1 ELSE 0 END)`,
        inProgress: sql<number>`SUM(CASE WHEN ${rides.status} IN ('in_progress','completed') OR ${rides.rideStep} IN ('ride_started','ride_in_progress','completed') THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      })
      .from(rides)
      .where(gte(rides.createdAt, since)),
    db
      .select({
        signups: sql<number>`(SELECT COUNT(*) FROM users WHERE createdAt >= ${since})`,
        firstRide: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})`,
        completedRide: sql<number>`COUNT(DISTINCT CASE WHEN ${rides.status} = 'completed' THEN ${ridePassengers.passengerId} END)`,
      })
      .from(ridePassengers)
      .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
      .where(gte(rides.createdAt, since)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(
        db
          .select({ passengerId: ridePassengers.passengerId, cnt: count() })
          .from(ridePassengers)
          .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
          .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")))
          .groupBy(ridePassengers.passengerId)
          .having(sql`COUNT(*) >= 2`)
          .as("repeat_riders"),
      ),
    db
      .select({
        applications: sql<number>`(SELECT COUNT(*) FROM driver_applications WHERE createdAt >= ${since})`,
        approved: sql<number>`(SELECT COUNT(*) FROM driver_applications WHERE createdAt >= ${since} AND status = 'approved')`,
        activeDrivers: sql<number>`(SELECT COUNT(DISTINCT driverId) FROM rides WHERE createdAt >= ${since} AND status = 'completed')`,
      })
      .from(driverApplications)
      .limit(1),
    db
      .select({
        completedRides: sql<number>`(SELECT COUNT(*) FROM rides WHERE createdAt >= ${since} AND status = 'completed')`,
        paid: sql<number>`(SELECT COUNT(*) FROM stripe_payments WHERE createdAt >= ${since} AND status = 'succeeded')`,
        refunded: sql<number>`(SELECT COUNT(*) FROM stripe_payments WHERE createdAt >= ${since} AND status IN ('refunded','partially_refunded'))`,
      })
      .from(stripePayments)
      .limit(1),
    db
      .select({
        reason: sql<string>`COALESCE(NULLIF(${rides.cancelReason}, ''), 'unspecified')`,
        count: count(),
      })
      .from(rides)
      .where(and(eq(rides.status, "cancelled"), gte(rides.createdAt, since)))
      .groupBy(sql`COALESCE(NULLIF(${rides.cancelReason}, ''), 'unspecified')`)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        hour: sql<number>`HOUR(${rides.createdAt})`,
        cancelled: count(),
      })
      .from(rides)
      .where(and(eq(rides.status, "cancelled"), gte(rides.createdAt, since)))
      .groupBy(sql`HOUR(${rides.createdAt})`)
      .orderBy(sql`HOUR(${rides.createdAt})`),
    db
      .select({
        area: sql<string>`TRIM(SUBSTRING_INDEX(${rides.pickupAddress}, ',', 1))`,
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
        gmv: sql<string>`SUM(CASE WHEN ${rides.status} = 'completed' THEN ${rides.totalFare} ELSE 0 END)`,
      })
      .from(rides)
      .where(gte(rides.createdAt, since))
      .groupBy(sql`TRIM(SUBSTRING_INDEX(${rides.pickupAddress}, ',', 1))`)
      .orderBy(desc(count()))
      .limit(12),
    computeCohortRetention(),
  ]);

  const signups = Number(passengerFunnel?.signups ?? 0);
  const firstRide = Number(passengerFunnel?.firstRide ?? 0);
  const completedRide = Number(passengerFunnel?.completedRide ?? 0);
  const repeat = Number(repeatRiders?.c ?? 0);

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return {
    periodDays: days,
    rideLifecycle: {
      requested: Number(rideLifecycle?.requested ?? 0),
      matched: Number(rideLifecycle?.matched ?? 0),
      driverAssigned: Number(rideLifecycle?.driverAssigned ?? 0),
      inProgress: Number(rideLifecycle?.inProgress ?? 0),
      completed: Number(rideLifecycle?.completed ?? 0),
      cancelled: Number(rideLifecycle?.cancelled ?? 0),
      conversionRate: pct(Number(rideLifecycle?.completed ?? 0), Number(rideLifecycle?.requested ?? 0)),
    },
    passengerFunnel: {
      signups,
      firstRide,
      completedRide,
      repeatRiders: repeat,
      signupToFirstRide: pct(firstRide, signups),
      firstToCompleted: pct(completedRide, firstRide),
      repeatRate: pct(repeat, completedRide),
    },
    driverFunnel: {
      applications: Number(driverFunnel?.applications ?? 0),
      approved: Number(driverFunnel?.approved ?? 0),
      activeDrivers: Number(driverFunnel?.activeDrivers ?? 0),
      approvalRate: pct(Number(driverFunnel?.approved ?? 0), Number(driverFunnel?.applications ?? 0)),
    },
    revenueFunnel: {
      completedRides: Number(revenueFunnel?.completedRides ?? 0),
      paid: Number(revenueFunnel?.paid ?? 0),
      refunded: Number(revenueFunnel?.refunded ?? 0),
      paymentRate: pct(Number(revenueFunnel?.paid ?? 0), Number(revenueFunnel?.completedRides ?? 0)),
    },
    cancellation: {
      reasons: cancellationReasons.map((r) => ({
        reason: r.reason,
        count: Number(r.count),
      })),
      byHour: cancellationByHour.map((h) => ({
        hour: Number(h.hour),
        label: `${String(h.hour).padStart(2, "0")}:00`,
        count: Number(h.cancelled),
      })),
      rate: pct(Number(rideLifecycle?.cancelled ?? 0), Number(rideLifecycle?.requested ?? 0)),
    },
    geographic: geographic
      .filter((g) => g.area && g.area.length > 2)
      .map((g) => ({
        area: g.area.slice(0, 80),
        total: Number(g.total),
        completed: Number(g.completed),
        cancelled: Number(g.cancelled),
        gmv: parseFloat(g.gmv || "0"),
        conversionRate: pct(Number(g.completed), Number(g.total)),
      })),
    cohortRetention,
    timestamp: new Date().toISOString(),
  };
}

async function computeCohortRetention() {
  const weeks = 6;
  const cohorts: Array<{ week: string; cohortSize: number; retention: number[] }> = [];

  for (let w = weeks; w >= 0; w--) {
    const cohortStart = new Date(Date.now() - (w + 1) * 7 * 86400000);
    const cohortEnd = new Date(Date.now() - w * 7 * 86400000);

    const [cohortRow] = await db
      .select({ c: count() })
      .from(users)
      .where(and(gte(users.createdAt, cohortStart), lte(users.createdAt, cohortEnd)));
    const cohortSize = Number(cohortRow?.c ?? 0);
    if (cohortSize === 0) continue;

    const retention: number[] = [];
    for (let wk = 0; wk < Math.min(4, weeks - w); wk++) {
      const actStart = new Date(cohortEnd.getTime() + wk * 7 * 86400000);
      const actEnd = new Date(actStart.getTime() + 7 * 86400000);
      const [activeRow] = await db
        .select({ c: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})` })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .innerJoin(users, eq(ridePassengers.passengerId, users.id))
        .where(
          and(
            gte(users.createdAt, cohortStart),
            lte(users.createdAt, cohortEnd),
            gte(rides.createdAt, actStart),
            lte(rides.createdAt, actEnd),
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
