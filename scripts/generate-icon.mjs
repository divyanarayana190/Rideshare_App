#!/usr/bin/env node
/**
 * Generates all YOO app icon assets from an embedded SVG using sharp.
 * Run: node scripts/generate-icon.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "..", "assets", "images");

// ─── YOO Logo SVG ────────────────────────────────────────────────────────────
// Dark navy background, gradient YOO text (yellow→orange→indigo→purple),
// smiley faces in the two O rings, car silhouette at top.
const yooSvg = (transparent = false) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Background gradient (dark navy) -->
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="#090618"/>
      <stop offset="100%" stop-color="#120D30"/>
    </linearGradient>

    <!-- Full-width gradient for YOO letters: warm yellow → orange → indigo → purple -->
    <linearGradient id="grad" x1="60" y1="0" x2="964" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FFD600"/>
      <stop offset="27%"  stop-color="#FF7C00"/>
      <stop offset="58%"  stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>

    <!-- Gradient for car silhouette -->
    <linearGradient id="carGrad" x1="234" y1="0" x2="790" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FFE234"/>
      <stop offset="100%" stop-color="#A78BFA"/>
    </linearGradient>

    <!-- Soft glow filter for letters -->
    <filter id="glow" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  ${
    transparent
      ? `<!-- Transparent background for adaptive foreground -->
  <!-- Slight inner glow so logo pops on any bg color -->
  <ellipse cx="512" cy="640" rx="430" ry="360" fill="#6366F1" opacity="0.06"/>`
      : `<!-- Rounded square background -->
  <rect width="1024" height="1024" rx="200" ry="200" fill="url(#bg)"/>
  <!-- Subtle center glow -->
  <ellipse cx="512" cy="640" rx="430" ry="360" fill="#6366F1" opacity="0.07"/>`
  }

  <!-- ══════════ CAR SILHOUETTE ══════════ -->
  <!-- Body -->
  <rect x="234" y="154" width="556" height="110" rx="40" fill="url(#carGrad)" opacity="0.92"/>
  <!-- Cabin (arch) -->
  <path d="M 310,154 Q 398,68 512,60 Q 626,68 714,154 Z" fill="url(#carGrad)" opacity="0.92"/>
  <!-- Centre pillar -->
  <line x1="512" y1="64" x2="512" y2="150" stroke="#090618" stroke-width="16" opacity="0.55"/>
  <!-- Front wheel -->
  <circle cx="356" cy="283" r="45" fill="#090618" stroke="url(#carGrad)" stroke-width="14"/>
  <circle cx="356" cy="283" r="17" fill="url(#carGrad)" opacity="0.85"/>
  <!-- Rear wheel -->
  <circle cx="668" cy="283" r="45" fill="#090618" stroke="url(#carGrad)" stroke-width="14"/>
  <circle cx="668" cy="283" r="17" fill="url(#carGrad)" opacity="0.85"/>

  <!-- ══════════ Y LETTER ══════════ -->
  <g filter="url(#glow)" stroke="url(#grad)" stroke-width="82" stroke-linecap="round" fill="none">
    <!-- Left arm -->
    <line x1="90"  y1="370" x2="202" y2="582"/>
    <!-- Right arm -->
    <line x1="314" y1="370" x2="202" y2="582"/>
    <!-- Stem -->
    <line x1="202" y1="582" x2="202" y2="912"/>
  </g>

  <!-- ══════════ O1 LETTER (centre) ══════════ -->
  <g filter="url(#glow)">
    <!-- Ring -->
    <ellipse cx="512" cy="641" rx="106" ry="232" fill="none" stroke="url(#grad)" stroke-width="56"/>
    <!-- Left eye -->
    <circle cx="489" cy="564" r="14" fill="url(#grad)"/>
    <!-- Right eye -->
    <circle cx="535" cy="564" r="14" fill="url(#grad)"/>
    <!-- Smile -->
    <path d="M 470,628 Q 512,684 554,628"
          stroke="url(#grad)" stroke-width="13" fill="none" stroke-linecap="round"/>
  </g>

  <!-- ══════════ O2 LETTER (right) ══════════ -->
  <g filter="url(#glow)">
    <!-- Ring -->
    <ellipse cx="822" cy="641" rx="106" ry="232" fill="none" stroke="url(#grad)" stroke-width="56"/>
    <!-- Left eye -->
    <circle cx="799" cy="564" r="14" fill="url(#grad)"/>
    <!-- Right eye -->
    <circle cx="845" cy="564" r="14" fill="url(#grad)"/>
    <!-- Smile -->
    <path d="M 780,628 Q 822,684 864,628"
          stroke="url(#grad)" stroke-width="13" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

// ─── Background SVG (solid dark navy, for Android adaptive icon bg) ───────────
const bgSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#0A0720"/>
</svg>`;

async function run() {
  console.log("Generating YOO icon assets...\n");

  // 1. icon.png — 1024×1024 full logo (iOS / Android fallback)
  await sharp(Buffer.from(yooSvg(false)))
    .resize(1024, 1024)
    .png()
    .toFile(`${assetsDir}/icon.png`);
  console.log("✓  icon.png          1024×1024");

  // 2. favicon.png — 64×64 for web tab / localhost
  await sharp(Buffer.from(yooSvg(false)))
    .resize(64, 64)
    .png()
    .toFile(`${assetsDir}/favicon.png`);
  console.log("✓  favicon.png          64×64");

  // 3. splash-icon.png — 512×512 (displayed at 200px via imageWidth config)
  await sharp(Buffer.from(yooSvg(false)))
    .resize(512, 512)
    .png()
    .toFile(`${assetsDir}/splash-icon.png`);
  console.log("✓  splash-icon.png     512×512");

  // 4. android-icon-foreground.png — logo on transparent bg, centred in safe zone
  //    Android adaptive safe zone is 72/108 of the canvas.
  //    We scale the logo to ~68% and composite it centred on a transparent 1024px canvas.
  const fgLogoSize = 696; // 68% of 1024
  const fgOffset = Math.round((1024 - fgLogoSize) / 2);
  const fgLogo = await sharp(Buffer.from(yooSvg(true)))
    .resize(fgLogoSize, fgLogoSize)
    .png()
    .toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fgLogo, top: fgOffset, left: fgOffset }])
    .png()
    .toFile(`${assetsDir}/android-icon-foreground.png`);
  console.log("✓  android-icon-foreground.png  1024×1024 (transparent)");

  // 5. android-icon-background.png — solid dark navy
  await sharp(Buffer.from(bgSvg))
    .resize(1024, 1024)
    .png()
    .toFile(`${assetsDir}/android-icon-background.png`);
  console.log("✓  android-icon-background.png  1024×1024 (navy)");

  // 6. android-icon-monochrome.png — white-on-transparent silhouette
  //    Sharp doesn't natively support SVG fill replacement, so we convert the
  //    colour logo to greyscale and threshold-invert it for a clean monochrome.
  const monoRaw = await sharp(Buffer.from(yooSvg(true)))
    .resize(1024, 1024)
    .greyscale()
    .threshold(80)   // white where logo pixels are, black where transparent
    .png()
    .toBuffer();
  await sharp(monoRaw)
    .png()
    .toFile(`${assetsDir}/android-icon-monochrome.png`);
  console.log("✓  android-icon-monochrome.png  1024×1024 (monochrome)");

  console.log("\nAll assets written to assets/images/");
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
