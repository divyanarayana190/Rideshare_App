/**
 * Extract transparent logo from yoo-logo-source.png for use on any background.
 * Run: pnpm tsx scripts/extract-yoo-logo-transparent.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "assets/brand/yoo-logo-source.png");
const OUT = path.join(process.cwd(), "assets/brand/yoo-logo-transparent.png");

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = r + g + b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max - min;

      // Keep logo strokes + soft blue glow; remove navy background/vignette.
      const isLogoStroke =
        lum > 160 ||
        (b > 80 && sat > 22) ||
        (g > 100 && b > 110) ||
        (lum > 85 && b > 65 && g > 45);

      if (!isLogoStroke) {
        out[i + 3] = 0;
      }
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(OUT);
  console.log("wrote", OUT);

  // Also build SVG that embeds the transparent PNG (pixel-perfect brand file)
  const b64 = fs.readFileSync(OUT).toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
  <image width="1024" height="1024" xlink:href="data:image/png;base64,${b64}" />
</svg>`;
  const svgPath = path.join(process.cwd(), "assets/brand/yoo-logo.svg");
  fs.writeFileSync(svgPath, svg);
  console.log("wrote", svgPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
