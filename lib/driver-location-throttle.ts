/** Haversine distance in meters between two lat/lng points. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type LocationSnapshot = { lat: number; lng: number; ts: number };

export const DRIVER_LOCATION_MIN_INTERVAL_MS = 15_000;
export const DRIVER_LOCATION_MIN_DISTANCE_M = 25;
export const DRIVER_LOCATION_RATE_LIMIT_BACKOFF_MS = 30_000;

/** True when a location update should be sent (moved enough or interval elapsed). */
export function shouldSendLocationUpdate(
  last: LocationSnapshot | null,
  lat: number,
  lng: number,
  now: number,
  minDistanceM = DRIVER_LOCATION_MIN_DISTANCE_M,
  minIntervalMs = DRIVER_LOCATION_MIN_INTERVAL_MS,
): boolean {
  if (!last) return true;
  const distM = haversineMeters(last.lat, last.lng, lat, lng);
  const elapsed = now - last.ts;
  return distM >= minDistanceM || elapsed >= minIntervalMs;
}
