/**
 * Support operations — SLA metrics, agent performance, escalation queue from real tickets.
 */
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { supportTickets, supportMessages, users } from "../../drizzle/schema";

/** First-response SLA targets in minutes by priority */
const FIRST_RESPONSE_SLA: Record<string, number> = {
  urgent: 60,
  high: 240,
  medium: 1440,
  low: 2880,
};

/** Resolution SLA targets in minutes by priority */
const RESOLUTION_SLA: Record<string, number> = {
  urgent: 240,
  high: 1440,
  medium: 4320,
  low: 10080,
};

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export async function getSupportSlaDashboard(days = 30) {
  const since = new Date(Date.now() - days * 86400000);

  const tickets = await db
    .select({
      ticketId: supportTickets.ticketId,
      subject: supportTickets.subject,
      userId: supportTickets.userId,
      priority: supportTickets.priority,
      status: supportTickets.status,
      category: supportTickets.category,
      assignedTo: supportTickets.assignedTo,
      createdAt: supportTickets.createdAt,
      resolvedAt: supportTickets.resolvedAt,
      userName: users.name,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .where(gte(supportTickets.createdAt, since))
    .orderBy(desc(supportTickets.createdAt))
    .limit(500);

  const ticketIds = tickets.map((t) => t.ticketId);
  const firstAdminReplies = ticketIds.length > 0
    ? await db
        .select({
          ticketId: supportMessages.ticketId,
          firstReply: sql<Date>`MIN(${supportMessages.createdAt})`,
        })
        .from(supportMessages)
        .where(and(inArray(supportMessages.ticketId, ticketIds), eq(supportMessages.senderType, "admin")))
        .groupBy(supportMessages.ticketId)
    : [];

  const replyMap = Object.fromEntries(firstAdminReplies.map((r) => [r.ticketId, r.firstReply]));

  let responseBreaches = 0;
  let resolutionBreaches = 0;
  let totalResponseMin = 0;
  let responseCount = 0;
  let totalResolutionMin = 0;
  let resolutionCount = 0;

  const escalationQueue: Array<{
    ticketId: string;
    subject: string;
    priority: string;
    status: string;
    userName: string;
    ageMinutes: number;
    breachType: string;
  }> = [];

  const agentStats: Record<number, { name: string; assigned: number; resolved: number; avgResolutionMin: number; resolutionTotal: number }> = {};

  for (const t of tickets) {
    const created = new Date(t.createdAt);
    const firstReply = replyMap[t.ticketId] ? new Date(replyMap[t.ticketId]) : null;
    const responseSla = FIRST_RESPONSE_SLA[t.priority] ?? 1440;
    const resolutionSla = RESOLUTION_SLA[t.priority] ?? 4320;
    const now = new Date();
    const ageMin = minutesBetween(created, now);

    if (firstReply) {
      const respMin = minutesBetween(created, firstReply);
      totalResponseMin += respMin;
      responseCount++;
      if (respMin > responseSla) responseBreaches++;
    } else if (["open", "in_progress"].includes(t.status) && ageMin > responseSla) {
      responseBreaches++;
      escalationQueue.push({
        ticketId: t.ticketId,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        userName: t.userName || `User #${t.userId}`,
        ageMinutes: ageMin,
        breachType: "first_response",
      });
    }

    if (t.resolvedAt) {
      const resMin = minutesBetween(created, new Date(t.resolvedAt));
      totalResolutionMin += resMin;
      resolutionCount++;
      if (resMin > resolutionSla) resolutionBreaches++;

      if (t.assignedTo) {
        if (!agentStats[t.assignedTo]) {
          agentStats[t.assignedTo] = { name: `Agent #${t.assignedTo}`, assigned: 0, resolved: 0, avgResolutionMin: 0, resolutionTotal: 0 };
        }
        agentStats[t.assignedTo].resolved++;
        agentStats[t.assignedTo].resolutionTotal += resMin;
      }
    }

    if (t.assignedTo) {
      if (!agentStats[t.assignedTo]) {
        agentStats[t.assignedTo] = { name: `Agent #${t.assignedTo}`, assigned: 0, resolved: 0, avgResolutionMin: 0, resolutionTotal: 0 };
      }
      agentStats[t.assignedTo].assigned++;
    }

    if (["open", "in_progress"].includes(t.status) && !t.resolvedAt && ageMin > resolutionSla) {
      resolutionBreaches++;
      if (!escalationQueue.some((e) => e.ticketId === t.ticketId)) {
        escalationQueue.push({
          ticketId: t.ticketId,
          subject: t.subject,
          priority: t.priority,
          status: t.status,
          userName: t.userName || `User #${t.userId}`,
          ageMinutes: ageMin,
          breachType: "resolution",
        });
      }
    }
  }

  const agentIds = Object.keys(agentStats).map(Number);
  if (agentIds.length > 0) {
    const agentUsers = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, agentIds));
    for (const a of agentUsers) {
      if (agentStats[a.id]) agentStats[a.id].name = a.name || agentStats[a.id].name;
    }
  }

  const [openUrgent] = await db
    .select({ c: count() })
    .from(supportTickets)
    .where(and(eq(supportTickets.priority, "urgent"), inArray(supportTickets.status, ["open", "in_progress"])));

  const [unassigned] = await db
    .select({ c: count() })
    .from(supportTickets)
    .where(and(isNull(supportTickets.assignedTo), inArray(supportTickets.status, ["open", "in_progress"])));

  const trend = await db
    .select({
      date: sql<string>`DATE(${supportTickets.createdAt})`,
      opened: count(),
      resolved: sql<number>`SUM(CASE WHEN ${supportTickets.status} IN ('resolved','closed') THEN 1 ELSE 0 END)`,
    })
    .from(supportTickets)
    .where(gte(supportTickets.createdAt, since))
    .groupBy(sql`DATE(${supportTickets.createdAt})`)
    .orderBy(sql`DATE(${supportTickets.createdAt})`);

  return {
    periodDays: days,
    summary: {
      ticketsInPeriod: tickets.length,
      avgFirstResponseMin: responseCount > 0 ? Math.round(totalResponseMin / responseCount) : null,
      avgResolutionMin: resolutionCount > 0 ? Math.round(totalResolutionMin / resolutionCount) : null,
      firstResponseBreaches: responseBreaches,
      resolutionBreaches: resolutionBreaches,
      slaComplianceRate: tickets.length > 0
        ? Math.round(((tickets.length - responseBreaches - resolutionBreaches) / Math.max(tickets.length, 1)) * 100)
        : 100,
      openUrgent: Number(openUrgent.c),
      unassigned: Number(unassigned.c),
    },
    slaTargets: { firstResponse: FIRST_RESPONSE_SLA, resolution: RESOLUTION_SLA },
    agentPerformance: Object.entries(agentStats).map(([id, s]) => ({
      agentId: Number(id),
      name: s.name,
      assigned: s.assigned,
      resolved: s.resolved,
      avgResolutionMin: s.resolved > 0 ? Math.round(s.resolutionTotal / s.resolved) : null,
    })).sort((a, b) => b.resolved - a.resolved),
    escalationQueue: escalationQueue.slice(0, 25),
    trend: trend.map((t) => ({
      date: t.date,
      opened: Number(t.opened),
      resolved: Number(t.resolved),
    })),
    timestamp: new Date().toISOString(),
  };
}
