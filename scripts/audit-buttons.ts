/**
 * Scan app/ and components/ for buttons with missing or placeholder actions.
 *
 * Usage: pnpm tsx scripts/audit-buttons.ts
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "..");
const SCAN_DIRS = ["app", "components"].map((d) => path.join(ROOT, d));

type IssueType =
  | "empty_onPress"
  | "console_only"
  | "coming_soon"
  | "todo_fixme"
  | "missing_onPress"
  | "no_op_function";

interface Issue {
  file: string;
  line: number;
  type: IssueType;
  snippet: string;
  suggestion: string;
}

const issues: Issue[] = [];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function auditFile(filePath: string) {
  const rel = path.relative(ROOT, filePath);
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  lines.forEach((line, idx) => {
    const n = idx + 1;
    const trimmed = line.trim();

    if (/onPress=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(trimmed)) {
      issues.push({ file: rel, line: n, type: "empty_onPress", snippet: trimmed.slice(0, 120), suggestion: "Wire onPress to navigation or tRPC mutation" });
    }
    if (/onPress=\{undefined\}|onPress=\{null\}/.test(trimmed)) {
      issues.push({ file: rel, line: n, type: "missing_onPress", snippet: trimmed.slice(0, 120), suggestion: "Provide onPress handler or disable button with reason" });
    }
    if (/onPress=\{[^}]*console\.(log|warn|info)/.test(trimmed)) {
      issues.push({ file: rel, line: n, type: "console_only", snippet: trimmed.slice(0, 120), suggestion: "Replace console.log with real action" });
    }
    if (/coming\s+soon/i.test(trimmed) && /onPress|show\(/.test(trimmed)) {
      issues.push({ file: rel, line: n, type: "coming_soon", snippet: trimmed.slice(0, 120), suggestion: "Use ActionButton disabled with disabledReason or implement feature" });
    }
    if (/(TODO|FIXME).*onPress|onPress.*(TODO|FIXME)/i.test(trimmed)) {
      issues.push({ file: rel, line: n, type: "todo_fixme", snippet: trimmed.slice(0, 120), suggestion: "Complete implementation or disable button" });
    }
  });

  // Touchable/Pressable without onPress/disabled (multiline: check opening tag + next 6 lines)
  const content = lines.join("\n");
  const tagRe = /<(TouchableOpacity|Pressable|Button)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    const tag = m[0];
    const startLine = content.slice(0, m.index).split("\n").length;
    const block = lines.slice(startLine - 1, startLine + 12).join("\n");
    const hasHandler = /onPress=/.test(block);
    const isDisabled = /\bdisabled\b/.test(block);
    if (!hasHandler && !isDisabled && !/accessibilityRole/.test(tag)) {
      issues.push({
        file: rel,
        line: startLine,
        type: "missing_onPress",
        snippet: tag.slice(0, 100),
        suggestion: "Add onPress or mark disabled with reason",
      });
    }
  }
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) auditFile(file);
}

console.log(`\n# YOO Button Audit — ${issues.length} issue(s)\n`);
if (issues.length === 0) {
  console.log("No issues found.");
  process.exit(0);
}

const grouped = issues.reduce<Record<string, Issue[]>>((acc, i) => {
  (acc[i.type] ??= []).push(i);
  return acc;
}, {});

for (const [type, list] of Object.entries(grouped)) {
  console.log(`\n## ${type} (${list.length})\n`);
  for (const i of list.slice(0, 50)) {
    console.log(`- ${i.file}:${i.line}`);
    console.log(`  ${i.snippet}`);
    console.log(`  → ${i.suggestion}\n`);
  }
  if (list.length > 50) console.log(`  … and ${list.length - 50} more\n`);
}

process.exit(issues.length > 0 ? 1 : 0);
