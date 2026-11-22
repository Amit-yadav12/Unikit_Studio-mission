/** Product targets shared by the optimizer, analyzer, CSS tools and ZIP worker.
 * These are application limits, not promises about a device or hosting plan.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_BATCH_IMAGES = 5;
export const MAX_BATCH_BYTES = 20 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 24_000_000;
export const MAX_CONCURRENCY = 1;
export const MAX_CSS_BYTES = 500 * 1024;
export const MAX_ASSET_FILES = 5;
export const MAX_ZIP_BYTES = 50 * 1024 * 1024;

export type BatchCheck = { accepted: Blob[]; reasons: string[] };

/** Enforce count and total bytes before a batch is queued or inspected. */
export function inspectBatch(files: readonly Blob[], maxFiles = MAX_BATCH_IMAGES, maxBytes = MAX_BATCH_BYTES): BatchCheck {
  const accepted: Blob[] = [];
  const reasons: string[] = [];
  let bytes = 0;
  for (const file of files) {
    if (file.size === 0) {
      reasons.push("An empty file was rejected.");
    } else if (file.size > MAX_IMAGE_BYTES) {
      reasons.push("A file above 5 MB was rejected.");
    } else if (accepted.length >= maxFiles) {
      reasons.push("Only 5 images can be queued in one batch.");
      break;
    } else if (bytes + file.size > maxBytes) {
      reasons.push("The 20 MB batch limit was reached.");
      break;
    } else {
      accepted.push(file);
      bytes += file.size;
    }
  }
  return { accepted, reasons };
}

/** Additional ZIP working memory, separate from the already-created source Blobs. */
export function zipMemoryBudget(deviceMemoryGb?: number | null): number {
  if (typeof deviceMemoryGb === "number" && Number.isFinite(deviceMemoryGb)) {
    return Math.min(160 * 1024 * 1024, Math.max(48 * 1024 * 1024, deviceMemoryGb * 64 * 1024 * 1024));
  }
  return 96 * 1024 * 1024;
}
