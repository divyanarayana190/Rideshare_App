/**
 * Driver Matcher & Dispatch Queue — Production-grade driver matching engine.
 *
 * Algorithm:
 *   1. Fetch all online drivers within radiusKm using bounding-box filter
 *   2. Score each candidate: score = 0.5×(1−normDist) + 0.3×(rating/5) + 0.2×acceptanceRate
 *   3. Sort by score descending → try drivers sequentially
 *   4. Send ride request to best candidate; set 30-second acceptance timeout
 *   5. If driver declines/times-out, try next candidate
 *   6. After all candidates exhausted, mark ride as "no_driver_found"
 *
 * Safety matching:
 *   - women_drivers_only → only female drivers
 *   - (companion/women_only enforced at ride-join level, not dispatch level)
 */

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DriverCandidate {
  driverId: number;
  lat: number;
  lng: number;
  rating: number;
  acceptanceRate: number;
  distanceKm: number;
  etaMinutes: number;
  gender?: string | null;
}

export interface DispatchRequest {
  rideId: string;
  passengerId: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  totalFare: number;
  mode: "solo" | "share";
  safetyMode?: string;
  candidates: DriverCandidate[];
  currentIndex: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  status: "dispatching" | "accepted" | "failed";
  createdAt: number;
}

// ─── In-memory Dispatch Queue ─────────────────────────────────────────────────

class DispatchQueueManager extends EventEmitter {
  /** rideId → active dispatch request */
  private queue = new Map<string, DispatchRequest>();
  /** driverId → rideId (pending request they haven't answered yet) */
  private pendingForDriver = new Map<number, string>();

  private readonly ACCEPTANCE_TIMEOUT_MS = 30_000; // 30 s per driver

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  // ── Haversine distance helper ──────────────────────────────────────────────

  distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** ETA estimate: 3 min + 2 min/km */
  estimateEtaMinutes(distKm: number): number {
    return Math.round(3 + distKm * 2);
  }

  // ── Candidate scoring ─────────────────────────────────────────────────────

  scoreCandidate(candidate: DriverCandidate, maxDistKm: number): number {
    const normDist      = Math.min(candidate.distanceKm / maxDistKm, 1); // 0–1
    const ratingScore   = candidate.rating / 5;
    const acceptScore   = candidate.acceptanceRate / 100;
    return 0.50 * (1 - normDist) + 0.30 * ratingScore + 0.20 * acceptScore;
  }

  sortCandidates(candidates: DriverCandidate[], maxDistKm: number): DriverCandidate[] {
    return [...candidates].sort(
      (a, b) => this.scoreCandidate(b, maxDistKm) - this.scoreCandidate(a, maxDistKm),
    );
  }

  // ── Dispatch lifecycle ────────────────────────────────────────────────────

  /** Start dispatching to a sorted candidate list. Returns false if queue is empty. */
  startDispatch(request: Omit<DispatchRequest, "currentIndex" | "status" | "createdAt">): boolean {
    if (request.candidates.length === 0) return false;

    const fullRequest: DispatchRequest = {
      ...request,
      currentIndex: 0,
      status: "dispatching",
      createdAt: Date.now(),
    };
    this.queue.set(request.rideId, fullRequest);
    this._dispatchToNext(request.rideId);
    return true;
  }

  private _dispatchToNext(rideId: string): void {
    const req = this.queue.get(rideId);
    if (!req || req.status !== "dispatching") return;

    if (req.currentIndex >= req.candidates.length) {
      // All candidates exhausted — notify failure
      req.status = "failed";
      this.emit("dispatch:failed", { rideId });
      this.queue.delete(rideId);
      return;
    }

    const driver = req.candidates[req.currentIndex];
    this.pendingForDriver.set(driver.driverId, rideId);

    // Notify the driver via event (server polls this)
    this.emit("driver:request", {
      rideId,
      driverId: driver.driverId,
      pickupLat: req.pickupLat,
      pickupLng: req.pickupLng,
      dropoffLat: req.dropoffLat,
      dropoffLng: req.dropoffLng,
      fare: req.totalFare,
      etaMinutes: driver.etaMinutes,
      mode: req.mode,
    });

    // Set acceptance timeout
    if (req.timeoutHandle) clearTimeout(req.timeoutHandle);
    req.timeoutHandle = setTimeout(() => {
      this._handleTimeout(rideId, driver.driverId);
    }, this.ACCEPTANCE_TIMEOUT_MS);
  }

  /** Driver accepts the pending ride request */
  acceptRide(driverId: number): { rideId: string; request: DispatchRequest } | null {
    const rideId = this.pendingForDriver.get(driverId);
    if (!rideId) return null;

    const req = this.queue.get(rideId);
    if (!req || req.status !== "dispatching") return null;
    if (req.candidates[req.currentIndex]?.driverId !== driverId) return null;

    if (req.timeoutHandle) clearTimeout(req.timeoutHandle);
    req.status = "accepted";
    this.pendingForDriver.delete(driverId);
    this.queue.delete(rideId);

    this.emit("dispatch:accepted", { rideId, driverId });
    return { rideId, request: req };
  }

  /** Driver declines the pending ride request */
  declineRide(driverId: number): void {
    const rideId = this.pendingForDriver.get(driverId);
    if (!rideId) return;

    const req = this.queue.get(rideId);
    if (!req || req.status !== "dispatching") return;

    if (req.timeoutHandle) clearTimeout(req.timeoutHandle);
    this.pendingForDriver.delete(driverId);
    this.emit("dispatch:declined", { rideId, driverId });

    // Try next candidate
    req.currentIndex++;
    this._dispatchToNext(rideId);
  }

  private _handleTimeout(rideId: string, driverId: number): void {
    const req = this.queue.get(rideId);
    if (!req || req.status !== "dispatching") return;

    this.pendingForDriver.delete(driverId);
    this.emit("dispatch:timeout", { rideId, driverId });

    // Move to next candidate
    req.currentIndex++;
    this._dispatchToNext(rideId);
  }

  /** Cancel an active dispatch (e.g. passenger cancels before driver assigned) */
  cancelDispatch(rideId: string): void {
    const req = this.queue.get(rideId);
    if (!req) return;

    if (req.timeoutHandle) clearTimeout(req.timeoutHandle);

    // Clean up ALL candidates for this ride to prevent pendingForDriver leaks
    for (const candidate of req.candidates) {
      if (this.pendingForDriver.get(candidate.driverId) === rideId) {
        this.pendingForDriver.delete(candidate.driverId);
      }
    }

    req.status = "failed";
    this.queue.delete(rideId);
    this.emit("dispatch:cancelled", { rideId });
  }

  /** Clean up dispatch state after ride reaches a terminal state */
  cleanupRide(rideId: string): void {
    this.cancelDispatch(rideId);
    // Also sweep pendingForDriver for any orphaned entries pointing to this rideId
    for (const [driverId, rid] of this.pendingForDriver.entries()) {
      if (rid === rideId) this.pendingForDriver.delete(driverId);
    }
  }

  // ── Driver location store (in-memory, fast reads) ─────────────────────────

  private driverLocations = new Map<
    number,
    { lat: number; lng: number; updatedAt: number }
  >();

  updateDriverLocation(driverId: number, lat: number, lng: number): void {
    this.driverLocations.set(driverId, { lat, lng, updatedAt: Date.now() });
    this.emit("location:update", { driverId, lat, lng });
  }

  getDriverLocation(driverId: number): { lat: number; lng: number } | null {
    const loc = this.driverLocations.get(driverId);
    if (!loc) return null;
    // Stale if not updated in 5 minutes
    if (Date.now() - loc.updatedAt > 300_000) return null;
    return { lat: loc.lat, lng: loc.lng };
  }

  /** Get all online driver locations within a bounding box */
  getDriversNear(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Array<{ driverId: number; lat: number; lng: number; distanceKm: number }> {
    const results: Array<{ driverId: number; lat: number; lng: number; distanceKm: number }> = [];
    for (const [driverId, loc] of this.driverLocations) {
      if (Date.now() - loc.updatedAt > 300_000) continue; // stale
      const dist = this.distanceKm(lat, lng, loc.lat, loc.lng);
      if (dist <= radiusKm) {
        results.push({ driverId, lat: loc.lat, lng: loc.lng, distanceKm: dist });
      }
    }
    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // ── Pending request query (driver polls this) ─────────────────────────────

  getPendingRequestForDriver(driverId: number): (DispatchRequest & { driver: DriverCandidate }) | null {
    const rideId = this.pendingForDriver.get(driverId);
    if (!rideId) return null;
    const req = this.queue.get(rideId);
    if (!req || req.status !== "dispatching") return null;
    const driver = req.candidates[req.currentIndex];
    if (!driver || driver.driverId !== driverId) return null;
    return { ...req, driver };
  }

  isRideDispatching(rideId: string): boolean {
    return this.queue.has(rideId);
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  /** Clean shutdown — clear all timeouts, maps, and listeners */
  shutdown(): void {
    for (const [, req] of this.queue) {
      if (req.timeoutHandle) clearTimeout(req.timeoutHandle);
    }
    this.queue.clear();
    this.pendingForDriver.clear();
    this.driverLocations.clear();
    this.removeAllListeners();
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const dispatchQueue = new DispatchQueueManager();

// ─── Last dispatch time tracker (for recency scoring in smartMatchDrivers) ───
// driverId → timestamp of most recent ride dispatch event (accepted or completed)
export const lastDispatchTime = new Map<number, number>();

// Update when a driver accepts a ride
dispatchQueue.on("dispatch:accepted", ({ driverId }: { driverId: number }) => {
  lastDispatchTime.set(driverId, Date.now());
});

// ─── Smart Matching v2 ────────────────────────────────────────────────────────

export interface MatchScore {
  driverId: number;
  score: number; // 0-100
  distanceKm: number;
  etaMinutes: number;
  driverRating: number;
  vehicleMatch: boolean;
  factors: {
    proximity: number;    // 0-40 points
    rating: number;       // 0-25 points
    vehicleMatch: number; // 0-15 points
    acceptance: number;   // 0-10 points
    recency: number;      // 0-10 points
  };
}

/** Extended candidate with optional vehicle type for smart matching */
export interface SmartMatchCandidate extends DriverCandidate {
  vehicleType?: string;
  lastRideCompletedAt?: number; // epoch ms — for recency scoring
}

/**
 * Smart matching v2: rank drivers by multiple weighted factors
 * - Proximity (40%): closer drivers score higher
 * - Rating (25%): higher-rated drivers preferred
 * - Vehicle match (15%): if passenger requested specific class
 * - Acceptance rate (10%): drivers who accept more rides
 * - Recency (10%): drivers who haven't had a ride recently get priority
 */
export function smartMatchDrivers(
  candidates: SmartMatchCandidate[],
  passengerLat: number,
  passengerLng: number,
  requestedVehicleClass?: string,
  maxResults: number = 5,
): MatchScore[] {
  if (candidates.length === 0) return [];

  const scored: MatchScore[] = candidates.map(driver => {
    // Proximity score: 0-40 (within 1km = 40, within 5km = 20, within 10km = 5)
    const distKm = haversineDistance(passengerLat, passengerLng, driver.lat, driver.lng);
    let proximity = 0;
    if (distKm <= 1) proximity = 40;
    else if (distKm <= 2) proximity = 35;
    else if (distKm <= 3) proximity = 28;
    else if (distKm <= 5) proximity = 20;
    else if (distKm <= 10) proximity = 10;
    else proximity = Math.max(0, 5 - (distKm - 10));

    // Rating score: 0-25
    const rating = driver.rating ?? 4.0;
    const ratingScore = Math.round((rating / 5.0) * 25);

    // Vehicle match: 0-15
    const vehicleMatch = !requestedVehicleClass || driver.vehicleType === requestedVehicleClass;
    const vehicleScore = vehicleMatch ? 15 : 5;

    // Acceptance rate: 0-10
    const acceptanceScore = Math.round((driver.acceptanceRate / 100) * 10);

    // Recency: 0-10 — uses time since driver's last dispatch event.
    // Drivers who haven't had a recent ride get a priority boost (fairness rotation).
    // In-memory queue tracks last dispatch; default 5 (neutral) when unknown.
    const lastDispatch = lastDispatchTime.get(driver.driverId);
    let recencyScore = 5; // neutral baseline
    if (lastDispatch !== undefined) {
      const minutesIdle = (Date.now() - lastDispatch) / 60_000;
      // 0 min idle → 0 pts (just finished a ride), 30+ min idle → 10 pts
      recencyScore = Math.min(10, Math.round(minutesIdle / 3));
    }

    const totalScore = proximity + ratingScore + vehicleScore + acceptanceScore + recencyScore;
    const etaMinutes = Math.round(distKm * 2.5); // rough: 2.5 min per km in city

    return {
      driverId: driver.driverId,
      score: Math.min(100, totalScore),
      distanceKm: Math.round(distKm * 10) / 10,
      etaMinutes: Math.max(1, etaMinutes),
      driverRating: rating,
      vehicleMatch,
      factors: {
        proximity,
        rating: ratingScore,
        vehicleMatch: vehicleScore,
        acceptance: acceptanceScore,
        recency: recencyScore,
      },
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
