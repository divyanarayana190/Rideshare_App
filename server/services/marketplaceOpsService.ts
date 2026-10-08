/**
 * Marketplace operations center — real-time supply/demand metrics with filters.
 */
import { and, count, eq, gte, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  driverSessions,
  emergencyAlerts,
  supportTickets,
  surgeZones,
} from "../../drizzle/schema";

export type MarketplaceFilters = {
  city?: string;
  university?: string;
  companyDomain?: string;
  dateFrom?: string;
  dateTo?: string;
  rideType?: string;
  womenOnly?: boolean;
  studentVerified?: boolean;
  scheduled?: boolean;
};

function parseDateRange(filters: MarketplaceFilters): { since?: Date; until?: Date } {
  const since = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
  const until = filters.dateTo ? new Date(filters.dateTo) : undefined;
  return { since, until };
}

function buildRideConditions(filters: MarketplaceFilters) {
  const { since, until } = parseDateRange(filters);
  const conditions: any[] = [];
  if (since) conditions.push(gte(rides.createdAt, since));
  if (until) conditions.push(lte(rides.createdAt, until));
  if (filters.rideType && filters.rideType !== "all") {
    conditions.push(eq(rides.mode, filters.rideType as "solo" | "share"));
  }
  if (filters.womenOnly) {
    conditions.push(ne(rides.safetyMode, "none"));
  }
  if (filters.scheduled === true) {
    conditions.push(sql`${rides.departureTime} IS NOT NULL`);
  } else if (filters.scheduled === false) {
    conditions.push(sql`${rides.departureTime} IS NULL`);
  }
  if (filters.city) {
    conditions.push(or(
      like(rides.pickupAddress, `%${filters.city}%`),
      like(rides.dropoffAddress, `%${filters.city}%`),
    ));
  }
  return conditions;
}

async function rideIdsMatchingPassengerFilter(filters: MarketplaceFilters): Promise<number[] | null> {
  if (!filters.university && !filters.companyDomain && !filters.studentVerified) return null;

  const profileConds: any[] = [];
  if (filters.university) {
    profileConds.push(eq(userProfiles.studentUniversityDomain, filters.university));
  }
  if (filters.studentVerified) {
    profileConds.push(eq(userProfiles.isStudentVerified, true));
  }
  if (filters.companyDomain) {
    profileConds.push(like(users.email, `%@${filters.companyDomain}`));
  }

  const rows = await db
    .select({ rideId: ridePassengers.rideId })
    .from(ridePassengers)
    .innerJoin(users, eq(ridePassengers.passengerId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(profileConds.length ? and(...profileConds) : undefined)
    .groupBy(ridePassengers.rideId);

  return rows.map((r) => r.rideId);
}

export async function getMarketplaceOps(filters: MarketplaceFilters = {}) {
  const rideConds = buildRideConditions(filters);
  const passengerRideIds = await rideIdsMatchingPassengerFilter(filters);

  const applyPassengerFilter = (extra: any[] = []) => {
    const all = [...rideConds, ...extra];
    if (passengerRideIds !== null) {
      if (passengerRideIds.length === 0) return sql`1=0`;
      all.push(inArray(rides.id, passengerRideIds));
    }
    return all.length ? and(...all) : undefined;
  };

  const [onlineRow] = await db
    .select({ count: count() })
    .from(driverSessions)
    .where(eq(driverSessions.status, "online"));
  const [onRideRow] = await db
    .select({ count: count() })
    .from(driverSessions)
    .where(eq(driverSessions.status, "on_ride"));
  const [offlineRow] = await db
    .select({ count: count() })
    .from(driverSessions)
    .where(eq(driverSessions.status, "offline"));
  const [totalDriversRow] = await db
    .select({ count: count() })
    .from(userProfiles)
    .where(eq(userProfiles.isDriver, true));

  const activeStatuses = ["searching", "matched", "driver_arrived", "in_progress"] as const;
  const whereActive = applyPassengerFilter([inArray(rides.status, [...activeStatuses])]);
  const whereSearching = applyPassengerFilter([eq(rides.status, "searching")]);
  const whereCancelled = applyPassengerFilter([eq(rides.status, "cancelled")]);

  const [activeTripsRow] = await db.select({ count: count() }).from(rides).where(whereActive);
  const [waitingRow] = await db.select({ count: count() }).from(rides).where(whereSearching);
  const [cancelledRow] = await db.select({ count: count() }).from(rides).where(whereCancelled);

  const [passengersWaitingRow] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${ridePassengers.passengerId})` })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(eq(rides.status, "searching"));

  const [sosRow] = await db
    .select({ count: count() })
    .from(emergencyAlerts)
    .where(eq(emergencyAlerts.status, "active"));
  const [escalationsRow] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(and(
      inArray(supportTickets.status, ["open", "in_progress"]),
      eq(supportTickets.priority, "urgent"),
    ));

  const since6h = new Date(Date.now() - 6 * 3600000);
  const demandWhere = rideConds.length
    ? and(gte(rides.createdAt, since6h), ...rideConds)
    : gte(rides.createdAt, since6h);
  let demandPoints = await db
    .select({ lat: rides.pickupLat, lng: rides.pickupLng, status: rides.status })
    .from(rides)
    .where(demandWhere)
    .limit(500);

  if (passengerRideIds !== null) {
    if (passengerRideIds.length === 0) {
      demandPoints = [];
    } else {
      demandPoints = await db
        .select({ lat: rides.pickupLat, lng: rides.pickupLng, status: rides.status })
        .from(rides)
        .where(and(demandWhere, inArray(rides.id, passengerRideIds)))
        .limit(500);
    }
  }

  const supplyPoints = await db
    .select({
      lat: driverSessions.currentLat,
      lng: driverSessions.currentLng,
      status: driverSessions.status,
      driverId: driverSessions.driverId,
    })
    .from(driverSessions)
    .where(or(eq(driverSessions.status, "online"), eq(driverSessions.status, "on_ride")));

  const activeRideList = await db
    .select({
      id: rides.id,
      rideId: rides.rideId,
      status: rides.status,
      mode: rides.mode,
      safetyMode: rides.safetyMode,
      pickupAddress: rides.pickupAddress,
      dropoffAddress: rides.dropoffAddress,
      totalFare: rides.totalFare,
      createdAt: rides.createdAt,
      driverId: rides.driverId,
    })
    .from(rides)
    .where(whereActive)
    .orderBy(sql`${rides.createdAt} DESC`)
    .limit(25);

  const driverIds = [...new Set(activeRideList.map((r) => r.driverId).filter((id): id is number => id != null))];
  const driverNames =
    driverIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, driverIds))
      : [];
  const nameMap = Object.fromEntries(driverNames.map((d) => [d.id, d.name]));

  const totalOnline = Number(onlineRow?.count ?? 0) + Number(onRideRow?.count ?? 0);
  const utilization =
    totalOnline > 0 ? Math.round((Number(onRideRow?.count ?? 0) / totalOnline) * 1000) / 10 : 0;
  const fillRate =
    Number(activeTripsRow?.count ?? 0) + Number(waitingRow?.count ?? 0) > 0
      ? Math.round(
          (Number(activeTripsRow?.count ?? 0) /
            (Number(activeTripsRow?.count ?? 0) + Number(waitingRow?.count ?? 0))) *
            1000,
        ) / 10
      : 100;

  const surgeActive = await db
    .select({ id: surgeZones.id, name: surgeZones.name, multiplier: surgeZones.multiplier, centerLat: surgeZones.centerLat, centerLng: surgeZones.centerLng })
    .from(surgeZones)
    .where(eq(surgeZones.isActive, true))
    .limit(20);

  return {
    supply: {
      online: Number(onlineRow?.count ?? 0),
      onRide: Number(onRideRow?.count ?? 0),
      offline: Number(offlineRow?.count ?? 0),
      totalDrivers: Number(totalDriversRow?.count ?? 0),
      utilization,
      points: supplyPoints
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          lat: parseFloat(String(p.lat)),
          lng: parseFloat(String(p.lng)),
          status: p.status,
          driverId: p.driverId,
        })),
    },
    demand: {
      waitingTrips: Number(waitingRow?.count ?? 0),
      passengersWaiting: Number(passengersWaitingRow?.count ?? 0),
      points: demandPoints
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          lat: parseFloat(String(p.lat)),
          lng: parseFloat(String(p.lng)),
          weight: p.status === "cancelled" ? 0.3 : 1,
        })),
    },
    marketplace: {
      activeTrips: Number(activeTripsRow?.count ?? 0),
      tripsWithoutDriver: Number(waitingRow?.count ?? 0),
      cancelledTrips: Number(cancelledRow?.count ?? 0),
      fillRate,
      health: fillRate >= 80 && utilization >= 30 ? "healthy" : fillRate >= 50 ? "degraded" : "critical",
    },
    safety: {
      sosEvents: Number(sosRow?.count ?? 0),
      supportEscalations: Number(escalationsRow?.count ?? 0),
    },
    surgeZones: surgeActive,
    activeRides: activeRideList.map((r) => ({
      ...r,
      driverName: r.driverId != null ? (nameMap[r.driverId] || `Driver #${r.driverId}`) : null,
    })),
    filters,
    timestamp: new Date().toISOString(),
  };
}

export async function listUniversities() {
  const rows = await db
    .select({
      domain: userProfiles.studentUniversityDomain,
      name: userProfiles.studentUniversityName,
      students: count(),
    })
    .from(userProfiles)
    .where(sql`${userProfiles.studentUniversityDomain} IS NOT NULL AND ${userProfiles.studentUniversityDomain} != ''`)
    .groupBy(userProfiles.studentUniversityDomain, userProfiles.studentUniversityName)
    .orderBy(sql`COUNT(*) DESC`);

  const driverCounts = await db
    .select({
      domain: userProfiles.studentUniversityDomain,
      drivers: count(),
    })
    .from(userProfiles)
    .where(and(
      eq(userProfiles.isDriver, true),
      sql`${userProfiles.studentUniversityDomain} IS NOT NULL`,
    ))
    .groupBy(userProfiles.studentUniversityDomain);

  const driverMap = Object.fromEntries(
    driverCounts.map((d) => [d.domain, Number(d.drivers)]),
  );

  return rows
    .filter((r) => r.domain)
    .map((r) => ({
      domain: r.domain!,
      name: r.name || r.domain!,
      students: Number(r.students),
      drivers: driverMap[r.domain!] ?? 0,
    }));
}

export async function listCompanyDomains() {
  const rows = await db
    .select({
      domain: sql<string>`SUBSTRING_INDEX(${users.email}, '@', -1)`.as("domain"),
      count: count(),
    })
    .from(users)
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(and(
      sql`${users.email} IS NOT NULL`,
      sql`${users.email} LIKE '%@%'`,
      sql`SUBSTRING_INDEX(${users.email}, '@', -1) NOT LIKE '%.edu'`,
      eq(userProfiles.isStudent, false),
    ))
    .groupBy(sql`SUBSTRING_INDEX(${users.email}, '@', -1)`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(50);

  return rows
    .filter((r) => r.domain && !r.domain.includes("gmail") && !r.domain.includes("yahoo") && !r.domain.includes("hotmail") && !r.domain.includes("icloud"))
    .map((r) => ({ domain: r.domain, employees: Number(r.count) }));
}
