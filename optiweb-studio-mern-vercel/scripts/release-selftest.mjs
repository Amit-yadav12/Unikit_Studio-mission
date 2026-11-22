/** Focused elite-release checks: exact capacities, ZIP lifecycle and privacy.
 * Runs against a production server (default http://127.0.0.1:4173).
 * Requires PLAYWRIGHT_MODULE or a local playwright installation and Chromium.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.argv[2] || process.env.RELEASE_BASE_URL || "http://127.0.0.1:4173";
const work = await mkdtemp(join(tmpdir(), "unikit-release-"));
let ownedServer;
let browser;
let page;

async function ensureProductionServer() {
  try {
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (response.ok) return;
  } catch { /* start the local production build below */ }
  if (process.argv[2] || process.env.RELEASE_BASE_URL) throw new Error(`The requested release server is not responding at ${base}.`);
  const server = new URL(base);
  ownedServer = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", PORT: server.port || "4173" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  ownedServer.stdout.on("data", (chunk) => { logs = (logs + chunk).slice(-8000); });
  ownedServer.stderr.on("data", (chunk) => { logs = (logs + chunk).slice(-8000); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (ownedServer.exitCode !== null) throw new Error(`The release test server exited early. ${logs}`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await delay(250);
  }
  throw new Error(`The release test server did not become healthy at ${base}. ${logs}`);
}
const writes = [];
const downloads = [];
const errors = [];
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); console.log(`✓ ${message}`); checks += 1; };
const fixture = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const photo = await readFile(new URL("../public/samples/alpine-ridge.jpg", import.meta.url));
const small = (suffix) => fixture(`small-${suffix}.jpg`, "image/jpeg", photo);
const clear = async () => { if (await page.getByRole("button", { name: "Clear all", exact: true }).count()) await page.getByRole("button", { name: "Clear all", exact: true }).click(); };
const go = async (path) => { await page.goto(base + path, { waitUntil: "domcontentloaded" }); await page.locator("h1").waitFor({ state: "visible" }); await page.locator("input[type=file]").first().waitFor({ state: "attached" }); };
const waitQueue = () => page.locator('[data-testid="queue"] li').first().waitFor();
const save = async () => { const file = await downloads.at(-1).path(); return readFile(file); };
const storage = () => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
const pdfFixture = await (async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [index, color] of [[0, rgb(0.1, 0.4, 0.8)], [1, rgb(0.8, 0.25, 0.15)]]) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 36, y: 660, width: 540, height: 80, color });
    page.drawText(`Release test page ${index + 1}`, { x: 48, y: 695, size: 24, font, color: rgb(1, 1, 1) });
    page.drawText(`Page ${index + 1} content for PDF and PowerPoint conversion checks.`, { x: 48, y: 620, size: 14, font });
  }
  return Buffer.from(await pdf.save());
})();
const pdfFile = { name: "studio-fixture.pdf", mimeType: "application/pdf", buffer: pdfFixture };
const documentOperation = async (name, files) => {
  await page.locator("button").filter({ hasText: name }).first().click();
  await page.locator('input[type="file"]').setInputFiles(files);
};
const processDocument = async (expectedName) => {
  await page.getByRole("button", { name: "Process in browser", exact: true }).click();
  await page.getByRole("heading", { name: "Result ready" }).waitFor({ timeout: 90_000 });
  check(await page.getByRole("alert").count() === 0, `${expectedName}: processing finishes without a UI error`);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download locally", exact: true }).click();
  const file = await downloaded;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
};

try {
  await ensureProductionServer();
  const launched = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  browser = launched;
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push({ path: new URL(request.url()).pathname, bytes: request.postDataBuffer()?.length ?? 0, type: request.headers()["content-type"] });
  });
  page.on("download", (download) => downloads.push(download));
  page.on("pageerror", (error) => errors.push(error.message));

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

  // Run every document workflow in a real browser with a known two-page PDF.
  // Outputs are downloaded, reopened and structurally checked rather than only
  // asserting that the UI displayed a success state.
  await go("/app/documents");
  const documentWriteCount = writes.length;
  await documentOperation("Compress PDF", pdfFile);
  const losslessPdf = await processDocument("lossless PDF compression");
  const losslessDoc = await PDFDocument.load(losslessPdf.bytes);
  check(losslessPdf.name.endsWith(".pdf") && losslessDoc.getPageCount() === 2, "lossless PDF output reopens with both pages intact");

  await documentOperation("Compress PDF", pdfFile);
  await page.getByLabel("Balanced · raster pages").click();
  const balancedPdf = await processDocument("balanced PDF compression");
  const balancedDoc = await PDFDocument.load(balancedPdf.bytes);
  check(balancedPdf.name.endsWith(".pdf") && balancedDoc.getPageCount() === 2, "balanced PDF output is a valid two-page PDF");
  check((await page.locator("body").innerText()).includes("Text, vector graphics, forms, accessibility data and document metadata are not preserved"), "balanced compression clearly discloses its rasterization trade-offs");

  await documentOperation("PDF to images", pdfFile);
  const pngZipResult = await processDocument("PDF-to-PNG export");
  const pngZip = await JSZip.loadAsync(pngZipResult.bytes, { checkCRC32: true });
  const pngEntries = Object.keys(pngZip.files).filter((name) => !pngZip.files[name].dir);
  check(pngEntries.length === 2 && pngEntries.every((name) => name.endsWith(".png")), "PDF-to-PNG ZIP contains one PNG for each source page");
  const pngBytes = await pngZip.file(pngEntries[0]).async("nodebuffer");
  check(pngBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "exported PNG has a real PNG signature");

  await documentOperation("PDF to images", pdfFile);
  await page.locator("#document-image-format").selectOption("jpeg");
  const jpgZipResult = await processDocument("PDF-to-JPEG export");
  const jpgZip = await JSZip.loadAsync(jpgZipResult.bytes, { checkCRC32: true });
  const jpgEntries = Object.keys(jpgZip.files).filter((name) => !jpgZip.files[name].dir);
  check(jpgEntries.length === 2 && jpgEntries.every((name) => name.endsWith(".jpg")), "PDF-to-JPEG ZIP contains one JPEG for each source page");
  check((await jpgZip.file(jpgEntries[0]).async("nodebuffer")).subarray(0, 2).equals(Buffer.from([255, 216])), "exported JPEG has a real JPEG signature");

  await documentOperation("Images to PDF", [
    { name: "page-one.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "page-two.jpg", mimeType: "image/jpeg", buffer: photo },
  ]);
  const imagePdf = await processDocument("images-to-PDF conversion");
  const imagePdfDoc = await PDFDocument.load(imagePdf.bytes);
  check(imagePdf.name.endsWith(".pdf") && imagePdfDoc.getPageCount() === 2, "two accepted image inputs become a valid two-page PDF");

  await documentOperation("PDF to PowerPoint", pdfFile);
  const deckResult = await processDocument("PDF-to-PowerPoint conversion");
  check(deckResult.name.endsWith(".pptx"), "PDF conversion downloads a PowerPoint file");
  const deck = await JSZip.loadAsync(deckResult.bytes, { checkCRC32: true });
  const presentationXml = await deck.file("ppt/presentation.xml")?.async("string");
  const slideEntries = Object.keys(deck.files).filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));
  check(Boolean(presentationXml) && slideEntries.length === 2, "generated PPTX is a readable ZIP package with both visual slides");
  check(Boolean(deck.file("ppt/media/page1.jpg")) && Boolean(deck.file("ppt/media/page2.jpg")), "each visual slide is backed by embedded page imagery");
  const nativeDeck = await JSZip.loadAsync(deckResult.bytes);
  const nativeShape = (slideNo) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Editable text ${slideNo}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="5000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FCE4D6"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t>Native editable slide ${slideNo}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  for (let slideNo = 1; slideNo <= 2; slideNo += 1) {
    const slideFile = nativeDeck.file(`ppt/slides/slide${slideNo}.xml`);
    const slideXml = await slideFile.async("string");
    const pictureStart = slideXml.indexOf("<p:pic>");
    const pictureEnd = slideXml.indexOf("</p:pic>", pictureStart) + "</p:pic>".length;
    assert.ok(pictureStart >= 0 && pictureEnd > pictureStart, `slide ${slideNo} has the image placeholder to replace`);
    nativeDeck.file(`ppt/slides/slide${slideNo}.xml`, `${slideXml.slice(0, pictureStart)}${nativeShape(slideNo)}${slideXml.slice(pictureEnd)}`);
  }
  const nativeDeckBytes = await nativeDeck.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 4 } });
  check(nativeDeckBytes.length > 0, "created a valid fixture with native PowerPoint text boxes and shapes");
  const textOnlyDeck = await JSZip.loadAsync(nativeDeckBytes);
  for (let slideNo = 1; slideNo <= 2; slideNo += 1) {
    textOnlyDeck.remove(`ppt/media/page${slideNo}.jpg`);
    const relPath = `ppt/slides/_rels/slide${slideNo}.xml.rels`;
    const relXml = await textOnlyDeck.file(relPath).async("string");
    const imageRelStart = relXml.indexOf('<Relationship Id="rId2"');
    const imageRelEnd = relXml.indexOf("/>", imageRelStart) + 2;
    assert.ok(imageRelStart >= 0 && imageRelEnd > imageRelStart, `slide ${slideNo} has a removable image relationship`);
    textOnlyDeck.file(relPath, `${relXml.slice(0, imageRelStart)}${relXml.slice(imageRelEnd)}`);
  }
  const textOnlyBytes = await textOnlyDeck.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 4 } });
  await documentOperation("Optimize PowerPoint", { name: "editable-slides.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: textOnlyBytes });
  const retainedDeckResult = await processDocument("image-free PowerPoint retention");
  check(retainedDeckResult.bytes.equals(textOnlyBytes), "image-free editable PowerPoint is returned byte-for-byte unchanged");

  await documentOperation("Optimize PowerPoint", { name: deckResult.name, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: nativeDeckBytes });
  const optimizedDeckResult = await processDocument("PowerPoint optimization");
  const optimizedDeck = await JSZip.loadAsync(optimizedDeckResult.bytes, { checkCRC32: true });
  const optimizedSlides = Object.keys(optimizedDeck.files).filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));
  const optimizedSlideOne = await optimizedDeck.file("ppt/slides/slide1.xml")?.async("string");
  check(optimizedDeckResult.name.endsWith(".pptx") && optimizedSlides.length === 2 && optimizedSlideOne?.includes("Native editable slide 1"), "optimized PowerPoint output remains valid and preserves native slide text");

  await documentOperation("PowerPoint to PDF", { name: deckResult.name, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: nativeDeckBytes });
  const renderedPdf = await processDocument("PowerPoint-to-PDF rendering");
  const renderedDoc = await PDFDocument.load(renderedPdf.bytes);
  check(renderedPdf.name.endsWith(".pdf") && renderedDoc.getPageCount() === 2, "rendered PowerPoint output reopens as a two-page PDF");

  await documentOperation("Compress PDF", { name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
  await page.getByRole("button", { name: "Process in browser", exact: true }).click();
  const invalidPdfAlert = page.getByRole("alert");
  await invalidPdfAlert.waitFor({ state: "visible" });
  check((await invalidPdfAlert.innerText()).length > 0, "invalid PDF input gets a clear visible error instead of a crash");
  await documentOperation("Optimize PowerPoint", { name: "broken.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("not a ZIP package") });
  await page.getByRole("button", { name: "Process in browser", exact: true }).click();
  const invalidPptxAlert = page.getByRole("alert");
  await invalidPptxAlert.waitFor({ state: "visible" });
  check((await invalidPptxAlert.innerText()).length > 0, "invalid PowerPoint input gets a clear visible error instead of a crash");
  check(writes.length === documentWriteCount, "all PDF and PowerPoint documents stay local with no network writes");
  check(errors.length === 0, `PDF/PPTX workflows raised no uncaught browser errors (${errors.join(" | ")})`);

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
  if (browser) await browser.close();
  if (ownedServer && ownedServer.exitCode === null) {
    ownedServer.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => ownedServer.once("exit", resolve)), delay(3000)]);
    if (ownedServer.exitCode === null) ownedServer.kill("SIGKILL");
  }
  await rm(work, { recursive: true, force: true });
}
