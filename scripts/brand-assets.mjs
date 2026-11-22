// Reproducible brand derivatives and measured, public comparison sample.
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const logo = await readFile("public/brand/unikit-symbol.svg");
await mkdir("src/generated", { recursive: true });
await mkdir("public/icons", { recursive: true });
await sharp(logo)
  .resize({ height: 384 })
  .png()
  .toFile("public/brand/unikit-symbol.png");
for (const size of [32, 180, 192, 512]) {
  const mark = await sharp(logo)
    .resize({ height: Math.round(size * 0.81) })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#101018" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(`public/icons/unikit-${size}.png`);
}
const ink = logo
  .toString()
  .replace('stop-color="#fff"', 'stop-color="#31263e"')
  .replace("#f2efff", "#30283d")
  .replace("#cbc7e4", "#514366");
await writeFile("public/brand/unikit-symbol-light.svg", ink);
await sharp(logo)
  .resize(32, 32, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("public/icons/unikit-32.png");
const svg = logo
  .toString()
  .replace('viewBox="245 62 748 1102"', 'viewBox="0 0 1280 1280"')
  .replace(
    "  <defs>",
    '<rect width="1280" height="1280" rx="256" fill="#111018"/><defs>',
  );
await writeFile("src/app/icon.svg", svg);
const bytes = await sharp("design/alpine-source.jpg")
  .rotate()
  .resize({ width: 1500, withoutEnlargement: true })
  .jpeg({ quality: 97, mozjpeg: true })
  .toBuffer();
const after = await sharp(bytes).webp({ quality: 78, effort: 4 }).toBuffer();
const { width, height } = await sharp(bytes).metadata();
await Promise.all([
  writeFile("public/samples/alpine-ridge.jpg", bytes),
  writeFile("public/samples/alpine-ridge.webp", after),
  writeFile(
    "src/generated/sample.json",
    JSON.stringify(
      {
        inputBytes: bytes.length,
        outputBytes: after.length,
        width,
        height,
        quality: 78,
      },
      null,
      2,
    ) + "\n",
  ),
]);
console.log({
  input: bytes.length,
  output: after.length,
  width,
  height,
  saved: bytes.length - after.length,
});
