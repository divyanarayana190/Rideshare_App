import { db } from "../db";
import { driverApplications, userProfiles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyUser } from "./userNotifications";
import logger from "../logger";

// ── Pure logic (exported for unit tests) ─────────────────────────────────────

export type ExpiryAction = "suspend" | "warn_30" | "warn_60" | "ok";

export interface ExpiryInput {
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  now: Date;
}

export interface ExpiryResult {
  action: ExpiryAction;
  reason: string;
  docs: string[];
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function computeExpiryAction(input: ExpiryInput): ExpiryResult {
  const { now } = input;
  const in30 = addDays(now, 30);
  const in60 = addDays(now, 60);

  const licenseDate = input.licenseExpiry ? new Date(input.licenseExpiry) : null;
  const insuranceDate = input.insuranceExpiry ? new Date(input.insuranceExpiry) : null;

  const licenseExpired = licenseDate && licenseDate < now;
  const insuranceExpired = insuranceDate && insuranceDate < now;

  if (licenseExpired || insuranceExpired) {
    const docs: string[] = [];
    if (licenseExpired) docs.push("Driver license has expired");
    if (insuranceExpired) docs.push("Insurance policy has expired");
    return { action: "suspend", reason: docs.join("; "), docs };
  }

  const licenseIn30 = licenseDate && licenseDate <= in30 && licenseDate > now;
  const insuranceIn30 = insuranceDate && insuranceDate <= in30 && insuranceDate > now;

  if (licenseIn30 || insuranceIn30) {
    const docs: string[] = [];
    if (licenseIn30) docs.push("driver license");
    if (insuranceIn30) docs.push("insurance policy");
    return { action: "warn_30", reason: `expires within 30 days`, docs };
  }

  const licenseIn60 = licenseDate && licenseDate <= in60 && licenseDate > in30;
  const insuranceIn60 = insuranceDate && insuranceDate <= in60 && insuranceDate > in30;

  if (licenseIn60 || insuranceIn60) {
    const docs: string[] = [];
    if (licenseIn60) docs.push("driver license");
    if (insuranceIn60) docs.push("insurance policy");
    return { action: "warn_60", reason: `expires within 60 days`, docs };
  }

  return { action: "ok", reason: "", docs: [] };
}

// ── Cron runner ───────────────────────────────────────────────────────────────

async function runDriverExpiryCron() {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const apps = await db
      .select({
        applicationId: driverApplications.applicationId,
        userId: driverApplications.userId,
        licenseExpiry: driverApplications.licenseExpiry,
        insuranceExpiry: driverApplications.insuranceExpiry,
      })
      .from(driverApplications)
      .where(eq(driverApplications.status, "approved"));

    for (const app of apps) {
      const { action, reason, docs } = computeExpiryAction({
        licenseExpiry: app.licenseExpiry ?? null,
        insuranceExpiry: app.insuranceExpiry ?? null,
        now,
      });

      if (action === "suspend") {
        await db
          .update(userProfiles)
          .set({ isBanned: true, banReason: `Auto-suspended: ${reason}. Please update documents to regain access.` })
          .where(eq(userProfiles.userId, app.userId));

        await db
          .update(driverApplications)
          .set({ status: "rejected", rejectionReason: `Auto-suspended: ${reason}` })
          .where(eq(driverApplications.applicationId, app.applicationId));

        await notifyUser({
          userId: app.userId,
          recipientRole: "driver",
          type: "system",
          title: "Driver Access Suspended",
          body: `Your driver access has been suspended. ${reason}. Please update your documents to regain access.`,
          data: { notificationType: "driver_access_suspended" },
          deepLink: "/driver-onboarding",
        }).catch((e) => logger.warn({ err: e, userId: app.userId }, "[expiry-cron] suspend notify failed"));

        logger.info({ userId: app.userId, reason }, "[expiry-cron] Auto-suspended driver");
      } else if (action === "warn_30") {
        await notifyUser({
          userId: app.userId,
          recipientRole: "driver",
          type: "system",
          title: "Document Expiry Warning",
          body: `Your ${docs.join(" and ")} will expire within 30 days. Please renew to avoid suspension.`,
          data: { notificationType: "driver_expiry_warn_30" },
          deepLink: "/driver/documents",
        }).catch((e) => logger.warn({ err: e, userId: app.userId }, "[expiry-cron] 30d warn failed"));

        logger.info({ userId: app.userId, docs }, "[expiry-cron] Sent 30-day expiry warning");
      } else if (action === "warn_60") {
        await notifyUser({
          userId: app.userId,
          recipientRole: "driver",
          type: "system",
          title: "Document Expiry Notice",
          body: `Your ${docs.join(" and ")} will expire within 60 days. Please plan to renew soon.`,
          data: { notificationType: "driver_expiry_warn_60" },
          deepLink: "/driver/documents",
        }).catch((e) => logger.warn({ err: e, userId: app.userId }, "[expiry-cron] 60d warn failed"));

        logger.info({ userId: app.userId, docs }, "[expiry-cron] Sent 60-day expiry warning");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "[expiry-cron] runDriverExpiryCron failed");
  }
}

export function startDriverExpiryCron() {
  runDriverExpiryCron();
  const interval = setInterval(runDriverExpiryCron, 24 * 60 * 60 * 1000);
  (interval as any).unref?.();
  logger.info("[cron] Driver expiry cron started (daily)");
}
