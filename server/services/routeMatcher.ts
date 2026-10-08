/**
 * Route Matcher — Route compatibility engine for mid-ride join
 *
 * Uses polyline-based matching to determine if a joiner's pickup/dropoff
 * are "along the route" of an existing ride.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

export const MAX_PICKUP_DISTANCE_KM = 2.0;
export const MAX_DROPOFF_DISTANCE_KM = 3.0;
export const MAX_DETOUR_PERCENT = 0.25; // 25%
export const MIN_COMPATIBILITY_SCORE = 30;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteMatchResult {
  isCompatible: boolean;
  pickupDistanceKm: number;
  dropoffDistanceKm: number;
  pickupSegmentIndex: number;
  dropoffSegmentIndex: number;
  detourKm: number;
  detourMinutes: number;
  detourPercent: number;
  score: number;
}

// ─── Polyline Decoder ───────────────────────────────────────────────────────

/**
 * Decode a Google/OSRM encoded polyline string to array of {lat, lng}
 * Standard polyline encoding uses precision=5 (1e5)
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = Math.pow(10, precision);
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

/**
 * Encode an array of {lat, lng} to a Google/OSRM polyline string
 */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const factor = Math.pow(10, precision);
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const { lat, lng } of points) {
    const latRound = Math.round(lat * factor);
    const lngRound = Math.round(lng * factor);
    encoded += encodeValue(latRound - prevLat);
    encoded += encodeValue(lngRound - prevLng);
    prevLat = latRound;
    prevLng = lngRound;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = "";
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

/** Haversine distance between two points in kilometers */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Approximate distance from a point to a line segment (p1-p2).
 * Uses perpendicular distance from the point to the infinite line,
 * clamped to the segment endpoints.
 */
function pointToSegmentDistance(point: LatLng, p1: LatLng, p2: LatLng): number {
  const d12 = haversineDistance(p1, p2);
  if (d12 < 0.001) return haversineDistance(point, p1); // degenerate segment

  // Project point onto line segment using dot product approximation
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const px = point.lng - p1.lng;
  const py = point.lat - p1.lat;

  let t = (px * dx + py * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projectedPoint: LatLng = {
    lat: p1.lat + t * dy,
    lng: p1.lng + t * dx,
  };

  return haversineDistance(point, projectedPoint);
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Find minimum distance from a point to any segment of a polyline.
 * Returns distance in km and the segment index.
 */
export function pointToPolylineDistance(
  point: LatLng,
  polyline: LatLng[],
): { distanceKm: number; segmentIndex: number; fraction: number } {
  let minDist = Infinity;
  let minIndex = 0;
  let minFraction = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    const dist = pointToSegmentDistance(point, p1, p2);
    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
      // Calculate fraction along this segment (0..1)
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const px = point.lng - p1.lng;
      const py = point.lat - p1.lat;
      const denom = dx * dx + dy * dy;
      minFraction = denom > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / denom)) : 0;
    }
  }

  return { distanceKm: minDist, segmentIndex: minIndex, fraction: minFraction };
}

/**
 * Check if pickup and dropoff are along the route.
 * Pickup must be within MAX_PICKUP_DISTANCE_KM of the route,
 * dropoff within MAX_DROPOFF_DISTANCE_KM, and pickup must come
 * before dropoff in the route sequence.
 */
export function isAlongRoute(
  pickup: LatLng,
  dropoff: LatLng,
  polyline: LatLng[],
): { along: boolean; pickupResult: ReturnType<typeof pointToPolylineDistance>; dropoffResult: ReturnType<typeof pointToPolylineDistance> } {
  const pickupResult = pointToPolylineDistance(pickup, polyline);
  const dropoffResult = pointToPolylineDistance(dropoff, polyline);

  const along =
    pickupResult.distanceKm <= MAX_PICKUP_DISTANCE_KM &&
    dropoffResult.distanceKm <= MAX_DROPOFF_DISTANCE_KM &&
    pickupResult.segmentIndex <= dropoffResult.segmentIndex;

  return { along, pickupResult, dropoffResult };
}

/**
 * Estimate the detour required to pick up and drop off the joiner.
 * Detour = pickup deviation + dropoff deviation (extra km off the route).
 */
export function calculateDetour(
  polyline: LatLng[],
  driverPos: LatLng,
  joinerPickup: LatLng,
  joinerDropoff: LatLng,
): { detourKm: number; detourMinutes: number; detourPercent: number } {
  // Find where driver currently is on the route
  const driverOnRoute = pointToPolylineDistance(driverPos, polyline);
  const pickupOnRoute = pointToPolylineDistance(joinerPickup, polyline);
  const dropoffOnRoute = pointToPolylineDistance(joinerDropoff, polyline);

  // Detour = distance from route to pickup + distance from pickup back to route
  // + any deviation for dropoff
  const pickupDetour = pickupOnRoute.distanceKm * 2; // off route and back
  const dropoffDetour = dropoffOnRoute.distanceKm * 2;

  const detourKm = Math.round((pickupDetour + dropoffDetour) * 100) / 100;

  // Estimate total route distance from driver to end
  let routeDistance = 0;
  for (let i = driverOnRoute.segmentIndex; i < polyline.length - 1; i++) {
    routeDistance += haversineDistance(polyline[i], polyline[i + 1]);
  }

  const detourPercent = routeDistance > 0 ? detourKm / routeDistance : 0;
  // Rough estimate: 2 min per km of detour (city driving)
  const detourMinutes = Math.round(detourKm * 2);

  return { detourKm, detourMinutes, detourPercent };
}

/**
 * Score a route match on a 0-100 scale.
 *
 * Scoring breakdown:
 * - 35 pts: pickup proximity (closer = higher)
 * - 25 pts: dropoff proximity (closer = higher)
 * - 25 pts: detour efficiency (less detour = higher)
 * - 15 pts: direction similarity (how well directions align)
 */
export function scoreRouteMatch(
  pickupDistKm: number,
  dropoffDistKm: number,
  detourPercent: number,
  pickup: LatLng,
  dropoff: LatLng,
  ridePickup: LatLng,
  rideDropoff: LatLng,
): number {
  // Pickup proximity: 35 pts (0 km = 35, MAX_PICKUP = 0)
  const pickupScore = Math.max(0, 35 * (1 - pickupDistKm / MAX_PICKUP_DISTANCE_KM));

  // Dropoff proximity: 25 pts
  const dropoffScore = Math.max(0, 25 * (1 - dropoffDistKm / MAX_DROPOFF_DISTANCE_KM));

  // Detour efficiency: 25 pts (0% = 25, MAX_DETOUR = 0)
  const detourScore = Math.max(0, 25 * (1 - detourPercent / MAX_DETOUR_PERCENT));

  // Direction similarity: 15 pts using cosine similarity of direction vectors
  const joinerDx = dropoff.lng - pickup.lng;
  const joinerDy = dropoff.lat - pickup.lat;
  const rideDx = rideDropoff.lng - ridePickup.lng;
  const rideDy = rideDropoff.lat - ridePickup.lat;

  const dot = joinerDx * rideDx + joinerDy * rideDy;
  const magA = Math.sqrt(joinerDx * joinerDx + joinerDy * joinerDy);
  const magB = Math.sqrt(rideDx * rideDx + rideDy * rideDy);
  const cosSim = magA > 0 && magB > 0 ? dot / (magA * magB) : 0;
  // Convert [-1, 1] to [0, 15]
  const directionScore = Math.max(0, 15 * (cosSim + 1) / 2);

  return Math.round(pickupScore + dropoffScore + detourScore + directionScore);
}

// ─── Main Matching Function ─────────────────────────────────────────────────

export interface JoinableRide {
  rideId: string;
  rideDbId: number;
  driverId: number | null;
  pickupDistanceKm: number;
  dropoffDistanceKm: number;
  detourKm: number;
  detourMinutes: number;
  detourPercent: number;
  compatibilityScore: number;
  ridePickupAddress: string;
  rideDropoffAddress: string;
  availableSeats: number;
  driverName?: string;
}

export interface RideCandidate {
  rideId: string;
  id: number;
  driverId: number | null;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  routePolyline: string | null;
  availableSeats: number;
  driverName?: string;
}

/**
 * Find joinable rides along the joiner's route.
 * Pre-filters with simple bounding box, then scores with polyline matching.
 */
export function findJoinableRidesAlongRoute(
  joinerPickup: LatLng,
  joinerDropoff: LatLng,
  candidates: RideCandidate[],
): JoinableRide[] {
  const results: JoinableRide[] = [];

  for (const ride of candidates) {
    if (ride.availableSeats <= 0) continue;

    const ridePickup: LatLng = { lat: ride.pickupLat, lng: ride.pickupLng };
    const rideDropoff: LatLng = { lat: ride.dropoffLat, lng: ride.dropoffLng };

    let pickupDistKm: number;
    let dropoffDistKm: number;
    let detourKm: number;
    let detourMinutes: number;
    let detourPercent: number;

    if (ride.routePolyline) {
      // Full polyline-based matching
      const polyline = decodePolyline(ride.routePolyline);
      const routeCheck = isAlongRoute(joinerPickup, joinerDropoff, polyline);

      if (!routeCheck.along) continue;

      pickupDistKm = routeCheck.pickupResult.distanceKm;
      dropoffDistKm = routeCheck.dropoffResult.distanceKm;

      // Use driver's current estimated position (approximate: use pickup for now)
      const detourResult = calculateDetour(polyline, ridePickup, joinerPickup, joinerDropoff);
      detourKm = detourResult.detourKm;
      detourMinutes = detourResult.detourMinutes;
      detourPercent = detourResult.detourPercent;
    } else {
      // Fallback: simple haversine matching
      pickupDistKm = haversineDistance(joinerPickup, ridePickup);
      dropoffDistKm = haversineDistance(joinerDropoff, rideDropoff);

      if (pickupDistKm > MAX_PICKUP_DISTANCE_KM) continue;
      if (dropoffDistKm > MAX_DROPOFF_DISTANCE_KM) continue;

      detourKm = pickupDistKm + dropoffDistKm;
      detourMinutes = Math.round(detourKm * 2);
      const rideDist = haversineDistance(ridePickup, rideDropoff);
      detourPercent = rideDist > 0 ? detourKm / rideDist : 0;
    }

    if (detourPercent > MAX_DETOUR_PERCENT) continue;

    const score = scoreRouteMatch(
      pickupDistKm,
      dropoffDistKm,
      detourPercent,
      joinerPickup,
      joinerDropoff,
      ridePickup,
      rideDropoff,
    );

    if (score < MIN_COMPATIBILITY_SCORE) continue;

    results.push({
      rideId: ride.rideId,
      rideDbId: ride.id,
      driverId: ride.driverId,
      pickupDistanceKm: Math.round(pickupDistKm * 100) / 100,
      dropoffDistanceKm: Math.round(dropoffDistKm * 100) / 100,
      detourKm,
      detourMinutes,
      detourPercent: Math.round(detourPercent * 100) / 100,
      compatibilityScore: score,
      ridePickupAddress: ride.pickupAddress,
      rideDropoffAddress: ride.dropoffAddress,
      availableSeats: ride.availableSeats,
      driverName: ride.driverName,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  return results;
}
