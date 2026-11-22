/** Real Chromium release checks. Install Playwright outside production dependencies;
 * set PLAYWRIGHT_MODULE to its absolute index.mjs. Run only on your test host. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.argv[2] || "http://127.0.0.1:3000";
const dir = await mkdtemp(join(tmpdir(), "unikit-browser-"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "light",
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [],
  unexpected = [],
  writes = [];
let count = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  if (!["GET", "HEAD"].includes(r.method()))
    writes.push({
      url: new URL(r.url()).pathname,
      type: r.headers()["content-type"],
      size: r.postDataBuffer()?.length ?? 0,
      body: r.headers()["content-type"]?.includes("json") ? r.postData() : null,
    });
});
page.on("response", (r) => {
  if (r.status() >= 400)
    unexpected.push(`${r.status()} ${new URL(r.url()).pathname}`);
});
const check = (condition, n) => {
  assert.ok(condition, n);
  console.log("✓ " + n);
  count++;
};
const file = (name, buffer, mimeType) => ({ name, buffer, mimeType });
const goto = (p) => page.goto(base + p, { waitUntil: "networkidle" });
const waitDone = () =>
  page
    .getByRole("link", { name: "Download", exact: true })
    .first()
    .waitFor({ timeout: 60000 });
const dl = async (locator) => {
  const pending = page.waitForEvent("download");
  await locator.click();
  const entry = await pending;
  const path = join(dir, `${Date.now()}-${entry.suggestedFilename()}`);
  await entry.saveAs(path);
  return { bytes: await readFile(path), name: entry.suggestedFilename() };
};
const upload = async (files) => {
  await page.locator('input[type="file"]').setInputFiles(files);
  await page
    .getByRole("button", {
      name: `Optimize ${files.length} file${files.length === 1 ? "" : "s"}`,
      exact: true,
    })
    .click();
  await waitDone();
};
const reset = async () => {
  await page.getByRole("button", { name: "Optimize another file" }).click();
};
try {
  await goto("/");
  check((await page.title()).includes("Unikit Studio"), "new tab title");
  check(
    (await page.locator("html").getAttribute("data-theme")) === "dark",
    "fresh tab uses dark brand palette",
  );
  const s = page.getByRole("slider", { name: "Before and after comparison" });
  await s.focus();
  await s.press("ArrowRight");
  check((await s.inputValue()) === "49", "comparison works by keyboard");
  await page.getByRole("button", { name: /^Theme: dark/ }).click();
  await page.reload({ waitUntil: "networkidle" });
  check(
    (await page.locator("html").getAttribute("data-theme")) === "light",
    "light preference persists on reload",
  );
  await page.getByRole("button", { name: /^Theme: light/ }).click();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  check(true, "system follows a live OS preference change");
  check(
    await page.evaluate(
      () =>
        matchMedia("(prefers-reduced-motion: reduce)").matches &&
        getComputedStyle(document.querySelector(".hero-primary"))
          .transitionDuration.split(",")
          .every((x) => parseFloat(x) < 0.001),
    ),
    "reduced-motion transitions suppressed",
  );
  const jpg = await sharp({
    create: { width: 240, height: 160, channels: 3, background: "#563d98" },
  })
    .jpeg({ quality: 96 })
    .toBuffer();
  const png = await sharp({
    create: {
      width: 160,
      height: 100,
      channels: 4,
      background: { r: 135, g: 68, b: 178, alpha: 0.55 },
    },
  })
    .png()
    .toBuffer();
  await goto("/app/images");
  await page.getByRole("button", { name: "Show dimensions" }).click();
  await page.getByLabel("Max width (px)").fill("120");
  const start = writes.length;
  await upload([
    file("photo.jpg", jpg, "image/jpeg"),
    file("transparent.png", png, "image/png"),
  ]);
  const one = await dl(
    page.getByRole("link", { name: "Save", exact: true }).first(),
  );
  const meta = await sharp(one.bytes).metadata();
  check(
    meta.format === "webp" && meta.width === 120 && meta.height === 80,
    "JPEG → resized WebP decodes at 120×80",
  );
  const two = await dl(
    page.getByRole("link", { name: "Save", exact: true }).nth(1),
  );
  check(
    (await sharp(two.bytes).metadata()).hasAlpha,
    "transparent PNG → WebP preserves alpha",
  );
  const zip = await dl(
    page.getByRole("button", { name: "Download all (ZIP)" }),
  );
  const entries = await JSZip.loadAsync(zip.bytes);
  check(Object.keys(entries.files).length === 2, "ZIP has both outputs");
  check(
    (await entries.file(one.name).async("nodebuffer")).equals(one.bytes) &&
      (await entries.file(two.name).async("nodebuffer")).equals(two.bytes),
    "ZIP bytes equal the two individual downloads",
  );
  const receipt = writes
    .slice(start)
    .find((r) => r.url === "/api/v1/history/local");
  const record = JSON.parse(receipt.body);
  check(
    record.items[0].inputBytes === jpg.length &&
      record.items[0].outputBytes === one.bytes.length &&
      record.items[1].inputBytes === png.length &&
      record.items[1].outputBytes === two.bytes.length,
    "history measurements match actual input/output byte counts",
  );
  check(
    writes
      .slice(start)
      .every(
        (r) =>
          r.url === "/api/v1/history/local" &&
          r.type?.includes("json") &&
          r.size < 2000,
      ),
    "local image batch sends measurements only",
  );
  await page.getByRole("radio", { name: "JPEG", exact: true }).click();
  check(
    await page
      .getByRole("button", { name: "Optimize 2 files", exact: true })
      .isEnabled(),
    "new settings re-enable processing without selecting files again",
  );
  await reset();
  await page.getByRole("radio", { name: "AVIF", exact: true }).click();
  await upload([file("source.webp", one.bytes, "image/webp")]);
  const av = await dl(
    page.getByRole("link", { name: "Download", exact: true }).first(),
  );
  check(
    (await sharp(av.bytes).metadata()).compression === "av1" &&
      av.name.endsWith(".avif"),
    "browser worker writes real AVIF bytes from WebP",
  );
  await reset();
  await page.getByRole("radio", { name: "PNG", exact: true }).click();
  check(
    await page.locator("#quality").isDisabled(),
    "PNG does not pretend to implement lossy quality",
  );
  await upload([file("source.avif", av.bytes, "image/avif")]);
  const p = await dl(
    page.getByRole("link", { name: "Download", exact: true }).first(),
  );
  check(
    (await sharp(p.bytes).metadata()).format === "png",
    "AVIF input → lossless PNG",
  );
  await reset();
  await page.getByRole("radio", { name: "JPEG", exact: true }).click();
  const stillGif = await sharp(jpg).gif().toBuffer();
  await upload([file("still.gif", stillGif, "image/gif")]);
  const j = await dl(
    page.getByRole("link", { name: "Download", exact: true }).first(),
  );
  check(
    (await sharp(j.bytes).metadata()).format === "jpeg",
    "still GIF input → JPEG",
  );
  await reset();
  await page
    .getByRole("radio", { name: "Extended codecs", exact: true })
    .click();
  await page.getByRole("radio", { name: "TIFF", exact: true }).click();
  await upload([file("extended.jpg", jpg, "image/jpeg")]);
  const tif = await dl(
    page.getByRole("link", { name: "Download", exact: true }).first(),
  );
  check(
    (await sharp(tif.bytes).metadata()).format === "tiff",
    "extended encoder returns a real TIFF",
  );
  await reset();
  await page.getByRole("radio", { name: "GIF", exact: true }).click();
  await upload([file("source.tif", tif.bytes, "image/tiff")]);
  const g = await dl(
    page.getByRole("link", { name: "Download", exact: true }).first(),
  );
  check(
    (await sharp(g.bytes).metadata()).format === "gif",
    "TIFF input → real GIF",
  );
  await reset();
  await page.getByRole("radio", { name: "On-device", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles(
      file(
        "not-an-image.pdf",
        Buffer.from("Not a supported image"),
        "application/pdf",
      ),
    );
  await page
    .getByRole("button", { name: "Optimize 1 file", exact: true })
    .click();
  await page.getByRole("heading", { name: "Rejected files" }).waitFor();
  check(
    (await page
      .getByRole("link", { name: "Download", exact: true })
      .count()) === 0,
    "unsupported input has a reason and no fake download",
  );
  await goto("/app/fonts");
  const css =
    "@font-face{font-family:Studio;src:url(/studio.woff2)}\n.keep{color:indigo}";
  const at = writes.length;
  await page.locator("#css-editor").fill(css);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page
    .getByText(/is missing font-display/)
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Apply font-display" }).click();
  await page.getByRole("heading", { name: "Before and after" }).waitFor();
  const patched = await dl(page.getByRole("button", { name: "Download CSS" }));
  check(
    /font-display:\s*swap/.test(patched.bytes.toString()) &&
      patched.bytes.toString().includes(".keep{color:indigo}"),
    "CSS download adds the requested rule and preserves unrelated CSS",
  );
  await goto("/app/assets");
  await page
    .locator("input[type=file]")
    .setInputFiles([
      file("photo.jpg", jpg, "image/jpeg"),
      file("styles.css", Buffer.from(css), "text/css"),
    ]);
  await page.getByRole("heading", { name: "Results", exact: true }).waitFor();
  check(
    (await page
      .getByRole("button", { name: "Optimize", exact: true })
      .count()) === 1,
    "asset analyzer finds the image and offers a real handoff",
  );
  check(
    writes
      .slice(at)
      .every(
        (r) =>
          r.type?.includes("json") && !r.body?.includes("font-family:Studio"),
      ),
    "CSS and asset bytes never uploaded",
  );
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  await page
    .getByRole("button", { name: "Optimize 1 file", exact: true })
    .waitFor();
  check(true, "asset → image handoff preserves the selected file");
  await goto("/app/history");
  check(
    (await page.locator("tbody tr").count()) > 0,
    "history has measured jobs",
  );
  await page.reload({ waitUntil: "networkidle" });
  check(
    (await page.locator("tbody tr").count()) > 0,
    "history survives refresh",
  );
  for (const width of [360, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      "/",
      "/app",
      "/app/images",
      "/app/fonts",
      "/app/assets",
      "/app/audit",
      "/app/history",
      "/app/settings",
    ]) {
      await goto(path);
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `no page overflow at ${width}px: ${path}`,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await goto("/app/images");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "Workspace navigation" }).waitFor();
  await page.keyboard.press("Escape");
  check(
    !(await page.getByRole("dialog", { name: "Workspace navigation" }).count()),
    "mobile navigation opens and dismisses with Escape",
  );
  check(
    errors.length === 0,
    `no browser console/script errors: ${errors.join(" | ")}`,
  );
  check(
    unexpected.length === 0,
    `no failed HTTP responses: ${unexpected.join(" | ")}`,
  );
  console.log(
    `\n${count} browser checks passed. Chromium ${browser.version()}.`,
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
