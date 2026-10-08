/**
 * Driver Application Service — handles the full driver onboarding workflow
 *
 * Lifecycle:
 *  not_applied → draft → under_review → approved | rejected | action_required
 *  action_required → under_review (resubmit)
 *  rejected → draft (reapply)
 */

import crypto from "crypto";
import { db } from "../db";
import {
  driverApplications,
  userProfiles,
  notifications,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, sql, inArray, ne } from "drizzle-orm";

// ============================================================================
// SHARED TYPES
// ============================================================================

type VehicleType = "sedan" | "suv" | "van" | "truck" | "luxury";

interface ApplicationFields {
  fullName: string;
  phoneNumber: string;
  profilePhotoUrl?: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  plateNumber: string;
  vehicleType: VehicleType;
  vehicleRegistrationUrl?: string;
  insurancePolicyNumber: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  insuranceDocUrl?: string;
  bankName?: string;
  accountLast4?: string;
  routingLast4?: string;
  tosAcceptedAt?: Date;
  tosVersion?: string;
  tosAcceptedIp?: string;
  privacyAcceptedAt?: Date;
  driverAgreementAcceptedAt?: Date;
  icAgreementAcceptedAt?: Date;
}

// ============================================================================
// SAVE DRAFT
// ============================================================================

/**
 * Persist an in-progress application as draft without full validation.
 * Creates a new draft or updates an existing draft/action_required application.
 * Cannot overwrite a pending, under_review, or approved application.
 */
export async function saveDriverApplicationDraft(params: {
  userId: number;
  fields: Partial<ApplicationFields>;
}) {
  const { userId, fields } = params;

  // Guard: cannot draft over an active submission
  const existing = await db
    .select()
    .from(driverApplications)
    .where(
      and(
        eq(driverApplications.userId, userId),
        inArray(driverApplications.status, ["pending", "under_review", "approved"]),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("You already have an active driver application. Cannot create a new draft.");
  }

  // Find existing draft or action_required to update
  const draft = await db
    .select()
    .from(driverApplications)
    .where(
      and(
        eq(driverApplications.userId, userId),
        inArray(driverApplications.status, ["draft", "action_required"]),
      ),
    )
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  const safeFields = {
    ...fields,
    vehicleYear: fields.vehicleYear ?? 0,
    fullName: fields.fullName ?? "",
    phoneNumber: fields.phoneNumber ?? "",
    licenseNumber: fields.licenseNumber ?? "",
    licenseState: fields.licenseState ?? "",
    licenseExpiry: fields.licenseExpiry ?? "",
    vehicleMake: fields.vehicleMake ?? "",
    vehicleModel: fields.vehicleModel ?? "",
    vehicleColor: fields.vehicleColor ?? "",
    plateNumber: fields.plateNumber ?? "",
    vehicleType: fields.vehicleType ?? "sedan",
    insurancePolicyNumber: fields.insurancePolicyNumber ?? "",
    insuranceProvider: fields.insuranceProvider ?? "",
    insuranceExpiry: fields.insuranceExpiry ?? "",
  };

  if (draft.length > 0) {
    await db
      .update(driverApplications)
      .set({ ...fields, status: "draft" } as any)
      .where(eq(driverApplications.applicationId, draft[0]!.applicationId));

    return { applicationId: draft[0]!.applicationId, status: "draft" as const };
  }

  const applicationId = crypto.randomUUID();
  await db.insert(driverApplications).values({
    applicationId,
    userId,
    ...safeFields,
    status: "draft",
  } as any);

  return { applicationId, status: "draft" as const };
}

// ============================================================================
// SUBMIT APPLICATION (final)
// ============================================================================

/**
 * Final submission. Validates all required fields, then sets status = under_review.
 * Can submit from: draft, action_required, or rejected (creates new application).
 */
export async function submitDriverApplication(params: {
  userId: number;
} & ApplicationFields) {
  const { userId, ...data } = params;

  // Guard: no active pending/under_review
  const active = await db
    .select()
    .from(driverApplications)
    .where(
      and(
        eq(driverApplications.userId, userId),
        inArray(driverApplications.status, ["pending", "under_review"]),
      ),
    )
    .limit(1);

  if (active.length > 0) {
    throw new Error("You already have an application under review. Please wait for the current review to complete.");
  }

  // Guard: not already approved
  const profile = await db
    .select({ isDriver: userProfiles.isDriver })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (profile.length > 0 && profile[0]!.isDriver) {
    throw new Error("You are already an approved driver.");
  }

  // Validate required agreement fields
  if (!data.tosAcceptedAt) {
    throw new Error("You must accept the Terms of Service to submit your application.");
  }
  if (!data.privacyAcceptedAt) {
    throw new Error("You must accept the Privacy Policy to submit your application.");
  }
  if (!data.driverAgreementAcceptedAt) {
    throw new Error("You must accept the Driver Agreement to submit your application.");
  }
  if (!data.icAgreementAcceptedAt) {
    throw new Error("You must accept the Independent Contractor Agreement to submit your application.");
  }

  // Reuse existing draft/action_required application if present
  const existing = await db
    .select()
    .from(driverApplications)
    .where(
      and(
        eq(driverApplications.userId, userId),
        inArray(driverApplications.status, ["draft", "action_required"]),
      ),
    )
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  const applicationId = existing.length > 0
    ? existing[0]!.applicationId
    : crypto.randomUUID();

  const now = new Date();
  const submissionData = {
    ...data,
    status: "under_review" as const,
    actionRequiredReason: null,
    updatedAt: now,
  };

  if (existing.length > 0) {
    await db
      .update(driverApplications)
      .set(submissionData as any)
      .where(eq(driverApplications.applicationId, applicationId));
  } else {
    await db.insert(driverApplications).values({
      applicationId,
      userId,
      ...submissionData,
    } as any);
  }

  // Notification: submitted
  await db.insert(notifications).values({
    notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
    userId,
    type: "system",
    title: "Application Submitted",
    body: "Your driver application has been submitted for review. Estimated review time: 24–48 hours. We'll notify you once it's processed.",
    data: JSON.stringify({ applicationId, type: "driver_application_submitted" }),
    deepLink: "/driver-application-status",
  });

  return { applicationId, status: "under_review" as const };
}

// ============================================================================
// GET APPLICATION STATUS
// ============================================================================

export async function getApplicationStatus(userId: number) {
  const apps = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.userId, userId))
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  if (apps.length === 0) return null;
  const app = apps[0]!;

  return {
    applicationId: app.applicationId,
    status: app.status,
    fullName: app.fullName,
    vehicleMake: app.vehicleMake,
    vehicleModel: app.vehicleModel,
    vehicleYear: app.vehicleYear,
    vehicleColor: app.vehicleColor,
    plateNumber: app.plateNumber,
    vehicleType: app.vehicleType,
    licenseExpiry: app.licenseExpiry,
    insuranceExpiry: app.insuranceExpiry,
    vehicleRegistrationUrl: app.vehicleRegistrationUrl,
    rejectionReason: app.rejectionReason,
    actionRequiredReason: app.actionRequiredReason,
    submittedAt: app.createdAt?.toISOString(),
    reviewedAt: app.reviewedAt?.toISOString() ?? null,
    approvedAt: app.approvedAt?.toISOString() ?? null,
    rejectedAt: app.rejectedAt?.toISOString() ?? null,
    actionRequiredAt: app.actionRequiredAt?.toISOString() ?? null,
  };
}

export async function getAllApplications(userId: number) {
  return db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.userId, userId))
    .orderBy(desc(driverApplications.createdAt));
}

// ============================================================================
// ADMIN: LIST APPLICATIONS
// ============================================================================

export async function listPendingApplications(filters?: {
  status?: "draft" | "pending" | "under_review" | "action_required" | "approved" | "rejected" | "all";
  limit?: number;
  offset?: number;
}) {
  const { status = "under_review", limit = 50, offset = 0 } = filters ?? {};

  const whereClause = status === "all" ? undefined : eq(driverApplications.status, status as any);

  const apps = await db
    .select({
      id: driverApplications.id,
      applicationId: driverApplications.applicationId,
      userId: driverApplications.userId,
      fullName: driverApplications.fullName,
      phoneNumber: driverApplications.phoneNumber,
      profilePhotoUrl: driverApplications.profilePhotoUrl,
      licenseNumber: driverApplications.licenseNumber,
      licenseState: driverApplications.licenseState,
      licenseExpiry: driverApplications.licenseExpiry,
      licenseFrontUrl: driverApplications.licenseFrontUrl,
      licenseBackUrl: driverApplications.licenseBackUrl,
      vehicleMake: driverApplications.vehicleMake,
      vehicleModel: driverApplications.vehicleModel,
      vehicleYear: driverApplications.vehicleYear,
      vehicleColor: driverApplications.vehicleColor,
      plateNumber: driverApplications.plateNumber,
      vehicleType: driverApplications.vehicleType,
      vehicleRegistrationUrl: driverApplications.vehicleRegistrationUrl,
      insurancePolicyNumber: driverApplications.insurancePolicyNumber,
      insuranceProvider: driverApplications.insuranceProvider,
      insuranceExpiry: driverApplications.insuranceExpiry,
      insuranceDocUrl: driverApplications.insuranceDocUrl,
      bankName: driverApplications.bankName,
      accountLast4: driverApplications.accountLast4,
      routingLast4: driverApplications.routingLast4,
      status: driverApplications.status,
      rejectionReason: driverApplications.rejectionReason,
      actionRequiredReason: driverApplications.actionRequiredReason,
      tosAcceptedAt: driverApplications.tosAcceptedAt,
      tosVersion: driverApplications.tosVersion,
      createdAt: driverApplications.createdAt,
      reviewedAt: driverApplications.reviewedAt,
      approvedAt: driverApplications.approvedAt,
      rejectedAt: driverApplications.rejectedAt,
      actionRequiredAt: driverApplications.actionRequiredAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(driverApplications)
    .leftJoin(users, eq(driverApplications.userId, users.id))
    .where(whereClause)
    .orderBy(desc(driverApplications.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(driverApplications)
    .where(whereClause);

  return {
    applications: apps,
    total: Number(countResult[0]?.count ?? 0),
    limit,
    offset,
  };
}

// ============================================================================
// ADMIN: APPROVE APPLICATION
// ============================================================================

export async function approveApplication(params: {
  applicationId: string;
  reviewerId: number;
}) {
  const { applicationId, reviewerId } = params;

  const apps = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.applicationId, applicationId))
    .limit(1);

  if (apps.length === 0) throw new Error("Application not found");
  const app = apps[0]!;

  if (app.status === "approved") throw new Error("Application already approved");
  if (app.status === "draft") throw new Error("Cannot approve a draft application");

  const now = new Date();

  await db
    .update(driverApplications)
    .set({
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: now,
      approvedAt: now,
      actionRequiredReason: null,
    } as any)
    .where(eq(driverApplications.applicationId, applicationId));

  // Sync user profile
  const existingProfile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, app.userId))
    .limit(1);

  if (existingProfile.length === 0) {
    await db.insert(userProfiles).values({
      userId: app.userId,
      isDriver: true,
      driverLicense: app.licenseNumber,
      vehicleType: app.vehicleType,
      vehicleColor: app.vehicleColor,
      licensePlate: app.plateNumber,
      profilePhoto: app.profilePhotoUrl,
    } as any);
  } else {
    await db
      .update(userProfiles)
      .set({
        isDriver: true,
        driverLicense: app.licenseNumber,
        vehicleType: app.vehicleType,
        vehicleColor: app.vehicleColor,
        licensePlate: app.plateNumber,
        ...(app.profilePhotoUrl ? { profilePhoto: app.profilePhotoUrl } : {}),
      })
      .where(eq(userProfiles.userId, app.userId));
  }

  await db.insert(notifications).values({
    notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
    userId: app.userId,
    type: "system",
    title: "You're Approved as a Driver!",
    body: "Congratulations! Your driver application has been approved. Toggle Driver Mode in your Profile to start accepting ride requests.",
    data: JSON.stringify({ applicationId, type: "driver_application_approved" }),
    deepLink: "/driver/dashboard",
  });

  return { success: true, status: "approved" as const };
}

// ============================================================================
// ADMIN: REJECT APPLICATION
// ============================================================================

export async function rejectApplication(params: {
  applicationId: string;
  reviewerId: number;
  reason: string;
}) {
  const { applicationId, reviewerId, reason } = params;

  const apps = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.applicationId, applicationId))
    .limit(1);

  if (apps.length === 0) throw new Error("Application not found");
  const app = apps[0]!;

  if (app.status === "approved") throw new Error("Cannot reject an approved application");
  if (app.status === "rejected") throw new Error("Application already rejected");

  const now = new Date();

  await db
    .update(driverApplications)
    .set({
      status: "rejected",
      rejectionReason: reason,
      reviewedBy: reviewerId,
      reviewedAt: now,
      rejectedAt: now,
    } as any)
    .where(eq(driverApplications.applicationId, applicationId));

  await db.insert(notifications).values({
    notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
    userId: app.userId,
    type: "system",
    title: "Driver Application Update",
    body: `Your driver application was not approved. Reason: ${reason}. You may reapply after addressing the issues.`,
    data: JSON.stringify({ applicationId, type: "driver_application_rejected", reason }),
    deepLink: "/driver-application-status",
  });

  return { success: true, status: "rejected" as const };
}

// ============================================================================
// ADMIN: REQUEST CHANGES (ACTION REQUIRED)
// ============================================================================

export async function requestChanges(params: {
  applicationId: string;
  reviewerId: number;
  reason: string;
}) {
  const { applicationId, reviewerId, reason } = params;

  const apps = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.applicationId, applicationId))
    .limit(1);

  if (apps.length === 0) throw new Error("Application not found");
  const app = apps[0]!;

  if (app.status === "approved") throw new Error("Cannot request changes on an approved application");
  if (app.status === "rejected") throw new Error("Application is rejected. Driver must reapply.");
  if (app.status === "draft") throw new Error("Application has not been submitted yet.");

  const now = new Date();

  await db
    .update(driverApplications)
    .set({
      status: "action_required",
      actionRequiredReason: reason,
      reviewedBy: reviewerId,
      reviewedAt: now,
      actionRequiredAt: now,
    } as any)
    .where(eq(driverApplications.applicationId, applicationId));

  await db.insert(notifications).values({
    notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
    userId: app.userId,
    type: "system",
    title: "Action Required on Your Driver Application",
    body: `Your driver application needs updates: ${reason}. Please open the app and resubmit your application.`,
    data: JSON.stringify({ applicationId, type: "driver_application_action_required", reason }),
    deepLink: "/driver-onboarding",
  });

  return { success: true, status: "action_required" as const };
}

// ============================================================================
// ADMIN: GET APPLICATION STATS
// ============================================================================

export async function getApplicationStats() {
  const stats = await db
    .select({
      status: driverApplications.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(driverApplications)
    .groupBy(driverApplications.status);

  const result: Record<string, number> = {
    draft: 0,
    pending: 0,
    under_review: 0,
    action_required: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  };

  for (const row of stats) {
    result[row.status] = Number(row.count);
    result.total += Number(row.count);
  }

  return result;
}
