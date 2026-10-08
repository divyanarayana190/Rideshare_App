/**
 * Generates a .down.sql companion for each .sql migration (DROP TABLE reverse order).
 * Run after `pnpm db:generate` when new migrations are added.
 */
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle/migrations");

function tablesFromUp(sql: string): string[] {
  const re = /CREATE TABLE `([^`]+)`/g;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) tables.push(m[1]);
  return tables;
}

function main() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"));
  for (const file of files) {
    const upPath = path.join(MIGRATIONS_DIR, file);
    const downPath = upPath.replace(/\.sql$/, ".down.sql");
    const up = fs.readFileSync(upPath, "utf8");
    const tables = tablesFromUp(up);
    const down = [
      `-- Rollback for ${file} — generated; test on staging before production use`,
      ...tables.reverse().map((t) => `DROP TABLE IF EXISTS \`${t}\`;`),
      "",
    ].join("\n");
    fs.writeFileSync(downPath, down);
    console.log(`Wrote ${path.relative(process.cwd(), downPath)} (${tables.length} tables)`);
  }
}

main();
