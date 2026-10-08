/**
 * Driver detail, compliance documents, and expiry monitoring.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ratings,
  driverSessions,
  driverApplications,
  supportTickets,
  adminAuditLogs,
  stripeTransfers,
  stripePayments,
} from "../../drizzle/schema";

export type ExpiryStatus = "valid" | "warning_30" | "warning_15" | "warning_7" | "expired" | "unknown";

export function getExpiryStatus(dateStr: string | null | undefined): { status: ExpiryStatus; daysUntil: number | null; expiryLabel: string } {
  if (!dateStr) return { status: "unknown", daysUntil: null, expiryLabel: "Unknown" };
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return { status: "unknown", daysUntil: null, expiryLabel: "Invalid date" };
  const daysUntil = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
  if (daysUntil < 0) return { status: "expired", daysUntil, expiryLabel: "Expired" };
  if (daysUntil <= 7) return { status: "warning_7", daysUntil, expiryLabel: `${daysUntil}d left` };
  if (daysUntil <= 15) return { status: "warning_15", daysUntil, expiryLabel: `${daysUntil}d left` };
  if (daysUntil <= 30) return { status: "warning_30", daysUntil, expiryLabel: `${daysUntil}d left` };
  return { status: "valid", daysUntil, expiryLabel: "Valid" };
}

export async function getDriverDetail(driverId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, driverId)).limit(1);
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, driverId))
    .limit(1);
  if (!profile?.isDriver) return null;

  const [session] = await db
    .select()
    .from(driverSessions)
    .where(eq(driverSessions.driverId, driverId))
    .limit(1);

  const [application] = await db
    .select()
    .from(driverApplications)
    .where(eq(driverApplications.userId, driverId))
    .orderBy(desc(driverApplications.createdAt))
    .limit(1);

  const documents = application
    ? [
        {
          type: "license" as const,
          label: "Driver License",
          expiry: application.licenseExpiry,
          number: application.licenseNumber,
          state: application.licenseState,
          frontUrl: application.licenseFrontUrl,
          backUrl: application.licenseBackUrl,
          ...getExpiryStatus(application.licenseExpiry),
        },
        {
          type: "insurance" as const,
          label: "Vehicle Insurance",
          expiry: application.insuranceExpiry,
          provider: application.insuranceProvider,
          policyNumber: application.insurancePolicyNumber,
          docUrl: application.insuranceDocUrl,
          ...getExpiryStatus(application.insuranceExpiry),
        },
        {
          type: "registration" as const,
          label: "Vehicle Registration",
          expiry: null,
          plateNumber: application.plateNumber,
          docUrl: application.vehicleRegistrationUrl,
          status: application.vehicleRegistrationUrl ? ("valid" as ExpiryStatus) : ("unknown" as ExpiryStatus),
          daysUntil: null,
          expiryLabel: application.vehicleRegistrationUrl ? "On file" : "Missing",
        },
        {
          type: "background_check" as const,
          label: "Background Check",
          expiry: application.approvedAt ? application.approvedAt.toISOString().slice(0, 10) : null,
          status: application.status === "approved" ? ("valid" as ExpiryStatus) : ("unknown" as ExpiryStatus),
          daysUntil: null,
          expiryLabel: application.status === "approved" ? "Approved" : application.status,
        },
      ]
    : [];

  const recentRides = await db
    .select()
    .from(rides)
    .where(eq(rides.driverId, driverId))
    .orderBy(desc(rides.createdAt))
    .limit(20);

  const driverRatings = await db
    .select()
    .from(ratings)
    .where(eq(ratings.ratedUserId, driverId))
    .orderBy(desc(ratings.createdAt))
    .limit(15);

  const payouts = await db
    .select()
    .from(stripeTransfers)
    .where(eq(stripeTransfers.driverId, driverId))
    .orderBy(desc(stripeTransfers.createdAt))
    .limit(20);

  const [earningsRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${stripePayments.amountCents}), 0)` })
    .from(stripePayments)
    .where(and(eq(stripePayments.driverId, driverId), eq(stripePayments.status, "succeeded")));

  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, driverId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(10);

  const auditLogs = await db
    .select()
    .from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.entity, "user"), eq(adminAuditLogs.entityId, String(driverId))))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(20);

  const [completedCount] = await db
    .select({ count: count() })
    .from(rides)
    .where(and(eq(rides.driverId, driverId), eq(rides.status, "completed")));
  const [cancelledCount] = await db
    .select({ count: count() })
    .from(rides)
    .where(and(eq(rides.driverId, driverId), eq(rides.status, "cancelled")));

  const totalTrips = Number(completedCount?.count ?? 0) + Number(cancelledCount?.count ?? 0);
  const cancellationRate = totalTrips > 0 ? Math.round((Number(cancelledCount?.count ?? 0) / totalTrips) * 1000) / 10 : 0;

  return {
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    profile,
    session,
    application,
    documents,
    complianceWarnings: documents.filter((d) =>
      ["expired", "warning_7", "warning_15", "warning_30"].includes(d.status),
    ),
    analytics: {
      completedRides: Number(completedCount?.count ?? 0),
      cancelledRides: Number(cancelledCount?.count ?? 0),
      cancellationRate,
      totalEarningsCents: Number(earningsRow?.total ?? 0),
      averageRating: profile.averageRating,
    },
    recentRides,
    ratings: driverRatings,
    payouts,
    supportTickets: tickets,
    auditLogs,
  };
}

export async function listExpiringDocuments(withinDays = 30) {
  const apps = await db
    .select({
      userId: driverApplications.userId,
      fullName: driverApplications.fullName,
      licenseExpiry: driverApplications.licenseExpiry,
      insuranceExpiry: driverApplications.insuranceExpiry,
      status: driverApplications.status,
    })
    .from(driverApplications)
    .where(eq(driverApplications.status, "approved"));

  const cutoff = new Date(Date.now() + withinDays * 86400000);
  const results: Array<{
    driverId: number;
    driverName: string;
    documentType: string;
    expiry: string;
    status: ExpiryStatus;
    daysUntil: number | null;
  }> = [];

  for (const app of apps) {
    for (const doc of [
      { type: "license", expiry: app.licenseExpiry },
      { type: "insurance", expiry: app.insuranceExpiry },
    ]) {
      const info = getExpiryStatus(doc.expiry);
      if (info.status === "unknown" || info.status === "valid") continue;
      const parsed = new Date(doc.expiry);
      if (info.status !== "expired" && parsed > cutoff) continue;
      results.push({
        driverId: app.userId,
        driverName: app.fullName,
        documentType: doc.type,
        expiry: doc.expiry,
        status: info.status,
        daysUntil: info.daysUntil,
      });
    }
  }

  return results.sort((a, b) => (a.daysUntil ?? -999) - (b.daysUntil ?? -999));
}
