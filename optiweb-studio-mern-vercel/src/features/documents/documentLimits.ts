/** Document-only limits. These do not alter the image optimizer or its 50 MB ZIP cap. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_DOCUMENT_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_PPTX_ENTRIES = 4_000;
export const MAX_PPTX_ENTRY_BYTES = 32 * 1024 * 1024;
export const MAX_PPTX_EXPANDED_BYTES = 128 * 1024 * 1024;
export const MAX_PPTX_MEDIA_BYTES = 96 * 1024 * 1024;
export const MAX_PPTX_EXPANSION_RATIO = 200;
export const MAX_PDF_PAGES = 200;
export const MAX_PDF_RENDER_PAGES = 80;
export const MAX_PPTX_SLIDES = 120;
export const MAX_PAGE_PIXELS = 12_000_000;
export const MAX_TOTAL_RENDER_PIXELS = 100_000_000;
export const MAX_IMAGE_INPUTS = 20;
export const MAX_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const TARGET_RASTER_EDGE = 2_800;

export type DocumentCompressionMode = "lossless" | "balanced" | "small";
export type PowerPointPdfMode = "maximum" | "balanced" | "small";

export type DocumentOperation =
  | "compress-pdf"
  | "pdf-to-images"
  | "images-to-pdf"
  | "pdf-to-pptx"
  | "compress-pptx"
  | "pptx-to-pdf";

export type DocumentResultFile = { name: string; blob: Blob };

export type DocumentResult = {
  sourceBytes: number;
  outputBytes: number;
  outputName: string;
  output: Blob;
  files?: DocumentResultFile[];
  pagesOrSlides?: number;
  durationMs: number;
  notices: string[];
  keptOriginal: boolean;
};
