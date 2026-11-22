/** Local downloads and cancellable, verified ZIP creation. Nothing is persisted. */
import { MAX_ZIP_BYTES, zipMemoryBudget } from "@/lib/capabilities";
import type { Dispatch, SetStateAction } from "react";

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click is handled synchronously for blob URLs. Revoke on the next turn,
  // after the browser has taken the reference, not when the tab eventually closes.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type ZipProgress = { phase: "idle" | "packing" | "verifying" | "done" | "error" | "cancelled"; percent: number; message: string };

export function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let copy = 2; used.has(candidate.toLowerCase()); copy += 1) candidate = `${base}-${copy}${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Generate on a disposable worker; offer only a fully verified archive. */
export function createZip(
  files: ReadonlyArray<{ name: string; blob: Blob }>,
  onProgress: Dispatch<SetStateAction<ZipProgress>>,
): { promise: Promise<void>; cancel: () => void } {
  let worker: Worker | null = null;
  let cancelled = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const memoryBudget = zipMemoryBudget((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null);
  const cleanup = () => {
    settled = true;
    if (timer) clearTimeout(timer);
    worker?.terminate();
    worker = null;
  };
  let complete: () => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    complete = resolve;
    const fail = (message: string) => {
      if (settled) return;
      cleanup();
      onProgress({ phase: "error", percent: 0, message });
      reject(new Error(message));
    };
    const total = files.reduce((sum, file) => sum + file.blob.size, 0);
    if (total > MAX_ZIP_BYTES) {
      fail("These files exceed the 50 MB ZIP limit. Download them individually.");
      return;
    }
    if (total * 2 > memoryBudget) {
      fail("This ZIP exceeds the browser memory budget. Download files individually.");
      return;
    }
    try {
      worker = new Worker(new URL("../features/images/zip.worker.ts", import.meta.url), { type: "module", name: "unikit-zip-worker" });
    } catch {
      fail("This browser cannot start a ZIP worker. Download the files individually.");
      return;
    }
    timer = setTimeout(() => fail("ZIP creation timed out. Download files individually or close other tabs and retry."), 120_000);
    onProgress({ phase: "packing", percent: 0, message: "Packing your files on this device…" });
    worker.onmessage = (event: MessageEvent<{ type: string; percent?: number; message?: string; blob?: Blob }>) => {
      if (settled || cancelled) return;
      const message = event.data;
      if (message.type === "progress") {
        const percent = Math.max(0, Math.min(95, Math.round(message.percent ?? 0)));
        onProgress({ phase: "packing", percent, message: `Packing your files on this device… ${percent}%` });
      } else if (message.type === "verifying") {
        onProgress({ phase: "verifying", percent: 98, message: "Verifying every file in the archive…" });
      } else if (message.type === "error") fail(message.message ?? "ZIP creation failed.");
      else if (message.type === "done" && message.blob) {
        cleanup();
        saveBlob(message.blob, "unikit-images.zip");
        onProgress({ phase: "done", percent: 100, message: "Verified and downloaded. Temporary resources released." });
        resolve();
      }
    };
    worker.onerror = () => fail("The ZIP worker stopped unexpectedly. Download files individually.");
    worker.postMessage({ files: [...files], memoryBudget });
  });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      cancelled = true;
      cleanup();
      onProgress({ phase: "cancelled", percent: 0, message: "ZIP creation cancelled. Temporary resources released." });
      complete();
    },
  };
}
