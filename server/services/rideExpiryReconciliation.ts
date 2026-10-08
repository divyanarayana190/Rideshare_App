import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { Ride } from "../../drizzle/schema";
import { rides } from "../../drizzle/schema";
import { db, getRideByRideId, getRidePassengers, getUserRides } from "../db";
import logger from "../logger";
import { notificationBus, pushRideStatusUpdate } from "./notificationService";
import { notifyUser } from "./userNotifications";

export const DRIVER_NO_SHOW_GRACE_MIN = 15;
export const ON_DEMAND_SEARCH_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type MissedReason = "NO_DRIVER_FOUND" | "DRIVER_NO_SHOW";

const TERMINAL_STATUSES = ["completed", "cancelled", "missed"] as const;

/** Pure check — does this ride qualify for expiry reconciliation right now? */
export function getExpiredMissedReason(ride: Ride, now = new Date()): MissedReason | null {
  if (TERMINAL_STATUSES.includes(ride.status as (typeof TERMINAL_STATUSES)[number])) {
    return null;
  }

  if (ride.rideStep === "finding_driver" && ride.status === "searching") {
    if (ride.departureTime) {
      return new Date(ride.departureTime) < now ? "NO_DRIVER_FOUND" : null;
    }
    const ageMs = now.getTime() - new Date(ride.createdAt).getTime();
    return ageMs > ON_DEMAND_SEARCH_TIMEOUT_MS ? "NO_DRIVER_FOUND" : null;
  }

  const noShowSteps = ["driver_assigned", "driver_en_route", "driver_arrived"] as const;
  const noShowStatuses = ["matched", "driver_arrived"] as const;
  if (
    ride.startedAt == null &&
    ride.departureTime &&
    noShowSteps.includes(ride.rideStep as (typeof noShowSteps)[number]) &&
    noShowStatuses.includes(ride.status as (typeof noShowStatuses)[number])
  ) {
    const graceCutoff = new Date(now.getTime() - DRIVER_NO_SHOW_GRACE_MIN * 60_000);
    if (new Date(ride.departureTime) < graceCutoff) {
      return "DRIVER_NO_SHOW";
    }
  }

  return null;
}

async function notifyMissed(
  rideId: string,
  rideDbId: number,
  missedReason: MissedReason,
  driverId: number | null,
) {
  const passengers = await getRidePassengers(rideDbId);
  const passengerIds = passengers.map((p) => p.passengerId);
  pushRideStatusUpdate(rideId, "cancelled", passengerIds, { missedReason, rideId });
  for (const userId of passengerIds) {
    notificationBus.pushToUser(userId, {
      type: "ride_missed",
      title: missedReason === "NO_DRIVER_FOUND" ? "Ride missed — no driver found" : "Ride missed — driver no-show",
      body:
        missedReason === "NO_DRIVER_FOUND"
          ? "Your scheduled ride passed without a driver accepting."
          : "Your driver did not start the ride on time.",
      data: { rideId, missedReason, recipientRole: "passenger" },
    });
    void notifyUser({
      userId,
      recipientRole: "passenger",
      type: "ride_cancelled",
      title: missedReason === "NO_DRIVER_FOUND" ? "Ride missed — no driver found" : "Ride missed — driver no-show",
      body:
        missedReason === "NO_DRIVER_FOUND"
          ? "Your scheduled ride passed without a driver accepting."
          : "Your driver did not start the ride on time.",
      data: { rideId, missedReason, notificationType: "driver_no_show" },
      deepLink: "/(tabs)/rides",
    });
  }
  if (driverId != null) {
    notificationBus.pushToUser(driverId, {
      type: "ride_missed",
      title: missedReason === "DRIVER_NO_SHOW" ? "Driver no-show warning" : "Ride marked as missed",
      body:
        missedReason === "DRIVER_NO_SHOW"
          ? "This ride was marked missed because the trip did not start on time."
          : "This ride expired before it could be completed.",
      data: { rideId, missedReason, recipientRole: "driver" },
    });
    void notifyUser({
      userId: driverId,
      recipientRole: "driver",
      type: "system",
      title: missedReason === "DRIVER_NO_SHOW" ? "Driver no-show warning" : "Ride marked as missed",
      body:
        missedReason === "DRIVER_NO_SHOW"
          ? "This ride was marked missed because the trip did not start on time."
          : "This ride expired before it could be completed.",
      data: { rideId, missedReason, notificationType: "driver_no_show" },
      deepLink: "/driver/(tabs)/rides",
    });
  }
}

/**
 * Atomically mark a single ride missed if it is still in an expirable state.
 * Returns true when a row was updated.
 */
export async function reconcileExpiredRide(ride: Ride, now = new Date()): Promise<boolean> {
  const reason = getExpiredMissedReason(ride, now);
  if (!reason) return false;

  let affectedRows = 0;

  if (reason === "NO_DRIVER_FOUND") {
    const [result] = await db.execute<{ affectedRows: number }>(
      sql`UPDATE rides SET status = 'missed', cancelReason = ${reason}, cancelledAt = ${now}
          WHERE id = ${ride.id}
            AND rideStep = 'finding_driver'
            AND status = 'searching'`,
    );
    affectedRows = result.affectedRows ?? 0;
  } else {
    const graceCutoff = new Date(now.getTime() - DRIVER_NO_SHOW_GRACE_MIN * 60_000);
    const [result] = await db.execute<{ affectedRows: number }>(
      sql`UPDATE rides SET status = 'missed', cancelReason = ${reason}, cancelledAt = ${now}
          WHERE id = ${ride.id}
            AND rideStep IN ('driver_assigned', 'driver_en_route', 'driver_arrived')
            AND status IN ('matched', 'driver_arrived')
            AND startedAt IS NULL
            AND departureTime IS NOT NULL
            AND departureTime < ${graceCutoff}`,
    );
    affectedRows = result.affectedRows ?? 0;
  }

  const updated = affectedRows === 1;
  if (updated) {
    await notifyMissed(ride.rideId, ride.id, reason, ride.driverId);
    logger.info({ rideId: ride.rideId, reason }, "[reconcile] Ride marked missed");
  }
  return updated;
}

/** Reconcile one ride by public rideId — for detail / active-ride endpoints. */
export async function reconcileExpiredRideByRideId(rideId: string): Promise<void> {
  const ride = await getRideByRideId(rideId);
  if (!ride) return;
  await reconcileExpiredRide(ride);
}

/**
 * Reconcile all non-terminal rides linked to a user (driver or passenger).
 * Call before list/detail endpoints so API and UI always agree.
 */
export async function reconcileExpiredRidesForUser(userId: number): Promise<void> {
  const userRides = await getUserRides(userId);
  const candidates = userRides
    .map((u) => u.ride)
    .filter((r) => !TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number]));

  await Promise.all(candidates.map((r) => reconcileExpiredRide(r)));
}

/** Global sweep — used by background cron. */
export async function reconcileAllExpiredRides(): Promise<void> {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - DRIVER_NO_SHOW_GRACE_MIN * 60_000);
  const onDemandCutoff = new Date(now.getTime() - ON_DEMAND_SEARCH_TIMEOUT_MS);

  try {
    const rows = await db
      .select()
      .from(rides)
      .where(
        and(
          notInArray(rides.status, ["completed", "cancelled", "missed"]),
          or(
            and(
              eq(rides.rideStep, "finding_driver"),
              eq(rides.status, "searching"),
              or(
                and(sql`${rides.departureTime} IS NOT NULL`, lt(rides.departureTime, now)),
                and(
                  sql`${rides.departureTime} IS NULL`,
                  lt(rides.createdAt, onDemandCutoff),
                ),
              ),
            ),
            and(
              inArray(rides.rideStep, ["driver_assigned", "driver_en_route", "driver_arrived"]),
              inArray(rides.status, ["matched", "driver_arrived"]),
              sql`${rides.departureTime} IS NOT NULL`,
              lt(rides.departureTime, graceCutoff),
              isNull(rides.startedAt),
            ),
          ),
        ),
      );

    for (const ride of rows) {
      await reconcileExpiredRide(ride, now);
    }
  } catch (err) {
    logger.warn({ err }, "[reconcile] reconcileAllExpiredRides failed");
  }
}
