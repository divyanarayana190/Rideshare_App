/** Shared driver access types — used by server and client. */

export type DriverStatus =
  | "not_applied"
  | "draft"
  | "pending"
  | "under_review"
  | "action_required"
  | "approved"
  | "rejected"
  | "suspended";

export interface DriverAccessStatus {
  canAccessDriverMode: boolean;
  isDriver: boolean;
  driverStatus: DriverStatus;
  missingRequirements?: string[];
  rejectionReason?: string | null;
  actionRequiredReason?: string | null;
  banReason?: string | null;
  applicationId?: string | null;
  /** Set to true when the status could not be determined due to a server error. */
  isError?: boolean;
}

export function canAccessDriverMode(
  access: DriverAccessStatus | null | undefined,
): boolean {
  return access?.canAccessDriverMode === true;
}
