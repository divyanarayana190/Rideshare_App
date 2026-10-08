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

  // roof centerline: midpoint of vertical fg span at each x
  const roof: { x: number; y: number }[] = [];
  for (let x = 230; x <= 830; x += 2) {
    let top = -1,
      bot = -1;
    for (let y = 0; y < 650; y++) {
      if (isFg(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0 && bot - top < 120) {
      // thin vertical span = roof or front/rear detail
      roof.push({ x, y: (top + bot) / 2 });
    }
  }
  // split into segments by y jumps
  console.log("roof center", roof.filter((_, i) => i % 15 === 0));

  // front nose separate piece - scan x>780 for small segments
  for (let x = 790; x <= 870; x += 3) {
    let top = -1,
      bot = -1;
    for (let y = 400; y < 650; y++) {
      if (isFg(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0) console.log(`front x=${x} span ${top}-${bot} mid ${(top + bot) / 2}`);
  }

  // rear spoiler
  for (let x = 165; x <= 240; x += 5) {
    let top = -1,
      bot = -1;
    for (let y = 520; y < 620; y++) {
      if (isFg(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0) console.log(`spoiler x=${x} ${top}-${bot}`);
  }

  // swoosh centerline y>480
  const swoosh: { x: number; y: number }[] = [];
  for (let x = 270; x <= 780; x += 2) {
    let top = -1,
      bot = -1;
    for (let y = 480; y < 660; y++) {
      if (isFg(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0 && bot - top < 80) {
      swoosh.push({ x, y: (top + bot) / 2 });
    }
  }
  console.log("swoosh center", swoosh.filter((_, i) => i % 20 === 0));
}

main().catch(console.error);
