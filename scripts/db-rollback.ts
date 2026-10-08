/**
 * Roll back the last applied Drizzle migration using the companion .down.sql file.
 * FOR STAGING / ROLLBACK TESTING ONLY — destructive on production data.
 *
 * Usage:
 *   pnpm db:rollback          # dry-run (prints SQL)
 *   pnpm db:rollback --apply    # execute rollback
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle/migrations");

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[db:rollback] DATABASE_URL is required");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  try {
    const [tableCheck] = await conn.execute(
      "SHOW TABLES LIKE '__drizzle_migrations'",
    );
    if (!Array.isArray(tableCheck) || tableCheck.length === 0) {
      console.log("[db:rollback] No __drizzle_migrations table — nothing to roll back");
      return;
    }

    const [rows] = await conn.execute(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY created_at DESC LIMIT 1",
    );
    const last = (rows as Array<{ id: number; hash: string; created_at: number }>)[0];
    if (!last) {
      console.log("[db:rollback] No applied migrations");
      return;
    }

    const journal = JSON.parse(
      fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const entry = journal.entries[journal.entries.length - 1];
    if (!entry) {
      console.error("[db:rollback] Journal empty");
      process.exit(1);
    }

    const downPath = path.join(MIGRATIONS_DIR, `${entry.tag}.down.sql`);
    if (!fs.existsSync(downPath)) {
      console.error(`[db:rollback] Missing ${downPath} — run pnpm db:generate:down`);
      process.exit(1);
    }

    const downSql = fs.readFileSync(downPath, "utf8");
    const statements = downSql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("DROP TABLE"));

    console.log(`[db:rollback] Last migration: ${entry.tag} (id=${last.id})`);
    console.log(`[db:rollback] ${statements.length} DROP statements`);

    if (!apply) {
      console.log("[db:rollback] Dry-run — pass --apply to execute");
      statements.slice(0, 5).forEach((s) => console.log(`  ${s}`));
      if (statements.length > 5) console.log(`  … and ${statements.length - 5} more`);
      return;
    }

    await conn.beginTransaction();
    try {
      for (const stmt of statements) {
        await conn.execute(stmt);
      }
      await conn.execute("DELETE FROM `__drizzle_migrations` WHERE id = ?", [last.id]);
      await conn.commit();
      console.log("[db:rollback] Rollback applied successfully");
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[db:rollback] Failed:", err);
  process.exit(1);
});
