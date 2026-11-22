export function makeResult(sourceBytes: number, bytes: Uint8Array, outputName: string, type: string, start: number, options: { pagesOrSlides?: number; notices?: string[]; keptOriginal?: boolean } = {}) {
  return {
    sourceBytes,
    outputBytes: bytes.byteLength,
    outputName,
    output: new Blob([bytes.slice().buffer], { type }),
    pagesOrSlides: options.pagesOrSlides,
    durationMs: Math.max(0, performance.now() - start),
    notices: options.notices ?? [],
    keptOriginal: options.keptOriginal ?? false,
  };
}

export function outputCanvas(canvas: HTMLCanvasElement, format: "png" | "jpeg", quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Your browser could not encode this page.")), format === "png" ? "image/png" : "image/jpeg", quality));
}

import { MAX_PAGE_PIXELS, MAX_TOTAL_RENDER_PIXELS } from "./documentLimits";

export function assertCanvasBudget(width: number, height: number, runningPixels: number): void {
  if (width <= 0 || height <= 0 || width * height > MAX_PAGE_PIXELS || runningPixels + width * height > MAX_TOTAL_RENDER_PIXELS) {
    throw new Error("This document would exceed the safe page-rendering memory limit.");
  }
}
