/**
 * Export YOO brand logo PNG variants from SVG sources.
 * Run: pnpm tsx scripts/export-yoo-brand-assets.ts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BRAND_DIR = path.join(process.cwd(), "assets/brand");
const OUT_SIZE = 1024;

const exports: { svg: string; png: string }[] = [
  { svg: "yoo-logo.svg", png: "yoo-logo-transparent-1024.png" },
  { svg: "yoo-logo-white.svg", png: "yoo-logo-white-1024.png" },
  { svg: "yoo-logo-black.svg", png: "yoo-logo-black-1024.png" },
  { svg: "yoo-logo-flat-blue.svg", png: "yoo-logo-flat-blue-1024.png" },
  { svg: "yoo-logo-app-icon.svg", png: "yoo-logo-app-icon-1024.png" },
];

async function renderSvg(svgPath: string, pngPath: string) {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg, { density: 300 })
    .resize(OUT_SIZE, OUT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pngPath);
  console.log("wrote", pngPath);
}

async function main() {
  // Regenerate transparent PNG + pixel-perfect yoo-logo.svg from source
  execSync("pnpm tsx scripts/extract-yoo-logo-transparent.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  for (const item of exports) {
    const svgPath = path.join(BRAND_DIR, item.svg);
    const pngPath = path.join(BRAND_DIR, item.png);
    if (!fs.existsSync(svgPath)) {
      console.warn("missing", svgPath);
      continue;
    }
    const needsTransparentBg = item.svg === "yoo-logo.svg";
    const svg = fs.readFileSync(svgPath);
    let pipeline = sharp(svg, { density: 300 }).resize(OUT_SIZE, OUT_SIZE, {
      fit: "contain",
      background: needsTransparentBg
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 8, g: 21, b: 47, alpha: 1 },
    });
    await pipeline.png().toFile(pngPath);
    console.log("wrote", pngPath);
  }

  // App icon sizes for Expo
  const appIconSrc = path.join(BRAND_DIR, "yoo-logo-app-icon-1024.png");
  if (fs.existsSync(appIconSrc)) {
    const iconOut = path.join(process.cwd(), "assets/images/icon.png");
    await sharp(appIconSrc).resize(1024, 1024).png().toFile(iconOut);
    console.log("updated", iconOut);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
