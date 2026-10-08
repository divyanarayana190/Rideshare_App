/**
 * Fare Engine — Production-grade fare calculation for YOO
 *
 * Formula:
 *   fare = (baseFare + distanceKm × perKmRate + durationMin × perMinRate) × surgeMultiplier − discount
 *
 * Fare tiers by vehicle type:
 *   standard  → base $3.50, $1.20/km, $0.20/min   (shared default)
 *   economy   → base $2.50, $1.00/km, $0.15/min
 *   comfort   → base $5.00, $1.80/km, $0.30/min   (solo default)
 *   xl        → base $7.00, $2.20/km, $0.35/min
 *
 * Surge: peak hours (7-9 AM, 5-8 PM) and special events push multiplier up to 3×.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export type VehicleClass = "economy" | "standard" | "comfort" | "xl";

const FARE_TIERS: Record<VehicleClass, { baseFare: number; perKm: number; perMin: number }> = {
  economy:  { baseFare: 2.50, perKm: 1.00, perMin: 0.15 },
  standard: { baseFare: 3.50, perKm: 1.20, perMin: 0.20 },
  comfort:  { baseFare: 5.00, perKm: 1.80, perMin: 0.30 },
  xl:       { baseFare: 7.00, perKm: 2.20, perMin: 0.35 },
};

/** Shared-ride passenger gets a discount relative to a solo trip */
const SHARE_DISCOUNT_RATE = 0.40; // 40% cheaper than equivalent solo

const PLATFORM_FEE = 1.50;        // flat platform service charge
const BOOKING_FEE = 0.50;         // booking fee
const MIN_FARE     = 4.00;        // floor price regardless of formula

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  surgeMultiplier: number;
  surgeAmount: number;
  shareDiscount: number;
  promoDiscount: number;
  platformFee: number;
  bookingFee: number;
  totalFare: number;
  /** Per-passenger fare for shared rides */
  farePerPassenger: number | null;
  currency: "USD";
}

export interface FareInput {
  distanceKm: number;
  durationMinutes: number;
  vehicleClass?: VehicleClass;
  mode: "solo" | "share";
  passengerCount?: number;   // for shared rides
  surgeMultiplier?: number;  // pre-computed surge (1.0 = no surge)
  promoDiscountAmount?: number;
  peakHourOverride?: boolean;
}

// ─── Surge Calculation ───────────────────────────────────────────────────────

/**
 * Compute surge multiplier based on time-of-day and day-of-week.
 * In production this would also factor in real-time demand density
 * from the driver_sessions table (demand / supply ratio).
 */
export function computeSurgeMultiplier(
  date: Date = new Date(),
  demandFactor: number = 1.0, // 0.5 (low) → 2.0 (very high)
): number {
  const hour = date.getHours();
  const dow  = date.getDay(); // 0 = Sunday

  let timeSurge = 1.0;

  // Morning rush: 7–9 AM weekdays
  if (dow >= 1 && dow <= 5 && hour >= 7 && hour < 9) timeSurge = 1.3;
  // Evening rush: 5–8 PM weekdays
  else if (dow >= 1 && dow <= 5 && hour >= 17 && hour < 20) timeSurge = 1.5;
  // Late night weekend: Fri/Sat 10 PM – 2 AM
  else if ((dow === 5 || dow === 6) && (hour >= 22 || hour < 2)) timeSurge = 1.8;
  // Saturday afternoon
  else if (dow === 6 && hour >= 12 && hour < 18) timeSurge = 1.2;

  // Combine time surge × demand factor, capped at 3.0
  const combined = timeSurge * demandFactor;
  return Math.min(3.0, Math.round(combined * 10) / 10);
}

// ─── Core Fare Calculator ─────────────────────────────────────────────────────

export function calculateFare(input: FareInput): FareBreakdown {
  const {
    distanceKm: rawDistanceKm,
    durationMinutes: rawDurationMinutes,
    vehicleClass = input.mode === "solo" ? "comfort" : "standard",
    mode,
    passengerCount = 1,
    surgeMultiplier = 1.0,
    promoDiscountAmount = 0,
  } = input;

  // Validate inputs — prevent negative/NaN values
  const distanceKm = Math.max(0, Number.isFinite(rawDistanceKm) ? rawDistanceKm : 0);
  const durationMinutes = Math.max(0, Number.isFinite(rawDurationMinutes) ? rawDurationMinutes : 0);

  const tier = FARE_TIERS[vehicleClass];

  // ── Base calculation ──────────────────────────────────────────────────────
  const baseFare     = tier.baseFare;
  const distanceFare = Math.round(distanceKm * tier.perKm * 100) / 100;
  const timeFare     = Math.round(durationMinutes * tier.perMin * 100) / 100;
  const subtotal     = baseFare + distanceFare + timeFare;

  // ── Surge ─────────────────────────────────────────────────────────────────
  const surge        = Math.max(1.0, surgeMultiplier);
  const surgeAmount  = Math.round((subtotal * (surge - 1)) * 100) / 100;
  const afterSurge   = subtotal + surgeAmount;

  // ── Shared ride discount ──────────────────────────────────────────────────
  const shareDiscount =
    mode === "share"
      ? Math.round(afterSurge * SHARE_DISCOUNT_RATE * 100) / 100
      : 0;
  const afterShare = afterSurge - shareDiscount;

  // ── Promo discount ────────────────────────────────────────────────────────
  const promoDiscount = Math.min(promoDiscountAmount, afterShare);
  const afterPromo    = afterShare - promoDiscount;

  // ── Fees ──────────────────────────────────────────────────────────────────
  const totalFare = Math.max(
    MIN_FARE,
    Math.round((afterPromo + PLATFORM_FEE + BOOKING_FEE) * 100) / 100,
  );

  // ── Per-passenger (shared rides split equally) ────────────────────────────
  const effectivePassengers = mode === "share" ? Math.max(1, passengerCount) : null;
  const farePerPassenger = effectivePassengers
    ? Math.round((totalFare / effectivePassengers) * 100) / 100
    : null;

  return {
    baseFare,
    distanceFare,
    timeFare,
    subtotal,
    surgeMultiplier: surge,
    surgeAmount,
    shareDiscount,
    promoDiscount,
    platformFee: PLATFORM_FEE,
    bookingFee: BOOKING_FEE,
    totalFare,
    farePerPassenger,
    currency: "USD",
  };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Quick estimate for display before booking (no surge lookup) */
export function estimateFare(
  distanceKm: number,
  durationMinutes: number,
  mode: "solo" | "share",
): number {
  const breakdown = calculateFare({ distanceKm, durationMinutes, mode });
  return breakdown.totalFare;
}

/** Driver earnings = 80% of total fare (after platform cut) */
export function computeDriverEarnings(totalFare: number): number {
  return Math.round(totalFare * 0.80 * 100) / 100;
}

/** Format as "$12.50" */
export function formatFare(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ─── Shared Ride Join Fare Calculator ────────────────────────────────────────

export interface JoinFareInput {
  originalRideTotalFare: number;
  originalRideDistanceKm: number;
  joinerDistanceKm: number;
  joinerDurationMinutes: number;
  existingPassengerCount: number;
  /** Extra km of detour required for mid-ride join */
  detourKm?: number;
}

export interface JoinFareResult {
  joinerFare: number;
  originalPassengerNewFare: number;
  originalPassengerDiscount: number;
  driverEarnings: number;
  platformSurplus: number;
}

/**
 * Calculate dynamic fare when a new passenger joins an existing shared ride.
 *
 * Rules:
 *   - Joiner pays based on their distance (share rate)
 *   - Original passenger gets 15-25% discount
 *   - Combined fares >= original fare + $2-5 (platform surplus)
 *   - Driver always earns >= original fare
 */
export function calculateJoinFare(input: JoinFareInput): JoinFareResult {
  const {
    originalRideTotalFare,
    originalRideDistanceKm,
    joinerDistanceKm,
    joinerDurationMinutes,
    detourKm = 0,
  } = input;

  const DETOUR_SURCHARGE_PER_KM = 0.50;

  // Calculate joiner's base fare using standard share rate
  const joinerBreakdown = calculateFare({
    distanceKm: joinerDistanceKm,
    durationMinutes: joinerDurationMinutes,
    mode: "share",
    passengerCount: 1,
  });
  // Add detour surcharge
  const detourSurcharge = Math.round(detourKm * DETOUR_SURCHARGE_PER_KM * 100) / 100;
  const joinerFare = Math.max(MIN_FARE, joinerBreakdown.totalFare + detourSurcharge);

  // Original passenger gets 15-25% discount based on joiner's distance overlap
  const overlapRatio = Math.min(1, joinerDistanceKm / Math.max(originalRideDistanceKm, 1));
  const discountPercent = 0.15 + overlapRatio * 0.10; // 15% min, 25% max
  const rawDiscount = Math.round(originalRideTotalFare * discountPercent * 100) / 100;
  let originalPassengerNewFare = Math.round((originalRideTotalFare - rawDiscount) * 100) / 100;

  // Combined fares should be >= original fare + $2 surplus
  const combinedFares = originalPassengerNewFare + joinerFare;
  const targetMinimum = originalRideTotalFare + 2.0;

  let finalDiscount = rawDiscount;
  if (combinedFares < targetMinimum) {
    const shortfall = targetMinimum - combinedFares;
    finalDiscount = Math.max(0, rawDiscount - shortfall);
    originalPassengerNewFare = Math.round((originalRideTotalFare - finalDiscount) * 100) / 100;
  }

  // Driver always earns at least what they would have earned on the original fare
  const driverEarnings = Math.max(
    computeDriverEarnings(originalRideTotalFare),
    computeDriverEarnings(originalPassengerNewFare + joinerFare),
  );

  const platformSurplus = Math.round((originalPassengerNewFare + joinerFare - originalRideTotalFare) * 100) / 100;

  return {
    joinerFare,
    originalPassengerNewFare,
    originalPassengerDiscount: finalDiscount,
    driverEarnings,
    platformSurplus,
  };
}

// ─── Surge Zone Management ──────────────────────────────────────────────────

import { db } from "../db";
import { surgeZones as surgeZonesTable } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export interface SurgeZone {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  multiplier: number;
}

// ponytail: 60s TTL cache so DB is hit at most once per minute per process
let _surgeCache: SurgeZone[] = [];
let _surgeCacheAt = 0;
const SURGE_CACHE_TTL_MS = 60_000;

async function loadActiveSurgeZones(): Promise<SurgeZone[]> {
  const now = Date.now();
  if (now - _surgeCacheAt < SURGE_CACHE_TTL_MS) return _surgeCache;
  try {
    const rows = await db
      .select()
      .from(surgeZonesTable)
      .where(
        and(
          eq(surgeZonesTable.isActive, true),
          sql`${surgeZonesTable.activeFrom} <= NOW()`,
          sql`${surgeZonesTable.activeUntil} >= NOW()`,
        ),
      );
    _surgeCache = rows.map(r => ({
      id: String(r.id),
      name: r.name,
      centerLat: Number(r.centerLat),
      centerLng: Number(r.centerLng),
      radiusKm: Number(r.radiusKm),
      multiplier: Number(r.multiplier),
    }));
    _surgeCacheAt = now;
  } catch {
    // Degrade gracefully — keep stale cache or empty
  }
  return _surgeCache;
}

/** Check if a location is inside any active surge zone */
export async function getSurgeForLocation(lat: number, lng: number): Promise<{ multiplier: number; zones: SurgeZone[] }> {
  const all = await loadActiveSurgeZones();
  const zones = all.filter(z => haversineKm(lat, lng, z.centerLat, z.centerLng) <= z.radiusKm);
  if (zones.length === 0) return { multiplier: 1.0, zones: [] };
  const multiplier = Math.max(...zones.map(z => z.multiplier));
  return { multiplier: Math.min(3.0, multiplier), zones };
}

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/** Smart surge: compute from real-time demand/supply */
export async function computeSmartSurge(
  pickupLat: number,
  pickupLng: number,
  activeRequestsInArea: number,
  driversAvailableInArea: number,
): Promise<number> {
  // Zone-based surge
  const { multiplier: zoneSurge } = await getSurgeForLocation(pickupLat, pickupLng);

  // Demand-supply surge
  const ratio = driversAvailableInArea > 0
    ? activeRequestsInArea / driversAvailableInArea
    : 2.0;

  let demandSurge = 1.0;
  if (ratio > 3.0) demandSurge = 2.0;
  else if (ratio > 2.0) demandSurge = 1.7;
  else if (ratio > 1.5) demandSurge = 1.4;
  else if (ratio > 1.0) demandSurge = 1.2;

  // Time-based surge
  const timeSurge = computeSurgeMultiplier(new Date(), 1.0);

  // Combine: max of all, capped at 3.0
  const combined = Math.max(zoneSurge, demandSurge, timeSurge);
  return Math.min(3.0, Math.round(combined * 10) / 10);
}

/** Multi-class fare estimate (for fare estimator screen) */
export function estimateAllClasses(
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0,
): Record<VehicleClass, { solo: FareBreakdown; shared: FareBreakdown }> {
  const classes: VehicleClass[] = ["economy", "standard", "comfort", "xl"];
  const result = {} as Record<VehicleClass, { solo: FareBreakdown; shared: FareBreakdown }>;
  for (const vc of classes) {
    result[vc] = {
      solo: calculateFare({ distanceKm, durationMinutes, vehicleClass: vc, mode: "solo", surgeMultiplier }),
      shared: calculateFare({ distanceKm, durationMinutes, vehicleClass: vc, mode: "share", surgeMultiplier }),
    };
  }
  return result;
}
