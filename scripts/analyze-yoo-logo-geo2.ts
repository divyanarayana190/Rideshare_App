import sharp from "sharp";

async function main() {
  const { data, info } = await sharp("assets/images/yoo-logo.png")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const bg = { r: 1, g: 2, b: 30 };

  const isFg = (x: number, y: number) => {
    const i = (y * w + x) * info.channels;
    return (
      Math.abs(data[i] - bg.r) +
        Math.abs(data[i + 1] - bg.g) +
        Math.abs(data[i + 2] - bg.b) >
      35
    );
  };

  function findWheel(cx0: number, cy0: number) {
    let best = { cx: 0, cy: 0, r: 0, score: 0 };
    for (let cy = cy0 - 20; cy <= cy0 + 20; cy += 2) {
      for (let cx = cx0 - 20; cx <= cx0 + 20; cx += 2) {
        for (const r of [64, 68, 72, 76, 80]) {
          let score = 0;
          for (let a = 0; a < 360; a += 6) {
            const rad = (a * Math.PI) / 180;
            const x = Math.round(cx + r * Math.cos(rad));
            const y = Math.round(cy + r * Math.sin(rad));
            if (x >= 0 && x < w && y >= 0 && y < 1024 && isFg(x, y)) score++;
          }
          if (score > best.score) best = { cx, cy, r, score };
        }
      }
    }
    return best;
  }

  console.log("front wheel", findWheel(318, 596));
  console.log("rear wheel", findWheel(718, 596));

  // Extract roofline top edge points
  const roof: { x: number; y: number }[] = [];
  for (let x = 240; x <= 820; x += 5) {
    for (let y = 0; y < 500; y++) {
      if (isFg(x, y)) {
        roof.push({ x, y });
        break;
      }
    }
  }
  console.log("roof samples", roof.filter((_, i) => i % 8 === 0));

  // Lower swoosh top edge
  const swoosh: { x: number; y: number }[] = [];
  for (let x = 280; x <= 780; x += 5) {
    for (let y = 500; y < 650; y++) {
      if (isFg(x, y)) {
        swoosh.push({ x, y });
        break;
      }
    }
  }
  console.log("swoosh top", swoosh.filter((_, i) => i % 8 === 0));

  // Rear tail - scan low y at left
  for (let x = 180; x <= 280; x += 10) {
    for (let y = 520; y < 620; y++) {
      if (isFg(x, y)) console.log(`rear tail fg at ${x},${y}`);
    }
  }

  // Front headlight gap - scan front area
  for (let x = 820; x <= 880; x += 5) {
    let ys: number[] = [];
    for (let y = 480; y < 620; y++) if (isFg(x, y)) ys.push(y);
    if (ys.length) console.log(`x=${x} y ranges`, ys[0], ys[ys.length - 1]);
  }
}

main().catch(console.error);
