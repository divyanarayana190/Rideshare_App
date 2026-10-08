/**
 * Single source of truth for driver mode access.
 * Access is granted ONLY when driverApplications.status === "approved" and user is not banned.
 * The userProfiles.isDriver boolean is a sync flag only — it NEVER grants access on its own.
 */
import { desc, eq } from "drizzle-orm";
import { driverApplications } from "../../drizzle/schema";
import type { DriverAccessStatus, DriverStatus } from "../../shared/driverAccess";
import { db, getUserProfileByUserId, updateUserProfile } from "../db";
import logger from "../logger";

export type { DriverAccessStatus, DriverStatus };

type AppStatus = "draft" | "pending" | "under_review" | "action_required" | "approved" | "rejected" | null;

export function computeDriverAccessStatus(input: {
  profileIsDriver: boolean;
  isBanned: boolean;
  banReason?: string | null;
  appStatus?: AppStatus;
  applicationId?: string | null;
  rejectionReason?: string | null;
  actionRequiredReason?: string | null;
}): DriverAccessStatus {
  const { isBanned, banReason, appStatus, applicationId, rejectionReason, actionRequiredReason } = input;

  // Suspension overrides everything — check first
  if (isBanned) {
    return {
      canAccessDriverMode: false,
      isDriver: false,
      driverStatus: "suspended",
      missingRequirements: ["Account suspended"],
      banReason: banReason ?? null,
      applicationId: applicationId ?? null,
    };
  }

  // The only path to driver mode: application explicitly approved
  if (appStatus === "approved") {
    return {
      canAccessDriverMode: true,
      isDriver: true,
      driverStatus: "approved",
      applicationId: applicationId ?? null,
    };
  }

  if (appStatus === "action_required") {
    return {
      canAccessDriverMode: false,
      isDriver: false,
      driverStatus: "action_required",
      actionRequiredReason: actionRequiredReason ?? null,
      applicationId: applicationId ?? null,
    };
  }

  if (appStatus === "under_review" || appStatus === "pending") {
    return {
      canAccessDriverMode: false,
      isDriver: false,
      driverStatus: "under_review",
      applicationId: applicationId ?? null,
    };
  }

  if (appStatus === "draft") {
    return {
      canAccessDriverMode: false,
      isDriver: false,
      driverStatus: "draft",
      applicationId: applicationId ?? null,
    };
  }

  if (appStatus === "rejected") {
    return {
      canAccessDriverMode: false,
      isDriver: false,
      driverStatus: "rejected",
      rejectionReason: rejectionReason ?? null,
      applicationId: applicationId ?? null,
    };
  }

  return {
    canAccessDriverMode: false,
    isDriver: false,
    driverStatus: "not_applied",
    applicationId: null,
  };
}

export async function getDriverAccessStatus(userId: number): Promise<DriverAccessStatus> {
  const profile = await getUserProfileByUserId(userId);

  const apps = await db
    .select({
      applicationId: driverApplications.applicationId,
      status: driverApplications.status,
      rejectionReason: driverApplications.rejectionReason,
      actionRequiredReason: driverApplications.actionRequiredReason,
    })
    .from(driverApplications)
    .where(eq(driverApplications.userId, userId))
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  const latestApp = apps[0];
  const access = computeDriverAccessStatus({
    profileIsDriver: profile?.isDriver === true,
    isBanned: profile?.isBanned === true,
    banReason: profile?.banReason ?? null,
    appStatus: (latestApp?.status ?? null) as AppStatus,
    applicationId: latestApp?.applicationId ?? null,
    rejectionReason: latestApp?.rejectionReason ?? null,
    actionRequiredReason: latestApp?.actionRequiredReason ?? null,
  });

  // Keep the isDriver sync flag up-to-date when approved
  if (access.canAccessDriverMode && latestApp?.status === "approved" && !profile?.isDriver) {
    try {
      await updateUserProfile(userId, { isDriver: true });
    } catch (err) {
      logger.warn({ err, userId }, "[driverAccess] Failed to sync isDriver flag");
    }
  }

  // Clear the isDriver flag if no longer approved (e.g. suspended after approval)
  if (!access.canAccessDriverMode && profile?.isDriver === true && latestApp?.status !== "approved") {
    try {
      await updateUserProfile(userId, { isDriver: false });
    } catch (err) {
      logger.warn({ err, userId }, "[driverAccess] Failed to clear isDriver flag");
    }
  }

  return access;
}

/** Throws TRPC-compatible message when caller cannot use driver features. */
export function driverAccessDeniedMessage(access: DriverAccessStatus): string {
  switch (access.driverStatus) {
    case "under_review":
    case "pending":
      return "Your driver application is under review. You'll be notified once approved.";
    case "draft":
      return "Complete and submit your driver application to access Driver Mode.";
    case "action_required":
      return `Your application needs updates. ${access.actionRequiredReason ?? "Check your application for details."}`;
    case "rejected":
      return `Driver access is not active. ${access.rejectionReason ?? "Please contact support or reapply."}`;
    case "suspended":
      return `Driver access is suspended. ${access.banReason ?? "Please contact support."}`;
    default:
      return "Complete driver onboarding to access Driver Mode.";
  }
}
