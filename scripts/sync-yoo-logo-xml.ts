/**
 * Sync SVG file contents for SvgXml rendering (web + native).
 * Source of truth: assets/brand/*.svg
 * Run: pnpm tsx scripts/sync-yoo-logo-xml.ts
 */
import fs from "node:fs";
import path from "node:path";

const BRAND_DIR = path.join(process.cwd(), "assets/brand");
const OUT = path.join(BRAND_DIR, "yoo-logo-xml.generated.ts");

const FILES: { file: string; exportName: string }[] = [
  { file: "yoo-logo.svg", exportName: "YOO_LOGO_GRADIENT_XML" },
  { file: "yoo-logo-white.svg", exportName: "YOO_LOGO_WHITE_XML" },
  { file: "yoo-logo-black.svg", exportName: "YOO_LOGO_BLACK_XML" },
  { file: "yoo-logo-flat-blue.svg", exportName: "YOO_LOGO_FLAT_BLUE_XML" },
];

function stripXmlDeclaration(raw: string): string {
  return raw.replace(/^\s*<\?xml[^?]*\?\>\s*/i, "").trim();
}

function main() {
  const lines = [
    "/** Auto-generated from assets/brand/*.svg — do not edit. */",
    "/* eslint-disable */",
    "",
  ];

  for (const { file, exportName } of FILES) {
    const svgPath = path.join(BRAND_DIR, file);
    if (!fs.existsSync(svgPath)) {
      throw new Error(`Missing ${svgPath}`);
    }
    const xml = stripXmlDeclaration(fs.readFileSync(svgPath, "utf8"));
    lines.push(`export const ${exportName} = ${JSON.stringify(xml)};`, "");
  }

  fs.writeFileSync(OUT, lines.join("\n"));
  console.log("wrote", OUT);
}

main();
