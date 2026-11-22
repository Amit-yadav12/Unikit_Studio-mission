import assert from "node:assert/strict";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { buildImageDeck, verifyImageDeck } from "../src/features/documents/pptxPackage.ts";
import { MAX_DOCUMENT_BYTES } from "../src/features/documents/documentLimits.ts";
import { assertDocumentSize, loadPptxArchive, readImageDimensions, readZipManifest, validateImageFile } from "../src/features/documents/documentValidation.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;

let passed = 0;
function test(name, operation) {
  try { operation(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
async function asyncTest(name, operation) {
  try { await operation(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function bytesFile(bytes, name = "fixture.pptx", type = "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
  return new File([bytes.slice().buffer], name, { type });
}

const tinyPng = new Uint8Array(24);
tinyPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
new DataView(tinyPng.buffer).setUint32(16, 640);
new DataView(tinyPng.buffer).setUint32(20, 480);

test("independent 15 MB document size guard", () => {
  assert.throws(() => assertDocumentSize({ name: "too-large.pdf", size: MAX_DOCUMENT_BYTES + 1 }), /15 MB/);
  assert.throws(() => assertDocumentSize({ name: "empty.pdf", size: 0 }), /non-empty/);
});
test("PNG signature and dimension checks use bytes, not filename alone", () => {
  assert.equal(validateImageFile(new File([tinyPng], "page.png", { type: "image/png" }), tinyPng), "png");
  assert.deepEqual(readImageDimensions(tinyPng, "png"), { width: 640, height: 480 });
  assert.throws(() => validateImageFile(new File([tinyPng], "fake.jpg", { type: "image/jpeg" }), tinyPng), /signature/);
});
test("PDF pages become distinct, verified visual slides in source order", async () => {
  const rasters = [
    { bytes: new Uint8Array([1, 2, 3]), mime: "image/png", width: 800, height: 1000 },
    { bytes: new Uint8Array([4, 5, 6]), mime: "image/jpeg", width: 800, height: 1000 },
  ];
  const deck = await buildImageDeck(rasters, 612, 792);
  await verifyImageDeck(deck, 2);
  const zip = await JSZip.loadAsync(deck, { checkCRC32: true });
  const presentation = await zip.file("ppt/presentation.xml").async("string");
  assert.equal((presentation.match(/<p:sldId\b/g) ?? []).length, 2);
  const first = await zip.file("ppt/slides/slide1.xml").async("string");
  const second = await zip.file("ppt/slides/slide2.xml").async("string");
  assert.match(first, /PDF page 1/);
  assert.match(second, /PDF page 2/);
  const image1 = await zip.file("ppt/media/page1.png").async("uint8array");
  const image2 = await zip.file("ppt/media/page2.jpg").async("uint8array");
  assert.deepEqual([...image1], [1, 2, 3]);
  assert.deepEqual([...image2], [4, 5, 6]);
});

let validDeck;
await asyncTest("generated PPTX passes package CRC, ZIP limits and OOXML relationship validation", async () => {
  validDeck = await buildImageDeck([{ bytes: tinyPng, mime: "image/png", width: 640, height: 480 }], 612, 792);
  const manifest = await readZipManifest(validDeck);
  assert.ok(manifest.length > 5);
  const archive = await loadPptxArchive(bytesFile(validDeck));
  assert.equal(archive.slideCount, 1);
  assert.ok(archive.zip.file("ppt/slides/slide1.xml"));
});
await asyncTest("rejects non-PPTX, legacy PPT and mismatched MIME", async () => {
  await assert.rejects(() => loadPptxArchive(new File([new Uint8Array([1, 2, 3])], "legacy.ppt")), /Legacy/);
  await assert.rejects(() => loadPptxArchive(new File([validDeck], "fake.pptx", { type: "application/pdf" })), /MIME/);
  await assert.rejects(() => loadPptxArchive(new File([new Uint8Array([1, 2, 3])], "not-a-deck.pptx")), /ZIP signature/);
});
await asyncTest("rejects OOXML relationships that escape the package root", async () => {
  const zip = await JSZip.loadAsync(validDeck);
  const rel = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
  zip.file("ppt/_rels/presentation.xml.rels", rel.replace("Target=\"slides/slide1.xml\"", "Target=\"../../../outside.xml\""));
  const malicious = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await assert.rejects(() => loadPptxArchive(bytesFile(malicious)), /escapes its package root/);
});
await asyncTest("rejects macro-enabled package paths", async () => {
  const zip = await JSZip.loadAsync(validDeck);
  zip.file("ppt/vbaProject.bin", new Uint8Array([1]));
  const macro = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await assert.rejects(() => loadPptxArchive(bytesFile(macro)), /Macro-enabled/);
});
await asyncTest("rejects an oversized expanded ZIP entry before inflation", async () => {
  const zip = await JSZip.loadAsync(validDeck);
  zip.file("ppt/media/large.bin", new Uint8Array([1]));
  const source = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const bytes = source.slice();
  const view = new DataView(bytes.buffer);
  let central = -1;
  for (let i = 0; i <= bytes.length - 4; i += 1) if (view.getUint32(i, true) === 0x02014b50) { central = i; break; }
  assert.notEqual(central, -1);
  const localOffset = view.getUint32(central + 42, true);
  view.setUint32(central + 24, 33 * 1024 * 1024, true);
  view.setUint32(localOffset + 22, 33 * 1024 * 1024, true);
  await assert.rejects(() => readZipManifest(bytes), /entry exceeds/);
});
await asyncTest("rejects XML entity declarations", async () => {
  const zip = await JSZip.loadAsync(validDeck);
  zip.file("ppt/slides/slide1.xml", `<!DOCTYPE x [<!ENTITY a "b">]><p:sld>&a;</p:sld>`);
  const xml = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await assert.rejects(() => loadPptxArchive(bytesFile(xml)), /entities/);
});

console.log(`${passed} document checks passed.`);
dom.window.close();
