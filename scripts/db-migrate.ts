/**
 * Production migration runner — applies pending Drizzle SQL migrations.
 * Railway: runs automatically via `pnpm db:migrate:prod` in startCommand.
 *
 * If the DB was previously provisioned via `db:push` (tables exist but no
 * migration journal), auto-baselines before attempting migrate.
 */
import "dotenv/config";
import { execSync } from "child_process";
import mysql from "mysql2/promise";
import { allMigrationHashes } from "./db-migration-utils";

async function needsBaseline(url: string): Promise<boolean> {
  // Only baseline when the DB has tables but NO migration journal.
  // If __drizzle_migrations exists (even with pending entries), let
  // drizzle-kit migrate handle the pending rows — baselining here would
  // mark new migrations as applied without running their SQL.
  const conn = await mysql.createConnection(url);
  try {
    const [users] = await conn.execute("SHOW TABLES LIKE 'users'");
    if (!Array.isArray(users) || users.length === 0) return false;

    const [migTable] = await conn.execute("SHOW TABLES LIKE '__drizzle_migrations'");
    return !Array.isArray(migTable) || migTable.length === 0;
  } finally {
    await conn.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[db:migrate] DATABASE_URL is required");
    process.exit(1);
  }

  if (await needsBaseline(url)) {
    console.log("[db:migrate] Existing schema detected without migration journal — baselining…");
    execSync("pnpm exec tsx scripts/db-baseline.ts", { stdio: "inherit", env: process.env });
  }

  console.log("[db:migrate] Applying pending migrations…");
  execSync("pnpm exec drizzle-kit migrate", { stdio: "inherit", env: process.env });
  console.log("[db:migrate] Done");
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
