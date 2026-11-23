import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import JSZip from "jszip";

import type { DocumentCompressionMode } from "./documentLimits";
import {
  MAX_DOCUMENT_ARCHIVE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_PDF_PAGES,
  MAX_PDF_RENDER_PAGES,
  TARGET_RASTER_EDGE,
} from "./documentLimits";
import { buildImageDeck, verifyImageDeck, type SlideRaster } from "./pptxPackage";
import { readImageDimensions, safeBaseName, validateImagesToPdf, validatePdfFile } from "./documentValidation";
import { assertCanvasBudget, makeResult, outputCanvas } from "./documentShared";

// pdfjs 6 uses a module worker; bundling it keeps conversion completely offline.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Progress = (completed: number, total: number, label?: string) => void;

function hasPdfSignatureField(bytes: Uint8Array): boolean {
  const body = new TextDecoder("latin1").decode(bytes);
  return /\/ByteRange\s*\[|\/FT\s*\/Sig|\/Type\s*\/Sig/.test(body);
}

async function loadPdf(file: File) {
  const bytes = await validatePdfFile(file);
  let task: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
    task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, useSystemFonts: false, stopAtErrors: false });
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > MAX_PDF_PAGES) {
      await task.destroy();
      throw new Error(`PDFs must contain 1–${MAX_PDF_PAGES} pages.`);
    }
    return { bytes, task, doc };
  } catch (error) {
    await task?.destroy().catch(() => undefined);
    bytes.fill(0);
    if (error instanceof Error && /password/i.test(error.message)) throw new Error("Password-protected PDFs are not supported.");
    throw error;
  }
}

function targetScale(width: number, height: number, target = TARGET_RASTER_EDGE): number {
  return Math.min(2.5, target / Math.max(width, height));
}

async function renderBalancedPdf(doc: Awaited<ReturnType<typeof loadPdf>>["doc"], quality: { maxEdge: number; jpegQuality: number }, onProgress?: Progress): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  let renderedPixels = 0;
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetScale(base.width, base.height, quality.maxEdge) });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    assertCanvasBudget(width, height, renderedPixels);
    renderedPixels += width * height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    await page.render({ canvas, canvasContext: context, viewport, background: "#ffffff", intent: "print" }).promise;
    const jpeg = await outputCanvas(canvas, "jpeg", quality.jpegQuality);
    const embedded = await out.embedJpg(await jpeg.arrayBuffer());
    const outputPage = out.addPage([base.width, base.height]);
    outputPage.drawImage(embedded, { x: 0, y: 0, width: base.width, height: base.height });
    canvas.width = 1;
    canvas.height = 1;
    page.cleanup();
    onProgress?.(pageNo, doc.numPages, `Rendering page ${pageNo} of ${doc.numPages}`);
  }
  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function compressPdf(file: File, mode: DocumentCompressionMode, onProgress?: Progress) {
  const start = performance.now();
  const { bytes, task, doc } = await loadPdf(file);
  try {
    if (hasPdfSignatureField(bytes)) return makeResult(bytes.byteLength, bytes, `${safeBaseName(file.name)}.pdf`, "application/pdf", start, { pagesOrSlides: doc.numPages, keptOriginal: true, notices: ["This PDF appears to contain a digital signature; optimization is skipped so the signed original remains unchanged."] });
    if (mode === "lossless") {
      const input = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      const output = await input.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 40, updateFieldAppearances: false });
      onProgress?.(1, 1, "Rebuilding the PDF structure");
      const smaller = output.byteLength < bytes.byteLength;
      const resultBytes = smaller ? output : bytes;
      return makeResult(bytes.byteLength, resultBytes, `${safeBaseName(file.name)}${smaller ? "-optimized" : ""}.pdf`, "application/pdf", start, {
        pagesOrSlides: doc.numPages,
        keptOriginal: !smaller,
        notices: smaller ? [] : ["The lossless rewrite did not make this PDF smaller; the original is retained unchanged."],
      });
    }
    if (doc.numPages > MAX_PDF_RENDER_PAGES) throw new Error(`Balanced compression is limited to ${MAX_PDF_RENDER_PAGES} pages to protect browser memory. Try lossless compression instead.`);
    const qualityLevels = mode === "small"
      ? [{ maxEdge: 1_600, jpegQuality: 0.62 }, { maxEdge: 1_300, jpegQuality: 0.5 }, { maxEdge: 1_000, jpegQuality: 0.38 }]
      : [{ maxEdge: 2_200, jpegQuality: 0.78 }, { maxEdge: 1_800, jpegQuality: 0.68 }, { maxEdge: 1_400, jpegQuality: 0.56 }];
    let output: Uint8Array | undefined;
    let selectedQuality: (typeof qualityLevels)[number] | undefined;
    for (const quality of qualityLevels) {
      const candidate = await renderBalancedPdf(doc, quality, onProgress);
      if (candidate.byteLength < bytes.byteLength && candidate.byteLength <= MAX_DOCUMENT_ARCHIVE_BYTES) {
        output = candidate;
        selectedQuality = quality;
        break;
      }
      candidate.fill(0);
    }
    const smaller = Boolean(output && selectedQuality);
    const modeLabel = mode === "small" ? "Smaller-file" : "Balanced";
    const notices = [
      `${modeLabel} compression rasterizes each page to JPEG. Text, vector graphics, forms, accessibility data and document metadata are not preserved.`,
      ...(smaller && selectedQuality!.maxEdge < qualityLevels[0].maxEdge ? [`A lower raster resolution (${selectedQuality!.maxEdge}px maximum edge, JPEG quality ${Math.round(selectedQuality!.jpegQuality * 100)}%) was needed to make this file smaller.`] : []),
      ...(!smaller ? ["Compression could not make this already compact or image-optimized PDF smaller within the safe quality and output limits, so the original is retained unchanged."] : []),
    ];
    const result = makeResult(bytes.byteLength, output ?? bytes, `${safeBaseName(file.name)}${smaller ? mode === "small" ? "-small" : "-balanced" : ""}.pdf`, "application/pdf", start, {
      pagesOrSlides: doc.numPages,
      keptOriginal: !smaller,
      notices,
    });
    output?.fill(0);
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The optimization failed.";
    return makeResult(bytes.byteLength, bytes, `${safeBaseName(file.name)}.pdf`, "application/pdf", start, {
      pagesOrSlides: doc.numPages,
      keptOriginal: true,
      notices: [`Optimization could not complete (${message}); the original PDF is retained unchanged.`],
    });
  } finally {
    await task.destroy().catch(() => undefined);
    bytes.fill(0);
  }
}

export async function pdfToImages(file: File, format: "png" | "jpeg", onProgress?: Progress) {
  const start = performance.now();
  const { bytes, task, doc } = await loadPdf(file);
  const files = [];
  let outputBytes = 0;
  let pixels = 0;
  try {
    if (doc.numPages > MAX_PDF_RENDER_PAGES) throw new Error(`Image export is limited to ${MAX_PDF_RENDER_PAGES} pages to protect browser memory.`);
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetScale(base.width, base.height) });
      assertCanvasBudget(Math.ceil(viewport.width), Math.ceil(viewport.height), pixels);
      pixels += Math.ceil(viewport.width) * Math.ceil(viewport.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: format === "png" });
      if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
      if (format === "jpeg") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvas, canvasContext: context, viewport, background: format === "jpeg" ? "#ffffff" : undefined }).promise;
      const blob = await outputCanvas(canvas, format, 0.9);
      outputBytes += blob.size;
      if (outputBytes > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("PDF page images exceed the 50 MB archive safety limit.");
      files.push({ name: `${safeBaseName(file.name)}-page-${String(pageNo).padStart(3, "0")}.${format === "jpeg" ? "jpg" : "png"}`, blob });
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
      onProgress?.(pageNo, doc.numPages, `Rendering page ${pageNo} of ${doc.numPages}`);
    }
  } finally { await task.destroy().catch(() => undefined); bytes.fill(0); }
  const zip = new JSZip();
  for (const entry of files) zip.file(entry.name, entry.blob);
  const zipped = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 4 } });
  if (zipped.byteLength > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("The generated image ZIP exceeds the 50 MB archive safety limit.");
  const result = makeResult(bytes.byteLength, zipped, `${safeBaseName(file.name)}-pages.zip`, "application/zip", start, { pagesOrSlides: doc.numPages });
  zipped.fill(0);
  files.length = 0;
  return result;
}

export async function imagesToPdf(files: readonly File[], onProgress?: Progress) {
  const start = performance.now();
  const input = await validateImagesToPdf(files);
  try {
  const out = await PDFDocument.create();
  let totalPixels = 0;
  for (let index = 0; index < input.length; index += 1) {
    const { bytes, format, file } = input[index];
    const dimensions = readImageDimensions(bytes, format);
    if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw new Error(`${file.name}: image dimensions are invalid or exceed the safe pixel limit.`);
    let image = format === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    if (image.width !== dimensions.width || image.height !== dimensions.height) throw new Error(`${file.name}: the decoded image dimensions did not match the file header.`);
    totalPixels += image.width * image.height;
    if (totalPixels > 80_000_000) throw new Error("The selected images exceed the combined pixel-memory limit.");
    const page = out.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    image = undefined as never;
    onProgress?.(index + 1, input.length, `Adding image ${index + 1} of ${input.length}`);
  }
  const result = await out.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 40 });
  return makeResult(input.reduce((n, item) => n + item.bytes.length, 0), result, `${safeBaseName(files[0]?.name ?? "images")}-combined.pdf`, "application/pdf", start, { pagesOrSlides: input.length });
  } finally { input.forEach((item) => item.bytes.fill(0)); }
}

export async function pdfToPptx(file: File, onProgress?: Progress) {
  const start = performance.now();
  const { bytes, task, doc } = await loadPdf(file);
  const rasters: SlideRaster[] = [];
  try {
    if (doc.numPages > 80) throw new Error("PDF-to-PowerPoint conversion is limited to 80 pages to keep the generated deck within the 50 MB archive limit.");
    let pixels = 0;
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetScale(base.width, base.height, 2000) });
      assertCanvasBudget(Math.ceil(viewport.width), Math.ceil(viewport.height), pixels);
      pixels += Math.ceil(viewport.width) * Math.ceil(viewport.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport, background: "#ffffff" }).promise;
      const blob = await outputCanvas(canvas, "jpeg", 0.9);
      rasters.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg", width: canvas.width, height: canvas.height });
      canvas.width = 1; canvas.height = 1;
      page.cleanup();
      onProgress?.(pageNo, doc.numPages, `Rendering PDF page ${pageNo} of ${doc.numPages}`);
    }
    const first = await doc.getPage(1);
    const size = first.getViewport({ scale: 1 });
    const output = await buildImageDeck(rasters, size.width, size.height, onProgress ? (n, total) => onProgress(n, total, `Building slide ${n} of ${total}`) : undefined);
    await verifyImageDeck(output, doc.numPages);
    return makeResult(bytes.byteLength, output, `${safeBaseName(file.name)}-visual-slides.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, {
      pagesOrSlides: doc.numPages,
      notices: ["Visual conversion only: each PDF page is a full-slide image, not editable PowerPoint text or objects."],
    });
  } finally {
    await task.destroy().catch(() => undefined);
    bytes.fill(0);
    rasters.forEach((raster) => raster.bytes.fill(0));
  }
}

