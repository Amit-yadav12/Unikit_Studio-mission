/** Focused elite-release checks: exact capacities, ZIP lifecycle and privacy.
 * Runs against a production server (default http://127.0.0.1:4173).
 * Requires PLAYWRIGHT_MODULE or a local playwright installation and Chromium.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.argv[2] || "http://127.0.0.1:4173";
const work = await mkdtemp(join(tmpdir(), "unikit-release-"));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const writes = [];
const downloads = [];
const errors = [];
page.on("request", (request) => {
  if (!["GET", "HEAD"].includes(request.method())) writes.push({ path: new URL(request.url()).pathname, bytes: request.postDataBuffer()?.length ?? 0, type: request.headers()["content-type"] });
});
page.on("download", (download) => downloads.push(download));
page.on("pageerror", (error) => errors.push(error.message));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); console.log(`✓ ${message}`); checks += 1; };
const fixture = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const photo = await readFile(new URL("../public/samples/alpine-ridge.jpg", import.meta.url));
const small = (suffix) => fixture(`small-${suffix}.jpg`, "image/jpeg", photo);
const clear = async () => { if (await page.getByRole("button", { name: "Clear all", exact: true }).count()) await page.getByRole("button", { name: "Clear all", exact: true }).click(); };
const go = async (path) => { await page.goto(base + path, { waitUntil: "domcontentloaded" }); await page.locator("input[type=file]").first().waitFor(); };
const waitQueue = () => page.locator('[data-testid="queue"] li').first().waitFor();
const save = async () => { const file = await downloads.at(-1).path(); return readFile(file); };
const storage = () => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));

try {
  await go("/app/images");
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 6 }, (_, index) => small(index + 1)));
  await waitQueue();
  check(await page.locator('[data-testid="queue"] li').count() === 5, "six selections admit exactly five images");
  check((await page.locator("body").innerText()).includes("beyond 5 files in one queue"), "the sixth file has a visible batch-limit reason");
  await clear();

  const padded = Buffer.concat([photo, Buffer.alloc(4_200_000)]);
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 5 }, (_, index) => fixture(`padded-${index}.jpg`, "image/jpeg", padded)));
  await waitQueue();
  check(await page.locator('[data-testid="queue"] li').count() === 4, "21 MB of valid-sized files stops at the 20 MB aggregate boundary");
  check((await page.locator("body").innerText()).includes("beyond the 20 MB batch total"), "aggregate batch-byte rejection is explained");
  await clear();

  await page.locator('input[type="file"]').setInputFiles(fixture("over-5mb.jpg", "image/jpeg", Buffer.concat([photo, Buffer.alloc(5_100_000)])));
  await waitQueue();
  check((await page.locator('[data-testid="queue"]').innerText()).includes("larger than the 5 MB per-image limit"), "over-5 MB input remains visible with its exact rejection");
  await clear();

  await page.locator('input[type="file"]').setInputFiles([small("a"), small("b")]);
  await page.getByRole("button", { name: "Optimize 2 files", exact: true }).click();
  await page.getByRole("button", { name: "Download all (ZIP)", exact: true }).waitFor({ timeout: 60_000 });
  const downloadBefore = downloads.length;
  await page.getByRole("button", { name: "Download all (ZIP)", exact: true }).click();
  await page.locator('[data-testid="zip-progress"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="zip-progress"]')?.textContent.includes("Verified and downloaded"), { timeout: 30_000 });
  check(downloads.length === downloadBefore + 1, "Download All produces exactly one archive");
  const archive = await save("unikit-images.zip");
  const zip = await JSZip.loadAsync(archive);
  const entries = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  check(entries.length === 2 && entries.every((name) => name.endsWith(".webp")), "ZIP preserves both output names and WebP extensions");
  check(entries.every((name) => zip.file(name).name === name), "verified archive entries can be reopened");
  await page.getByRole("button", { name: /^Download .*small-a/ }).first().click();
  const single = await save("single.webp");
  const entryName = entries.find((name) => name.includes("small-a"));
  check(Buffer.from(await zip.file(entryName).async("nodebuffer")).equals(single), "ZIP bytes equal the corresponding individual download");
  check(writes.length === 0, "image processing and verified ZIP produce no file-bearing network writes");

  // Delay only ZIP completion, so the real cancellation control can be exercised.
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (options?.name !== "unikit-zip-worker") return new NativeWorker(url, options);
        this.inner = new NativeWorker(url, options);
        this.inner.onmessage = (event) => {
          if (event.data.type === "done") setTimeout(() => this.onmessage?.(event), 1_500);
          else this.onmessage?.(event);
        };
        this.inner.onerror = (event) => this.onerror?.(event);
      }
      postMessage(message) { this.inner.postMessage(message); }
      terminate() { this.inner.terminate(); }
      addEventListener(...args) { this.inner.addEventListener(...args); }
    };
  });
  const cancelledBefore = downloads.length;
  await page.getByRole("button", { name: "Download all (ZIP)", exact: true }).click();
  await page.getByRole("button", { name: "Cancel ZIP", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel ZIP", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="zip-progress"]')?.textContent.includes("cancelled"));
  await page.waitForTimeout(1_800);
  check(downloads.length === cancelledBefore, "cancelling ZIP terminates the worker without a late download");
  const state = await storage();
  check(state.local.length === 0 && state.session.length === 0, "processing writes no localStorage or sessionStorage entries");

  await go("/app/fonts");
  await page.locator('#css-editor').fill('@font-face{font-family:Studio;src:url(/studio.woff2)}');
  await page.getByRole("button", { name: "Apply font-display", exact: true }).click();
  await page.getByRole("heading", { name: "Before and after" }).waitFor();
  const cssDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSS", exact: true }).click();
  const cssFile = await cssDownload;
  check((await readFile(await cssFile.path())).toString().includes("font-display:swap"), "font optimizer downloads actual patched CSS");
  await page.locator('input[type="file"]').setInputFiles(fixture("oversize.css", "text/css", Buffer.alloc(500 * 1024 + 1, 65)));
  await page.waitForFunction(() => document.body.innerText.includes("File too large"));
  check(true, "CSS over 500 KB is rejected without parsing or upload");
  check((await storage()).session.length === 0, "CSS editing never writes a sessionStorage draft");

  await go("/app/assets");
  await page.locator('input[type="file"]').setInputFiles([small("asset-a"), small("asset-b"), small("asset-c"), small("asset-d"), small("asset-e"), small("asset-f")]);
  await page.locator('[data-testid="asset-results"]').waitFor();
  check(await page.locator('[data-testid="asset-results"] article').count() === 5, "Asset Analyzer inspects at most five files per batch");
  check((await page.locator("body").innerText()).includes("1 file was left out"), "the sixth analysis file is explicitly excluded");
  check(writes.every((entry) => entry.path === "/api/v1/audits" || entry.bytes < 1024), "no workflow sends image, CSS, ZIP, filename or savings data to the backend");
  check(errors.length === 0, `no browser script errors (${errors.join(" | ")})`);

  for (const width of [360, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/app/images", "/app/documents", "/app/fonts", "/app/assets", "/app/audit", "/app/settings"]) {
      await page.goto(base + path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("h1");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} has no horizontal overflow at ${width}px`);
    }
  }
  console.log(`\n${checks} elite release checks passed.`);
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
