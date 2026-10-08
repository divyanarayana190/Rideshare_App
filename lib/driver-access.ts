export type {
  DriverAccessStatus,
  DriverStatus,
} from "@/shared/driverAccess";
export { canAccessDriverMode } from "@/shared/driverAccess";

import type { DriverAccessStatus } from "@/shared/driverAccess";

/** Client-side helper — mirrors server `getDriverAccessStatus`. */
export function resolveDriverAccess(
  access: DriverAccessStatus | null | undefined,
) {
  const driverStatus = access?.driverStatus ?? "not_applied";
  return {
    access,
    canAccessDriverMode: access?.canAccessDriverMode === true,
    isDriver: access?.isDriver === true,
    driverStatus,
    isApproved: driverStatus === "approved",
    // Backend maps both "pending" and "under_review" app statuses to "under_review"
    isPending: driverStatus === "pending" || driverStatus === "under_review",
    isActionRequired: driverStatus === "action_required",
    isRejected: driverStatus === "rejected",
    isSuspended: driverStatus === "suspended",
    isNotStarted: driverStatus === "not_applied",
    isError: access?.isError === true,
    rejectionReason: access?.rejectionReason ?? null,
    actionRequiredReason: access?.actionRequiredReason ?? null,
    banReason: access?.banReason ?? null,
  };
}

/** Route to open when user taps Driver Mode without full access. */
export function driverAccessFallbackRoute(
  access: DriverAccessStatus | null | undefined,
): "/driver-onboarding" | "/driver-application-status" | "/(tabs)/profile" {
  const status = access?.driverStatus ?? "not_applied";
  if (status === "pending") return "/driver-application-status";
  if (status === "rejected" || status === "suspended") return "/driver-application-status";
  return "/driver-onboarding";
}
