/**
 * Baseline an existing database that was created via `db:push`.
 * Marks migration 0000 as applied WITHOUT running CREATE TABLE statements.
 *
 * Usage (one-time on Railway / prod after first deploy with migrations):
 *   pnpm db:baseline
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { allMigrationHashes } from "./db-migration-utils";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[db:baseline] DATABASE_URL is required");
    process.exit(1);
  }

  const migrations = allMigrationHashes();
  if (migrations.length === 0) {
    console.error("[db:baseline] No migrations in journal");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
        \`id\` bigint AUTO_INCREMENT NOT NULL,
        \`hash\` text NOT NULL,
        \`created_at\` bigint,
        CONSTRAINT \`__drizzle_migrations_id\` PRIMARY KEY(\`id\`)
      )
    `);

    let inserted = 0;
    for (const { tag, hash } of migrations) {
      const [rows] = await conn.execute(
        "SELECT id FROM `__drizzle_migrations` WHERE hash = ? LIMIT 1",
        [hash],
      );
      if (Array.isArray(rows) && rows.length > 0) continue;

      await conn.execute(
        "INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
        [hash, Date.now()],
      );
      console.log(`[db:baseline] Recorded ${tag} (hash ${hash.slice(0, 12)}…)`);
      inserted += 1;
    }
    if (inserted === 0) {
      console.log("[db:baseline] All migrations already recorded — nothing to do");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[db:baseline] Failed:", err);
  process.exit(1);
});
