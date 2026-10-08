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

  // top-most point per column for full logo region
  const pts: { x: number; y: number }[] = [];
  for (let x = 156; x <= 880; x += 4) {
    for (let y = 0; y < 680; y++) {
      if (isFg(x, y)) {
        pts.push({ x, y });
        break;
      }
    }
  }
  console.log(JSON.stringify(pts.filter((_, i) => i % 3 === 0)));

  // bottom-most per column (for swoosh bottom edge)
  const bot: { x: number; y: number }[] = [];
  for (let x = 260; x <= 780; x += 4) {
    for (let y = 679; y >= 480; y--) {
      if (isFg(x, y)) {
        bot.push({ x, y });
        break;
      }
    }
  }
  console.log("bottom edge", JSON.stringify(bot.filter((_, i) => i % 5 === 0)));
}

main().catch(console.error);
