import crypto from "crypto";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json");

export function migrationHash(tag: string): string {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  return crypto.createHash("sha256").update(sql).digest("hex");
}

export function journalEntries(): Array<{ tag: string; idx: number }> {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as {
    entries: Array<{ tag: string; idx: number }>;
  };
  return journal.entries;
}

export function allMigrationHashes(): Array<{ tag: string; hash: string }> {
  return journalEntries().map((e) => ({ tag: e.tag, hash: migrationHash(e.tag) }));
}
