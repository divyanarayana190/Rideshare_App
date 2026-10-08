/**
 * Alert engine — evaluates rules against live DB metrics and dispatches to channels.
 */
import crypto from "crypto";
import { and, avg, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  alertRules,
  systemAlerts,
  rides,
  driverSessions,
  emergencyAlerts,
  fraudFlags,
  supportTickets,
  ratings,
  webhooks,
  webhookDeliveries,
  users,
} from "../../drizzle/schema";
import { getLedgerRevenueTotal } from "./paymentLedgerService";
import { createNotification } from "../db";
import logger from "../logger";

export const ALERT_METRICS = [
  "cancellation_rate",
  "online_drivers",
  "active_sos",
  "today_rides",
  "avg_rating",
  "driver_shortage",
  "demand_spike",
  "revenue_drop_pct",
  "fill_rate",
  "fraud_open_flags",
  "support_backlog",
  "waiting_trips",
] as const;

type AlertMetric = (typeof ALERT_METRICS)[number];

function compare(op: string, current: number, threshold: number): boolean {
  switch (op) {
    case "gt": return current > threshold;
    case "gte": return current >= threshold;
    case "lt": return current < threshold;
    case "lte": return current <= threshold;
    case "eq": return current === threshold;
    default: return false;
  }
}

async function fetchMetricValues(): Promise<Record<AlertMetric, number>> {
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const yesterday = new Date(today.getTime() - 86400000);
  const oneHour = new Date(Date.now() - 3600000);

  const [
    [onlineDrivers],
    [onRide],
    [todayRides],
    [todayCancelled],
    [activeSos],
    [waitingTrips],
    [recentRequests],
    [recentCancelled],
    [avgRating],
    [openFraud],
    [openTickets],
    revenueToday,
    revenueYesterday,
  ] = await Promise.all([
    db.select({ c: count() }).from(driverSessions).where(inArray(driverSessions.status, ["online", "on_ride"])),
    db.select({ c: count() }).from(driverSessions).where(eq(driverSessions.status, "on_ride")),
    db.select({ c: count() }).from(rides).where(gte(rides.createdAt, today)),
    db.select({ c: count() }).from(rides).where(and(gte(rides.createdAt, today), eq(rides.status, "cancelled"))),
    db.select({ c: count() }).from(emergencyAlerts).where(eq(emergencyAlerts.status, "active")),
    db.select({ c: count() }).from(rides).where(eq(rides.status, "searching")),
    db.select({ c: count() }).from(rides).where(gte(rides.createdAt, oneHour)),
    db.select({ c: count() }).from(rides).where(and(gte(rides.createdAt, oneHour), eq(rides.status, "cancelled"))),
    db.select({ avg: avg(ratings.score) }).from(ratings).where(gte(ratings.createdAt, new Date(Date.now() - 30 * 86400000))),
    db.select({ c: count() }).from(fraudFlags).where(eq(fraudFlags.status, "open")),
    db.select({ c: count() }).from(supportTickets).where(inArray(supportTickets.status, ["open", "in_progress"])),
    getLedgerRevenueTotal(today),
    getLedgerRevenueTotal(yesterday).then(async (twoDay) => {
      const todayRev = await getLedgerRevenueTotal(today);
      return twoDay - todayRev;
    }),
  ]);

  const totalToday = Number(todayRides.c);
  const cancellationRate = totalToday > 0 ? Math.round((Number(todayCancelled.c) / totalToday) * 100) : 0;
  const fillRate = Number(recentRequests.c) > 0
    ? Math.round(((Number(recentRequests.c) - Number(recentCancelled.c)) / Number(recentRequests.c)) * 100)
    : 100;
  const revenueDropPct = revenueYesterday > 0
    ? Math.round(((revenueYesterday - revenueToday) / revenueYesterday) * 100)
    : 0;

  return {
    cancellation_rate: cancellationRate,
    online_drivers: Number(onlineDrivers.c),
    active_sos: Number(activeSos.c),
    today_rides: totalToday,
    avg_rating: parseFloat(String(avgRating.avg ?? "5")),
    driver_shortage: Number(onlineDrivers.c),
    demand_spike: Number(waitingTrips.c),
    revenue_drop_pct: Math.max(0, revenueDropPct),
    fill_rate: fillRate,
    fraud_open_flags: Number(openFraud.c),
    support_backlog: Number(openTickets.c),
    waiting_trips: Number(waitingTrips.c),
  };
}

async function dispatchAlertChannels(alert: {
  id: number;
  message: string;
  severity: string;
  metric: string;
  currentValue: number;
  threshold: number;
}) {
  const payload = {
    event: "system.alert",
    timestamp: new Date().toISOString(),
    data: alert,
  };

  const channels: Array<{ channel: string; status: string; detail?: string }> = [];

  const activeWebhooks = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
  for (const wh of activeWebhooks) {
    const events = (wh.events as string[]) ?? [];
    if (!events.includes("system.alert") && !events.includes("*")) continue;
    let status: "delivered" | "failed" = "failed";
    let responseCode = 0;
    let responseBody = "";
    try {
      const sig = crypto.createHmac("sha256", wh.secret || "").update(JSON.stringify(payload)).digest("hex");
      const r = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-YOO-Signature": sig },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      responseCode = r.status;
      responseBody = (await r.text().catch(() => "")).slice(0, 1000);
      status = r.ok ? "delivered" : "failed";
    } catch (e: any) {
      responseBody = e.message?.slice(0, 200) ?? "fetch failed";
    }
    await db.insert(webhookDeliveries).values({
      webhookId: wh.id,
      event: "system.alert",
      payload,
      status,
      responseCode,
      responseBody,
      attempts: 1,
      deliveredAt: status === "delivered" ? new Date() : null,
    });
    channels.push({ channel: `webhook:${wh.name}`, status, detail: String(responseCode) });
  }

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(20);
  for (const admin of admins) {
    try {
      await createNotification({
        notificationId: `alert_${alert.id}_${admin.id}_${Date.now()}`,
        userId: admin.id,
        type: "system",
        title: `[${alert.severity.toUpperCase()}] ${alert.metric}`,
        body: alert.message,
        data: { alertId: alert.id, severity: alert.severity },
      });
      channels.push({ channel: `admin_panel:${admin.id}`, status: "delivered" });
    } catch {
      channels.push({ channel: `admin_panel:${admin.id}`, status: "failed" });
    }
  }

  return channels;
}

export async function evaluateAlertRules() {
  const metrics = await fetchMetricValues();
  const rules = await db.select().from(alertRules).where(eq(alertRules.isActive, true));
  const triggered: Array<{ ruleId: number; ruleName: string; metric: string; currentValue: number; severity: string }> = [];
  const channels: Array<{ alertId: number; deliveries: Awaited<ReturnType<typeof dispatchAlertChannels>> }> = [];

  for (const rule of rules) {
    const metric = rule.metric as AlertMetric;
    const currentValue = metrics[metric];
    if (currentValue === undefined) continue;

    const threshold = parseFloat(String(rule.threshold));
    if (!compare(rule.operator, currentValue, threshold)) continue;

    const alertKey = `rule_${rule.id}`;
    const [existing] = await db
      .select()
      .from(systemAlerts)
      .where(and(eq(systemAlerts.alertKey, alertKey), eq(systemAlerts.status, "active")))
      .limit(1);

    let alertId: number;
    const message = `${rule.name}: ${metric.replace(/_/g, " ")} is ${currentValue} (threshold ${rule.operator} ${threshold})`;

    if (existing) {
      await db.update(systemAlerts).set({
        currentValue: String(currentValue),
        message,
        severity: rule.severity,
      }).where(eq(systemAlerts.id, existing.id));
      alertId = existing.id;
    } else {
      const [result] = await db.insert(systemAlerts).values({
        alertKey,
        metric: rule.metric,
        currentValue: String(currentValue),
        threshold: String(threshold),
        severity: rule.severity,
        message,
        status: "active",
      });
      alertId = (result as { insertId: number }).insertId;
      const deliveries = await dispatchAlertChannels({
        id: alertId,
        message,
        severity: rule.severity,
        metric: rule.metric,
        currentValue,
        threshold,
      });
      channels.push({ alertId, deliveries });
    }

    triggered.push({
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      currentValue,
      severity: rule.severity,
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    rulesChecked: rules.length,
    triggered: triggered.length,
    alerts: triggered,
    metrics,
    channelDeliveries: channels,
  };
}

export async function getAlertEngineStatus() {
  const [activeRules] = await db.select({ c: count() }).from(alertRules).where(eq(alertRules.isActive, true));
  const [activeAlerts] = await db.select({ c: count() }).from(systemAlerts).where(eq(systemAlerts.status, "active"));
  const [webhookCount] = await db
    .select({ c: count() })
    .from(webhooks)
    .where(eq(webhooks.isActive, true));
  const recentDeliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.event, "system.alert"))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(20);

  const metrics = await fetchMetricValues();

  return {
    activeRules: Number(activeRules.c),
    activeAlerts: Number(activeAlerts.c),
    webhookChannels: Number(webhookCount.c),
    supportedMetrics: ALERT_METRICS,
    currentMetrics: metrics,
    recentDeliveries: recentDeliveries.map((d) => ({
      id: d.id,
      webhookId: d.webhookId,
      status: d.status,
      responseCode: d.responseCode,
      createdAt: d.createdAt,
    })),
    channels: ["admin_panel", "webhook (system.alert event)", "in-app notifications"],
  };
}

export function startAlertEngineCron() {
  const run = async () => {
    try {
      const result = await evaluateAlertRules();
      if (result.triggered > 0) {
        logger.info({ triggered: result.triggered }, "[alert-engine] Rules triggered");
      }
    } catch (e) {
      logger.warn({ err: e }, "[alert-engine] Evaluation failed");
    }
  };
  run();
  const interval = setInterval(run, 5 * 60 * 1000);
  return () => clearInterval(interval);
}
