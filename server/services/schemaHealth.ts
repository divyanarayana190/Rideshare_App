import { sql } from "drizzle-orm";
import { db } from "../db";
import logger from "../logger";

export type SchemaCheckResult = {
  ok: boolean;
  missingTables: string[];
  warnings: string[];
};

/** Stripe payment subsystem tables */
export const STRIPE_TABLES = [
  "stripe_customers",
  "stripe_payment_methods",
  "stripe_payments",
  "stripe_transfers",
  "stripe_refunds",
  "connected_accounts",
  "webhook_events",
] as const;

/** Legal compliance tables */
export const LEGAL_TABLES = [
  "legal_acceptances",
  "legal_policy_versions",
] as const;

/** Passenger broadcast request tables */
export const PASSENGER_REQUEST_TABLES = [
  "passenger_requests",
] as const;

/** Tables required for shipped passenger/driver/compliance features. */
export const PRODUCTION_REQUIRED_TABLES = [
  // Driver schedule
  "driver_schedule_settings",
  "driver_availability_slots",
  // Ride credits
  "credit_wallets",
  "credit_grants",
  "credit_redemptions",
  "credit_ledger",
  // Compliance / account lifecycle
  "account_deletion_requests",
  "data_export_requests",
  // Push notifications (canonical token store)
  "push_tokens",
  // Stripe / payments (canonical charge store)
  ...STRIPE_TABLES,
  // Legal compliance
  ...LEGAL_TABLES,
  // Passenger broadcast requests
  ...PASSENGER_REQUEST_TABLES,
] as const;

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "driver_sessions", column: "totalOnlineMinutes" },
  { table: "stripe_payments", column: "tipCents" },
  // driver_applications columns added in later migrations — if missing, getApplicationStatus returns 500
  { table: "driver_applications", column: "actionRequiredReason" },
  { table: "driver_applications", column: "actionRequiredAt" },
  { table: "driver_applications", column: "vehicleRegistrationUrl" },
];

async function tableExists(table: string): Promise<boolean> {
  try {
    const rows = await db.execute(sql.raw(`SHOW TABLES LIKE '${table}'`));
    return Array.isArray(rows)
      ? (rows as unknown[]).length > 0
      : ((rows as { rows?: unknown[] })?.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = await db.execute(
      sql.raw(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`),
    );
    return Array.isArray(rows)
      ? (rows as unknown[]).length > 0
      : ((rows as { rows?: unknown[] })?.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export type TableGroupResult = {
  ok: boolean;
  missing: string[];
  present: string[];
};

export async function verifyTableGroup(tables: readonly string[]): Promise<TableGroupResult> {
  const missing: string[] = [];
  const present: string[] = [];
  for (const table of tables) {
    if (await tableExists(table)) present.push(table);
    else missing.push(table);
  }
  return { ok: missing.length === 0, missing, present };
}

export async function checkProductionSchemaHealth(): Promise<SchemaCheckResult> {
  const missingTables: string[] = [];
  const warnings: string[] = [];

  for (const table of PRODUCTION_REQUIRED_TABLES) {
    if (!(await tableExists(table))) missingTables.push(table);
  }

  for (const { table, column } of REQUIRED_COLUMNS) {
    if (!(await columnExists(table, column))) {
      warnings.push(`${table}.${column} column missing`);
    }
  }

  return { ok: missingTables.length === 0 && warnings.length === 0, missingTables, warnings };
}

/** @deprecated use checkProductionSchemaHealth */
export const checkDriverSchemaHealth = checkProductionSchemaHealth;

/** @deprecated use checkProductionSchemaHealth */
export const checkDriverSchemaHealthOnly = checkProductionSchemaHealth;

export async function logDriverSchemaHealthOnStartup(): Promise<void> {
  try {
    const health = await checkProductionSchemaHealth();
    if (!health.ok) {
      logger.error(
        { missingTables: health.missingTables, warnings: health.warnings },
        "[schema] Production DB schema incomplete — run: pnpm db:push (dev) or pnpm db:migrate (prod)",
      );
      return;
    }
    logger.info("[schema] Production DB schema OK");
  } catch (err) {
    logger.warn({ err }, "[schema] Could not verify DB schema health");
  }
}
