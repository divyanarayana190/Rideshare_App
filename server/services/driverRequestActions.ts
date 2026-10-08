import { eq } from "drizzle-orm";
import { passengerRequests } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import {
  addRidePassenger,
  createRide,
  db,
  getRideByRideId,
  getUserById,
  upsertDriverSession,
} from "../db";
import { STEP_TO_DB_STATUS } from "./rideStateMachine";
import { notifyUser } from "./userNotifications";
import { pushRideStatusUpdate } from "./notificationService";

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function acceptPassengerBroadcastRequest(driverId: number, requestId: string) {
  const rows = await db
    .select()
    .from(passengerRequests)
    .where(eq(passengerRequests.requestId, requestId))
    .limit(1);
  const req = rows[0];
  if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
  if (req.status !== "broadcasting") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Request is no longer active" });
  }

  const newRideId = genId("ride");
  await createRide({
    rideId: newRideId,
    driverId,
    mode: "solo",
    status: STEP_TO_DB_STATUS["driver_en_route"],
    rideStep: "driver_en_route",
    pickupLat: req.pickupLat,
    pickupLng: req.pickupLng,
    pickupAddress: req.pickupAddress,
    dropoffLat: req.dropoffLat,
    dropoffLng: req.dropoffLng,
    dropoffAddress: req.dropoffAddress,
    distanceKm: req.distanceKm ?? "0",
    estimatedMinutes: req.estimatedMinutes ?? 0,
    totalFare: req.offerPrice,
    driverAssignedAt: new Date(),
  } as any);

  const createdRide = await getRideByRideId(newRideId);
  if (createdRide) {
    await addRidePassenger({
      rideId: createdRide.id,
      passengerId: req.passengerId,
      pickupLat: req.pickupLat,
      pickupLng: req.pickupLng,
      pickupAddress: req.pickupAddress,
      dropoffLat: req.dropoffLat,
      dropoffLng: req.dropoffLng,
      dropoffAddress: req.dropoffAddress,
      distanceKm: req.distanceKm ?? "0",
      fareShare: req.offerPrice,
      status: "joined",
      isOriginalPassenger: true,
    } as any);
  }

  await db
    .update(passengerRequests)
    .set({ status: "matched", matchedDriverId: driverId, matchedRideId: newRideId })
    .where(eq(passengerRequests.requestId, requestId));

  await upsertDriverSession(driverId, {
    status: "on_ride",
    currentRideId: newRideId,
    lastSeenAt: new Date(),
  });

  pushRideStatusUpdate(newRideId, "driver_en_route", [req.passengerId], { driverId });

  const driverUser = await getUserById(driverId);
  const driverName = driverUser?.name ?? "Your driver";
  const pickupShort = (req.pickupAddress || "").split(",")[0] || "pickup";
  await notifyUser({
    userId: req.passengerId,
    recipientRole: "passenger",
    type: "driver_assigned",
    title: `${driverName} accepted your request!`,
    body: `Your driver is heading to ${pickupShort}.`,
    data: { rideId: newRideId, requestId, driverId },
    deepLink: "/active-ride",
  });

  const { notificationBus } = await import("./notificationService");
  notificationBus.pushToUser(req.passengerId, {
    type: "passenger_request_matched",
    requestId,
    rideId: newRideId,
    driverId,
  });

  return { success: true, rideId: newRideId, passengerId: req.passengerId };
}
