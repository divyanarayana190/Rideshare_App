/**
 * Executive dashboard metrics — all values from production DB tables.
 */
import { and, count, eq, gte, inArray, lte, sql, sum, avg } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  driverSessions,
  emergencyAlerts,
  fraudFlags,
  supportTickets,
  platformConfig,
} from "../../drizzle/schema";
import { getLedgerRevenueTotal } from "./paymentLedgerService";

function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

async function getCommissionPct(): Promise<number> {
  const [row] = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, "commission_pct"))
    .limit(1);
  const pct = parseFloat(row?.value ?? "15");
  return Number.isFinite(pct) ? pct : 15;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getExecutiveMetrics() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);
  const prevWeekStart = daysAgo(14);
  const prevMonthStart = daysAgo(60);

  const commissionPct = await getCommissionPct();

  const [
    revenueToday,
    revenueWeek,
    revenueMonth,
    revenuePrevWeek,
    revenuePrevMonth,
  ] = await Promise.all([
    getLedgerRevenueTotal(todayStart),
    getLedgerRevenueTotal(weekStart),
    getLedgerRevenueTotal(monthStart),
    getLedgerRevenueTotal(prevWeekStart).then(async (twoWeek) => {
      const oneWeek = await getLedgerRevenueTotal(weekStart);
      return twoWeek - oneWeek;
    }),
    getLedgerRevenueTotal(prevMonthStart).then(async (twoMonth) => {
      const oneMonth = await getLedgerRevenueTotal(monthStart);
      return twoMonth - oneMonth;
    }),
  ]);

  const [gmvTodayRow] = await db
    .select({ total: sum(rides.totalFare) })
    .from(rides)
    .where(and(gte(rides.createdAt, todayStart), eq(rides.status, "completed")));
  const [gmvMonthRow] = await db
    .select({ total: sum(rides.totalFare) })
    .from(rides)
    .where(and(gte(rides.createdAt, monthStart), eq(rides.status, "completed")));

  const gmvToday = Number(gmvTodayRow?.total ?? 0);
  const gmvMonth = Number(gmvMonthRow?.total ?? 0);
  const platformTakeRate =
    gmvMonth > 0 ? Math.round((revenueMonth / gmvMonth) * 1000) / 10 : commissionPct;

  const [totalDriversRow] = await db
    .select({ count: count() })
    .from(userProfiles)
    .where(eq(userProfiles.isDriver, true));
  const [onlineDriversRow] = await db
    .select({ count: count() })
    .from(driverSessions)
    .where(eq(driverSessions.status, "online"));
  const [onRideDriversRow] = await db
    .select({ count: count() })
    .from(driverSessions)
    .where(eq(driverSessions.status, "on_ride"));

  const activeStatuses = ["searching", "matched", "driver_arrived", "in_progress"] as const;
  const [activePassengersRow] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})` })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(inArray(rides.status, [...activeStatuses]));

  const [tripsTodayRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(gte(rides.createdAt, todayStart));
  const [tripsInProgressRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(eq(rides.status, "in_progress"));
  const [tripsWaitingRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(eq(rides.status, "searching"));
  const [tripsCompletedTodayRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(and(gte(rides.createdAt, todayStart), eq(rides.status, "completed")));
  const [tripsCancelledTodayRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(and(gte(rides.createdAt, todayStart), eq(rides.status, "cancelled")));

  const totalOnline = Number(onlineDriversRow?.count ?? 0) + Number(onRideDriversRow?.count ?? 0);
  const driverUtilization =
    totalOnline > 0
      ? Math.round((Number(onRideDriversRow?.count ?? 0) / totalOnline) * 1000) / 10
      : 0;

  const oneHourAgo = new Date(Date.now() - 3600000);
  const [recentRequestsRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(gte(rides.createdAt, oneHourAgo));
  const [recentCancelledRow] = await db
    .select({ count: count() })
    .from(rides)
    .where(and(gte(rides.createdAt, oneHourAgo), eq(rides.status, "cancelled")));
  const recentRequests = Number(recentRequestsRow?.count ?? 0);
  const marketplaceFillRate =
    recentRequests > 0
      ? Math.round(((recentRequests - Number(recentCancelledRow?.count ?? 0)) / recentRequests) * 1000) / 10
      : 100;

  const [avgWaitRow] = await db
    .select({
      avgSec: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${rides.createdAt}, ${rides.driverAssignedAt}))`,
    })
    .from(rides)
    .where(
      and(
        gte(rides.createdAt, weekStart),
        eq(rides.status, "completed"),
        sql`${rides.driverAssignedAt} IS NOT NULL`,
      ),
    );
  const [avgDistanceRow] = await db
    .select({ avg: avg(rides.distanceKm) })
    .from(rides)
    .where(and(gte(rides.createdAt, monthStart), eq(rides.status, "completed")));
  const [avgDurationRow] = await db
    .select({
      avgMin: sql<number>`AVG(TIMESTAMPDIFF(MINUTE, ${rides.startedAt}, ${rides.completedAt}))`,
    })
    .from(rides)
    .where(
      and(
        gte(rides.createdAt, monthStart),
        eq(rides.status, "completed"),
        sql`${rides.startedAt} IS NOT NULL`,
        sql`${rides.completedAt} IS NOT NULL`,
      ),
    );

  const repeatRiders = await db
    .select({
      passengerId: ridePassengers.passengerId,
      rideCount: count(),
    })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(gte(rides.createdAt, monthStart), eq(rides.status, "completed")))
    .groupBy(ridePassengers.passengerId);
  const totalRiders = repeatRiders.length;
  const repeatCount = repeatRiders.filter((r) => Number(r.rideCount) > 1).length;
  const repeatRiderPct = totalRiders > 0 ? Math.round((repeatCount / totalRiders) * 1000) / 10 : 0;

  const [dauRow] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.lastSignedIn, daysAgo(1)));
  const [wauRow] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.lastSignedIn, daysAgo(7)));
  const [mauRow] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.lastSignedIn, daysAgo(30)));

  const [usersThisMonthRow] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, monthStart));
  const [usersPrevMonthRow] = await db
    .select({ count: count() })
    .from(users)
    .where(and(gte(users.createdAt, prevMonthStart), lte(users.createdAt, monthStart)));
  const [driversThisMonthRow] = await db
    .select({ count: count() })
    .from(userProfiles)
    .where(and(eq(userProfiles.isDriver, true), gte(userProfiles.createdAt, monthStart)));
  const [driversPrevMonthRow] = await db
    .select({ count: count() })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.isDriver, true),
        gte(userProfiles.createdAt, prevMonthStart),
        lte(userProfiles.createdAt, monthStart),
      ),
    );

  const [openTicketsRow] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(inArray(supportTickets.status, ["open", "in_progress"]));
  const [safetyIncidentsRow] = await db
    .select({ count: count() })
    .from(emergencyAlerts)
    .where(eq(emergencyAlerts.status, "active"));
  const [fraudAlertsRow] = await db
    .select({ count: count() })
    .from(fraudFlags)
    .where(eq(fraudFlags.status, "open"));

  const matchRate = marketplaceFillRate;
  const cancellationRate =
    Number(tripsTodayRow?.count ?? 0) > 0
      ? Math.round((Number(tripsCancelledTodayRow?.count ?? 0) / Number(tripsTodayRow?.count ?? 1)) * 1000) / 10
      : 0;
  const systemHealth =
    matchRate >= 80 && cancellationRate < 20 && totalOnline >= 3
      ? "healthy"
      : matchRate >= 60
        ? "degraded"
        : "critical";

  return {
    revenueToday,
    revenueWeek,
    revenueMonth,
    gmvToday,
    gmvMonth,
    platformTakeRate,
    commissionPct,
    activeDrivers: Number(totalDriversRow?.count ?? 0),
    onlineDrivers: Number(onlineDriversRow?.count ?? 0),
    activePassengers: Number(activePassengersRow?.count ?? 0),
    tripsToday: Number(tripsTodayRow?.count ?? 0),
    tripsInProgress: Number(tripsInProgressRow?.count ?? 0),
    tripsWaitingForDriver: Number(tripsWaitingRow?.count ?? 0),
    tripsCompletedToday: Number(tripsCompletedTodayRow?.count ?? 0),
    tripsCancelledToday: Number(tripsCancelledTodayRow?.count ?? 0),
    driverUtilization,
    marketplaceFillRate,
    averageWaitTimeMinutes: Math.round((Number(avgWaitRow?.avgSec ?? 0) / 60) * 10) / 10,
    averageRideDistanceKm: Math.round(Number(avgDistanceRow?.avg ?? 0) * 100) / 100,
    averageRideDurationMinutes: Math.round(Number(avgDurationRow?.avgMin ?? 0) * 10) / 10,
    repeatRiderPct,
    dau: Number(dauRow?.count ?? 0),
    wau: Number(wauRow?.count ?? 0),
    mau: Number(mauRow?.count ?? 0),
    userGrowthPct: pctChange(Number(usersThisMonthRow?.count ?? 0), Number(usersPrevMonthRow?.count ?? 0)),
    driverGrowthPct: pctChange(
      Number(driversThisMonthRow?.count ?? 0),
      Number(driversPrevMonthRow?.count ?? 0),
    ),
    revenueGrowthPct: pctChange(revenueMonth, revenuePrevMonth),
    supportTicketsOpen: Number(openTicketsRow?.count ?? 0),
    safetyIncidents: Number(safetyIncidentsRow?.count ?? 0),
    fraudAlerts: Number(fraudAlertsRow?.count ?? 0),
    systemHealth,
    timestamp: now.toISOString(),
  };
}
