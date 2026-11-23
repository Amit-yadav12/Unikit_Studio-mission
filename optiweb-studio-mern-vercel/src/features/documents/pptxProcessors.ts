import { PDFDocument } from "pdf-lib";
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import html2canvas from "html2canvas";

import type { DocumentCompressionMode, PowerPointPdfMode } from "./documentLimits";
import {
  MAX_DOCUMENT_ARCHIVE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_PAGE_PIXELS,
  MAX_PPTX_SLIDES,
  MAX_PPTX_ENTRIES,
  MAX_PPTX_ENTRY_BYTES,
  MAX_PPTX_EXPANDED_BYTES,
  MAX_PPTX_MEDIA_BYTES,
  MAX_TOTAL_RENDER_PIXELS,
  TARGET_RASTER_EDGE,
} from "./documentLimits";
import { assertDocumentSize, loadPptxArchive, readImageDimensions, safeBaseName } from "./documentValidation";
import type { SlideRaster } from "./pptxPackage";
import { assertCanvasBudget, makeResult, outputCanvas } from "./documentShared";

type Progress = (completed: number, total: number, label?: string) => void;
const MAX_PPTX_PDF_RASTER_EDGE = 4_200;

async function reencodeImage(bytes: Uint8Array, name: string, maxEdge = TARGET_RASTER_EDGE, jpegQuality = 0.82): Promise<Uint8Array | null> {
  if (!/\.(png|jpe?g)$/i.test(name)) return null;
  const format = /\.png$/i.test(name) ? "png" : "jpeg";
  const dimensions = readImageDimensions(bytes, format);
  if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) return null;
  const blob = new Blob([bytes.slice().buffer], { type: format === "png" ? "image/png" : "image/jpeg" });
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) return null;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: /\.png$/i.test(name) });
    if (!context) return null;
    if (/\.jpe?g$/i.test(name)) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); }
    context.drawImage(bitmap, 0, 0, width, height);
    const output = await outputCanvas(canvas, /\.png$/i.test(name) ? "png" : "jpeg", jpegQuality);
    canvas.width = 1; canvas.height = 1;
    return new Uint8Array(await output.arrayBuffer());
  } finally { bitmap.close(); }
}

export async function compressPptx(file: File, mode: DocumentCompressionMode = "balanced", onProgress?: Progress) {
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
    let fallbackImageCount = 0;
    const imageLevels = mode === "small"
      ? { jpeg: [{ maxEdge: 1_900, quality: 0.62 }, { maxEdge: 1_500, quality: 0.48 }, { maxEdge: 1_200, quality: 0.36 }], png: [{ maxEdge: 2_400, quality: 0.82 }, { maxEdge: 1_800, quality: 0.82 }, { maxEdge: 1_400, quality: 0.82 }] }
      : { jpeg: [{ maxEdge: TARGET_RASTER_EDGE, quality: 0.82 }, { maxEdge: 2_400, quality: 0.68 }, { maxEdge: 1_800, quality: 0.56 }], png: [{ maxEdge: TARGET_RASTER_EDGE, quality: 0.82 }, { maxEdge: 2_200, quality: 0.82 }, { maxEdge: 1_600, quality: 0.82 }] };
    for (const entry of (mode === "lossless" ? [] : media)) {
      const original = await archive.zip.file(entry.name)!.async("uint8array");
      try {
        if (/\.(png|jpe?g)$/i.test(entry.name)) {
          const isJpeg = /\.jpe?g$/i.test(entry.name);
          const levels = isJpeg ? imageLevels.jpeg : imageLevels.png;
          let selected: Uint8Array | undefined;
          for (let level = 0; level < levels.length; level += 1) {
            const candidate = await reencodeImage(original, entry.name, levels[level].maxEdge, levels[level].quality);
            if (!candidate) break;
            if (candidate.length < original.length) {
              selected = candidate;
              if (level > 0) fallbackImageCount += 1;
              break;
            }
            candidate.fill(0);
          }
          if (selected) replacements.set(entry.name, selected);
          else notices.push(`Embedded image “${entry.name.split("/").at(-1)}” could not be made smaller at the safe quality settings; it was retained unchanged.`);
        }
      } catch {
        notices.push(`Could not decode embedded image “${entry.name.split("/").at(-1)}”; original content was retained.`);
      } finally { original.fill(0); }
      done += 1;
      onProgress?.(done, media.length || 1, `Checking embedded image ${done} of ${media.length}`);
    }
    if (mode !== "lossless" && replacements.size === 0) return makeResult(input.byteLength, input, `${safeBaseName(file.name)}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, { pagesOrSlides: archive.slideCount, keptOriginal: true, notices: [...notices, "No supported embedded raster image could be reduced within the selected quality and resolution settings. The original PowerPoint is retained unchanged."] });
    if (fallbackImageCount) notices.push(`${fallbackImageCount} embedded image${fallbackImageCount === 1 ? "" : "s"} needed stronger downsampling or JPEG compression to reduce the presentation size; review the slides for visual changes.`);
    if (mode !== "lossless") notices.push("Optimized embedded images may be downscaled and JPEG images are re-encoded; inspect the presentation for visual changes.");
    for (const [name, bytes] of replacements) archive.zip.file(name, bytes);
    const output = await archive.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, streamFiles: true });
    if (output.byteLength > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("The optimized package exceeds the 50 MB archive safety limit.");
    const improved = output.byteLength < input.byteLength;
    return makeResult(input.byteLength, improved ? output : input, `${safeBaseName(file.name)}${improved ? "-optimized" : ""}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation", start, {
      pagesOrSlides: archive.slideCount,
      keptOriginal: !improved,
      notices: [...notices, ...(mode === "lossless" ? ["Lossless mode leaves every embedded image byte unchanged and only rebuilds the ZIP package."] : []), ...(improved ? [] : [mode === "lossless" ? "The lossless package rewrite was not smaller; the original presentation is retained unchanged." : "The optimized package was not smaller; the original presentation is retained unchanged."])],
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

export async function pptxToPdf(file: File, mode: PowerPointPdfMode = "balanced", onProgress?: Progress) {
  const start = performance.now();
  assertDocumentSize(file);
  const source = new Uint8Array(await file.arrayBuffer());
  let archive: Awaited<ReturnType<typeof loadPptxArchive>>;
  try { archive = await loadPptxArchive(file, source); }
  catch (cause) { source.fill(0); throw cause; }
  if (archive.slideCount > MAX_PPTX_SLIDES) {
    for (const entry of archive.entries) archive.zip.remove(entry.name);
    source.fill(0);
    throw new Error(`PPTX-to-PDF conversion is limited to ${MAX_PPTX_SLIDES} slides.`);
  }
  const parsedSlides = await Promise.all(archive.entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).map((entry) => archive.zip.file(entry.name)!.async("string")));
  const notices = [...new Set([...archive.notices, ...estimateSlideWarnings(parsedSlides)])];
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:960px;height:720px;overflow:visible;background:#fff;pointer-events:none;z-index:-1";
  document.body.appendChild(host);
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:960px;height:720px;background:#fff;overflow:visible";
  host.appendChild(container);
  let viewer: PptxViewer | undefined;
  let renderingSlide = 0;
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
      onNodeError: (_nodeId, error) => {
        const detail = error instanceof Error ? ` (${error.message})` : "";
        const notice = `Slide ${renderingSlide + 1} contains an element the renderer could not reproduce${detail}; inspect this slide in the output.`;
        if (!notices.includes(notice)) notices.push(notice);
      },
    });
    await viewer.open(source, { renderMode: "slide", lazyMedia: true, lazySlides: true });
    if (viewer.slideCount !== archive.slideCount || viewer.slideCount < 1) throw new Error("The presentation renderer could not reliably determine the slide sequence.");
    const slideWidth = Number.isFinite(viewer.slideWidth) && viewer.slideWidth > 0 ? viewer.slideWidth : 1280;
    const slideHeight = Number.isFinite(viewer.slideHeight) && viewer.slideHeight > 0 ? viewer.slideHeight : 720;
    const ratio = slideWidth / slideHeight;
    const requestedDpi = mode === "maximum" ? 300 : mode === "small" ? 150 : 220;
    const requestedScale = requestedDpi / 96;
    const rasterScale = Math.min(requestedScale, MAX_PPTX_PDF_RASTER_EDGE / Math.max(slideWidth, slideHeight), Math.sqrt(MAX_PAGE_PIXELS / (slideWidth * slideHeight)), Math.sqrt(MAX_TOTAL_RENDER_PIXELS / (viewer.slideCount * slideWidth * slideHeight)));
    const expectedWidth = Math.ceil(slideWidth * rasterScale);
    const expectedHeight = Math.ceil(slideHeight * rasterScale);
    assertCanvasBudget(expectedWidth, expectedHeight, 0);
    host.style.width = `${slideWidth}px`;
    host.style.height = `${slideHeight}px`;
    container.style.width = `${slideWidth}px`;
    container.style.height = `${slideHeight}px`;
    const pageWidthPoints = slideWidth * 72 / 96;
    const pageHeightPoints = slideHeight * 72 / 96;
    for (let index = 0; index < viewer.slideCount; index += 1) {
      renderingSlide = index;
      container.replaceChildren();
      // Render at the deck's native CSS dimensions, then rasterize to the chosen
      // output resolution. Scaling the DOM before html2canvas can clip or double-
      // scale slides in some browser/layout combinations.
      const handle = viewer.renderSlideToContainer(index, container);
      if (!handle) throw new Error(`Could not render slide ${index + 1}.`);
      handles.push(handle);
      await handle.ready;
      const element = handle.element;
      const slideImages = Array.from(element.querySelectorAll("img"));
      await Promise.all(slideImages.map((image) => image.decode().catch(() => undefined)));
      const brokenImages = slideImages.filter((image) => !image.complete || image.naturalWidth === 0);
      if (brokenImages.length) throw new Error(`Slide ${index + 1} has ${brokenImages.length} image(s) that could not be decoded; no partial PDF was created. Check the embedded media in the presentation.`);
      if (typeof document.fonts !== "undefined") await document.fonts.ready;
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: rasterScale,
        width: slideWidth,
        height: slideHeight,
        windowWidth: Math.ceil(slideWidth),
        windowHeight: Math.ceil(slideHeight),
        x: 0,
        y: 0,
        useCORS: false,
        allowTaint: false,
        logging: false,
        foreignObjectRendering: false,
        imageTimeout: 5000,
      });
      const capturedRatio = canvas.width / Math.max(canvas.height, 1);
      if (Math.abs(capturedRatio / ratio - 1) > 0.01 || canvas.width < expectedWidth * 0.98 || canvas.height < expectedHeight * 0.98) {
        canvas.width = 1;
        canvas.height = 1;
        throw new Error(`Slide ${index + 1} was not captured at its full ${slideWidth} × ${slideHeight} layout. Retry in a supported browser; no partial PDF was created.`);
      }
      assertCanvasBudget(canvas.width, canvas.height, totalPixels);
      totalPixels += canvas.width * canvas.height;
      const jpegQuality = mode === "maximum" ? 0.96 : mode === "small" ? 0.78 : 0.9;
      const jpeg = await outputCanvas(canvas, "jpeg", jpegQuality);
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
    return makeResult(source.byteLength, output, `${safeBaseName(file.name)}-visual-${mode}.pdf`, "application/pdf", start, {
      pagesOrSlides: viewer.slideCount,
      notices: [...notices, `Static visual export only: slide artwork is rasterized at up to ${Math.round(rasterScale * 96)} DPI (requested ${requestedDpi} DPI; browser canvas and memory limits may reduce this). Text is not selectable/searchable, and vector content, notes, animations, transitions and accessibility structure are not preserved. Confirm fonts, charts, tables, SmartArt, embedded objects and page appearance in the downloaded PDF. External media is blocked.`, ...(mode === "small" ? ["Smaller-file mode uses a lower raster resolution and JPEG quality, which can soften fine text and details."] : [])],
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

