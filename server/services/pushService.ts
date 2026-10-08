// Push Notification Service - Expo Push API
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import logger from "../logger";

const expo = new Expo();

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

/**
 * Send push notification to specific Expo push tokens
 */
export async function sendPushNotifications(
  tokens: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: tokens.filter(t => !Expo.isExpoPushToken(t)) };
  }

  const messages: ExpoPushMessage[] = validTokens.map(token => ({
    to: token,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    badge: payload.badge,
    channelId: payload.channelId || "default",
  }));

  // Chunk messages (Expo limit: 100 per batch)
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];
  const invalidTokens: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);

      for (let i = 0; i < ticketChunk.length; i++) {
        const ticket = ticketChunk[i]!;
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            const token = (chunk[i] as any)?.to;
            if (token) invalidTokens.push(typeof token === "string" ? token : token[0]);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, "[Push] Error sending chunk");
      failed += chunk.length;
    }
  }

  return { sent, failed, invalidTokens };
}

/**
 * Send push notification to a user by userId
 * Requires getUserPushTokens function from db
 */
export async function sendPushToUser(
  getUserTokens: (userId: number) => Promise<{ token: string }[]>,
  removeTokens: (tokens: string[]) => Promise<void>,
  userId: number,
  payload: PushPayload,
): Promise<void> {
  try {
    const tokenRecords = await getUserTokens(userId);
    if (tokenRecords.length === 0) return;

    const tokens = tokenRecords.map(t => t.token);
    const result = await sendPushNotifications(tokens, payload);

    // Clean up invalid tokens
    if (result.invalidTokens.length > 0) {
      await removeTokens(result.invalidTokens).catch(() => {});
    }
  } catch (error) {
    logger.error({ err: error, userId }, "[Push] Failed to send to user");
  }
}

/**
 * Notify driver of new ride request
 */
export function buildRideRequestPayload(rideDetails: {
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFare: number;
  distanceKm: number;
}): PushPayload {
  return {
    title: "New Ride Request!",
    body: `${rideDetails.pickupAddress} -> ${rideDetails.dropoffAddress} ($${(rideDetails.estimatedFare / 100).toFixed(2)})`,
    data: { type: "ride_request", ...rideDetails },
    sound: "default",
    channelId: "ride-requests",
  };
}

/**
 * Notify passenger of ride status change
 */
export function buildRideStatusPayload(status: string, driverName?: string): PushPayload {
  const messages: Record<string, { title: string; body: string }> = {
    matched: { title: "Driver Found!", body: `${driverName || "Your driver"} is on the way.` },
    pickup: { title: "Driver Arriving", body: `${driverName || "Your driver"} is almost at your pickup point.` },
    arrived: { title: "Driver Arrived", body: "Your driver is waiting at the pickup point." },
    in_progress: { title: "Ride Started", body: "You're on your way to your destination!" },
    completed: { title: "Ride Complete", body: "You've arrived! Don't forget to rate your ride." },
    cancelled: { title: "Ride Cancelled", body: "Your ride has been cancelled." },
  };

  const msg = messages[status] || { title: "Ride Update", body: `Ride status: ${status}` };
  return { ...msg, data: { type: "ride_status", status }, sound: "default" };
}

/**
 * Payment confirmation notification
 */
export function buildPaymentPayload(amount: number, currency = "USD"): PushPayload {
  return {
    title: "Payment Confirmed",
    body: `$${(amount / 100).toFixed(2)} ${currency} has been charged for your ride.`,
    data: { type: "payment", amount, currency },
  };
}
