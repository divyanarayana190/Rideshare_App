export type PosterRole = "driver" | "passenger_organizer";
export type DriverAppStatus =
  | "draft"
  | "pending"
  | "under_review"
  | "action_required"
  | "approved"
  | "rejected"
  | null
  | undefined;

/**
 * Returns whether the requested posterRole is valid given the user's driver
 * application status.  The only path to posterRole="driver" is an approved
 * driver application.  Passengers can always post as "passenger_organizer".
 */
export function validatePosterRole(
  posterRole: PosterRole,
  driverAppStatus: DriverAppStatus,
): { valid: true } | { valid: false; reason: string } {
  if (posterRole !== "driver") return { valid: true };
  if (driverAppStatus === "approved") return { valid: true };
  return {
    valid: false,
    reason: "Only approved drivers can post a ride as driver",
  };
}

/**
 * Returns true if a scheduled departure time is strictly in the past.
 * A null/undefined departureTime is treated as "not set" → not departed.
 */
export function isDeparturePassed(departureTime: Date | null | undefined): boolean {
  if (!departureTime) return false;
  return departureTime.getTime() < Date.now();
}
