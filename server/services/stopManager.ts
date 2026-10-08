/**
 * Stop Manager — Manages ordered stops per ride for multi-passenger pickups/dropoffs
 */

import {
  createRideStop,
  getRideStopsFromDb,
  updateRideStop,
  resequenceStops,
} from "../db";
import { decodePolyline, pointToPolylineDistance, type LatLng } from "./routeMatcher";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StopInput {
  passengerId: number;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
}

export interface OrderedStop {
  id: number;
  rideId: number;
  stopType: "pickup" | "dropoff";
  passengerId: number;
  lat: string;
  lng: string;
  address: string;
  sequence: number;
  status: "pending" | "approaching" | "reached" | "skipped";
  estimatedArrivalAt: Date | null;
  actualArrivalAt: Date | null;
  passengerName?: string;
}

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Initialize stops for a ride when it starts.
 * Creates pickup and dropoff entries for all current passengers.
 * When a routePolyline is provided, stops are ordered geographically along
 * the route — whoever's location comes first on the route gets served first.
 * Each passenger's pickup is guaranteed to come before their dropoff.
 */
export async function initializeStopsForRide(
  rideId: number,
  passengers: StopInput[],
  routePolyline?: string | null,
): Promise<void> {
  // Check for existing stops to prevent duplicates (e.g. from approveMidRideJoin)
  const existingStops = await getRideStopsFromDb(rideId);

  // Filter out passengers who already have stops
  const newPassengers = passengers.filter(
    p => !existingStops.some(s => s.passengerId === p.passengerId)
  );

  if (newPassengers.length === 0) return;

  let seq = existingStops.length > 0
    ? Math.max(...existingStops.map(s => s.sequence)) + 1
    : 1;

  // Build flat list of all stop entries
  interface StopEntry {
    stopType: "pickup" | "dropoff";
    passengerId: number;
    lat: number;
    lng: number;
    address: string;
    segmentIndex: number; // position along route (for sorting)
  }

  const allStopEntries: StopEntry[] = [];

  if (routePolyline) {
    // Use route polyline to determine geographic order
    const polyline = decodePolyline(routePolyline);

    for (const p of newPassengers) {
      const pickupOnRoute = pointToPolylineDistance(
        { lat: p.pickupLat, lng: p.pickupLng },
        polyline,
      );
      const dropoffOnRoute = pointToPolylineDistance(
        { lat: p.dropoffLat, lng: p.dropoffLng },
        polyline,
      );

      allStopEntries.push({
        stopType: "pickup",
        passengerId: p.passengerId,
        lat: p.pickupLat,
        lng: p.pickupLng,
        address: p.pickupAddress,
        segmentIndex: pickupOnRoute.segmentIndex + pickupOnRoute.fraction,
      });

      allStopEntries.push({
        stopType: "dropoff",
        passengerId: p.passengerId,
        lat: p.dropoffLat,
        lng: p.dropoffLng,
        address: p.dropoffAddress,
        segmentIndex: dropoffOnRoute.segmentIndex + dropoffOnRoute.fraction,
      });
    }

    // Sort by position along the route
    allStopEntries.sort((a, b) => a.segmentIndex - b.segmentIndex);

    // Enforce constraint: each passenger's pickup must come before their dropoff.
    // If a dropoff appears before its pickup (edge case), swap them.
    const seenPickups = new Set<number>();
    for (let i = 0; i < allStopEntries.length; i++) {
      const entry = allStopEntries[i];
      if (entry.stopType === "pickup") {
        seenPickups.add(entry.passengerId);
      } else if (entry.stopType === "dropoff" && !seenPickups.has(entry.passengerId)) {
        // Dropoff appeared before pickup — find the pickup and move it before this dropoff
        const pickupIdx = allStopEntries.findIndex(
          (e, j) => j > i && e.passengerId === entry.passengerId && e.stopType === "pickup"
        );
        if (pickupIdx !== -1) {
          const [pickup] = allStopEntries.splice(pickupIdx, 1);
          allStopEntries.splice(i, 0, pickup);
          seenPickups.add(entry.passengerId);
          // Don't increment i — re-check new element at position i+1
        }
      }
    }
  } else {
    // No polyline — use haversine distance from first passenger's pickup as a rough order
    // Collect all stops and sort by distance from origin
    const originLat = newPassengers[0].pickupLat;
    const originLng = newPassengers[0].pickupLng;

    for (const p of newPassengers) {
      const pickupDist = haversineSimple(originLat, originLng, p.pickupLat, p.pickupLng);
      const dropoffDist = haversineSimple(originLat, originLng, p.dropoffLat, p.dropoffLng);

      allStopEntries.push({
        stopType: "pickup",
        passengerId: p.passengerId,
        lat: p.pickupLat,
        lng: p.pickupLng,
        address: p.pickupAddress,
        segmentIndex: pickupDist,
      });

      allStopEntries.push({
        stopType: "dropoff",
        passengerId: p.passengerId,
        lat: p.dropoffLat,
        lng: p.dropoffLng,
        address: p.dropoffAddress,
        segmentIndex: dropoffDist,
      });
    }

    allStopEntries.sort((a, b) => a.segmentIndex - b.segmentIndex);

    // Enforce pickup-before-dropoff constraint
    const seenPickups = new Set<number>();
    for (let i = 0; i < allStopEntries.length; i++) {
      const entry = allStopEntries[i];
      if (entry.stopType === "pickup") {
        seenPickups.add(entry.passengerId);
      } else if (entry.stopType === "dropoff" && !seenPickups.has(entry.passengerId)) {
        const pickupIdx = allStopEntries.findIndex(
          (e, j) => j > i && e.passengerId === entry.passengerId && e.stopType === "pickup"
        );
        if (pickupIdx !== -1) {
          const [pickup] = allStopEntries.splice(pickupIdx, 1);
          allStopEntries.splice(i, 0, pickup);
          seenPickups.add(entry.passengerId);
        }
      }
    }
  }

  // Create stops in geographic order
  for (const entry of allStopEntries) {
    await createRideStop({
      rideId,
      stopType: entry.stopType,
      passengerId: entry.passengerId,
      lat: String(entry.lat),
      lng: String(entry.lng),
      address: entry.address,
      sequence: seq++,
      status: "pending",
    });
  }
}

/** Simple haversine distance in km (for fallback ordering without polyline) */
function haversineSimple(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Insert new passenger stops into the correct sequence.
 * Uses the route polyline to determine where the pickup/dropoff fall
 * relative to existing stops.
 */
export async function insertNewPassengerStops(
  rideId: number,
  passenger: StopInput,
  routePolyline: string | null,
  _driverLoc: LatLng | null,
): Promise<void> {
  const existingStops = await getRideStopsFromDb(rideId);

  // Skip if this passenger already has stops (prevents duplicates)
  const alreadyHasStops = existingStops.some(
    s => s.passengerId === passenger.passengerId,
  );
  if (alreadyHasStops) return;

  let pickupSeqTarget: number;
  let dropoffSeqTarget: number;

  if (routePolyline) {
    const polyline = decodePolyline(routePolyline);
    const pickupOnRoute = pointToPolylineDistance(
      { lat: passenger.pickupLat, lng: passenger.pickupLng },
      polyline,
    );
    const dropoffOnRoute = pointToPolylineDistance(
      { lat: passenger.dropoffLat, lng: passenger.dropoffLng },
      polyline,
    );

    // Find where in the existing stop sequence these should be inserted
    // by comparing segment indices of existing stops
    pickupSeqTarget = 1;
    dropoffSeqTarget = 2;

    for (const stop of existingStops) {
      const stopOnRoute = pointToPolylineDistance(
        { lat: parseFloat(stop.lat), lng: parseFloat(stop.lng) },
        polyline,
      );

      if (stopOnRoute.segmentIndex < pickupOnRoute.segmentIndex) {
        pickupSeqTarget = stop.sequence + 1;
      }
      if (stopOnRoute.segmentIndex < dropoffOnRoute.segmentIndex) {
        dropoffSeqTarget = Math.max(pickupSeqTarget + 1, stop.sequence + 1);
      }
    }

    // Ensure dropoff is after pickup
    if (dropoffSeqTarget <= pickupSeqTarget) {
      dropoffSeqTarget = pickupSeqTarget + 1;
    }
  } else {
    // Fallback: append to end
    const maxSeq = existingStops.reduce((max, s) => Math.max(max, s.sequence), 0);
    pickupSeqTarget = maxSeq + 1;
    dropoffSeqTarget = maxSeq + 2;
  }

  // Shift existing stops to make room
  const updates: { stopId: number; sequence: number }[] = [];
  for (const stop of existingStops) {
    let newSeq = stop.sequence;
    if (stop.sequence >= pickupSeqTarget) newSeq++;
    if (stop.sequence >= dropoffSeqTarget) newSeq++;
    if (newSeq !== stop.sequence) {
      updates.push({ stopId: stop.id, sequence: newSeq });
    }
  }

  if (updates.length > 0) {
    await resequenceStops(rideId, updates);
  }

  // Insert the new stops
  await createRideStop({
    rideId,
    stopType: "pickup",
    passengerId: passenger.passengerId,
    lat: String(passenger.pickupLat),
    lng: String(passenger.pickupLng),
    address: passenger.pickupAddress,
    sequence: pickupSeqTarget,
    status: "pending",
  });

  await createRideStop({
    rideId,
    stopType: "dropoff",
    passengerId: passenger.passengerId,
    lat: String(passenger.dropoffLat),
    lng: String(passenger.dropoffLng),
    address: passenger.dropoffAddress,
    sequence: dropoffSeqTarget,
    status: "pending",
  });
}

/**
 * Get all stops for a ride, ordered by sequence.
 */
export async function getOrderedStops(rideId: number): Promise<OrderedStop[]> {
  const stops = await getRideStopsFromDb(rideId);
  return stops.sort((a, b) => a.sequence - b.sequence) as OrderedStop[];
}

/**
 * Mark a stop as reached (arrived).
 */
export async function markStopReached(
  rideId: number,
  stopId: number,
): Promise<void> {
  await updateRideStop(stopId, {
    status: "reached",
    actualArrivalAt: new Date(),
  });
}

/**
 * Get the next pending stop for a ride.
 */
export async function getNextStop(rideId: number): Promise<OrderedStop | null> {
  const stops = await getOrderedStops(rideId);
  return stops.find((s) => s.status === "pending") ?? null;
}

/**
 * Recalculate ETAs for all pending stops based on driver's current position.
 * Uses simple straight-line distance / average speed estimation.
 */
export async function recalculateETAs(
  rideId: number,
  driverLat: number,
  driverLng: number,
): Promise<void> {
  const stops = await getOrderedStops(rideId);
  const pendingStops = stops.filter((s) => s.status === "pending");

  const AVG_SPEED_KM_PER_MIN = 0.5; // ~30 km/h city driving
  let cumulativeMinutes = 0;
  let prevLat = driverLat;
  let prevLng = driverLng;

  for (const stop of pendingStops) {
    const stopLat = parseFloat(stop.lat);
    const stopLng = parseFloat(stop.lng);

    const distKm = haversineSimple(prevLat, prevLng, stopLat, stopLng);
    cumulativeMinutes += distKm / AVG_SPEED_KM_PER_MIN;

    const eta = new Date(Date.now() + cumulativeMinutes * 60 * 1000);
    await updateRideStop(stop.id, { estimatedArrivalAt: eta });

    prevLat = stopLat;
    prevLng = stopLng;
  }
}
