/**
 * useRideEvents — reads from the shared RideEventsProvider (single SSE connection).
 *
 * Usage:
 *   const { lastRideUpdate, isConnected } = useRideEvents();
 */

export {
  RideEventsProvider,
  useRideEvents,
  type RideEventsContextValue,
  type RideUpdateEvent,
  type LocationUpdateEvent,
  type NotificationEvent,
  type RouteDeviationEvent,
  type JoinApprovedEvent,
  type JoinRejectedEvent,
  type PassengerRequestMatchedEvent,
  type ChatMessageEvent,
  type SseEvent,
} from "./ride-events-context";

import { useEffect, useState } from "react";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

/**
 * useDriverLocationPolling — polls ride status every N seconds.
 * Use this when SSE is unavailable or as a supplementary source.
 */
export function useDriverLocationPolling(
  rideId: string | null,
  enabled = true,
  intervalMs = 5000,
): { lat: number | null; lng: number | null } {
  const [loc] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });

  useEffect(() => {
    if (!enabled || !rideId) return;

    const poll = async () => {
      try {
        await fetch(`${API_BASE}/api/events/ride/${rideId}`, {
          credentials: "include",
        });
      } catch {
        /* ignore */
      }
    };

    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  }, [rideId, enabled, intervalMs]);

  return loc;
}
