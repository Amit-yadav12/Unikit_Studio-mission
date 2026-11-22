import { readImageHeader } from "@/shared/imageHeader";
import type {
  CandidateRecord,
  ImageOptimizeSettings,
  ImageResult,
} from "@/types/domain";
import { ApiClientError } from "@/lib/api-client";

export type Output = { blob: Blob; result: ImageResult };
type Reply =
  | {
      ok: true;
      blob: Blob;
      format: string;
      retained: boolean;
      candidates: CandidateRecord[];
      iw: number;
      ih: number;
      width: number;
      height: number;
    }
  | { ok: false; error: string };
const supported = new Set([
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "tiff",
  "bmp",
]);
export const cancelled = () =>
  new ApiClientError("Processing stopped.", { code: "cancelled", status: 0 });

/** Never silently falls back to an upload. Extended processing requires an explicit choice. */
export async function processOnDevice(
  file: File,
  settings: ImageOptimizeSettings,
  maxPixels: number,
  signal: AbortSignal,
): Promise<Output> {
  const start = performance.now();
  const header = readImageHeader(new Uint8Array(await file.arrayBuffer()));
  if (signal.aborted) throw cancelled();
  if (
    !header ||
    !supported.has(header.format) ||
    header.malformed ||
    !header.width ||
    !header.height
  )
    throw new Error(
      "Not a readable supported raster image. Choose JPEG, PNG, WebP, AVIF, GIF, BMP or TIFF.",
    );
  if (header.width * header.height * (header.frames ?? 1) > maxPixels)
    throw new Error(
      "The image exceeds the decoded-pixel budget. Reduce its dimensions first.",
    );
  if (
    settings.format === "original" &&
    !["webp", "jpeg", "png", "avif"].includes(header.format)
  )
    throw new Error(
      "To keep this format, choose Extended codecs. Otherwise choose WebP, AVIF, PNG or JPEG.",
    );
  if (header.animated || header.format === "tiff")
    throw new Error(
      "Choose Extended codecs for TIFF or multi-frame files. Nothing has been uploaded.",
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker("/codecs/image-worker.mjs", {
      type: "module",
      name: "unikit-private-encoder",
    });
    const dispose = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      dispose();
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      dispose();
      reject(
        new Error(
          "Local encoding exceeded 45 seconds. Try a smaller output or WebP.",
        ),
      );
    }, 45_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      dispose();
      reject(
        new Error(
          "The local encoder could not start. Use a supported browser or select Extended codecs.",
        ),
      );
    };
    worker.onmessage = (message: MessageEvent<Reply>) => {
      dispose();
      const d = message.data;
      if (!d.ok) {
        reject(new Error(d.error));
        return;
      }
      const saved = file.size - d.blob.size;
      const name = file.name.replace(/[^\w. -]/g, "_").slice(0, 100) || "image";
      resolve({
        blob: d.blob,
        result: {
          id: crypto.randomUUID(),
          filename: name,
          outputFilename: d.retained
            ? name
            : `${name.replace(/\.[^.]+$/, "")}-unikit.${d.format === "jpeg" ? "jpg" : d.format}`,
          status: "completed",
          inputContentType: header.mime,
          durationMs: Math.round(performance.now() - start),
          inputBytes: file.size,
          outputBytes: d.blob.size,
          savedBytes: saved,
          savingsPercent: Math.round((saved / file.size) * 10000) / 100,
          inputWidth: d.iw,
          inputHeight: d.ih,
          outputWidth: d.width,
          outputHeight: d.height,
          outputFormat: d.format,
          retainedOriginal: d.retained,
          policy: settings.policy,
          candidates: d.candidates,
        },
      });
    };
    worker.postMessage({ file, header, settings, maxPixels });
  });
}

/** New output is returned directly to the tab; neither the source nor output is persisted. */
export async function processExtended(
  file: File,
  settings: ImageOptimizeSettings,
  signal: AbortSignal,
): Promise<Output> {
  const form = new FormData();
  form.append("files", file, file.name);
  form.append("delivery", "temporary");
  for (const [k, v] of Object.entries(settings))
    if (v != null) form.append(k, String(v));
  const res = await fetch("/api/v1/images/optimize", {
    method: "POST",
    body: form,
    signal,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(
      body?.error?.message ??
        `Temporary processing failed (HTTP ${res.status}).`,
      {
        status: res.status,
        code: body?.error?.code ?? "encode_failed",
        hint: body?.error?.hint,
        requestId: body?.meta?.requestId,
      },
    );
  }
  const receipt = res.headers.get("x-unikit-result");
  if (!receipt)
    throw new Error("The encoder did not return file measurements.");
  const result = JSON.parse(decodeURIComponent(receipt)) as ImageResult;
  const blob = await res.blob();
  if (blob.size !== result.outputBytes || !blob.size)
    throw new Error("The download was incomplete. Retry this file.");
  return { blob, result };
}

export async function bundleOutputs(
  files: { name: string; blob: Blob }[],
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const file of files) {
    let name = file.name.replace(/[\\/]/g, "_");
    const original = name;
    let i = 2;
    while (used.has(name)) name = original.replace(/(\.[^.]+)?$/, `-${i++}$1`);
    used.add(name);
    zip.file(name, await file.blob.arrayBuffer());
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
