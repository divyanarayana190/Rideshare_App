/**
 * Notification Service — Multi-channel notification delivery.
 *
 * Channels:
 *   1. In-app (DB row in notifications table + SSE push)
 *   2. Expo Push Notifications (FCM/APNs via Expo's push API)
 *   3. Twilio SMS (for critical alerts like SOS, driver arrived)
 *
 * All notifications are persisted to DB for in-app notification center.
 * Push and SMS are best-effort (failures are logged, not thrown).
 */

import { EventEmitter } from "events";
import logger from "../logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | "ride_request"
  | "driver_assigned"
  | "driver_arrived"
  | "ride_started"
  | "ride_completed"
  | "ride_cancelled"
  | "payment_received"
  | "rating_request"
  | "promo_code"
  | "system"
  | "safety_alert";

export interface NotificationPayload {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  deepLink?: string;
  pushToken?: string | null;
  smsPhone?: string | null;
  sendSms?: boolean;
}

// ─── Event Bus (for SSE delivery) ─────────────────────────────────────────────

class NotificationEventBus extends EventEmitter {
  /** Map of userId → SSE response stream writers */
  private sseClients = new Map<number, Set<(data: string) => void>>();

  registerSseClient(userId: number, writer: (data: string) => void): void {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }
    this.sseClients.get(userId)!.add(writer);
  }

  unregisterSseClient(userId: number, writer: (data: string) => void): void {
    const clients = this.sseClients.get(userId);
    if (!clients) return;
    clients.delete(writer);
    if (clients.size === 0) {
      this.sseClients.delete(userId);
    }
  }

  /** Close all SSE connections (used during graceful shutdown) */
  closeAll(): void {
    this.sseClients.clear();
  }

  pushToUser(userId: number, payload: Record<string, unknown>): void {
    const clients = this.sseClients.get(userId);
    if (!clients || clients.size === 0) return;
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const writer of clients) {
      try {
        writer(message);
      } catch {
        clients.delete(writer);
      }
    }
  }

  getConnectedUserIds(): number[] {
    return Array.from(this.sseClients.keys()).filter(
      (uid) => (this.sseClients.get(uid)?.size ?? 0) > 0,
    );
  }
}

export const notificationBus = new NotificationEventBus();

// ─── Expo Push Notifications ──────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  badge?: number;
  channelId?: string;
}

async function sendExpoPush(token: string, message: Omit<ExpoPushMessage, "to">): Promise<void> {
  if (!token || !token.startsWith("ExponentPushToken[")) return;

  try {
    const payload: ExpoPushMessage = { to: token, sound: "default", ...message };
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify([payload]),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ body: text }, "[PushNotification] Expo push failed");
    }
  } catch (err) {
    logger.warn({ err }, "[PushNotification] Expo push error");
  }
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────

export async function sendDirectSms(phone: string, message: string): Promise<void> {
  return sendSms(phone, message);
}

async function sendSms(phone: string, message: string): Promise<void> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    logger.warn("[SMS] Twilio not configured — skipping SMS");
    return;
  }

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(sid, token);
    await client.messages.create({ body: message, from, to: phone });
  } catch (err) {
    logger.warn({ err }, "[SMS] Twilio send error");
  }
}

// ─── Core notification sender ─────────────────────────────────────────────────

/**
 * Send a notification through all enabled channels.
 * Caller is responsible for also persisting to DB (see `createNotification` in db.ts).
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  // 1. SSE push (instant, no delay)
  notificationBus.pushToUser(payload.userId, {
    type:     "notification",
    notifType: payload.type,
    title:    payload.title,
    body:     payload.body,
    data:     payload.data,
    deepLink: payload.deepLink,
  });

  // 2. Expo push notification (background)
  if (payload.pushToken) {
    sendExpoPush(payload.pushToken, {
      title:     payload.title,
      body:      payload.body,
      data:      {
        ...payload.data,
        type: payload.type,
        deepLink: payload.deepLink,
      },
      channelId: payload.type,
    }).catch((err) => logger.warn({ err }, "[PushNotification] Expo push rejected"));
  }

  // 3. SMS for critical types (driver arrived, SOS)
  if (payload.sendSms && payload.smsPhone) {
    const smsText = `YOO: ${payload.title} — ${payload.body}`;
    sendSms(payload.smsPhone, smsText).catch((err) => logger.warn({ err }, "[SMS] send error"));
  }
}

// ─── Pre-built notification factories ─────────────────────────────────────────

export function buildNotification(
  type: NotificationType,
  context: Record<string, string | number>,
): { title: string; body: string; deepLink?: string } {
  switch (type) {
    case "driver_assigned":
      return {
        title: "Driver assigned!",
        body: `${context.driverName} is heading to your pickup in ${context.eta} min.`,
        deepLink: `/active-ride`,
      };
    case "driver_arrived":
      return {
        title: "Your driver has arrived",
        body: `${context.driverName} is waiting for you. Look for ${context.vehicle}.`,
        deepLink: `/active-ride`,
        // Flag to also send SMS
      };
    case "ride_started":
      return {
        title: "Ride started",
        body: `You're on your way to ${context.destination}. Estimated arrival: ${context.eta} min.`,
        deepLink: `/active-ride`,
      };
    case "ride_completed":
      return {
        title: "You've arrived!",
        body: `Your ride is complete. Total: $${context.fare}. Please rate your experience.`,
        deepLink: `/(tabs)/rides`,
      };
    case "ride_cancelled":
      return {
        title: "Ride cancelled",
        body: `Your ride was cancelled. ${context.reason ? `Reason: ${context.reason}` : ""}`,
        deepLink: `/`,
      };
    case "payment_received":
      return {
        title: "Payment received",
        body: `$${context.amount} has been added to your wallet.`,
        deepLink: `/wallet`,
      };
    case "rating_request":
      return {
        title: "How was your ride?",
        body: `Rate your experience with ${context.driverName}.`,
        deepLink: `/rate-ride-v2?rideId=${context.rideId}`,
      };
    case "promo_code":
      return {
        title: "Promo code applied!",
        body: `You saved $${context.savings} on this ride.`,
      };
    case "safety_alert":
      return {
        title: "🚨 Safety Alert",
        body: context.message as string,
        deepLink: `/emergency-sos`,
      };
    default:
      return {
        title: (context.title as string) || "YOO",
        body: (context.body as string) || "",
      };
  }
}

// ─── Ride status push to all participants ────────────────────────────────────

export function pushRideStatusUpdate(
  rideId: string,
  step: string,
  participantIds: number[],
  extraData?: Record<string, unknown>,
): void {
  const timestamp = Date.now();
  const event =
    step === "location_update"
      ? {
          type: "location_update" as const,
          rideId,
          driverId: Number(extraData?.driverId ?? 0),
          lat: Number(extraData?.driverLat ?? extraData?.lat ?? 0),
          lng: Number(extraData?.driverLng ?? extraData?.lng ?? 0),
          timestamp,
        }
      : {
          type: "ride_update" as const,
          rideId,
          step,
          ...extraData,
          timestamp,
        };
  for (const uid of participantIds) {
    notificationBus.pushToUser(uid, event);
  }
}
