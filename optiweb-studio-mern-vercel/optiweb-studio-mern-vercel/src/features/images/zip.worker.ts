/// <reference lib="webworker" />
import JSZip from "jszip";
import { MAX_ZIP_BYTES } from "@/lib/capabilities";

/** No DOM, storage, network or persistence here. Termination frees its resources. */
self.onmessage = async (event: MessageEvent<{ files: Array<{ name: string; blob: Blob }>; memoryBudget: number }>) => {
  try {
    const { files, memoryBudget } = event.data;
    const total = files.reduce((sum, file) => sum + file.blob.size, 0);
    if (total > MAX_ZIP_BYTES) throw new Error("The selected results exceed the 50 MB ZIP limit. Download them individually.");
    if (total * 2 > memoryBudget) throw new Error("Creating this ZIP would exceed the browser memory budget. Download files individually.");
    const zip = new JSZip();
    const used = new Set<string>();
    const sources = new Map<string, Blob>();
    for (const file of files) {
      let name = file.name.replace(/[\\/\0]/g, "_");
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const extension = dot > 0 ? name.slice(dot) : "";
      for (let copy = 2; used.has(name.toLowerCase()); copy += 1) name = `${base}-${copy}${extension}`;
      used.add(name.toLowerCase());
      sources.set(name, file.blob);
      zip.file(name, await file.blob.arrayBuffer());
    }
    const packed = await zip.generateAsync(
      { type: "uint8array", compression: "STORE", mimeType: "application/zip", streamFiles: true },
      ({ percent }: { percent: number }) => self.postMessage({ type: "progress", percent }),
    );
    if (packed.byteLength > MAX_ZIP_BYTES) throw new Error("The generated archive exceeds 50 MB. Download files individually.");
    self.postMessage({ type: "verifying" });
    const check = await JSZip.loadAsync(packed);
    const entries = Object.keys(check.files).filter((name) => !check.files[name].dir);
    if (entries.length !== sources.size) throw new Error("The archive does not contain every selected result.");
    const digest = async (data: BufferSource) => new Uint8Array(await crypto.subtle.digest("SHA-256", data)).join(",");
    for (const [name, source] of sources) {
      const entry = check.file(name);
      if (!entry) throw new Error(`The archive is missing ${name}.`);
      const [expected, actual] = await Promise.all([digest(await source.arrayBuffer()), digest(await entry.async("uint8array"))]);
      if (expected !== actual) throw new Error(`Archive verification failed for ${name}.`);
    }
    self.postMessage({ type: "done", blob: new Blob([packed], { type: "application/zip" }), bytes: packed.byteLength });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "The ZIP could not be created." });
  }
};
