import sharp from "sharp";

async function main() {
  const img = sharp("assets/images/yoo-logo.png");
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  const px = (x: number, y: number) => {
    const i = (y * w + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ].map(([x, y]) => ({ x, y, ...px(x, y) }));

  console.log("size", w, h);
  console.log("corners", corners);

  const bg = corners[0];
  const isFg = (x: number, y: number) => {
    const p = px(x, y);
    return (
      Math.abs(p.r - bg.r) + Math.abs(p.g - bg.g) + Math.abs(p.b - bg.b) > 35
    );
  };

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isFg(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log("bbox", { minX, minY, maxX, maxY });

  // horizontal scan at wheel row (~y=620)
  for (const y of [560, 600, 640, 680]) {
    const row: number[] = [];
    for (let x = minX; x <= maxX; x++) {
      if (isFg(x, y)) row.push(x);
    }
    console.log(`y=${y} fg spans`, row.length ? `${row[0]}-${row[row.length - 1]} (${row.length}px)` : "none");
  }

  const samples: { x: number; y: number; hex: string; lum: number }[] = [];
  for (let y = minY; y <= maxY; y += 15) {
    for (let x = minX; x <= maxX; x += 15) {
      if (!isFg(x, y)) continue;
      const p = px(x, y);
      const lum = p.r + p.g + p.b;
      const hex = `#${p.r.toString(16).padStart(2, "0")}${p.g.toString(16).padStart(2, "0")}${p.b.toString(16).padStart(2, "0")}`;
      samples.push({ x, y, hex, lum });
    }
  }
  samples.sort((a, b) => b.lum - a.lum);
  console.log("brightest", samples.slice(0, 8));
  samples.sort((a, b) => a.lum - b.lum);
  console.log("darkest", samples.slice(0, 8));
}

main().catch(console.error);
