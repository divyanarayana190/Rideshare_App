import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { passengerRequests, rideRequests, rides, ridePassengers } from "../../drizzle/schema";
import type { DriverRequestCard, DriverRequestActionResult } from "../../shared/driver/requestTypes";
import type { DriverStatRange } from "../../shared/driver/constants";
import { rangeToSince } from "./driverStatsService";
import { db } from "../db";
import {
  atomicTransitionRideStep,
  getDriverSession,
  getRideByRideId,
  getRidePassengers,
  getUserById,
  getUserProfileByUserId,
  updateRideRequest,
  upsertDriverSession,
} from "../db";
import {
  buildDriverFeedRequest,
  getPassengerMetaMap,
  haversineKm,
  inferRideType,
  isScheduledPickup,
  isValidFeedRequest,
} from "./driverRequestFeed";
import { acceptPassengerBroadcastRequest } from "./driverRequestActions";
import { dispatchQueue } from "./driverMatcher";
import { getTimestampsForStep, STEP_TO_DB_STATUS } from "./rideStateMachine";
import { notifyUser } from "./userNotifications";
import { pushRideStatusUpdate } from "./notificationService";
import { ENV } from "../_core/env";
import { getConnectedAccount } from "./stripeService";

const KM_TO_MILES = 0.621371;

function toDriverRequestCard(
  feed: ReturnType<typeof buildDriverFeedRequest>,
  requestType: DriverRequestCard["requestType"],
): DriverRequestCard {
  const rideType =
    feed.rideType === "group"
      ? "group"
      : feed.rideType === "shared"
        ? "shared"
        : feed.isImmediate
          ? "instant"
          : "scheduled";

  return {
    id: feed.requestId,
    requestType,
    rideId: feed.rideId ?? (requestType === "dispatch" ? feed.requestId : null),
    passengerId: Number(feed.passengerId) || 0,
    passengerName: feed.passengerName?.trim() || "Passenger",
    passengerRating: feed.passengerRating ?? 0,
    passengerPhotoUrl: feed.passengerPhoto ?? null,
    pickupAddress: feed.pickupLabel,
    dropoffAddress: feed.dropoffLabel,
    pickupLat: feed.pickupLat,
    pickupLng: feed.pickupLng,
    dropoffLat: feed.dropoffLat,
    dropoffLng: feed.dropoffLng,
    scheduledAt: feed.scheduledAt ?? null,
    requestedAt: feed.createdAt,
    fareCents: Math.round(feed.offeredFare * 100),
    distanceMiles: Math.round(feed.tripDistanceKm * KM_TO_MILES * 10) / 10,
    durationMinutes: feed.estimatedTripMinutes,
    pickupDistanceMiles: Math.round(feed.distanceToPickupKm * KM_TO_MILES * 10) / 10,
    matchScore: feed.matchScore,
    passengerCount: feed.passengerCount,
    rideType,
    status: feed.status as DriverRequestCard["status"],
    notes: null,
    safetyPreferences: feed.genderPreference ?? null,
    isScheduled: !feed.isImmediate,
    isSharedRide: feed.rideType === "shared" || feed.rideType === "group",
    expiresAt: feed.expiresAt,
    matchLabel: feed.matchLabel,
  };
}

export async function fetchUnifiedDriverRequests(
  driverId: number,
  opts: {
    status?: "pending" | "accepted" | "rejected" | "expired" | "all";
    range?: DriverStatRange;
  } = {},
): Promise<DriverRequestCard[]> {
  const status = opts.status ?? "pending";
  const since = opts.range ? rangeToSince(opts.range) : null;

  if (status === "pending" || status === "all") {
    const session = await getDriverSession(driverId);
    if (!session || session.status !== "online" || !session.currentLat || !session.currentLng) {
      if (status === "pending") return [];
    } else {
      const driverLat = Number(session.currentLat);
      const driverLng = Number(session.currentLng);
      const radiusKm = 50;
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.cos((driverLat * Math.PI) / 180));

      const broadcastRows = await db
        .select()
        .from(passengerRequests)
        .where(
          and(
            eq(passengerRequests.status, "broadcasting"),
            sql`${passengerRequests.expiresAt} > NOW()`,
            sql`${passengerRequests.pickupLat} BETWEEN ${driverLat - latDelta} AND ${driverLat + latDelta}`,
            sql`${passengerRequests.pickupLng} BETWEEN ${driverLng - lngDelta} AND ${driverLng + lngDelta}`,
          ),
        )
        .orderBy(desc(passengerRequests.createdAt))
        .limit(20);

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const dispatchRideRows = await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.rideStep, "finding_driver"),
            eq(rides.status, "searching"),
            isNull(rides.driverId),
            sql`${rides.pickupLat} BETWEEN ${driverLat - latDelta} AND ${driverLat + latDelta}`,
            sql`${rides.pickupLng} BETWEEN ${driverLng - lngDelta} AND ${driverLng + lngDelta}`,
            or(
              sql`${rides.departureTime} > NOW()`,
              and(sql`${rides.departureTime} IS NULL`, sql`${rides.createdAt} >= ${fifteenMinAgo}`),
            ),
          ),
        )
        .orderBy(desc(rides.createdAt))
        .limit(20);

      const dispatchRideNumericIds = dispatchRideRows.map((r) => r.id);
      const dispatchPaxRows =
        dispatchRideNumericIds.length > 0
          ? await db
              .select({ rideId: ridePassengers.rideId, passengerId: ridePassengers.passengerId })
              .from(ridePassengers)
              .where(inArray(ridePassengers.rideId, dispatchRideNumericIds))
          : [];

      const dispatchPaxByRide = new Map<number, number>();
      for (const p of dispatchPaxRows) {
        if (!dispatchPaxByRide.has(p.rideId)) dispatchPaxByRide.set(p.rideId, p.passengerId);
      }

      const filteredBroadcast = broadcastRows.filter(
        (r) =>
          r.passengerId !== driverId &&
          haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) <= radiusKm,
      );
      const filteredDispatch = dispatchRideRows.filter((r) => {
        if (haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) > radiusKm) return false;
        const paxId = dispatchPaxByRide.get(r.id);
        if (!paxId || paxId === driverId) return false;
        return Number(r.totalFare ?? 0) > 0;
      });

      const allPassengerIds = [
        ...new Set([
          ...filteredBroadcast.map((r) => r.passengerId),
          ...filteredDispatch.map((r) => dispatchPaxByRide.get(r.id)).filter((id): id is number => id != null),
        ]),
      ];
      const passengerMetaMap = await getPassengerMetaMap(allPassengerIds);

      const broadcastCards = filteredBroadcast
        .map((r) => {
          const distToPickup =
            Math.round(haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) * 10) / 10;
          const feed = buildDriverFeedRequest({
            requestId: r.requestId,
            passengerId: r.passengerId,
            meta: passengerMetaMap.get(r.passengerId),
            pickupLabel: r.pickupAddress,
            dropoffLabel: r.dropoffAddress,
            pickupLat: Number(r.pickupLat),
            pickupLng: Number(r.pickupLng),
            dropoffLat: Number(r.dropoffLat),
            dropoffLng: Number(r.dropoffLng),
            passengerCount: r.passengerCount,
            tripDistanceKm: r.distanceKm != null ? Number(r.distanceKm) : 0,
            estimatedTripMinutes: r.estimatedMinutes ?? 0,
            offeredFare: Number(r.offerPrice),
            distanceToPickupKm: distToPickup,
            scheduledAt: null,
            isImmediate: true,
            rideType: inferRideType(null, r.passengerCount),
            status: r.status,
            createdAt: r.createdAt,
            expiresAt: r.expiresAt,
            source: "broadcast",
          });
          return isValidFeedRequest(feed) ? toDriverRequestCard(feed, "broadcast") : null;
        })
        .filter((c): c is DriverRequestCard => c != null);

      const dispatchCards = filteredDispatch
        .map((r) => {
          const passengerId = dispatchPaxByRide.get(r.id) ?? 0;
          const distToPickup =
            Math.round(haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) * 10) / 10;
          const expiresAt = r.departureTime
            ? new Date(r.departureTime)
            : new Date(new Date(r.createdAt).getTime() + 15 * 60 * 1000);
          const scheduled = isScheduledPickup(r.departureTime, r.createdAt);
          const feed = buildDriverFeedRequest({
            requestId: r.rideId,
            rideId: r.rideId,
            passengerId,
            meta: passengerId ? passengerMetaMap.get(passengerId) : undefined,
            pickupLabel: r.pickupAddress,
            dropoffLabel: r.dropoffAddress,
            pickupLat: Number(r.pickupLat),
            pickupLng: Number(r.pickupLng),
            dropoffLat: Number(r.dropoffLat),
            dropoffLng: Number(r.dropoffLng),
            passengerCount: r.totalSeats ?? 1,
            tripDistanceKm: Number(r.distanceKm),
            estimatedTripMinutes: r.estimatedMinutes,
            offeredFare: Number(r.totalFare),
            distanceToPickupKm: distToPickup,
            scheduledAt: r.departureTime,
            isImmediate: !scheduled,
            rideType: inferRideType(r.mode, r.totalSeats ?? 1),
            rideSafetyMode: r.safetyMode,
            paymentType: r.stripePaymentIntentId ? "card" : undefined,
            status: r.status,
            createdAt: r.createdAt,
            expiresAt,
            source: "dispatch",
          });
          const type: DriverRequestCard["requestType"] = scheduled ? "scheduled" : "dispatch";
          return isValidFeedRequest(feed) ? toDriverRequestCard(feed, type) : null;
        })
        .filter((c): c is DriverRequestCard => c != null);

      const seen = new Set<string>();
      const pendingCards = [...dispatchCards, ...broadcastCards].filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      if (status === "pending") return pendingCards;
    }
  }

  const history: DriverRequestCard[] = [];

  const rideReqConditions = [eq(rideRequests.driverId, driverId)];
  if (since) rideReqConditions.push(sql`${rideRequests.createdAt} >= ${since}`);
  if (status === "accepted") rideReqConditions.push(eq(rideRequests.status, "accepted"));
  else if (status === "rejected") rideReqConditions.push(eq(rideRequests.status, "declined"));
  else if (status === "expired") rideReqConditions.push(eq(rideRequests.status, "expired"));

  const rideReqRows = await db
    .select()
    .from(rideRequests)
    .where(and(...rideReqConditions))
    .orderBy(desc(rideRequests.createdAt))
    .limit(50);

  for (const rr of rideReqRows) {
    const ride = await getRideByRideId(rr.rideId);
    if (!ride) continue;
    const passengers = await getRidePassengers(ride.id);
    const pax = passengers[0];
    const user = pax ? await getUserById(pax.passengerId) : null;
    history.push({
      id: rr.requestId,
      requestType: ride.departureTime ? "scheduled" : "dispatch",
      rideId: rr.rideId,
      passengerId: pax?.passengerId ?? 0,
      passengerName: user?.name ?? "Passenger",
      passengerRating: 0,
      passengerPhotoUrl: null,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      pickupLat: Number(ride.pickupLat),
      pickupLng: Number(ride.pickupLng),
      dropoffLat: Number(ride.dropoffLat),
      dropoffLng: Number(ride.dropoffLng),
      scheduledAt: ride.departureTime?.toISOString() ?? null,
      requestedAt: rr.createdAt.toISOString(),
      fareCents: Math.round(Number(rr.offeredFare) * 100),
      distanceMiles: Math.round(Number(ride.distanceKm) * KM_TO_MILES * 10) / 10,
      durationMinutes: ride.estimatedMinutes,
      pickupDistanceMiles: 0,
      matchScore: 0,
      passengerCount: passengers.length || 1,
      rideType: ride.mode === "share" ? "shared" : "instant",
      status: rr.status === "declined" ? "rejected" : (rr.status as DriverRequestCard["status"]),
      notes: null,
      safetyPreferences: null,
      isScheduled: !!ride.departureTime,
      isSharedRide: ride.mode === "share",
      expiresAt: rr.expiresAt?.toISOString() ?? null,
      matchLabel: "Medium Match",
    });
  }

  if (status === "accepted" || status === "all") {
    const matched = await db
      .select()
      .from(passengerRequests)
      .where(
        and(
          eq(passengerRequests.matchedDriverId, driverId),
          eq(passengerRequests.status, "matched"),
          since ? sql`${passengerRequests.createdAt} >= ${since}` : sql`1=1`,
        ),
      )
      .orderBy(desc(passengerRequests.createdAt))
      .limit(30);

    for (const r of matched) {
      const user = await getUserById(r.passengerId);
      history.push({
        id: r.requestId,
        requestType: "broadcast",
        rideId: r.matchedRideId,
        passengerId: r.passengerId,
        passengerName: user?.name ?? "Passenger",
        passengerRating: 0,
        passengerPhotoUrl: null,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        pickupLat: Number(r.pickupLat),
        pickupLng: Number(r.pickupLng),
        dropoffLat: Number(r.dropoffLat),
        dropoffLng: Number(r.dropoffLng),
        scheduledAt: null,
        requestedAt: r.createdAt.toISOString(),
        fareCents: Math.round(Number(r.offerPrice) * 100),
        distanceMiles: Math.round(Number(r.distanceKm ?? 0) * KM_TO_MILES * 10) / 10,
        durationMinutes: r.estimatedMinutes ?? 0,
        pickupDistanceMiles: 0,
        matchScore: 0,
        passengerCount: r.passengerCount,
        rideType: "instant",
        status: "accepted",
        notes: null,
        safetyPreferences: null,
        isScheduled: false,
        isSharedRide: false,
        expiresAt: null,
        matchLabel: "High Match",
      });
    }
  }

  return history;
}

export async function acceptDispatchRideRequest(driverId: number, rideId: string) {
  if (ENV.isProduction && ENV.stripeSecretKey) {
    const driverConnectAcct = await getConnectedAccount(driverId);
    if (!driverConnectAcct?.chargesEnabled) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Complete Stripe payout setup before accepting rides.",
      });
    }
  }

  dispatchQueue.acceptRide(driverId);
  const existing = await getRideByRideId(rideId);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

  const existingPassengers = await getRidePassengers(existing.id);
  if (existingPassengers.some((p) => p.passengerId === driverId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot accept your own ride request." });
  }

  const timestamps = getTimestampsForStep("driver_en_route");
  const claim = await atomicTransitionRideStep({
    rideId,
    fromSteps: ["finding_driver"],
    toStep: "driver_en_route",
    toDbStatus: STEP_TO_DB_STATUS["driver_en_route"],
    extraSet: { driverId, driverAssignedAt: new Date(), ...timestamps },
  });
  if (!claim.updated || !claim.ride) {
    throw new TRPCError({ code: "BAD_REQUEST", message: claim.reason ?? "Ride is no longer available." });
  }

  const ride = claim.ride;
  await upsertDriverSession(driverId, { status: "on_ride", currentRideId: rideId, lastSeenAt: new Date() });
  await updateRideRequest(rideId, driverId, "accepted");

  const passengers = await getRidePassengers(ride.id);
  const driverUser = await getUserById(driverId);
  const driverProfile = await getUserProfileByUserId(driverId);
  const driverName = driverUser?.name ?? "Your driver";
  const vehicleInfo = driverProfile?.vehicleType
    ? `${driverProfile.vehicleColor ?? ""} ${driverProfile.vehicleType}`.trim()
    : "vehicle";
  const pickupShort = (ride.pickupAddress || "").split(",")[0] || "Pickup";

  for (const p of passengers) {
    await notifyUser({
      userId: p.passengerId,
      recipientRole: "passenger",
      type: "driver_assigned",
      title: `${driverName} is on the way!`,
      body: `Your driver is heading to ${pickupShort} in a ${vehicleInfo}.`,
      data: { rideId, driverId },
      deepLink: "/active-ride",
    });
  }

  pushRideStatusUpdate(rideId, "driver_en_route", passengers.map((p) => p.passengerId), { driverId });

  return { success: true, rideId, passengerId: passengers[0]?.passengerId };
}

export async function acceptDriverRequestUnified(
  driverId: number,
  requestId: string,
  requestType: "dispatch" | "broadcast" | "scheduled" | "carpool_join",
): Promise<DriverRequestActionResult> {
  if (requestType === "broadcast") {
    const result = await acceptPassengerBroadcastRequest(driverId, requestId);
    return {
      success: true,
      rideId: result.rideId,
      requestId,
      status: "accepted",
      message: "Ride accepted — head to pickup",
    };
  }

  const rideId = requestType === "dispatch" || requestType === "scheduled" ? requestId : requestId;
  const result = await acceptDispatchRideRequest(driverId, rideId);
  return {
    success: true,
    rideId: result.rideId,
    requestId,
    status: "accepted",
    message: "Ride accepted — head to pickup",
  };
}

export async function rejectDriverRequestUnified(
  driverId: number,
  requestId: string,
  requestType: "dispatch" | "broadcast" | "scheduled" | "carpool_join",
  reason?: string,
): Promise<DriverRequestActionResult> {
  if (requestType === "broadcast") {
    await db
      .update(passengerRequests)
      .set({ driversViewed: sql`${passengerRequests.driversViewed} + 1` })
      .where(
        and(eq(passengerRequests.requestId, requestId), eq(passengerRequests.status, "broadcasting")),
      );
    return {
      success: true,
      rideId: null,
      requestId,
      status: "rejected",
      message: reason ?? "Request declined",
    };
  }

  dispatchQueue.declineRide(driverId);
  await updateRideRequest(requestId, driverId, "declined");
  return {
    success: true,
    rideId: requestId,
    requestId,
    status: "rejected",
    message: reason ?? "Request declined",
  };
}
