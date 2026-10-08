/**
 * Single shared SSE connection for the whole app.
 * Mount once near the root when the user is signed in.
 */
import { getSessionToken } from "@/lib/_core/auth";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

export interface RideUpdateEvent {
  type: "ride_update";
  rideId: string;
  step: string;
  driverId?: number;
  driverLat?: number;
  driverLng?: number;
  cancelReason?: string;
  timestamp: number;
}

export interface LocationUpdateEvent {
  type: "location_update";
  driverId: number;
  lat: number;
  lng: number;
}

export interface NotificationEvent {
  type: "notification";
  notifType: string;
  title: string;
  body: string;
  data?: Record<string, unknown> & { recipientRole?: "passenger" | "driver" };
  deepLink?: string;
}

export interface RouteDeviationEvent {
  type: "route_deviation";
  rideId: string;
  driverLat: number;
  driverLng: number;
  distanceMeters: number;
  timestamp: number;
}

export interface JoinApprovedEvent {
  type: "join_approved";
  joinRequestId: string;
  rideId: string;
  fareShare: string;
}

export interface JoinRejectedEvent {
  type: "join_rejected";
  joinRequestId: string;
  reason: string | null;
}

export interface PassengerRequestMatchedEvent {
  type: "passenger_request_matched";
  requestId: string;
  driverId: number;
}

export interface ChatMessageEvent {
  type: "chat_message";
  rideId: number;
  messageId: string;
  senderId: number;
  message: string;
  timestamp: number;
}

export type SseEvent =
  | RideUpdateEvent
  | LocationUpdateEvent
  | NotificationEvent
  | RouteDeviationEvent
  | JoinApprovedEvent
  | JoinRejectedEvent
  | PassengerRequestMatchedEvent
  | ChatMessageEvent;

export interface RideEventsContextValue {
  isConnected: boolean;
  lastRideUpdate: RideUpdateEvent | null;
  lastDriverLocation: LocationUpdateEvent | null;
  lastNotification: NotificationEvent | null;
  lastRouteDeviation: RouteDeviationEvent | null;
  lastJoinApproved: JoinApprovedEvent | null;
  lastJoinRejected: JoinRejectedEvent | null;
  lastRequestMatched: PassengerRequestMatchedEvent | null;
  lastChatMessage: ChatMessageEvent | null;
  unreadCount: number;
}

const EMPTY: RideEventsContextValue = {
  isConnected: false,
  lastRideUpdate: null,
  lastDriverLocation: null,
  lastNotification: null,
  lastRouteDeviation: null,
  lastJoinApproved: null,
  lastJoinRejected: null,
  lastRequestMatched: null,
  lastChatMessage: null,
  unreadCount: 0,
};

const RideEventsContext = createContext<RideEventsContextValue>(EMPTY);

export function RideEventsProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const [state, setState] = useState<RideEventsContextValue>(EMPTY);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setState(EMPTY);
      return;
    }

    let cancelled = false;

    const connect = async () => {
      if (!enabledRef.current || cancelled) return;

      try {
        const token = await getSessionToken();
        if (!enabledRef.current || cancelled) return;

        const url = token
          ? `${API_BASE}/api/events?token=${encodeURIComponent(token)}`
          : `${API_BASE}/api/events`;
        const es = new EventSource(url, { withCredentials: true });
        esRef.current = es;

        es.onopen = () => {
          if (cancelled) return;
          reconnectDelay.current = 1000;
          setState((prev) => ({ ...prev, isConnected: true }));
        };

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as SseEvent;
            setState((prev) => {
              const next = { ...prev };
              if (data.type === "ride_update") next.lastRideUpdate = data as RideUpdateEvent;
              else if (data.type === "location_update") next.lastDriverLocation = data as LocationUpdateEvent;
              else if (data.type === "notification") {
                next.lastNotification = data as NotificationEvent;
                next.unreadCount = prev.unreadCount + 1;
              } else if (data.type === "route_deviation") next.lastRouteDeviation = data as RouteDeviationEvent;
              else if (data.type === "join_approved") next.lastJoinApproved = data as JoinApprovedEvent;
              else if (data.type === "join_rejected") next.lastJoinRejected = data as JoinRejectedEvent;
              else if (data.type === "passenger_request_matched") next.lastRequestMatched = data as PassengerRequestMatchedEvent;
              else if (data.type === "chat_message") next.lastChatMessage = data as ChatMessageEvent;
              return next;
            });
          } catch {
            /* ignore malformed events */
          }
        };

        es.onerror = () => {
          es.close();
          if (esRef.current === es) esRef.current = null;
          setState((prev) => ({ ...prev, isConnected: false }));

          if (!enabledRef.current || cancelled) return;
          reconnectTimer.current = setTimeout(() => {
            reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
            connect();
          }, reconnectDelay.current);
        };
      } catch {
        setState((prev) => ({ ...prev, isConnected: false }));
      }
    };

    connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setState(EMPTY);
    };
  }, [enabled]);

  return (
    <RideEventsContext.Provider value={state}>
      {children}
    </RideEventsContext.Provider>
  );
}

/** Read shared SSE state. Connection lifecycle is managed by RideEventsProvider. */
export function useRideEvents(_enabled = true): RideEventsContextValue {
  return useContext(RideEventsContext);
}
