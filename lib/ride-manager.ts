/**
 * RideManager — Single Source of Truth for ride state on the frontend.
 *
 * Architecture:
 * - Subscribes to SSE events for real-time updates
 * - Falls back to polling when SSE unavailable
 * - Throttles location updates to prevent excessive re-renders
 * - Handles GPS stale detection and recovery alerts
 * - Manages driver cancel → re-dispatch flow
 * - Provides payment retry queue
 * - Idempotent action dispatching (prevents double-tap issues)
 *
 * Usage:
 *   const manager = RideManager.getInstance();
 *   manager.startTracking(rideId);
 *   manager.subscribe((state) => updateUI(state));
 *   manager.stopTracking();
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type RideStep =
  | "finding_driver"
  | "driver_assigned"
  | "driver_en_route"
  | "driver_arrived"
  | "ride_started"
  | "ride_in_progress"
  | "completed"
  | "cancelled";

export interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

export interface RideState {
  rideId: string | null;
  step: RideStep | null;
  driverId: number | null;
  driverName: string | null;
  driverPhone: string | null;
  driverRating: number | null;
  vehicleInfo: string | null;
  licensePlate: string | null;
  driverLocation: DriverLocation | null;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  destLat: number;
  destLng: number;
  destAddress: string;
  etaMinutes: number | null;
  distanceRemainingKm: number | null;
  fare: number | null;
  isGpsStale: boolean;
  gpsStaleSince: number | null;
  isReDispatching: boolean;
  paymentStatus: "pending" | "processing" | "succeeded" | "failed" | null;
  paymentRetryCount: number;
  isConnected: boolean;
  lastUpdated: number;
  error: string | null;
}

type RideEventListener = (state: RideState) => void;
type AlertListener = (alert: RideAlert) => void;

export interface RideAlert {
  type:
    | "gps_stale"
    | "gps_recovered"
    | "driver_cancelled"
    | "re_dispatching"
    | "no_show_warning"
    | "search_timeout"
    | "payment_failed"
    | "payment_retry"
    | "geofence_arrival";
  title: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ── RideManager Class ────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

class RideManager {
  private static instance: RideManager | null = null;

  private state: RideState;
  private listeners = new Set<RideEventListener>();
  private alertListeners = new Set<AlertListener>();
  private sseConnection: EventSource | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private pendingActions = new Set<string>(); // idempotency: tracks in-flight actions
  private paymentRetryTimer: ReturnType<typeof setTimeout> | null = null;

  // Throttle: location updates stored in buffer, not triggering re-render immediately
  private locationBuffer: DriverLocation | null = null;
  private locationFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly LOCATION_THROTTLE_MS = 2000; // flush location every 2s max

  private readonly GPS_STALE_THRESHOLD_MS = 30_000;
  private readonly POLLING_INTERVAL_MS = 5000;
  private readonly MAX_PAYMENT_RETRIES = 3;
  private readonly PAYMENT_RETRY_DELAYS = [60_000, 300_000, 900_000]; // 1min, 5min, 15min

  private constructor() {
    this.state = this.getDefaultState();
  }

  static getInstance(): RideManager {
    if (!RideManager.instance) {
      RideManager.instance = new RideManager();
    }
    return RideManager.instance;
  }

  private getDefaultState(): RideState {
    return {
      rideId: null,
      step: null,
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverRating: null,
      vehicleInfo: null,
      licensePlate: null,
      driverLocation: null,
      pickupLat: 0,
      pickupLng: 0,
      pickupAddress: "",
      destLat: 0,
      destLng: 0,
      destAddress: "",
      etaMinutes: null,
      distanceRemainingKm: null,
      fare: null,
      isGpsStale: false,
      gpsStaleSince: null,
      isReDispatching: false,
      paymentStatus: null,
      paymentRetryCount: 0,
      isConnected: false,
      lastUpdated: Date.now(),
      error: null,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  startTracking(rideId: string, initialState?: Partial<RideState>): void {
    this.state = {
      ...this.getDefaultState(),
      rideId,
      ...initialState,
      lastUpdated: Date.now(),
    };
    this.notify();
    this.connectSSE();
    this.startPolling();
  }

  stopTracking(): void {
    this.disconnectSSE();
    this.stopPolling();
    this.clearPaymentRetry();
    if (this.locationFlushTimer) {
      clearTimeout(this.locationFlushTimer);
      this.locationFlushTimer = null;
    }
    this.locationBuffer = null;
    this.state = this.getDefaultState();
    this.notify();
  }

  getState(): Readonly<RideState> {
    return { ...this.state };
  }

  subscribe(listener: RideEventListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // immediate callback with current state
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeAlerts(listener: AlertListener): () => void {
    this.alertListeners.add(listener);
    return () => {
      this.alertListeners.delete(listener);
    };
  }

  // ── Idempotent Action Dispatch ─────────────────────────────────────────────

  async dispatchAction(
    actionKey: string,
    action: () => Promise<unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // Prevent double-tap: if this action is already in-flight, skip
    if (this.pendingActions.has(actionKey)) {
      return { success: false, error: "Action already in progress" };
    }

    this.pendingActions.add(actionKey);
    try {
      const result = await action();
      return { success: true, result };
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Action failed";
      return { success: false, error: message };
    } finally {
      this.pendingActions.delete(actionKey);
    }
  }

  isActionPending(actionKey: string): boolean {
    return this.pendingActions.has(actionKey);
  }

  // ── SSE Connection ─────────────────────────────────────────────────────────

  private connectSSE(): void {
    if (typeof EventSource === "undefined") return; // not available in some RN envs

    try {
      this.sseConnection = new EventSource(`${API_BASE}/api/events`, {
        withCredentials: true,
      } as EventSourceInit);

      this.sseConnection.onopen = () => {
        this.updateState({ isConnected: true, error: null });
        this.reconnectDelay = 1000;
      };

      this.sseConnection.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSSEEvent(data);
        } catch {
          /* ignore malformed */
        }
      };

      this.sseConnection.onerror = () => {
        this.sseConnection?.close();
        this.sseConnection = null;
        this.updateState({ isConnected: false });

        // Exponential backoff reconnect
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
          this.connectSSE();
        }, this.reconnectDelay);
      };
    } catch {
      this.updateState({ isConnected: false });
    }
  }

  private disconnectSSE(): void {
    this.sseConnection?.close();
    this.sseConnection = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleSSEEvent(data: Record<string, unknown>): void {
    if (!data?.type) return;

    switch (data.type) {
      case "ride_update":
        if (data.rideId === this.state.rideId) {
          this.updateState({
            step: data.step as RideStep,
            driverId: (data.driverId as number) ?? this.state.driverId,
            lastUpdated: Date.now(),
          });
        }
        break;

      case "location_update":
        if (data.driverId === this.state.driverId) {
          this.bufferLocationUpdate({
            lat: data.lat as number,
            lng: data.lng as number,
            heading: data.heading as number | undefined,
            speed: data.speed as number | undefined,
            updatedAt: Date.now(),
          });
        }
        break;

      case "gps_stale":
        this.updateState({ isGpsStale: true, gpsStaleSince: Date.now() });
        this.emitAlert({
          type: "gps_stale",
          title: "Driver Location Updating...",
          message:
            "We've temporarily lost the driver's GPS signal. Don't worry — this usually resolves in a few seconds.",
          timestamp: Date.now(),
        });
        break;

      case "gps_recovered":
        this.updateState({ isGpsStale: false, gpsStaleSince: null });
        this.emitAlert({
          type: "gps_recovered",
          title: "Location Restored",
          message: "Driver's GPS signal has been restored.",
          timestamp: Date.now(),
        });
        break;

      case "driver_cancelled":
        this.updateState({
          isReDispatching: true,
          step: "finding_driver",
        });
        this.emitAlert({
          type: "driver_cancelled",
          title: "Driver Unavailable",
          message:
            "Your driver had to cancel. We're finding you a new driver right away.",
          timestamp: Date.now(),
        });
        break;

      case "re_dispatch_success":
        this.updateState({
          isReDispatching: false,
          step: "driver_assigned",
          driverId: data.driverId as number,
          driverName: data.driverName as string,
        });
        break;

      case "driver_no_show_warning":
        this.emitAlert({
          type: "no_show_warning",
          title: "Driver Taking Longer Than Expected",
          message: `Your driver has been en route for ${data.waitedMinutes} minutes (expected ${data.expectedEta} min). You can cancel for free.`,
          timestamp: Date.now(),
          data: data as Record<string, unknown>,
        });
        break;

      case "search_timeout":
        this.updateState({ step: "cancelled" });
        this.emitAlert({
          type: "search_timeout",
          title: "No Drivers Available",
          message:
            "We couldn't find a driver for your ride. Please try again in a few minutes.",
          timestamp: Date.now(),
        });
        break;

      case "geofence_arrival":
        this.updateState({ step: "driver_arrived" });
        this.emitAlert({
          type: "geofence_arrival",
          title: "Driver Has Arrived!",
          message: "Your driver is at the pickup location.",
          timestamp: Date.now(),
        });
        break;
    }
  }

  // ── Location Throttling ────────────────────────────────────────────────────

  private bufferLocationUpdate(location: DriverLocation): void {
    this.locationBuffer = location;

    if (!this.locationFlushTimer) {
      this.locationFlushTimer = setTimeout(() => {
        if (this.locationBuffer) {
          this.updateState({
            driverLocation: this.locationBuffer,
            isGpsStale: false,
            gpsStaleSince: null,
            lastUpdated: Date.now(),
          });
          this.locationBuffer = null;
        }
        this.locationFlushTimer = null;
      }, this.LOCATION_THROTTLE_MS);
    }
  }

  // ── Polling Fallback ───────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.pollingInterval) return;
    this.pollingInterval = setInterval(() => {
      this.pollRideStatus();
    }, this.POLLING_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private pollRideStatus(): void {
    if (!this.state.rideId) return;
    // Polling data is fetched by the React layer via tRPC.
    // RideManager checks GPS staleness based on the last known location timestamp.
    if (this.state.driverLocation) {
      const elapsed = Date.now() - this.state.driverLocation.updatedAt;
      if (elapsed >= this.GPS_STALE_THRESHOLD_MS && !this.state.isGpsStale) {
        this.updateState({ isGpsStale: true, gpsStaleSince: Date.now() });
        this.emitAlert({
          type: "gps_stale",
          title: "Driver Location Updating...",
          message: "Driver's location hasn't updated recently.",
          timestamp: Date.now(),
        });
      }
    }
  }

  // ── Payment Retry Queue ────────────────────────────────────────────────────

  schedulePaymentRetry(payAction: () => Promise<void>): void {
    const retryCount = this.state.paymentRetryCount;
    if (retryCount >= this.MAX_PAYMENT_RETRIES) {
      this.updateState({ paymentStatus: "failed" });
      this.emitAlert({
        type: "payment_failed",
        title: "Payment Failed",
        message:
          "We couldn't process your payment after multiple attempts. Please update your payment method.",
        timestamp: Date.now(),
      });
      return;
    }

    const delay = this.PAYMENT_RETRY_DELAYS[retryCount] ?? 900_000;
    this.updateState({
      paymentStatus: "pending",
      paymentRetryCount: retryCount + 1,
    });

    this.emitAlert({
      type: "payment_retry",
      title: "Payment Processing",
      message: `Retrying payment (attempt ${retryCount + 1} of ${this.MAX_PAYMENT_RETRIES})...`,
      timestamp: Date.now(),
    });

    this.paymentRetryTimer = setTimeout(async () => {
      try {
        await payAction();
        this.updateState({ paymentStatus: "succeeded" });
      } catch {
        this.schedulePaymentRetry(payAction); // recurse for next retry
      }
    }, delay);
  }

  private clearPaymentRetry(): void {
    if (this.paymentRetryTimer) {
      clearTimeout(this.paymentRetryTimer);
      this.paymentRetryTimer = null;
    }
  }

  // ── State Management ───────────────────────────────────────────────────────

  updateState(patch: Partial<RideState>): void {
    this.state = { ...this.state, ...patch, lastUpdated: Date.now() };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* safe — never let a bad listener break the manager */
      }
    }
  }

  private emitAlert(alert: RideAlert): void {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch {
        /* safe */
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stopTracking();
    this.listeners.clear();
    this.alertListeners.clear();
    RideManager.instance = null;
  }
}

export default RideManager;
