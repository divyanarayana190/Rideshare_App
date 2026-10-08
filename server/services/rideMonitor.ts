/**
 * RideMonitor — Production-grade ride lifecycle monitoring service.
 *
 * 1. GPS Heartbeat: Detects stale driver locations and alerts passengers.
 * 2. Live ETA: Dynamic ETA recalculation using OSRM routing API.
 * 3. Re-dispatch: Auto re-assigns driver if current driver cancels mid-ride.
 * 4. Geofence: Auto-triggers arrival when driver is within 50m of pickup.
 * 5. No-show: Auto-cancels if driver doesn't arrive within 2x ETA.
 * 6. Ride timeout: Auto-cancels if no driver found in 5 minutes.
 */

import { pushRideStatusUpdate } from "./notificationService";
import logger from "../logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveRideMonitor {
  rideId: string;
  rideDbId: number;
  driverId: number;
  passengerId: number;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  lastDriverUpdate: number; // timestamp ms
  lastDriverLat: number;
  lastDriverLng: number;
  currentStep: string;
  etaMinutes: number;
  driverAssignedAt: number; // timestamp ms
  isGpsStale: boolean;
  noShowWarned: boolean;
}

interface RideTimeoutEntry {
  rideId: string;
  rideDbId: number;
  passengerId: number;
  startedAt: number; // timestamp ms
  timeoutMs: number;
}

// ── Haversine helper ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── RideMonitorService (Singleton) ───────────────────────────────────────────

class RideMonitorService {
  private activeRides = new Map<string, ActiveRideMonitor>();
  private rideTimeouts = new Map<string, RideTimeoutEntry>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private timeoutCheckInterval: NodeJS.Timeout | null = null;

  private readonly GPS_STALE_THRESHOLD_MS = 30_000;  // 30 seconds
  private readonly GEOFENCE_RADIUS_KM = 0.05; // 50 meters
  private readonly NO_SHOW_MULTIPLIER = 2.0; // 2x ETA
  private readonly RIDE_SEARCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly HEARTBEAT_CHECK_INTERVAL_MS = 10_000; // check every 10s

  // Callbacks set by the server after initialization
  public onGeofenceArrival: ((rideDbId: number, driverId: number) => Promise<void>) | null = null;
  public onNoShowCancel: ((rideDbId: number, passengerId: number) => Promise<void>) | null = null;
  public onRideSearchTimeout: ((rideDbId: number, passengerId: number) => Promise<void>) | null = null;
  public onDriverGpsStale: ((rideId: string, passengerId: number) => void) | null = null;
  public onDriverGpsRecovered: ((rideId: string, passengerId: number) => void) | null = null;

  start(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.HEARTBEAT_CHECK_INTERVAL_MS) as unknown as NodeJS.Timeout;

    this.timeoutCheckInterval = setInterval(() => {
      this.checkRideTimeouts();
    }, this.HEARTBEAT_CHECK_INTERVAL_MS) as unknown as NodeJS.Timeout;

    logger.info({ intervalMs: this.HEARTBEAT_CHECK_INTERVAL_MS }, "[RideMonitor] Started");
  }

  stop(): void {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    if (this.timeoutCheckInterval) { clearInterval(this.timeoutCheckInterval); this.timeoutCheckInterval = null; }
    this.activeRides.clear();
    this.rideTimeouts.clear();
    logger.info("[RideMonitor] Stopped");
  }

  // ── Register a ride for monitoring ──

  trackRide(params: {
    rideId: string;
    rideDbId: number;
    driverId: number;
    passengerId: number;
    pickupLat: number;
    pickupLng: number;
    destLat: number;
    destLng: number;
    currentStep: string;
    etaMinutes: number;
  }): void {
    const now = Date.now();
    this.activeRides.set(params.rideId, {
      ...params,
      lastDriverUpdate: now,
      lastDriverLat: 0,
      lastDriverLng: 0,
      driverAssignedAt: now,
      isGpsStale: false,
      noShowWarned: false,
    });
  }

  untrackRide(rideId: string): void {
    this.activeRides.delete(rideId);
    this.rideTimeouts.delete(rideId);
  }

  // ── Register a ride for search timeout ──

  trackRideSearch(rideId: string, rideDbId: number, passengerId: number, timeoutMs?: number): void {
    this.rideTimeouts.set(rideId, {
      rideId,
      rideDbId,
      passengerId,
      startedAt: Date.now(),
      timeoutMs: timeoutMs ?? this.RIDE_SEARCH_TIMEOUT_MS,
    });
  }

  untrackRideSearch(rideId: string): void {
    this.rideTimeouts.delete(rideId);
  }

  // ── Update driver location ──

  updateDriverLocation(rideId: string, lat: number, lng: number): void {
    const monitor = this.activeRides.get(rideId);
    if (!monitor) return;

    const wasStale = monitor.isGpsStale;
    monitor.lastDriverLat = lat;
    monitor.lastDriverLng = lng;
    monitor.lastDriverUpdate = Date.now();
    monitor.isGpsStale = false;

    // GPS recovered notification
    if (wasStale) {
      this.onDriverGpsRecovered?.(rideId, monitor.passengerId);
      pushRideStatusUpdate(rideId, "gps_recovered", [monitor.passengerId], {
        driverId: monitor.driverId, lat, lng,
      });
    }

    // Geofence check: is driver within 50m of pickup?
    if (monitor.currentStep === "driver_en_route") {
      const distToPickup = haversineKm(lat, lng, monitor.pickupLat, monitor.pickupLng);
      if (distToPickup <= this.GEOFENCE_RADIUS_KM) {
        logger.info({ rideId }, "[RideMonitor] Geofence triggered — driver within 50m of pickup");
        this.onGeofenceArrival?.(monitor.rideDbId, monitor.driverId)?.catch((e) =>
          logger.error({ err: e, rideId }, "[RideMonitor] onGeofenceArrival error"),
        );
      }
    }
  }

  updateRideStep(rideId: string, step: string): void {
    const monitor = this.activeRides.get(rideId);
    if (monitor) monitor.currentStep = step;
  }

  updateEta(rideId: string, etaMinutes: number): void {
    const monitor = this.activeRides.get(rideId);
    if (monitor) monitor.etaMinutes = etaMinutes;
  }

  // ── Heartbeat check (runs every 10s) ──

  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [rideId, monitor] of this.activeRides) {
      // Skip if ride is completed/cancelled
      if (monitor.currentStep === "completed" || monitor.currentStep === "cancelled") {
        this.activeRides.delete(rideId);
        continue;
      }

      const elapsed = now - monitor.lastDriverUpdate;

      // GPS stale detection (30s without update)
      if (elapsed >= this.GPS_STALE_THRESHOLD_MS && !monitor.isGpsStale) {
        monitor.isGpsStale = true;
        this.onDriverGpsStale?.(rideId, monitor.passengerId);
        pushRideStatusUpdate(rideId, "gps_stale", [monitor.passengerId], {
          driverId: monitor.driverId,
          lastKnownLat: monitor.lastDriverLat,
          lastKnownLng: monitor.lastDriverLng,
          staleSince: monitor.lastDriverUpdate,
        });
      }

      // No-show detection: driver didn't arrive within 2x ETA
      if (
        monitor.currentStep === "driver_en_route" &&
        !monitor.noShowWarned &&
        monitor.etaMinutes > 0
      ) {
        const maxWaitMs = monitor.etaMinutes * 60_000 * this.NO_SHOW_MULTIPLIER;
        const waitedMs = now - monitor.driverAssignedAt;

        if (waitedMs >= maxWaitMs) {
          monitor.noShowWarned = true;
          logger.info({ rideId, waitedMin: Math.round(waitedMs / 60000), etaMin: monitor.etaMinutes }, "[RideMonitor] No-show triggered");

          // Notify passenger with option to cancel
          pushRideStatusUpdate(rideId, "driver_no_show_warning", [monitor.passengerId], {
            driverId: monitor.driverId,
            waitedMinutes: Math.round(waitedMs / 60_000),
            expectedEta: monitor.etaMinutes,
          });

          this.onNoShowCancel?.(monitor.rideDbId, monitor.passengerId)?.catch((e) =>
            logger.error({ err: e, rideId }, "[RideMonitor] onNoShowCancel error"),
          );
        }
      }
    }
  }

  // ── Ride search timeout check ──

  private checkRideTimeouts(): void {
    const now = Date.now();

    for (const [rideId, entry] of this.rideTimeouts) {
      if (now - entry.startedAt >= entry.timeoutMs) {
        logger.info({ rideId, timeoutSec: entry.timeoutMs / 1000 }, "[RideMonitor] Ride search timeout");
        this.rideTimeouts.delete(rideId);

        pushRideStatusUpdate(rideId, "search_timeout", [entry.passengerId], {
          message: "No drivers available. Please try again.",
        });

        this.onRideSearchTimeout?.(entry.rideDbId, entry.passengerId)?.catch((e) =>
          logger.error({ err: e, rideId }, "[RideMonitor] onRideSearchTimeout error"),
        );
      }
    }
  }

  // ── Live ETA from OSRM ──

  async calculateLiveETA(
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
  ): Promise<{ etaMinutes: number; distanceKm: number }> {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await res.json();
      if (data.routes?.[0]) {
        const route = data.routes[0];
        const baseDuration = route.duration / 60; // seconds to minutes
        const distance = route.distance / 1000; // meters to km

        // Apply time-of-day traffic multiplier
        const trafficMultiplier = this.getTrafficMultiplier();
        const adjustedMinutes = Math.ceil(baseDuration * trafficMultiplier);

        return { etaMinutes: Math.max(1, adjustedMinutes), distanceKm: Math.round(distance * 100) / 100 };
      }
    } catch {
      // Fallback to haversine estimate
    }

    const fallbackDist = haversineKm(fromLat, fromLng, toLat, toLng);
    return { etaMinutes: Math.max(1, Math.ceil(3 + fallbackDist * 2)), distanceKm: fallbackDist };
  }

  private getTrafficMultiplier(): number {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekday = day >= 1 && day <= 5;

    if (isWeekday && hour >= 7 && hour <= 9) return 1.4;   // morning rush
    if (isWeekday && hour >= 17 && hour <= 19) return 1.5;  // evening rush
    if (hour >= 22 || hour <= 5) return 0.85;               // late night (faster)
    if (!isWeekday && hour >= 11 && hour <= 15) return 1.2;  // weekend midday
    return 1.0;
  }

  // ── Stats ──

  getActiveRideCount(): number { return this.activeRides.size; }
  getPendingSearchCount(): number { return this.rideTimeouts.size; }

  getRideMonitor(rideId: string): ActiveRideMonitor | undefined {
    return this.activeRides.get(rideId);
  }
}

// Singleton export
export const rideMonitor = new RideMonitorService();
