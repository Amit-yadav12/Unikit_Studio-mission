import { PDFDocument } from "pdf-lib";
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import html2canvas from "html2canvas";

import {
  MAX_DOCUMENT_ARCHIVE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_PAGE_PIXELS,
  MAX_PPTX_SLIDES,
  MAX_PPTX_ENTRIES,
  MAX_PPTX_ENTRY_BYTES,
  MAX_PPTX_EXPANDED_BYTES,
  MAX_PPTX_MEDIA_BYTES,
  TARGET_RASTER_EDGE,
} from "./documentLimits";
import { assertDocumentSize, loadPptxArchive, readImageDimensions, safeBaseName } from "./documentValidation";
import type { SlideRaster } from "./pptxPackage";
import { assertCanvasBudget, makeResult, outputCanvas } from "./documentShared";

type Progress = (completed: number, total: number, label?: string) => void;

async function reencodeImage(bytes: Uint8Array, name: string): Promise<Uint8Array | null> {
  if (!/\.(png|jpe?g)$/i.test(name)) return null;
  const format = /\.png$/i.test(name) ? "png" : "jpeg";
  const dimensions = readImageDimensions(bytes, format);
  if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) return null;
  const blob = new Blob([bytes.slice().buffer], { type: format === "png" ? "image/png" : "image/jpeg" });
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) return null;
    const scale = Math.min(1, TARGET_RASTER_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: /\.png$/i.test(name) });
    if (!context) return null;
    if (/\.jpe?g$/i.test(name)) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); }
    context.drawImage(bitmap, 0, 0, width, height);
    const output = await outputCanvas(canvas, /\.png$/i.test(name) ? "png" : "jpeg", 0.82);
    canvas.width = 1; canvas.height = 1;
    return new Uint8Array(await output.arrayBuffer());
  } finally { bitmap.close(); }
}

export async function compressPptx(file: File, onProgress?: Progress) {
  const start = performance.now();
  assertDocumentSize(file);
  const input = new Uint8Array(await file.arrayBuffer());
  let archive: Awaited<ReturnType<typeof loadPptxArchive>> | undefined;
  const replacements = new Map<string, Uint8Array>();
  try {
    archive = await loadPptxArchive(file, input);
    if (archive.entries.some((entry) => entry.name.toLowerCase().includes("_xmlsignatures/"))) throw new Error("This presentation is digitally signed. Compression is refused because changing the package would invalidate its signature.");
    const notices = [...archive.notices];
    const media = archive.entries.filter((entry) => entry.name.toLowerCase().startsWith("ppt/media/"));
    let done = 0;
    for (const entry of media) {
      const original = await archive.zip.file(entry.name)!.async("uint8array");
      try {
        const optimized = await reencodeImage(original, entry.name);
        if (optimized && optimized.length < original.length) replacements.set(entry.name, optimized);
        else if (optimized && optimized.length > original.length) optimized.fill(0);
        else if (!optimized && /\.(png|jpe?g)$/i.test(entry.name)) notices.push(`Could not safely optimize embedded image “${entry.name.split("/").at(-1)}”; original content was retained.`);
      } catch {
        notices.push(`Could not decode embedded image “${entry.name.split("/").at(-1)}”; original content was retained.`);
      } finally { original.fill(0); }
      done += 1;
      onProgress?.(done, media.length || 1, `Checking embedded image ${done} of ${media.length}`);
    }
    if (replacements.size === 0) return makeResult(input.byteLength, input, `${safeBaseName(file.name)}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, { pagesOrSlides: archive.slideCount, keptOriginal: true, notices: [...notices, "No embedded raster image could be safely reduced; the original package is retained unchanged."] });
    notices.push("Optimized embedded images may be downscaled and JPEG images are re-encoded; inspect the presentation for visual changes.");
    for (const [name, bytes] of replacements) archive.zip.file(name, bytes);
    const output = await archive.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, streamFiles: true });
    if (output.byteLength > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("The optimized package exceeds the 50 MB archive safety limit.");
    const improved = output.byteLength < input.byteLength;
    return makeResult(input.byteLength, improved ? output : input, `${safeBaseName(file.name)}${improved ? "-optimized" : ""}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, {
      pagesOrSlides: archive.slideCount,
      keptOriginal: !improved,
      notices: [...notices, ...(improved ? [] : ["The optimized package was not smaller; the original presentation is retained unchanged."])],
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The optimization failed.";
    if (!archive || /digitally signed/.test(message)) throw cause;
    return makeResult(input.byteLength, input, `${safeBaseName(file.name)}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, {
      pagesOrSlides: archive?.slideCount,
      keptOriginal: true,
      notices: [`Optimization could not complete (${message}); the original presentation is retained unchanged.`],
    });
  } finally {
    input.fill(0);
    replacements.forEach((bytes) => bytes.fill(0));
    if (archive) for (const entry of archive.entries) archive.zip.remove(entry.name);
  }
}

function estimateSlideWarnings(slideXml: string[]): string[] {
  const notices = new Set<string>();
  if (slideXml.some((xml) => /<(?:\w+:)?(?:timing|transition)(?:\s|>)/i.test(xml))) notices.add("Animations and slide transitions are omitted from the static PDF.");
  if (slideXml.some((xml) => /<(?:\w+:)?(?:graphicFrame|oleObj|contentPart)(?:\s|>)/i.test(xml))) notices.add("Some embedded objects, tables or charts may be missing or simplified if the renderer does not support their specific OOXML features.");
  return [...notices];
}

export async function pptxToPdf(file: File, onProgress?: Progress) {
  const start = performance.now();
  assertDocumentSize(file);
  const source = new Uint8Array(await file.arrayBuffer());
  let archive: Awaited<ReturnType<typeof loadPptxArchive>>;
  try { archive = await loadPptxArchive(file, source); }
  catch (cause) { source.fill(0); throw cause; }
  if (archive.slideCount > MAX_PPTX_SLIDES) throw new Error(`PPTX-to-PDF conversion is limited to ${MAX_PPTX_SLIDES} slides.`);
  const parsedSlides = await Promise.all(archive.entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).map((entry) => archive.zip.file(entry.name)!.async("string")));
  const notices = [...new Set([...archive.notices, ...estimateSlideWarnings(parsedSlides)])];
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;height:900px;overflow:hidden;background:#fff;pointer-events:none;z-index:-1";
  document.body.appendChild(host);
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:1200px;height:900px;background:#fff;overflow:hidden";
  host.appendChild(container);
  let viewer: PptxViewer | undefined;
  const handles = [];
  const rasters: SlideRaster[] = [];
  let totalPixels = 0;
  try {
    viewer = new PptxViewer(container, {
      externalMedia: "block",
      zipLimits: {
        ...RECOMMENDED_ZIP_LIMITS,
        maxEntries: MAX_PPTX_ENTRIES,
        maxEntryUncompressedBytes: MAX_PPTX_ENTRY_BYTES,
        maxTotalUncompressedBytes: MAX_PPTX_EXPANDED_BYTES,
        maxMediaBytes: MAX_PPTX_MEDIA_BYTES,
        maxConcurrency: 2,
      },
      lazyMedia: true,
      lazySlides: true,
      width: 1200,
      fitMode: "contain",
      onNodeError: () => { if (!notices.includes("One or more PowerPoint elements could not be rendered; inspect the PDF for omissions.")) notices.push("One or more PowerPoint elements could not be rendered; inspect the PDF for omissions."); },
    });
    await viewer.open(source, { renderMode: "slide", lazyMedia: true, lazySlides: true });
    if (viewer.slideCount !== archive.slideCount || viewer.slideCount < 1) throw new Error("The presentation renderer could not reliably determine the slide sequence.");
    const slideWidth = viewer.slideWidth > 0 ? viewer.slideWidth : 1280;
    const slideHeight = viewer.slideHeight > 0 ? viewer.slideHeight : 720;
    const ratio = slideWidth / slideHeight;
    const width = Math.min(1600, Math.max(400, Math.round(Math.sqrt(MAX_PAGE_PIXELS * ratio))));
    const height = Math.max(1, Math.round(width / ratio));
    assertCanvasBudget(width, height, 0);
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    const pageWidthPoints = slideWidth * 72 / 96;
    const pageHeightPoints = slideHeight * 72 / 96;
    for (let index = 0; index < viewer.slideCount; index += 1) {
      container.replaceChildren();
      const handle = viewer.renderSlideToContainer(index, container, Math.min(width / viewer.slideWidth, height / viewer.slideHeight));
      if (!handle) throw new Error(`Could not render slide ${index + 1}.`);
      handles.push(handle);
      await handle.ready;
      const element = handle.element;
      const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: Math.min(1.5, width / Math.max(element.scrollWidth, 1)), useCORS: false, allowTaint: false, logging: false, foreignObjectRendering: false, imageTimeout: 5000 });
      assertCanvasBudget(canvas.width, canvas.height, totalPixels);
      totalPixels += canvas.width * canvas.height;
      const jpeg = await outputCanvas(canvas, "jpeg", 0.88);
      rasters.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), mime: "image/jpeg", width: canvas.width, height: canvas.height });
      canvas.width = 1; canvas.height = 1;
      handle.dispose();
      handles.pop();
      onProgress?.(index + 1, viewer.slideCount, `Rendering slide ${index + 1} of ${viewer.slideCount}`);
    }
    const pdf = await PDFDocument.create();
    for (const raster of rasters) {
      const image = await pdf.embedJpg(raster.bytes);
      const page = pdf.addPage([pageWidthPoints, pageHeightPoints]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidthPoints, height: pageHeightPoints });
    }
    const output = await pdf.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 40 });
    if (output.byteLength > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("The rendered PDF exceeds the 50 MB output safety limit.");
    return makeResult(source.byteLength, output, `${safeBaseName(file.name)}-visual.pdf`, "application/pdf", start, {
      pagesOrSlides: viewer.slideCount,
      notices: [...notices, "Static visual export only. Confirm fonts, charts, tables, SmartArt, embedded objects and page appearance in the downloaded PDF. External media is blocked and animations are not exported."],
    });
  } finally {
    handles.forEach((handle) => handle.dispose());
    viewer?.destroy();
    host.remove();
    rasters.forEach((raster) => { raster.bytes.fill(0); });
    for (const entry of archive.entries) archive.zip.remove(entry.name);
    source.fill(0);
  }
}

