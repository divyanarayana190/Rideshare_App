import { TRPCError } from "@trpc/server";
import { getRidePassengers } from "../db";

type RideRef = { id: number; driverId: number | null };

/** Pure membership check — driver or listed passenger. */
export function isRideParticipantFromLists(
  ride: RideRef,
  userId: number,
  passengerIds: number[],
): boolean {
  if (ride.driverId != null && ride.driverId === userId) return true;
  return passengerIds.includes(userId);
}

export async function isRideParticipant(ride: RideRef, userId: number): Promise<boolean> {
  const passengers = await getRidePassengers(ride.id);
  const passengerIds = passengers.map((p) => p.passengerId);
  return isRideParticipantFromLists(ride, userId, passengerIds);
}

export async function assertRideParticipant(ride: RideRef, userId: number): Promise<void> {
  if (!(await isRideParticipant(ride, userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant in this ride" });
  }
}

/** Canonical ride access gate — driver, passenger, or admin. */
export async function assertCanAccessRide(
  ride: RideRef,
  userId: number,
  userRole?: string,
): Promise<void> {
  if (userRole === "admin") return;
  await assertRideParticipant(ride, userId);
}
