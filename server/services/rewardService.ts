/**
 * Reward Service — Points management for ride sharing rewards
 *
 * Points are awarded for shared ride behaviors:
 * - Mid-ride join approved: Joiner +10, Original passengers +5, Driver +5
 * - Shared ride completed: Joiner +5, Driver +3
 * - First shared ride ever: +20 bonus
 */

import {
  getOrCreateRewardPointsDb,
  updateRewardPointsDb,
  addPointsLedgerEntryDb,
  getPointsLedgerDb,
} from "../db";

// ─── Constants ──────────────────────────────────────────────────────────────

export const POINTS = {
  MID_RIDE_JOIN_JOINER: 10,
  MID_RIDE_JOIN_ORIGINAL_PASSENGER: 5,
  MID_RIDE_JOIN_DRIVER: 5,
  SHARED_RIDE_COMPLETED_PASSENGER: 5,
  SHARED_RIDE_COMPLETED_DRIVER: 3,
  FIRST_SHARED_RIDE_BONUS: 20,
} as const;

export type PointsReason =
  | "mid_ride_join"
  | "shared_ride_bonus"
  | "original_passenger_bonus"
  | "driver_bonus"
  | "first_shared_ride"
  | "referral_bonus"
  | "redeemed";

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Get or create reward points record for a user.
 */
export async function getOrCreateRewardPoints(userId: number) {
  return getOrCreateRewardPointsDb(userId);
}

/**
 * Award points to a user and log the transaction.
 */
export async function awardPoints(
  userId: number,
  amount: number,
  reason: PointsReason,
  rideId?: number,
): Promise<void> {
  await getOrCreateRewardPointsDb(userId);
  await updateRewardPointsDb(userId, amount);
  await addPointsLedgerEntryDb({
    userId,
    amount,
    reason,
    relatedRideId: rideId ?? null,
  });
}

/**
 * Redeem points from a user's balance.
 * Returns false if insufficient points.
 */
export async function redeemPoints(
  userId: number,
  amount: number,
): Promise<boolean> {
  const record = await getOrCreateRewardPointsDb(userId);
  if (record.points < amount) return false;

  await updateRewardPointsDb(userId, -amount);
  await addPointsLedgerEntryDb({
    userId,
    amount: -amount,
    reason: "redeemed",
    relatedRideId: null,
  });

  return true;
}

/**
 * Get paginated points history for a user.
 */
export async function getPointsHistory(
  userId: number,
  limit = 20,
  offset = 0,
) {
  return getPointsLedgerDb(userId, limit, offset);
}

/**
 * Award all points for a mid-ride join approval.
 * - Joiner gets POINTS.MID_RIDE_JOIN_JOINER
 * - Each original passenger gets POINTS.MID_RIDE_JOIN_ORIGINAL_PASSENGER
 * - Driver gets POINTS.MID_RIDE_JOIN_DRIVER
 */
export async function awardMidRideJoinPoints(
  joinerId: number,
  originalPassengerIds: number[],
  driverId: number | null,
  rideId: number,
): Promise<void> {
  // Award joiner
  await awardPoints(joinerId, POINTS.MID_RIDE_JOIN_JOINER, "mid_ride_join", rideId);

  // Award original passengers
  for (const passengerId of originalPassengerIds) {
    await awardPoints(
      passengerId,
      POINTS.MID_RIDE_JOIN_ORIGINAL_PASSENGER,
      "original_passenger_bonus",
      rideId,
    );
  }

  // Award driver (only if assigned)
  if (driverId != null) await awardPoints(driverId, POINTS.MID_RIDE_JOIN_DRIVER, "driver_bonus", rideId);
}

/**
 * Award points for completing a shared ride.
 */
export async function awardSharedRideCompletionPoints(
  passengerIds: number[],
  driverId: number,
  rideId: number,
): Promise<void> {
  for (const passengerId of passengerIds) {
    await awardPoints(
      passengerId,
      POINTS.SHARED_RIDE_COMPLETED_PASSENGER,
      "shared_ride_bonus",
      rideId,
    );
  }

  await awardPoints(
    driverId,
    POINTS.SHARED_RIDE_COMPLETED_DRIVER,
    "driver_bonus",
    rideId,
  );
}
