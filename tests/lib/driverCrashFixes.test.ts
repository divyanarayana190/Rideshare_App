import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const STRIPE_IMPORT_RE =
  /(?:import\s+[\s\S]*?\s+from\s+['"]@stripe\/stripe-react-native['"]|require\s*\(\s*['"]@stripe\/stripe-react-native['"]\s*\))/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function isAllowedNativeStripeImport(filePath: string): boolean {
  return filePath.endsWith(".native.tsx") || filePath.endsWith(".native.ts");
}

describe("web build stripe import guard", () => {
  it("does not import @stripe/stripe-react-native outside native-only files", () => {
    const offenders: string[] = [];
    const files = walk(ROOT).filter(
      (f) =>
        !f.includes("node_modules") &&
        !f.includes("/tests/") &&
        !f.endsWith(".md") &&
        (f.includes("/app/") || f.includes("/components/") || f.includes("/lib/")),
    );

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (!STRIPE_IMPORT_RE.test(content)) continue;
      if (isAllowedNativeStripeImport(file)) continue;
      offenders.push(file.replace(`${ROOT}/`, ""));
    }

    expect(offenders).toEqual([]);
  });
});
