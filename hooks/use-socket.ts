// Real-time Socket.IO hook for ride tracking, chat, and notifications
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";

// Event constants (must match server WS_EVENTS)
const WS_EVENTS = {
  JOIN_RIDE: "join_ride",
  LEAVE_RIDE: "leave_ride",
  DRIVER_LOCATION: "driver_location",
  SEND_MESSAGE: "send_message",
  RIDE_UPDATE: "ride_update",
  DRIVER_LOCATION_UPDATE: "driver_location_update",
  CHAT_MESSAGE: "chat_message",
  NOTIFICATION: "notification",
  ETA_UPDATE: "eta_update",
  TRIP_PROGRESS: "trip_progress",
} as const;

export interface DriverLocationEvent {
  rideId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface RideUpdateEvent {
  rideId: string;
  status?: string;
  step?: string;
  message?: string;
  driverId?: number;
  timestamp: number;
}

export interface ChatMessageEvent {
  messageId: string;
  rideId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface ETAEvent {
  rideId: string;
  minutes: number;
  distanceKm: number;
  updatedAt: number;
}

export interface TripProgressEvent {
  rideId: string;
  percentage: number;
  currentLat: number;
  currentLng: number;
  remainingKm: number;
  remainingMin: number;
  timestamp: number;
}

// ── Global Socket Connection ────────────────────────────────────────────────

let globalSocket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;
let lastFailureAt = 0;
const FAILURE_COOLDOWN_MS = 15_000; // don't retry for 15 s after total failure

async function getOrCreateSocket(): Promise<Socket> {
  if (globalSocket?.connected) return globalSocket;

  if (connectionPromise) return connectionPromise;

  // Back off completely for FAILURE_COOLDOWN_MS after a failed attempt
  if (Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    throw new Error("Socket in cooldown after connection failure");
  }

  connectionPromise = (async () => {
    const token = await getSessionToken();
    if (!token) throw new Error("No session token");

    const baseUrl = getApiBaseUrl();

    const socket = io(baseUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
    });

    return new Promise<Socket>((resolve, reject) => {
      socket.on("connect", () => {
        console.log("[Socket] Connected:", socket.id);
        globalSocket = socket;
        connectionPromise = null;
        resolve(socket);
      });

      socket.on("connect_error", (err) => {
        if (!globalSocket) console.warn("[Socket] Connection error:", err.message);
        lastFailureAt = Date.now();
        connectionPromise = null;
        reject(err);
      });

      socket.on("disconnect", (reason) => {
        console.log("[Socket] Disconnected:", reason);
      });
    });
  })();

  return connectionPromise;
}

export function disconnectSocket() {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
    connectionPromise = null;
  }
}

// ── useSocket Hook ──────────────────────────────────────────────────────────

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    getOrCreateSocket()
      .then((socket) => {
        if (!mounted) return;
        setIsConnected(socket.connected);

        const onConnect = () => mounted && setIsConnected(true);
        const onDisconnect = () => mounted && setIsConnected(false);

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        return () => {
          socket.off("connect", onConnect);
          socket.off("disconnect", onDisconnect);
        };
      })
      .catch(() => {
        if (mounted) setIsConnected(false);
      });

    return () => { mounted = false; };
  }, []);

  return { isConnected, socket: globalSocket };
}

// ── useRideSocket Hook ──────────────────────────────────────────────────────

export function useRideSocket(rideId: string | null | undefined) {
  const [driverLocation, setDriverLocation] = useState<DriverLocationEvent | null>(null);
  const [rideUpdate, setRideUpdate] = useState<RideUpdateEvent | null>(null);
  const [eta, setETA] = useState<ETAEvent | null>(null);
  const [tripProgress, setTripProgress] = useState<TripProgressEvent | null>(null);
  const [messages, setMessages] = useState<ChatMessageEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Holds the listener-removal teardown so the outer cleanup can call it even
  // when the component unmounts before the async getOrCreateSocket() resolves.
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!rideId) return;

    let mounted = true;

    getOrCreateSocket()
      .then((socket) => {
        if (!mounted) {
          // Component already unmounted while we were awaiting the socket.
          // Nothing to set up — teardownRef stays null, which is correct.
          return;
        }
        socketRef.current = socket;
        setIsConnected(socket.connected);

        socket.emit(WS_EVENTS.JOIN_RIDE, rideId);

        const onDriverLocation = (data: DriverLocationEvent) => {
          if (data.rideId === rideId && mounted) setDriverLocation(data);
        };
        const onRideUpdate = (data: RideUpdateEvent) => {
          if (data.rideId === rideId && mounted) setRideUpdate(data);
        };
        const onETA = (data: ETAEvent) => {
          if (data.rideId === rideId && mounted) setETA(data);
        };
        const onProgress = (data: TripProgressEvent) => {
          if (data.rideId === rideId && mounted) setTripProgress(data);
        };
        const onMessage = (data: ChatMessageEvent) => {
          if (data.rideId === rideId && mounted) {
            setMessages(prev => [...prev, data]);
          }
        };
        const onConnect = () => { if (mounted) setIsConnected(true); };
        const onDisconnect = () => { if (mounted) setIsConnected(false); };

        socket.on(WS_EVENTS.DRIVER_LOCATION_UPDATE, onDriverLocation);
        socket.on(WS_EVENTS.RIDE_UPDATE, onRideUpdate);
        socket.on(WS_EVENTS.ETA_UPDATE, onETA);
        socket.on(WS_EVENTS.TRIP_PROGRESS, onProgress);
        socket.on(WS_EVENTS.CHAT_MESSAGE, onMessage);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        teardownRef.current = () => {
          socket.emit(WS_EVENTS.LEAVE_RIDE, rideId);
          socket.off(WS_EVENTS.DRIVER_LOCATION_UPDATE, onDriverLocation);
          socket.off(WS_EVENTS.RIDE_UPDATE, onRideUpdate);
          socket.off(WS_EVENTS.ETA_UPDATE, onETA);
          socket.off(WS_EVENTS.TRIP_PROGRESS, onProgress);
          socket.off(WS_EVENTS.CHAT_MESSAGE, onMessage);
          socket.off("connect", onConnect);
          socket.off("disconnect", onDisconnect);
          teardownRef.current = null;
        };
      })
      .catch(() => {});

    return () => {
      mounted = false;
      teardownRef.current?.();
    };
  }, [rideId]);

  const sendLocation = useCallback((lat: number, lng: number, heading?: number, speed?: number) => {
    if (socketRef.current?.connected && rideId) {
      socketRef.current.emit(WS_EVENTS.DRIVER_LOCATION, {
        rideId, latitude: lat, longitude: lng, heading, speed,
      });
    }
  }, [rideId]);

  const sendMessage = useCallback((message: string) => {
    if (socketRef.current?.connected && rideId) {
      socketRef.current.emit(WS_EVENTS.SEND_MESSAGE, { rideId, message });
    }
  }, [rideId]);

  return {
    driverLocation,
    rideUpdate,
    eta,
    tripProgress,
    messages,
    isConnected,
    sendLocation,
    sendMessage,
  };
}
