/**
 * Upsert infrastructure alerts into system_alerts (integrates with alert engine channels).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { systemAlerts } from "../../drizzle/schema";

type InfraAlertInput = {
  alertKey: string;
  metric: string;
  severity: "info" | "warning" | "critical";
  message: string;
  currentValue: number;
  threshold: number;
};

export async function upsertInfraAlert(input: InfraAlertInput) {
  const [existing] = await db
    .select()
    .from(systemAlerts)
    .where(and(eq(systemAlerts.alertKey, input.alertKey), eq(systemAlerts.status, "active")))
    .limit(1);

  if (existing) {
    await db
      .update(systemAlerts)
      .set({
        currentValue: String(input.currentValue),
        threshold: String(input.threshold),
        message: input.message,
        severity: input.severity,
      })
      .where(eq(systemAlerts.id, existing.id));
    return existing.id;
  }

  const [result] = await db.insert(systemAlerts).values({
    alertKey: input.alertKey,
    metric: input.metric,
    currentValue: String(input.currentValue),
    threshold: String(input.threshold),
    severity: input.severity,
    message: input.message,
    status: "active",
  });
  return (result as { insertId: number }).insertId;
}

export async function syncInfraAlerts(checks: InfraAlertInput[]) {
  for (const c of checks) {
    await upsertInfraAlert(c);
  }
}
