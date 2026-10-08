import { and, eq, inArray, sql } from "drizzle-orm";
import { rides } from "../../drizzle/schema";
import { db, findMatchingSharedRides, getOnlineDriversNear } from "../db";
import {
  calculateFare,
  computeSmartSurge,
  type FareBreakdown,
} from "./fareEngine";
import { getRouteWithPolyline } from "./googleMaps";

export type RideOptionType = "share" | "priority" | "solo" | "waitsave" | "premium";

export type PricingInsight = {
  type: "lower_prices" | "high_demand" | "shared_available" | "limited_drivers" | "normal";
  title: string;
  subtitle: string;
  trend: "down" | "up" | "neutral";
  severity: "positive" | "warning" | "neutral";
};

export type RideOptionBreakdown = {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  serviceFee: number;
  discount: number;
  surgeFee: number;
  totalFare: number;
};

export type RideOptionResult = {
  id: RideOptionType;
  type: RideOptionType;
  title: string;
  description: string;
  capacity: number;
  pickupEtaMinutes: number;
  pickupEtaMaxMinutes?: number;
  arrivalTime: string;
  fareCents: number;
  comparisonFareCents: number | null;
  avgFareCents: number;
  savingsPercent: number | null;
  badge: string | null;
  available: boolean;
  disabledReason: string | null;
  isShare: boolean;
  breakdown: RideOptionBreakdown;
};

export type RideOptionsResponse = {
  route: {
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    distanceMiles: number;
    durationMinutes: number;
    polyline: string | null;
  };
  options: RideOptionResult[];
  pricingInsight: PricingInsight;
  scheduledAt: string | null;
};

function kmToMiles(km: number) {
  return Math.round(km * 0.621371 * 10) / 10;
}

function fareToBreakdown(fare: FareBreakdown): RideOptionBreakdown {
  return {
    baseFare: fare.baseFare,
    distanceFee: fare.distanceFare,
    timeFee: fare.timeFare,
    serviceFee: fare.platformFee + fare.bookingFee,
    discount: fare.shareDiscount + fare.promoDiscount,
    surgeFee: fare.surgeAmount,
    totalFare: fare.totalFare,
  };
}

function formatArrivalTime(minutesFromNow: number, scheduledAt?: Date | null): string {
  const target = scheduledAt && scheduledAt.getTime() > Date.now() + 5 * 60_000
    ? scheduledAt
    : new Date(Date.now() + minutesFromNow * 60_000);
  const h = target.getHours();
  const m = target.getMinutes().toString().padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

function estimatePickupEta(
  driverCount: number,
  optionType: RideOptionType,
  scheduledAt?: Date | null,
): { min: number; max?: number } {
  if (scheduledAt && scheduledAt.getTime() > Date.now() + 20 * 60_000) {
    const mins = Math.max(0, Math.round((scheduledAt.getTime() - Date.now()) / 60_000));
    return { min: mins };
  }

  let base =
    driverCount >= 8 ? 5 :
    driverCount >= 5 ? 6 :
    driverCount >= 3 ? 8 :
    driverCount >= 1 ? 11 : 14;

  if (optionType === "priority") return { min: Math.max(4, Math.round(base * 0.75)) };
  if (optionType === "waitsave") return { min: Math.round(base * 1.2), max: Math.round(base * 2.1) };
  if (optionType === "share") return { min: Math.max(4, base - 1) };
  if (optionType === "premium") return { min: Math.max(5, base) };
  return { min: base };
}

function buildPricingInsight(params: {
  surge: number;
  driverCount: number;
  shareMatches: number;
}): PricingInsight {
  const { surge, driverCount, shareMatches } = params;

  if (driverCount === 0) {
    return {
      type: "limited_drivers",
      title: "Limited drivers nearby",
      subtitle: "Wait times may be longer than usual",
      trend: "up",
      severity: "warning",
    };
  }
  if (surge >= 1.4) {
    return {
      type: "high_demand",
      title: "High demand right now",
      subtitle: `Surge pricing · ${surge.toFixed(1)}× in your area`,
      trend: "up",
      severity: "warning",
    };
  }
  if (shareMatches > 0) {
    return {
      type: "shared_available",
      title: "Shared rides available nearby",
      subtitle: `${shareMatches} route${shareMatches === 1 ? "" : "s"} you can join now`,
      trend: "down",
      severity: "positive",
    };
  }
  if (surge <= 1.05 && driverCount >= 4) {
    return {
      type: "lower_prices",
      title: "Prices are lower right now",
      subtitle: "High availability in your area",
      trend: "down",
      severity: "positive",
    };
  }
  return {
    type: "normal",
    title: "Standard pricing applies",
    subtitle: `${driverCount} driver${driverCount === 1 ? "" : "s"} nearby`,
    trend: "neutral",
    severity: "neutral",
  };
}

function avgFareMultiplier(optionType: RideOptionType): number {
  if (optionType === "share") return 1.0;
  if (optionType === "priority") return 1.53;
  if (optionType === "waitsave") return 1.2;
  if (optionType === "premium") return 1.65;
  return 1.44;
}

export async function getRideOptionsForTrip(input: {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt?: string | null;
  passengerCount?: number;
}): Promise<RideOptionsResponse> {
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

  const routeData = await getRouteWithPolyline({
    originLat: input.pickupLat,
    originLng: input.pickupLng,
    destinationLat: input.dropoffLat,
    destinationLng: input.dropoffLng,
  });

  const distanceKm = routeData.distanceKm;
  const durationMinutes = Math.max(1, Math.round(routeData.durationMin));

  const [drivers, shareMatches, activeRequestsRows] = await Promise.all([
    getOnlineDriversNear(input.pickupLat, input.pickupLng, 15),
    findMatchingSharedRides(
      input.pickupLat,
      input.pickupLng,
      input.dropoffLat,
      input.dropoffLng,
      15,
    ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(rides)
      .where(
        and(
          inArray(rides.status, ["searching", "matched"]),
          sql`${rides.createdAt} >= ${new Date(Date.now() - 30 * 60_000)}`,
          sql`${rides.pickupLat} BETWEEN ${input.pickupLat - 0.15} AND ${input.pickupLat + 0.15}`,
          sql`${rides.pickupLng} BETWEEN ${input.pickupLng - 0.15} AND ${input.pickupLng + 0.15}`,
        ),
      ),
  ]);

  const driverCount = drivers.length;
  const activeRequests = Number(activeRequestsRows[0]?.count ?? 0);
  const surge = await computeSmartSurge(
    input.pickupLat,
    input.pickupLng,
    activeRequests,
    driverCount,
  );

  const soloBase = calculateFare({
    distanceKm,
    durationMinutes,
    mode: "solo",
    vehicleClass: "comfort",
    surgeMultiplier: surge,
  });
  const shareBase = calculateFare({
    distanceKm,
    durationMinutes,
    mode: "share",
    vehicleClass: "standard",
    surgeMultiplier: surge,
  });
  const premiumBase = calculateFare({
    distanceKm,
    durationMinutes,
    mode: "solo",
    vehicleClass: "xl",
    surgeMultiplier: surge,
  });

  const priorityFare = calculateFare({
    distanceKm,
    durationMinutes,
    mode: "solo",
    vehicleClass: "comfort",
    surgeMultiplier: Math.min(3, surge * 1.08),
  });
  priorityFare.totalFare = Math.round(soloBase.totalFare * 1.18 * 100) / 100;

  const waitSaveFare = calculateFare({
    distanceKm,
    durationMinutes,
    mode: "solo",
    vehicleClass: "comfort",
    surgeMultiplier: Math.max(1, surge * 0.92),
  });
  waitSaveFare.totalFare = Math.round(soloBase.totalFare * 0.91 * 100) / 100;

  const shareAvailable = shareMatches.length > 0 || driverCount > 0;
  const pricingInsight = buildPricingInsight({
    surge,
    driverCount,
    shareMatches: shareMatches.length,
  });

  const defs: Array<{
    id: RideOptionType;
    title: string;
    description: string;
    capacity: number;
    fare: FareBreakdown;
    comparison: number | null;
    savingsPercent: number | null;
    badge: string | null;
    isShare: boolean;
    available: boolean;
    disabledReason: string | null;
  }> = [
    {
      id: "share",
      title: "Share Ride",
      description: "Share with others, save more",
      capacity: 3,
      fare: shareBase,
      comparison: soloBase.totalFare,
      savingsPercent: Math.round(((soloBase.totalFare - shareBase.totalFare) / soloBase.totalFare) * 100),
      badge: shareBase.shareDiscount > 0
        ? `Save up to ${Math.min(40, Math.round(((soloBase.totalFare - shareBase.totalFare) / soloBase.totalFare) * 100))}%`
        : null,
      isShare: true,
      available: shareAvailable,
      disabledReason: shareAvailable ? null : "No shared routes available nearby",
    },
    {
      id: "priority",
      title: "Priority Pickup",
      description: "Get picked up faster",
      capacity: 4,
      fare: priorityFare,
      comparison: null,
      savingsPercent: null,
      badge: null,
      isShare: false,
      available: driverCount > 0,
      disabledReason: driverCount > 0 ? null : "No drivers online nearby",
    },
    {
      id: "solo",
      title: "Solo Ride",
      description: "Private ride just for you",
      capacity: 4,
      fare: soloBase,
      comparison: null,
      savingsPercent: null,
      badge: null,
      isShare: false,
      available: driverCount > 0 || scheduledAt != null,
      disabledReason: driverCount > 0 || scheduledAt ? null : "No drivers online nearby",
    },
    {
      id: "waitsave",
      title: "Wait & Save",
      description: "Lower fare, longer wait",
      capacity: 4,
      fare: waitSaveFare,
      comparison: null,
      savingsPercent: Math.round(((soloBase.totalFare - waitSaveFare.totalFare) / soloBase.totalFare) * 100),
      badge: null,
      isShare: false,
      available: driverCount > 0,
      disabledReason: driverCount > 0 ? null : "No drivers online nearby",
    },
    {
      id: "premium",
      title: "Premium Ride",
      description: "Extra space and top-rated drivers",
      capacity: 4,
      fare: premiumBase,
      comparison: null,
      savingsPercent: null,
      badge: "Premium",
      isShare: false,
      available: driverCount >= 1,
      disabledReason: driverCount >= 1 ? null : "Premium drivers unavailable nearby",
    },
  ];

  const options: RideOptionResult[] = defs.map((d) => {
    const eta = estimatePickupEta(driverCount, d.id, scheduledAt);
    const avgFare = Math.round(soloBase.totalFare * avgFareMultiplier(d.id) * 100) / 100;
    const pickupMinutes = eta.min + durationMinutes;
    return {
      id: d.id,
      type: d.id,
      title: d.title,
      description: d.description,
      capacity: d.capacity,
      pickupEtaMinutes: eta.min,
      pickupEtaMaxMinutes: eta.max,
      arrivalTime: formatArrivalTime(pickupMinutes, scheduledAt),
      fareCents: Math.round(d.fare.totalFare * 100),
      comparisonFareCents: d.comparison != null ? Math.round(d.comparison * 100) : null,
      avgFareCents: Math.round(avgFare * 100),
      savingsPercent: d.savingsPercent,
      badge: d.badge,
      available: d.available,
      disabledReason: d.disabledReason,
      isShare: d.isShare,
      breakdown: fareToBreakdown(d.fare),
    };
  });

  return {
    route: {
      pickupAddress: input.pickupAddress ?? "",
      dropoffAddress: input.dropoffAddress ?? "",
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropoffLat: input.dropoffLat,
      dropoffLng: input.dropoffLng,
      distanceMiles: kmToMiles(distanceKm),
      durationMinutes,
      polyline: routeData.polyline,
    },
    options,
    pricingInsight,
    scheduledAt: scheduledAt?.toISOString() ?? null,
  };
}

export async function getPricingInsightForTrip(input: {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}): Promise<PricingInsight> {
  const [drivers, shareMatches, activeRequestsRows] = await Promise.all([
    getOnlineDriversNear(input.pickupLat, input.pickupLng, 15),
    findMatchingSharedRides(
      input.pickupLat,
      input.pickupLng,
      input.dropoffLat,
      input.dropoffLng,
      15,
    ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(rides)
      .where(
        and(
          inArray(rides.status, ["searching", "matched"]),
          sql`${rides.createdAt} >= ${new Date(Date.now() - 30 * 60_000)}`,
        ),
      ),
  ]);
  const surge = await computeSmartSurge(
    input.pickupLat,
    input.pickupLng,
    Number(activeRequestsRows[0]?.count ?? 0),
    drivers.length,
  );
  return buildPricingInsight({
    surge,
    driverCount: drivers.length,
    shareMatches: shareMatches.length,
  });
}
