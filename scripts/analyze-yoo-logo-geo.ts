import sharp from "sharp";

async function main() {
  const { data, info } = await sharp("assets/images/yoo-logo.png")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const bg = { r: 1, g: 2, b: 30 };

  const isFg = (x: number, y: number) => {
    const i = (y * w + x) * info.channels;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    return Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b) > 35;
  };

  // Find wheel centers via circular Hough-like scan
  const candidates: { cx: number; cy: number; score: number; r: number }[] = [];
  for (let cy = 520; cy <= 640; cy += 4) {
    for (let cx = 280; cx <= 780; cx += 4) {
      for (const r of [68, 72, 76, 80, 84]) {
        let score = 0;
        for (let a = 0; a < 360; a += 8) {
          const rad = (a * Math.PI) / 180;
          const x = Math.round(cx + r * Math.cos(rad));
          const y = Math.round(cy + r * Math.sin(rad));
          if (x >= 0 && x < w && y >= 0 && y < h && isFg(x, y)) score++;
        }
        if (score > 30) candidates.push({ cx, cy, score, r });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  console.log("wheel candidates top", candidates.slice(0, 10));

  // Roof peak scan
  let peakY = 999,
    peakX = 0;
  for (let x = 200; x < 800; x++) {
    for (let y = 0; y < 400; y++) {
      if (isFg(x, y) && y < peakY) {
        peakY = y;
        peakX = x;
      }
    }
  }
  console.log("topmost fg", { peakX, peakY });

  // Scan roofline at various x
  for (const x of [200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850]) {
    let top = -1,
      bot = -1;
    for (let y = 0; y < 650; y++) {
      if (isFg(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0) console.log(`x=${x} stroke y ${top}-${bot}`);
  }
}

main().catch(console.error);
