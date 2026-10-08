// WebSocket Service for Real-Time Updates — PRODUCTION IMPLEMENTATION
// Uses Socket.IO for bi-directional communication

import { Server as SocketIOServer, Socket } from "socket.io";
import type { Server as HTTPServer } from "http";
import { sdk } from "../_core/sdk";
import { getRideByRideId, getRidePassengers } from "../db";
import logger from "../logger";
import {
  recordSocketConnect,
  recordSocketDisconnect,
  recordSocketEvent,
  recordSocketFailedConnect,
  getSocketMetricsSnapshot,
} from "./socketMetricsService";
import { isRideParticipantFromLists } from "./rideAccessService";
import { getDriverAccessStatus } from "./driverAccessService";
import { verifyAdminToken } from "../middleware/adminAuth";

// ── Event Types ─────────────────────────────────────────────────────────────

export interface RideUpdate {
  rideId: string;
  status: "searching" | "matched" | "pickup" | "in_progress" | "completed" | "cancelled";
  driverId?: number;
  driverLocation?: { latitude: number; longitude: number };
  passengers?: number[];
  eta?: number;
}

export interface ChatMessage {
  messageId: string;
  rideId: string;
  senderId: number;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface LocationUpdate {
  userId: number;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface WsNotification {
  id: string;
  userId: number;
  type: "ride_match" | "driver_arrived" | "payment_received" | "rating_request" | "ride_step" | "sos_alert";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// Socket.IO event name constants
export const WS_EVENTS = {
  // Client -> Server
  JOIN_RIDE: "join_ride",
  LEAVE_RIDE: "leave_ride",
  DRIVER_LOCATION: "driver_location",
  SEND_MESSAGE: "send_message",
  // Server -> Client
  RIDE_UPDATE: "ride_update",
  DRIVER_LOCATION_UPDATE: "driver_location_update",
  CHAT_MESSAGE: "chat_message",
  NOTIFICATION: "notification",
  ETA_UPDATE: "eta_update",
  TRIP_PROGRESS: "trip_progress",
  SURGE_UPDATE: "surge_update",
  SOS_ALERT: "sos_alert",
} as const;

// ── WebSocket Manager ───────────────────────────────────────────────────────

export class WebSocketManager {
  private io: SocketIOServer;
  private activeRides: Map<string, Set<number>> = new Map();
  private userSockets: Map<number, Set<string>> = new Map();
  private driverLocations: Map<number, { latitude: number; longitude: number; heading?: number; speed?: number }> = new Map();
  private adminLocationInterval: ReturnType<typeof setInterval> | null = null;

  constructor(httpServer: HTTPServer, corsOrigins: string[] = ["*"]) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigins.length === 1 && corsOrigins[0] === "*" ? "*" : corsOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingInterval: 25000,
      pingTimeout: 20000,
      transports: ["websocket", "polling"],
    });

    this.setupAuthMiddleware();
    this.setupEventHandlers();
    this.setupAdminNamespace();
    logger.info("[WebSocket] Manager initialized with Socket.IO");
  }

  // ── Auth Middleware ──────────────────────────────────────────────────────

  private setupAuthMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
        if (!token) {
          return next(new Error("Authentication required"));
        }

        const user = await sdk.resolveUserFromToken(token);
        if (!user?.id) {
          return next(new Error("Invalid token"));
        }

        // Numeric user ID — must match sendNotification(userId: number) room keys
        (socket as any).userId = user.id;
        (socket as any).userName = user.name ?? "User";
        next();
      } catch {
        recordSocketFailedConnect();
        next(new Error("Authentication failed"));
      }
    });
  }

  // ── Event Handlers ──────────────────────────────────────────────────────

  private setupEventHandlers() {
    this.io.on("connection", (socket: Socket) => {
      const userId = (socket as any).userId as number;
      logger.debug({ socketId: socket.id, userId }, "[WebSocket] Connected");
      recordSocketConnect();

      // Track user socket
      this.trackSocket(userId, socket.id);

      // Join user's personal room for notifications (numeric ID)
      socket.join(`user:${userId}`);

      // ── Join Ride Room ────────────────────────────────────────────────
      socket.on(WS_EVENTS.JOIN_RIDE, async (rideId: string) => {
        if (!rideId) return;
        if (!(await this.verifyRideMembership(rideId, userId))) {
          logger.warn({ userId, rideId }, "[WebSocket] join_ride denied — not a participant");
          return;
        }
        const room = `ride:${rideId}`;
        socket.join(room);

        if (!this.activeRides.has(rideId)) {
          this.activeRides.set(rideId, new Set());
        }
        this.activeRides.get(rideId)!.add(socket.id as any);
        recordSocketEvent("join_ride");
        logger.debug({ userId, rideId }, "[WebSocket] User joined ride room");
      });

      // ── Leave Ride Room ───────────────────────────────────────────────
      socket.on(WS_EVENTS.LEAVE_RIDE, (rideId: string) => {
        if (!rideId) return;
        socket.leave(`ride:${rideId}`);
        const users = this.activeRides.get(rideId);
        if (users) {
          users.delete(socket.id as any);
          if (users.size === 0) this.activeRides.delete(rideId);
        }
      });

      // ── Driver Location Update ────────────────────────────────────────
      socket.on(WS_EVENTS.DRIVER_LOCATION, async (data: { rideId: string; latitude: number; longitude: number; heading?: number; speed?: number }) => {
        if (!data?.rideId || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return;
        const driverAccess = await getDriverAccessStatus(userId);
        if (!driverAccess.canAccessDriverMode) {
          logger.warn({ userId, status: driverAccess.driverStatus }, "[WebSocket] driver_location blocked — driver access revoked");
          socket.emit("driver_access_revoked", { reason: driverAccess.banReason ?? "Driver access has been revoked" });
          return;
        }
        if (!(await this.verifyAssignedDriver(data.rideId, userId))) {
          logger.warn({ userId, rideId: data.rideId }, "[WebSocket] driver_location denied");
          return;
        }

        this.driverLocations.set(data.rideId as any, {
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading,
          speed: data.speed,
        });

        // Broadcast to ride room
        this.io.to(`ride:${data.rideId}`).emit(WS_EVENTS.DRIVER_LOCATION_UPDATE, {
          rideId: data.rideId,
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading,
          speed: data.speed,
          timestamp: Date.now(),
        });
        recordSocketEvent("driver_location");
      });

      // ── Chat Message ──────────────────────────────────────────────────
      socket.on(WS_EVENTS.SEND_MESSAGE, async (msg: { rideId: string; message: string }) => {
        if (!msg?.rideId || !msg?.message) return;
        if (!(await this.verifyRideMembership(msg.rideId, userId))) {
          logger.warn({ userId, rideId: msg.rideId }, "[WebSocket] send_message denied");
          return;
        }
        // Sanitize: strip HTML tags, limit lengths to prevent XSS / payload abuse
        const sanitize = (s: string, maxLen: number) =>
          String(s).replace(/<[^>]*>/g, "").trim().slice(0, maxLen);
        const safeMessage = sanitize(msg.message, 1000);
        const safeName = sanitize((socket as any).userName || "User", 100);
        if (!safeMessage) return;
        this.io.to(`ride:${msg.rideId}`).emit(WS_EVENTS.CHAT_MESSAGE, {
          messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          rideId: msg.rideId,
          senderId: userId,
          senderName: safeName,
          message: safeMessage,
          timestamp: Date.now(),
        });
        recordSocketEvent("chat_message", true);
      });

      // ── Disconnect ────────────────────────────────────────────────────
      socket.on("disconnect", (reason: string) => {
        recordSocketDisconnect(reason);
        this.untrackSocket(userId, socket.id);
        // Clean up from active rides
        for (const [rideId, sockets] of this.activeRides) {
          sockets.delete(socket.id as any);
          if (sockets.size === 0) this.activeRides.delete(rideId);
        }
        logger.debug({ socketId: socket.id, reason }, "[WebSocket] Disconnected");
      });
    });
  }

  // ── Ride access (mirrors rideAccessService) ─────────────────────────────

  private async verifyRideMembership(rideId: string, userId: number): Promise<boolean> {
    const ride = await getRideByRideId(rideId);
    if (!ride) return false;
    const passengers = await getRidePassengers(ride.id);
    return isRideParticipantFromLists(
      ride,
      userId,
      passengers.map((p) => p.passengerId),
    );
  }

  private async verifyAssignedDriver(rideId: string, userId: number): Promise<boolean> {
    const ride = await getRideByRideId(rideId);
    if (!ride) return false;
    return ride.driverId != null && ride.driverId === userId;
  }

  // ── Socket Tracking ─────────────────────────────────────────────────────

  private trackSocket(userId: number, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  private untrackSocket(userId: number, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) this.userSockets.delete(userId);
    }
  }

  // ── Broadcast Methods (Server -> Client) ────────────────────────────────

  public broadcastRideUpdate(update: RideUpdate): void {
    this.io.to(`ride:${update.rideId}`).emit(WS_EVENTS.RIDE_UPDATE, update);
    // Mirror to admin namespace for real-time dashboard
    this.io.of("/admin").emit("ride_update", update);
  }

  public notifyRideMatched(rideId: string, passengerId: number, driverId: number): void {
    const notification: WsNotification = {
      id: `notif_${Date.now()}`,
      userId: passengerId,
      type: "ride_match",
      title: "Ride Matched!",
      message: "Your ride has been matched with a driver.",
      data: { rideId, driverId },
      timestamp: Date.now(),
    };
    this.sendNotification(passengerId, notification);
  }

  public notifyDriverArrived(rideId: string, passengerId: number): void {
    const notification: WsNotification = {
      id: `notif_${Date.now()}`,
      userId: passengerId,
      type: "driver_arrived",
      title: "Driver Arrived",
      message: "Your driver has arrived at the pickup point.",
      data: { rideId },
      timestamp: Date.now(),
    };
    this.sendNotification(passengerId, notification);
  }

  public updateDriverLocation(driverId: number, location: { latitude: number; longitude: number }): void {
    this.driverLocations.set(driverId, location);
  }

  public broadcastChatMessage(message: ChatMessage): void {
    this.io.to(`ride:${message.rideId}`).emit(WS_EVENTS.CHAT_MESSAGE, message);
  }

  public sendNotification(userId: number, notification: WsNotification): void {
    this.io.to(`user:${userId}`).emit(WS_EVENTS.NOTIFICATION, notification);
  }

  public broadcastNotification(notification: WsNotification): void {
    this.io.emit(WS_EVENTS.NOTIFICATION, notification);
  }

  public broadcastETAUpdate(rideId: string, eta: { minutes: number; distanceKm: number; updatedAt: number }): void {
    this.io.to(`ride:${rideId}`).emit(WS_EVENTS.ETA_UPDATE, { rideId, ...eta });
  }

  public broadcastSurgeUpdate(zone: { id: string; name: string; multiplier: number; lat: number; lng: number; radiusKm: number }): void {
    this.io.emit(WS_EVENTS.SURGE_UPDATE, zone);
  }

  public notifyRideStep(rideId: string, userId: number, step: string, message: string): void {
    this.io.to(`user:${userId}`).emit(WS_EVENTS.RIDE_UPDATE, { rideId, step, message, timestamp: Date.now() });
  }

  public broadcastSOSAlert(alert: { userId: number; rideId?: string; lat: number; lng: number; message: string }): void {
    this.io.emit(WS_EVENTS.SOS_ALERT, { ...alert, timestamp: Date.now() });
  }

  public broadcastTripProgress(rideId: string, progress: { percentage: number; currentLat: number; currentLng: number; remainingKm: number; remainingMin: number }): void {
    this.io.to(`ride:${rideId}`).emit(WS_EVENTS.TRIP_PROGRESS, { rideId, ...progress, timestamp: Date.now() });
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  public getActiveRides(): string[] {
    return Array.from(this.activeRides.keys());
  }

  public getRideUsers(rideId: string): number[] {
    const users = this.activeRides.get(rideId);
    return users ? Array.from(users) as any : [];
  }

  public getDriverLocation(driverId: number): { latitude: number; longitude: number } | null {
    return this.driverLocations.get(driverId) || null;
  }

  public getConnectedCount(): number {
    let total = 0;
    for (const sockets of this.userSockets.values()) total += sockets.size;
    return total;
  }

  public getAllDriverLocations(): Map<number, { latitude: number; longitude: number }> {
    return new Map(this.driverLocations);
  }

  // ── Admin Namespace ──────────────────────────────────────────────────────

  private setupAdminNamespace() {
    const adminNs = this.io.of("/admin");

    adminNs.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
        if (!token) return next(new Error("Missing token"));
        const data = verifyAdminToken(token);
        if (!data) return next(new Error("Invalid or expired token"));
        if (data.role !== "admin") return next(new Error("Admin access required"));
        (socket as any).adminId = data.sub;
        next();
      } catch {
        next(new Error("Auth failed"));
      }
    });

    adminNs.on("connection", (socket) => {
      logger.debug({ socketId: socket.id }, "[WS/admin] Admin connected");

      // Send current driver locations immediately on connect
      const locations = Array.from(this.driverLocations.entries()).map(([driverId, loc]) => ({ driverId, ...loc }));
      socket.emit("driver_locations", locations);

      socket.on("disconnect", () => {
        logger.debug({ socketId: socket.id }, "[WS/admin] Admin disconnected");
      });
    });

    // Broadcast driver locations to all admin clients every 5 seconds
    this.adminLocationInterval = setInterval(() => {
      if (adminNs.sockets.size === 0) return;
      const locations = Array.from(this.driverLocations.entries()).map(([driverId, loc]) => ({ driverId, ...loc }));
      adminNs.emit("driver_locations", locations);
    }, 5000);
  }

  public broadcastToAdmin(event: string, data: unknown): void {
    this.io.of("/admin").emit(event, data);
  }

  public getOperationalStats(driverSessionOnline: number, passengerEstimate: number) {
    const mainSockets = this.io.engine.clientsCount;
    const adminSockets = this.io.of("/admin").sockets.size;
    const socketMetrics = getSocketMetricsSnapshot();
    return {
      totalActiveSockets: mainSockets + adminSockets,
      connectedAdmins: adminSockets,
      connectedDrivers: driverSessionOnline,
      connectedPassengers: Math.max(0, passengerEstimate),
      activeRideRooms: this.activeRides.size,
      trackedUsers: this.userSockets.size,
      driverLocationsTracked: this.driverLocations.size,
      ...socketMetrics,
    };
  }

  public close(): void {
    if (this.adminLocationInterval) clearInterval(this.adminLocationInterval);
    this.io.close();
    logger.info("[WebSocket] Manager closed");
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let wsManager: WebSocketManager | null = null;

export function initializeWebSocket(httpServer: HTTPServer, corsOrigins?: string[]): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(httpServer, corsOrigins);
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}
