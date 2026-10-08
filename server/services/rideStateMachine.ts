/**
 * Ride State Machine — validates and drives ride lifecycle transitions.
 *
 * DB status values  →  Extended rideStep values
 * ─────────────────────────────────────────────────────
 *  searching        →  finding_driver
 *  matched          →  driver_assigned → driver_en_route
 *  driver_arrived   →  driver_arrived
 *  in_progress      →  ride_started → ride_in_progress
 *  completed        →  completed
 *  cancelled        →  cancelled
 *
 * Valid transition map (rideStep level):
 *   finding_driver  → driver_assigned | cancelled
 *   driver_assigned → driver_en_route | cancelled
 *   driver_en_route → driver_arrived  | cancelled
 *   driver_arrived  → ride_started    | cancelled
 *   ride_started    → ride_in_progress
 *   ride_in_progress→ completed       | cancelled
 *   completed       → (terminal)
 *   cancelled       → (terminal)
 */

export type RideStep =
  | "finding_driver"
  | "driver_assigned"
  | "driver_en_route"
  | "driver_arrived"
  | "ride_started"
  | "ride_in_progress"
  | "completed"
  | "cancelled";

export type DbRideStatus =
  | "searching"
  | "matched"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

// ─── Transition Graph ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<RideStep, RideStep[]> = {
  finding_driver:   ["driver_assigned", "cancelled"],
  driver_assigned:  ["driver_en_route", "driver_arrived", "cancelled"],
  // finding_driver also valid here: driver cancels after accepting, ride re-queues for a new driver
  driver_en_route:  ["driver_arrived", "finding_driver", "cancelled"],
  driver_arrived:   ["ride_started", "finding_driver", "cancelled"],
  ride_started:     ["ride_in_progress"],
  ride_in_progress: ["completed", "cancelled"],
  completed:        [],
  cancelled:        [],
};

// ─── rideStep → DB status mapping ────────────────────────────────────────────

export const STEP_TO_DB_STATUS: Record<RideStep, DbRideStatus> = {
  finding_driver:   "searching",
  driver_assigned:  "matched",
  driver_en_route:  "matched",
  driver_arrived:   "driver_arrived",
  ride_started:     "in_progress",
  ride_in_progress: "in_progress",
  completed:        "completed",
  cancelled:        "cancelled",
};

// ─── Labels for frontend display ─────────────────────────────────────────────

export const STEP_LABELS: Record<RideStep, string> = {
  finding_driver:   "Finding you a driver…",
  driver_assigned:  "Driver assigned",
  driver_en_route:  "Driver heading to you",
  driver_arrived:   "Driver has arrived",
  ride_started:     "Ride started",
  ride_in_progress: "On the way",
  completed:        "Ride completed",
  cancelled:        "Ride cancelled",
};

// ─── Core helpers ─────────────────────────────────────────────────────────────

export function canTransition(from: RideStep, to: RideStep): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStep(step: RideStep): boolean {
  return step === "completed" || step === "cancelled";
}

export function validateTransition(
  currentStep: RideStep,
  targetStep: RideStep,
): { valid: boolean; reason?: string } {
  if (isTerminalStep(currentStep)) {
    return {
      valid: false,
      reason: `Ride is already in terminal state: ${currentStep}`,
    };
  }
  if (!canTransition(currentStep, targetStep)) {
    return {
      valid: false,
      reason: `Cannot transition from ${currentStep} → ${targetStep}. Valid next steps: ${VALID_TRANSITIONS[currentStep].join(", ")}`,
    };
  }
  return { valid: true };
}

/** Returns what timestamps should be set when entering a step */
export function getTimestampsForStep(
  step: RideStep,
  now: Date = new Date(),
): Record<string, Date | null> {
  switch (step) {
    case "driver_assigned": return { driverAssignedAt: now };
    case "driver_arrived":  return { driverArrivedAt: now };
    case "ride_started":    return { startedAt: now };
    case "completed":       return { completedAt: now };
    case "cancelled":       return { cancelledAt: now };
    default:                return {};
  }
}

/** Infer rideStep from a legacy dbStatus when rideStep column is missing */
export function inferStepFromDbStatus(status: DbRideStatus): RideStep {
  switch (status) {
    case "searching":       return "finding_driver";
    case "matched":         return "driver_assigned";
    case "driver_arrived":  return "driver_arrived";
    case "in_progress":     return "ride_in_progress";
    case "completed":       return "completed";
    case "cancelled":       return "cancelled";
  }
}

/**
 * The set of source steps from which a transition to `target` is legal,
 * derived directly from the VALID_TRANSITIONS graph.
 */
export function allowedSourceSteps(target: RideStep): RideStep[] {
  return (Object.keys(VALID_TRANSITIONS) as RideStep[]).filter((from) =>
    VALID_TRANSITIONS[from].includes(target),
  );
}

// ─── Route Deviation ─────────────────────────────────────────────────────────
//
// Cheap haversine in metres so we can flag a route deviation without pulling in
// any geo dependency. We use the equirectangular approximation — accurate
// enough for ride-scale distances (< 200 km) and ~10× faster than full
// haversine.

const EARTH_RADIUS_M = 6371000;

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const meanLat = toRad((lat1 + lat2) / 2);
  const x = dLng * Math.cos(meanLat);
  const y = dLat;
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_M;
}

/**
 * Determine whether a driver's current GPS position has deviated from the
 * planned route polyline. The route is supplied as an array of [lng,lat] pairs
 * (the OSRM/Google decoded format already used in DriverTrackingMapView).
 *
 * Returns the minimum distance from the driver to any vertex on the route.
 * Callers should treat anything beyond `thresholdMeters` (default 250 m) as a
 * deviation worth alerting on.
 */
export function checkRouteDeviation(opts: {
  driverLat: number;
  driverLng: number;
  routeCoords: Array<[number, number]>; // [lng, lat]
  thresholdMeters?: number;
}): { deviated: boolean; minDistanceMeters: number } {
  const { driverLat, driverLng, routeCoords, thresholdMeters = 250 } = opts;
  if (!routeCoords || routeCoords.length === 0) {
    return { deviated: false, minDistanceMeters: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  for (const [lng, lat] of routeCoords) {
    const d = distanceMeters(driverLat, driverLng, lat, lng);
    if (d < min) min = d;
  }
  return { deviated: min > thresholdMeters, minDistanceMeters: min };
}
