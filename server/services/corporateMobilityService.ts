/**
 * Corporate mobility — grouped by user email domain (no B2B schema yet).
 */
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  emergencyAlerts,
} from "../../drizzle/schema";
import { listCompanyDomains } from "./marketplaceOpsService";

const CONSUMER_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "proton.me", "live.com"];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function emailDomainMatch(domain: string) {
  return sql`SUBSTRING_INDEX(${users.email}, '@', -1) = ${domain}`;
}

function corporateRideFilter(domain: string) {
  return sql`(
    ${rides.driverId} IN (
      SELECT u.id FROM users u WHERE SUBSTRING_INDEX(u.email, '@', -1) = ${domain}
    )
    OR ${rides.id} IN (
      SELECT rp.rideId FROM ride_passengers rp
      INNER JOIN users u ON rp.passengerId = u.id
      WHERE SUBSTRING_INDEX(u.email, '@', -1) = ${domain}
    )
  )`;
}

export async function getCorporateMobility(domain: string, days = 30) {
  if (CONSUMER_DOMAINS.some((d) => domain.includes(d)) || domain.endsWith(".edu")) {
    return null;
  }

  const since = daysAgo(days);
  const rideFilter = corporateRideFilter(domain);

  const [employeeRow] = await db
    .select({ employees: count() })
    .from(users)
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(and(emailDomainMatch(domain), sql`${users.email} IS NOT NULL`));

  if (!employeeRow || Number(employeeRow.employees) === 0) return null;

  const [
    [riderStats],
    [driverStats],
    [tripStats],
    [revenueRow],
    popularRoutes,
    peakHours,
    [safetyStats],
    tripsTrend,
    topCommuters,
  ] = await Promise.all([
    db
      .select({ riders: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})` })
      .from(ridePassengers)
      .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
      .innerJoin(users, eq(ridePassengers.passengerId, users.id))
      .where(and(emailDomainMatch(domain), gte(rides.createdAt, since))),
    db
      .select({ drivers: count() })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(and(emailDomainMatch(domain), eq(userProfiles.isDriver, true))),
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
      .innerJoin(users, eq(emergencyAlerts.userId, users.id))
      .where(and(emailDomainMatch(domain), gte(emergencyAlerts.createdAt, since))),
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
    db
      .select({
        userId: ridePassengers.passengerId,
        name: users.name,
        trips: count(),
        spend: sum(rides.totalFare),
      })
      .from(ridePassengers)
      .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
      .innerJoin(users, eq(ridePassengers.passengerId, users.id))
      .where(and(emailDomainMatch(domain), gte(rides.createdAt, since), eq(rides.status, "completed")))
      .groupBy(ridePassengers.passengerId, users.name)
      .orderBy(desc(count()))
      .limit(10),
  ]);

  const employees = Number(employeeRow.employees);
  const activeRiders = Number(riderStats?.riders ?? 0);
  const totalTrips = Number(tripStats?.total ?? 0);
  const completedTrips = Number(tripStats?.completed ?? 0);

  return {
    domain,
    name: domain.replace(/\.(com|org|net|io|co)$/i, "").replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    periodDays: days,
    employees,
    activeRiders,
    adoptionRate: employees > 0 ? Math.round((activeRiders / employees) * 1000) / 10 : 0,
    drivers: Number(driverStats?.drivers ?? 0),
    trips: {
      total: totalTrips,
      completed: completedTrips,
      cancelled: Number(tripStats?.cancelled ?? 0),
      completionRate: totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 1000) / 10 : 0,
      avgPerEmployee: employees > 0 ? Math.round((completedTrips / employees) * 10) / 10 : 0,
    },
    revenue: {
      gmv: parseFloat(String(revenueRow?.gmv ?? "0")),
      avgTripValue: completedTrips > 0 ? parseFloat(String(revenueRow?.gmv ?? "0")) / completedTrips : 0,
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
    safety: { emergencyAlerts: Number(safetyStats?.alerts ?? 0) },
    tripsTrend: tripsTrend.map((t) => ({
      date: t.date,
      trips: Number(t.trips),
      completed: Number(t.completed),
    })),
    topCommuters: topCommuters.map((c) => ({
      userId: c.userId,
      name: c.name || `User #${c.userId}`,
      trips: Number(c.trips),
      spend: parseFloat(String(c.spend ?? "0")).toFixed(2),
    })),
    timestamp: new Date().toISOString(),
  };
}

export { listCompanyDomains };
