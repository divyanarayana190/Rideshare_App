/**
 * Safety operations — unified incident timeline from emergency alerts, ratings, support.
 */
import { and, count, desc, eq, gte, or, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  emergencyAlerts,
  ratings,
  rides,
  supportTickets,
} from "../../drizzle/schema";

export type SafetySeverity = "critical" | "high" | "medium" | "low";

function alertSeverity(alertType: string): SafetySeverity {
  if (alertType === "sos") return "critical";
  return "high";
}

function ratingSeverity(reported: boolean, score: number): SafetySeverity {
  if (reported) return "high";
  if (score <= 2) return "medium";
  return "low";
}

export async function getSafetyDashboard(filters: {
  severity?: string;
  status?: string;
  search?: string;
  type?: string;
} = {}) {
  const alertConditions: any[] = [];
  if (filters.status && filters.status !== "all") {
    alertConditions.push(eq(emergencyAlerts.status, filters.status as any));
  }

  const alerts = await db
    .select()
    .from(emergencyAlerts)
    .where(alertConditions.length ? and(...alertConditions) : undefined)
    .orderBy(desc(emergencyAlerts.createdAt))
    .limit(100);

  const userIds = [...new Set(alerts.map((a) => a.userId))];
  const alertUsers =
    userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
      : [];
  const userMap = Object.fromEntries(alertUsers.map((u) => [u.id, u]));

  const unsafeRatings = await db
    .select({
      id: ratings.id,
      rideId: ratings.rideId,
      ratedUserId: ratings.ratedUserId,
      raterUserId: ratings.raterId,
      score: ratings.score,
      comment: ratings.comment,
      reportedUnsafeBehavior: ratings.reportedUnsafeBehavior,
      createdAt: ratings.createdAt,
    })
    .from(ratings)
    .where(or(eq(ratings.reportedUnsafeBehavior, true), sql`${ratings.score} <= 2`))
    .orderBy(desc(ratings.createdAt))
    .limit(50);

  const safetyTickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.category, "safety"))
    .orderBy(desc(supportTickets.createdAt))
    .limit(30);

  const womenOnlyRides = await db
    .select({ id: rides.id, rideId: rides.rideId, safetyMode: rides.safetyMode, status: rides.status, createdAt: rides.createdAt })
    .from(rides)
    .where(and(
      sql`${rides.safetyMode} != 'none'`,
      gte(rides.createdAt, new Date(Date.now() - 7 * 86400000)),
    ))
    .orderBy(desc(rides.createdAt))
    .limit(20);

  const timeline: Array<{
    id: string;
    source: string;
    type: string;
    severity: SafetySeverity;
    status: string;
    userId: number;
    userName: string;
    description: string;
    latitude?: string | null;
    longitude?: string | null;
    rideId?: number | null;
    createdAt: Date;
  }> = [];

  for (const a of alerts) {
    const sev = alertSeverity(a.alertType);
    if (filters.severity && filters.severity !== "all" && sev !== filters.severity) continue;
    const name = userMap[a.userId]?.name || `User #${a.userId}`;
    if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) continue;
    timeline.push({
      id: `alert-${a.id}`,
      source: "emergency_alert",
      type: a.alertType,
      severity: sev,
      status: a.status ?? "active",
      userId: a.userId,
      userName: name,
      description: `${a.alertType.replace(/_/g, " ")} emergency alert`,
      latitude: a.latitude,
      longitude: a.longitude,
      rideId: a.rideId,
      createdAt: a.createdAt,
    });
  }

  const ratedUserIds = [...new Set(unsafeRatings.map((r) => r.ratedUserId))];
  const ratedUsers =
    ratedUserIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ratedUserIds))
      : [];
  const ratedUserMap = Object.fromEntries(ratedUsers.map((u) => [u.id, u.name]));

  for (const r of unsafeRatings) {
    const sev = ratingSeverity(!!r.reportedUnsafeBehavior, Number(r.score));
    if (filters.severity && filters.severity !== "all" && sev !== filters.severity) continue;
    if (filters.type && filters.type !== "harassment") continue;
    timeline.push({
      id: `rating-${r.id}`,
      source: "rating",
      type: r.reportedUnsafeBehavior ? "harassment_report" : "low_rating",
      severity: sev,
      status: "open",
      userId: r.ratedUserId,
      userName: ratedUserMap[r.ratedUserId] || `User #${r.ratedUserId}`,
      description: r.comment || (r.reportedUnsafeBehavior ? "Unsafe behavior reported" : `Low rating (${r.score}/5)`),
      rideId: r.rideId,
      createdAt: r.createdAt,
    });
  }

  const ticketUserIds = [...new Set(safetyTickets.map((t) => t.userId))];
  const ticketUsers =
    ticketUserIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ticketUserIds))
      : [];
  const ticketUserMap = Object.fromEntries(ticketUsers.map((u) => [u.id, u.name]));

  for (const t of safetyTickets) {
    const sev: SafetySeverity = t.priority === "urgent" ? "critical" : t.priority === "high" ? "high" : "medium";
    if (filters.severity && filters.severity !== "all" && sev !== filters.severity) continue;
    timeline.push({
      id: `ticket-${t.ticketId}`,
      source: "support",
      type: "support_escalation",
      severity: sev,
      status: t.status,
      userId: t.userId,
      userName: ticketUserMap[t.userId] || `User #${t.userId}`,
      description: t.subject,
      rideId: t.rideId,
      createdAt: t.createdAt,
    });
  }

  timeline.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const [activeSos] = await db.select({ count: count() }).from(emergencyAlerts).where(eq(emergencyAlerts.status, "active"));
  const [activeAlerts] = await db.select({ count: count() }).from(emergencyAlerts).where(or(eq(emergencyAlerts.status, "active"), eq(emergencyAlerts.status, "responded")));
  const [harassmentReports] = await db.select({ count: count() }).from(ratings).where(eq(ratings.reportedUnsafeBehavior, true));
  const [openSafetyTickets] = await db.select({ count: count() }).from(supportTickets).where(and(eq(supportTickets.category, "safety"), or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress"))));

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const trendRows = await db
    .select({
      date: sql<string>`DATE(${emergencyAlerts.createdAt})`,
      count: count(),
    })
    .from(emergencyAlerts)
    .where(gte(emergencyAlerts.createdAt, sevenDaysAgo))
    .groupBy(sql`DATE(${emergencyAlerts.createdAt})`)
    .orderBy(sql`DATE(${emergencyAlerts.createdAt})`);

  return {
    summary: {
      activeSos: Number(activeSos?.count ?? 0),
      activeAlerts: Number(activeAlerts?.count ?? 0),
      harassmentReports: Number(harassmentReports?.count ?? 0),
      openSafetyTickets: Number(openSafetyTickets?.count ?? 0),
      womenOnlyRides7d: womenOnlyRides.length,
    },
    timeline: timeline.slice(0, 80),
    mapPoints: alerts
      .filter((a) => a.status === "active" || a.status === "responded")
      .map((a) => ({
        id: a.id,
        lat: parseFloat(String(a.latitude)),
        lng: parseFloat(String(a.longitude)),
        type: a.alertType,
        severity: alertSeverity(a.alertType),
        userName: userMap[a.userId]?.name,
      })),
    trend: trendRows.map((r) => ({ date: r.date, count: Number(r.count) })),
    timestamp: new Date().toISOString(),
  };
}
