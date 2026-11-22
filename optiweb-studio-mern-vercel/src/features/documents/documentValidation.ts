import JSZip from "jszip";

import {
  MAX_DOCUMENT_BYTES,
  MAX_PPTX_ENTRIES,
  MAX_PPTX_ENTRY_BYTES,
  MAX_PPTX_EXPANSION_RATIO,
  MAX_PPTX_EXPANDED_BYTES,
  MAX_PPTX_MEDIA_BYTES,
  MAX_IMAGE_PIXELS,
} from "./documentLimits";

export type ArchiveEntry = {
  name: string;
  compressedBytes: number;
  expandedBytes: number;
  method: number;
};

export type PptxArchive = {
  zip: JSZip;
  entries: ArchiveEntry[];
  slideCount: number;
  notices: string[];
};

const encoder = new TextEncoder();

export function safeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 72);
  return base || "document";
}

export function assertDocumentSize(file: Pick<File, "name" | "size">): void {
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose a non-empty document.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("PDF and PowerPoint files are limited to 15 MB each.");
}

export async function validatePdfFile(file: File): Promise<Uint8Array> {
  assertDocumentSize(file);
  if (!/\.pdf$/i.test(file.name)) throw new Error("Choose a .pdf file.");
  if (file.type && file.type !== "application/pdf" && file.type !== "application/octet-stream") {
    throw new Error("The selected file's MIME type does not match a PDF.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, 8));
  if (!header.startsWith("%PDF-")) throw new Error("This file does not have a valid PDF signature.");
  return bytes;
}

export function readImageDimensions(bytes: Uint8Array, format: "png" | "jpeg"): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let cursor = 2;
  while (cursor + 4 < bytes.length) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    while (bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) return null;
    const length = view.getUint16(cursor);
    if (length < 2 || cursor + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return { height: view.getUint16(cursor + 3), width: view.getUint16(cursor + 5) };
    }
    if (marker === 0xda) return null;
    cursor += length;
  }
  return null;
}

export function validateImageFile(file: File, bytes: Uint8Array): "png" | "jpeg" {
  if (!/\.(png|jpe?g)$/i.test(file.name)) throw new Error(`${file.name}: choose a PNG or JPEG image.`);
  if (bytes.length < 12) throw new Error(`${file.name}: the image is incomplete.`);
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const ext = file.name.toLowerCase().split(".").at(-1);
  if (png && ext === "png" && (!file.type || file.type === "image/png" || file.type === "application/octet-stream")) return "png";
  if (jpeg && (ext === "jpg" || ext === "jpeg") && (!file.type || file.type === "image/jpeg" || file.type === "application/octet-stream")) return "jpeg";
  throw new Error(`${file.name}: the file signature, extension, and MIME type must agree for PNG or JPEG.`);
}

export async function readZipManifest(bytes: Uint8Array): Promise<ArchiveEntry[]> {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("PowerPoint files are limited to 15 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdSignature = 0x06054b50;
  const start = Math.max(0, bytes.byteLength - 65_557);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === eocdSignature) {
      const commentLength = view.getUint16(i + 20, true);
      if (i + 22 + commentLength === bytes.byteLength) { eocd = i; break; }
    }
  }
  if (eocd < 0) throw new Error("This is not a complete OOXML ZIP package.");
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) throw new Error("Split or multi-disk ZIP packages are not supported.");
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralBytes = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (diskEntries !== entryCount || entryCount === 0 || entryCount > MAX_PPTX_ENTRIES) throw new Error(`PowerPoint packages must contain 1–${MAX_PPTX_ENTRIES.toLocaleString()} entries.`);
  if (entryCount === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 PowerPoint packages are not supported within the 15 MB document limit.");
  if (centralOffset + centralBytes > eocd || centralOffset + 4 > bytes.byteLength) throw new Error("The PowerPoint ZIP directory is malformed.");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  let totalExpanded = 0;
  let totalMedia = 0;
  const localRanges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The PowerPoint ZIP directory contains a malformed entry.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const expandedBytes = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > centralOffset + centralBytes) throw new Error("The PowerPoint ZIP directory is truncated.");
    if (compressedBytes === 0xffffffff || expandedBytes === 0xffffffff || localOffset === 0xffffffff) throw new Error("ZIP64 entries are not supported in PowerPoint documents.");
    if (flags & 0x0001) throw new Error("Encrypted PowerPoint packages are not supported.");
    if (method !== 0 && method !== 8) throw new Error("This PowerPoint package uses an unsupported ZIP compression method.");
    let name: string;
    try { name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new Error("The PowerPoint package contains an invalid filename encoding."); }
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || name.includes("\0") || /^[a-z]:/i.test(name)) throw new Error("The PowerPoint package contains an unsafe archive path.");
    if (name.endsWith("/") && (compressedBytes !== 0 || expandedBytes !== 0)) throw new Error("Directory entries must not contain data.");
    const localStart = localOffset;
    if (localStart + 30 > centralOffset || view.getUint32(localStart, true) !== 0x04034b50) throw new Error("The PowerPoint package contains an invalid local ZIP header.");
    const localFlags = view.getUint16(localStart + 6, true);
    const localMethod = view.getUint16(localStart + 8, true);
    const localNameLength = view.getUint16(localStart + 26, true);
    const localExtraLength = view.getUint16(localStart + 28, true);
    const localCompressedBytes = view.getUint32(localStart + 18, true);
    const localExpandedBytes = view.getUint32(localStart + 22, true);
    const dataStart = localStart + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedBytes;
    const usesDataDescriptor = (flags & 0x0008) !== 0;
    if (localFlags !== flags || localMethod !== method || dataEnd > centralOffset || dataEnd < dataStart || (!usesDataDescriptor && (localCompressedBytes !== compressedBytes || localExpandedBytes !== expandedBytes))) throw new Error("A PowerPoint entry has mismatched ZIP metadata or overlaps its directory.");
    let localName: string;
    try { localName = decoder.decode(bytes.subarray(localStart + 30, localStart + 30 + localNameLength)); }
    catch { throw new Error("The PowerPoint package contains an invalid local filename encoding."); }
    if (localName !== name) throw new Error("A PowerPoint entry's local and directory filenames do not match.");
    const unixMode = view.getUint32(cursor + 38, true) >>> 16;
    if ((unixMode & 0xf000) === 0xa000) throw new Error("Symbolic links are not supported in PowerPoint packages.");
    localRanges.push({ start: localStart, end: dataEnd });
    cursor = end;
    if (name.endsWith("/")) continue;
    const normalized = name.toLowerCase();
    if (names.has(normalized)) throw new Error("The PowerPoint package contains duplicate paths.");
    names.add(normalized);
    if (expandedBytes > MAX_PPTX_ENTRY_BYTES) throw new Error(`A PowerPoint package entry exceeds the ${Math.round(MAX_PPTX_ENTRY_BYTES / 1024 / 1024)} MB safety limit.`);
    if (expandedBytes > 1024 * 1024 && expandedBytes / Math.max(compressedBytes, 1) > MAX_PPTX_EXPANSION_RATIO) throw new Error("The PowerPoint package has an unsafe compression ratio and was rejected.");
    totalExpanded += expandedBytes;
    if (name.toLowerCase().startsWith("ppt/media/")) totalMedia += expandedBytes;
    if (totalExpanded > MAX_PPTX_EXPANDED_BYTES || totalMedia > MAX_PPTX_MEDIA_BYTES) throw new Error("The PowerPoint package expands beyond the safe memory limit.");
    entries.push({ name, compressedBytes, expandedBytes, method });
  }
  if (cursor !== centralOffset + centralBytes) throw new Error("The PowerPoint ZIP directory has trailing or unindexed data.");
  localRanges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < localRanges.length; i += 1) {
    if (localRanges[i].start < localRanges[i - 1].end) throw new Error("PowerPoint ZIP entries overlap in the archive.");
  }
  return entries;
}

function resolvePackageTarget(sourcePart: string, target: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(target); } catch { throw new Error("The PowerPoint package contains an invalid relationship target."); }
  if (!decoded || decoded.startsWith("/") || decoded.includes("\\") || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded) || /[?#\0]/.test(decoded)) throw new Error("The PowerPoint package contains an unsafe internal relationship target.");
  const parts = sourcePart.split("/").slice(0, -1).filter(Boolean);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (parts.length === 0) throw new Error("The PowerPoint package contains a relationship that escapes its package root."); parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

export async function loadPptxArchive(file: File, bytes?: Uint8Array): Promise<PptxArchive> {
  assertDocumentSize(file);
  if (!/\.pptx$/i.test(file.name)) {
    if (/\.ppt$/i.test(file.name)) throw new Error("Legacy .ppt files are not supported; use modern .pptx files.");
    throw new Error("Choose a modern .pptx file.");
  }
  if (file.type && !["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "application/octet-stream"].includes(file.type)) {
    throw new Error("The selected file's MIME type does not match a .pptx presentation.");
  }
  const data = bytes ?? new Uint8Array(await file.arrayBuffer());
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) throw new Error("This file does not have a valid OOXML ZIP signature.");
  const entries = await readZipManifest(data);
  const paths = new Set(entries.map((entry) => entry.name));
  for (const required of ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"]) {
    if (!paths.has(required)) throw new Error(`This ZIP is not a valid PowerPoint package (missing ${required}).`);
  }
  if ([...paths].some((name) => name.toLowerCase().endsWith("vbaproject.bin"))) throw new Error("Macro-enabled presentations are not supported. Macros are never executed.");
  const zip = await JSZip.loadAsync(data, { checkCRC32: true, createFolders: false });
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  let hasExternalRelationship = false;
  let typesDoc: Document | undefined;
  let presentationDoc: Document | undefined;
  let presentationRelsDoc: Document | undefined;
  for (const entry of entries) {
    if (!/\.(?:xml|rels)$/i.test(entry.name)) continue;
    if (entry.expandedBytes > 8 * 1024 * 1024) throw new Error("An Office XML part exceeds the 8 MB parser safety limit.");
    const xml = await zip.file(entry.name)!.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML declarations with entities are not accepted in Office documents.");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    if (parsed.querySelector("parsererror") || !parsed.documentElement) throw new Error(`The PowerPoint package contains malformed XML (${entry.name}).`);
    if (entry.name === "[Content_Types].xml") typesDoc = parsed;
    if (entry.name === "ppt/presentation.xml") presentationDoc = parsed;
    if (entry.name === "ppt/_rels/presentation.xml.rels") presentationRelsDoc = parsed;
    if (entry.name.endsWith(".rels")) {
      const sourcePart = entry.name === "_rels/.rels" ? "" : entry.name.replace(/\/_rels\//, "/").replace(/\.rels$/i, "");
      const relationIds = new Set<string>();
      for (const rel of Array.from(parsed.getElementsByTagNameNS("*", "Relationship"))) {
        const relationId = rel.getAttribute("Id") ?? "";
        const target = rel.getAttribute("Target") ?? "";
        if (!relationId || relationIds.has(relationId) || !rel.getAttribute("Type") || !target) throw new Error(`The PowerPoint package contains a malformed relationship (${entry.name}).`);
        relationIds.add(relationId);
        if ((rel.getAttribute("TargetMode") ?? "").toLowerCase() === "external") { hasExternalRelationship = true; continue; }
        const resolved = resolvePackageTarget(sourcePart, target);
        if (!byName.has(resolved)) throw new Error(`The PowerPoint package has a broken internal relationship (${entry.name}).`);
      }
    }
  }
  if (!typesDoc || typesDoc.documentElement.localName !== "Types" || !presentationDoc || presentationDoc.documentElement.localName !== "presentation" || !presentationRelsDoc || presentationRelsDoc.documentElement.localName !== "Relationships") throw new Error("The PowerPoint package is missing valid core OOXML parts.");
  const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  if (/macroEnabled|vbaProject/i.test(contentTypes)) throw new Error("Macro-enabled presentations are not supported. Macros are never executed.");
  const slideIds = Array.from(presentationDoc.getElementsByTagNameNS("*", "sldId"));
  const slideCount = slideIds.length;
  if (slideCount < 1 || slideCount > 120) throw new Error("PowerPoint presentations must contain 1–120 slides.");
  const slideRelations = new Map(Array.from(presentationRelsDoc.getElementsByTagNameNS("*", "Relationship")).map((rel) => [rel.getAttribute("Id"), rel]));
  for (const slide of slideIds) {
    const relationId = slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? slide.getAttribute("r:id");
    const relation = relationId ? slideRelations.get(relationId) : undefined;
    if (!relation || !/\/slide$/i.test(relation.getAttribute("Type") ?? "") || (relation.getAttribute("TargetMode") ?? "").toLowerCase() === "external") throw new Error("The presentation contains an invalid slide-order relationship.");
  }
  const slideXml = entries.filter((entry) => /^ppt\/slides\/slide[^/]+\.xml$/i.test(entry.name));
  if (slideXml.length !== slideCount) throw new Error("The presentation slide list does not match its slide XML parts.");
  const notices: string[] = [];
  let hasAnimations = false;
  for (const entry of slideXml) {
    const xml = await zip.file(entry.name)!.async("string");
    if (/<(?:\w+:)?(?:timing|transition)(?:\s|>)/i.test(xml)) hasAnimations = true;
  }
  if (hasAnimations) notices.push("Animations and slide transitions are omitted in the static PDF conversion.");
  if ([...paths].some((name) => /^ppt\/media\/.*\.(mp4|m4v|mov|avi|wmv|mp3|m4a|wav|wma|mid|midi)$/i.test(name))) notices.push("Embedded audio/video is not included in the static PDF conversion.");
  if (hasExternalRelationship) notices.push("External relationships and media are blocked; only embedded presentation content is used. Hyperlinks are not carried into the raster PDF.");
  if ([...paths].some((name) => name.startsWith("ppt/diagrams/"))) notices.push("SmartArt uses its compatible preview data when available; complex SmartArt layout may differ.");
  if ([...paths].some((name) => name.startsWith("ppt/fonts/"))) notices.push("Embedded font payloads are subject to renderer support; check the exported PDF for font substitution or line-wrap changes.");
  if ([...paths].some((name) => name.toLowerCase().includes("_xmlsignatures/"))) notices.push("This package contains digital signatures. Editing its media invalidates those signatures; compression will be refused.");
  return { zip, entries, slideCount, notices };
}

export async function validateImagesToPdf(files: readonly File[]): Promise<Array<{ file: File; bytes: Uint8Array; format: "png" | "jpeg" }>> {
  if (files.length === 0 || files.length > 20) throw new Error("Choose 1–20 PNG or JPEG images for one PDF.");
  let total = 0;
  let totalPixels = 0;
  const out = [];
  try {
    for (const file of files) {
      if (file.size === 0) throw new Error(`${file.name}: empty files are not supported.`);
      total += file.size;
      if (file.size > MAX_DOCUMENT_BYTES || total > MAX_DOCUMENT_BYTES) throw new Error("Image-to-PDF input is limited to 15 MB total.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const format = validateImageFile(file, bytes);
        const dimensions = readImageDimensions(bytes, format);
        if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw new Error(`${file.name}: image dimensions are invalid or exceed the 24 MP limit.`);
        totalPixels += dimensions.width * dimensions.height;
        if (totalPixels > 80_000_000) throw new Error("The selected images exceed the combined 80 MP safety limit.");
        out.push({ file, bytes, format });
      } catch (cause) { bytes.fill(0); throw cause; }
    }
    return out;
  } catch (cause) {
    out.forEach((entry) => entry.bytes.fill(0));
    throw cause;
  }
}

export function makeFileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes.slice().buffer], name, { type, lastModified: 0 });
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return new TextDecoder("ascii").decode(bytes.subarray(0, 8)).startsWith("%PDF-");
}

export function hasPptxSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function encodedSize(text: string): number { return encoder.encode(text).byteLength; }
