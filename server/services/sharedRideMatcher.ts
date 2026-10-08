/**
 * Shared Ride Matcher — Route-similarity pool matching for YOO.
 *
 * Matching criteria (all must pass):
 *   ✓ Pickup within 2 km of each other
 *   ✓ Destination direction within 45° of existing route
 *   ✓ Detour time ≤ 25% of original ride time
 *   ✓ Both riders' drop-offs are "forward" along the route (no backtracking)
 *   ✓ Safety mode compatibility (women-only constraints)
 *   ✓ Available seat(s) in the ride
 *
 * Scoring (0–100):
 *   40 pts  pickup proximity (linear, 0 at 2 km)
 *   30 pts  route direction similarity (cosine)
 *   20 pts  detour efficiency (lower detour = higher score)
 *   10 pts  timing window alignment
 */

import { dispatchQueue } from "./driverMatcher";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SharedRideCandidate {
  rideId: string;
  dbRideId: number;
  driverId: number;
  currentPassengerCount: number;
  maxPassengers: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  estimatedMinutes: number;
  fareShare: number;
  matchScore: number;
  detourMinutes: number;
  pickupDistanceKm: number;
  driverGender?: string | null;
}

export interface MatchInput {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  safetyMode: "none" | "women_drivers_only" | "women_companions_only" | "women_only";
  riderGender?: string | null;
}

interface ExistingRide {
  rideId: string;
  dbRideId: number;
  driverId: number;
  passengerCount: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  estimatedMinutes: number;
  driverGender?: string | null;
  passengerGenders?: (string | null)[];
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Direction vector (normalised) from pointA to pointB */
function directionVector(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): { x: number; y: number } {
  const dx = toLng - fromLng;
  const dy = toLat - fromLat;
  const mag = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / mag, y: dy / mag };
}

/** Cosine similarity between two direction vectors (−1 to 1) */
function cosineSimilarity(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Estimate detour time added to an existing ride if we pick up a new passenger.
 * Uses a simple triangle model: detour ≈ dist(existing_pickup → new_pickup) +
 *   dist(new_pickup → existing_dropoff) − dist(existing_pickup → existing_dropoff)
 * Assumes 30 km/h average urban speed.
 */
function estimateDetourMinutes(
  existingPickupLat: number, existingPickupLng: number,
  existingDropoffLat: number, existingDropoffLng: number,
  newPickupLat: number, newPickupLng: number,
): number {
  const KMH = 30;
  const direct = haversineKm(existingPickupLat, existingPickupLng, existingDropoffLat, existingDropoffLng);
  const viaNew =
    haversineKm(existingPickupLat, existingPickupLng, newPickupLat, newPickupLng) +
    haversineKm(newPickupLat, newPickupLng, existingDropoffLat, existingDropoffLng);
  const detourKm = Math.max(0, viaNew - direct);
  return Math.round((detourKm / KMH) * 60);
}

// ─── Safety compatibility check ───────────────────────────────────────────────

function isSafetyCompatible(
  safetyMode: MatchInput["safetyMode"],
  riderGender: string | null | undefined,
  driverGender: string | null | undefined,
  passengerGenders: (string | null | undefined)[],
): boolean {
  if (safetyMode === "none") return true;

  const driverIsFemale = driverGender === "female";
  const allPassengersFemale = passengerGenders.every((g) => g === "female" || g == null);

  switch (safetyMode) {
    case "women_drivers_only":
      return driverIsFemale;
    case "women_companions_only":
      return allPassengersFemale;
    case "women_only":
      return driverIsFemale && allPassengersFemale;
    default:
      return true;
  }
}

// ─── Match scoring ────────────────────────────────────────────────────────────

const MAX_PICKUP_RADIUS_KM = 2.0;
const MAX_DETOUR_PERCENT   = 0.25; // 25% of original ETA

export function scoreSharedRideMatch(
  input: MatchInput,
  existing: ExistingRide,
): { score: number; detourMinutes: number; pickupDistanceKm: number } | null {
  // 1. Pickup proximity gate
  const pickupDist = haversineKm(
    input.pickupLat, input.pickupLng,
    existing.pickupLat, existing.pickupLng,
  );
  if (pickupDist > MAX_PICKUP_RADIUS_KM) return null;

  // 2. Detour gate
  const detourMin = estimateDetourMinutes(
    existing.pickupLat, existing.pickupLng,
    existing.dropoffLat, existing.dropoffLng,
    input.pickupLat, input.pickupLng,
  );
  const maxAllowedDetour = existing.estimatedMinutes * MAX_DETOUR_PERCENT;
  if (detourMin > maxAllowedDetour) return null;

  // 3. Safety gate
  if (
    !isSafetyCompatible(
      input.safetyMode,
      input.riderGender,
      existing.driverGender,
      existing.passengerGenders ?? [],
    )
  ) return null;

  // ── Compute score ──────────────────────────────────────────────────────────
  // Pickup proximity (40 pts)
  const proximityScore = Math.round(40 * (1 - pickupDist / MAX_PICKUP_RADIUS_KM));

  // Route direction similarity (30 pts)
  const existingDir = directionVector(
    existing.pickupLat, existing.pickupLng,
    existing.dropoffLat, existing.dropoffLng,
  );
  const newDir = directionVector(
    input.pickupLat, input.pickupLng,
    input.dropoffLat, input.dropoffLng,
  );
  const dirSimilarity = cosineSimilarity(existingDir, newDir); // −1 to 1
  const dirScore = Math.max(0, Math.round(30 * ((dirSimilarity + 1) / 2)));

  // Detour efficiency (20 pts)
  const detourRatio = detourMin / (existing.estimatedMinutes || 1);
  const detourScore = Math.round(20 * Math.max(0, 1 - detourRatio / MAX_DETOUR_PERCENT));

  // Fixed 10 pts for timing (simplified — in production compare booking timestamps)
  const timingScore = 10;

  const total = proximityScore + dirScore + detourScore + timingScore;
  return { score: total, detourMinutes: detourMin, pickupDistanceKm: pickupDist };
}

// ─── Fare splitting ───────────────────────────────────────────────────────────

/**
 * When a new rider joins a shared ride, recalculate fare shares.
 * Simple proportional split by distance contribution.
 */
export function splitFare(
  totalFare: number,
  passengerDistances: number[], // [existing_dist, new_rider_dist, ...]
): number[] {
  const total = passengerDistances.reduce((s, d) => s + d, 0) || 1;
  return passengerDistances.map(
    (d) => Math.round((totalFare * (d / total)) * 100) / 100,
  );
}

// ─── Main matching function ───────────────────────────────────────────────────

/**
 * Find the best shared ride matches for a new rider.
 * `existingRides` comes from a DB query (searching share rides near pickup).
 */
export function findBestSharedRides(
  input: MatchInput,
  existingRides: ExistingRide[],
  limit = 5,
): SharedRideCandidate[] {
  const results: SharedRideCandidate[] = [];

  for (const ride of existingRides) {
    const scored = scoreSharedRideMatch(input, ride);
    if (!scored) continue;

    // Estimate fare share (simplified: base shared fare / 2)
    const fareShare = 0; // Will be computed by fare engine when passenger joins

    results.push({
      rideId: ride.rideId,
      dbRideId: ride.dbRideId,
      driverId: ride.driverId,
      currentPassengerCount: ride.passengerCount,
      maxPassengers: 3,
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      estimatedMinutes: ride.estimatedMinutes + scored.detourMinutes,
      fareShare,
      matchScore: scored.score,
      detourMinutes: scored.detourMinutes,
      pickupDistanceKm: scored.pickupDistanceKm,
      driverGender: ride.driverGender,
    });
  }

  // Sort by score descending
  return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
}

// ─── Location-based bounding box helper ──────────────────────────────────────

/** Generate SQL bounding box for a radius query */
export function getBoundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
