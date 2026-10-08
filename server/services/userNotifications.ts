/**
 * Persist + deliver in-app / push / SSE notifications with audience separation.
 */
import crypto from "crypto";
import { createNotification, getUserPushTokens } from "../db";
import { sendNotification, type NotificationType } from "./notificationService";

export type RecipientRole = "passenger" | "driver";

function genNotificationId(): string {
  return `notif_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export interface NotifyUserInput {
  userId: number;
  recipientRole: RecipientRole;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  deepLink?: string;
  pushToken?: string | null;
}

/** Persist to DB and fan-out via SSE + Expo push. */
export async function notifyUser(input: NotifyUserInput): Promise<string> {
  const notificationId = genNotificationId();
  const data = { ...input.data, recipientRole: input.recipientRole };

  await createNotification({
    notificationId,
    userId: input.userId,
    recipientRole: input.recipientRole,
    type: input.type,
    title: input.title,
    body: input.body,
    data,
    deepLink: input.deepLink ?? null,
  });

  let pushToken = input.pushToken;
  if (pushToken === undefined) {
    try {
      const tokens = await getUserPushTokens(input.userId);
      pushToken = tokens[0]?.token ?? null;
    } catch {
      pushToken = null;
    }
  }

  await sendNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data,
    deepLink: input.deepLink,
    pushToken,
  });

  return notificationId;
}

/** Driver: new pickup request nearby */
export async function notifyDriverPickupRequest(
  driverId: number,
  ctx: {
    requestId?: string;
    rideId?: string;
    pickupAddress: string;
    dropoffAddress: string;
    offerPrice: number;
    passengerCount?: number;
  },
  pushToken?: string | null,
): Promise<void> {
  const pickupShort = ctx.pickupAddress.split(",")[0]?.trim() || ctx.pickupAddress;
  const dropoffShort = ctx.dropoffAddress.split(",")[0]?.trim() || ctx.dropoffAddress;
  const deepLink = ctx.requestId
    ? `/driver/(tabs)/requests`
    : `/driver/(tabs)/requests`;

  await notifyUser({
    userId: driverId,
    recipientRole: "driver",
    type: "ride_request",
    title: "New pickup nearby",
    body: `A passenger near ${pickupShort} needs a ride to ${dropoffShort}. $${ctx.offerPrice.toFixed(2)} offered.`,
    data: {
      requestId: ctx.requestId,
      rideId: ctx.rideId,
      notificationType: "driver_pickup_nearby",
    },
    deepLink,
    pushToken,
  });
}

/** Driver: passenger cancelled assigned ride */
export async function notifyDriverRideCancelled(
  driverId: number,
  ctx: { rideId: string; pickupAddress: string; dropoffAddress: string; reason?: string },
): Promise<void> {
  const pickupShort = ctx.pickupAddress.split(",")[0]?.trim() || "pickup";
  const dropoffShort = ctx.dropoffAddress.split(",")[0]?.trim() || "destination";
  await notifyUser({
    userId: driverId,
    recipientRole: "driver",
    type: "ride_cancelled",
    title: "Passenger cancelled",
    body: ctx.reason ?? `The rider cancelled their trip to ${dropoffShort}.`,
    data: { rideId: ctx.rideId, pickupAddress: ctx.pickupAddress, notificationType: "passenger_cancelled" },
    deepLink: "/driver/(tabs)/rides",
  });
}

/** Driver: scheduled ride reminder */
export async function notifyDriverRideReminder(
  driverId: number,
  ctx: { rideId: string; pickupAddress: string; departureTime: Date; minutesAway: number },
): Promise<void> {
  const timeLabel = ctx.departureTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const pickupShort = ctx.pickupAddress.split(",")[0]?.trim() || ctx.pickupAddress;
  await notifyUser({
    userId: driverId,
    recipientRole: "driver",
    type: "system",
    title: `Ride starts in ${ctx.minutesAway} minutes`,
    body: `Your scheduled pickup at ${pickupShort} is at ${timeLabel}.`,
    data: { rideId: ctx.rideId, notificationType: "ride_starts_soon" },
    deepLink: `/driver/ride-detail?rideId=${ctx.rideId}`,
  });
}
