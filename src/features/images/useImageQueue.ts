"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ImageOptimizeResponse,
  ImageOptimizeSettings,
  ImageResult,
} from "@/types/domain";
import {
  api,
  ApiClientError,
  artifactUrl,
  triggerDownload,
} from "@/lib/api-client";
import { takeStagedFile } from "@/features/assets/transfer";
import { useToast } from "@/components/ui/Feedback";
import {
  bundleOutputs,
  processExtended,
  processOnDevice,
} from "./private-processing";

export type QueueItem = {
  key: string;
  file: File;
  status: "ready" | "processing" | "completed" | "failed";
  preview: string;
  result?: ImageResult;
  output?: Blob;
  outputUrl?: string;
  error?: string;
  settingsKey?: string;
};
export type OptimizerLimits = {
  maxFileMb: number;
  maxFiles: number;
  maxDecodedPixels: number;
};
export type Processor = "device" | "extended";
export function useImageQueue(limits: OptimizerLimits, settingsKey: string) {
  const { push } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]),
    snapshot = useRef<QueueItem[]>([]);
  const [busy, setBusy] = useState(false),
    [zipping, setZipping] = useState(false),
    [progress, setProgress] = useState(""),
    [recorded, setRecorded] = useState(true);
  const [failure, setFailure] = useState<{
    message: string;
    hint?: string;
    code?: string;
    requestId?: string;
  } | null>(null);
  const runRef = useRef<AbortController | null>(null),
    urls = useRef(new Set<string>());
  const update = useCallback((fn: (q: QueueItem[]) => QueueItem[]) => {
    const next = fn(snapshot.current);
    snapshot.current = next;
    setItems(next);
  }, []);
  const objectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);
  const release = (url?: string) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  };
  const addItem = useCallback(
    (files: File[]) => {
      if (runRef.current) return;
      const accepted: QueueItem[] = [],
        errors: string[] = [];
      for (const file of files) {
        if (
          accepted.some(
            (x) =>
              x.file.name === file.name &&
              x.file.size === file.size &&
              x.file.lastModified === file.lastModified,
          ) ||
          snapshot.current.some(
            (x) =>
              x.file.name === file.name &&
              x.file.size === file.size &&
              x.file.lastModified === file.lastModified,
          )
        ) {
          errors.push(`${file.name} is already queued.`);
          continue;
        }
        if (!file.size) {
          errors.push(`${file.name} is empty.`);
          continue;
        }
        if (file.size > limits.maxFileMb * 1024 * 1024) {
          errors.push(`${file.name} exceeds ${limits.maxFileMb} MB.`);
          continue;
        }
        if (snapshot.current.length + accepted.length >= limits.maxFiles) {
          errors.push(`A queue holds ${limits.maxFiles} files.`);
          break;
        }
        accepted.push({
          key: crypto.randomUUID(),
          file,
          status: "ready",
          preview: objectUrl(file),
        });
      }
      update((q) => [...q, ...accepted]);
      setFailure(
        errors.length
          ? {
              message: errors.join(" "),
              hint: "Valid selections are still in the queue.",
            }
          : null,
      );
    },
    [limits.maxFileMb, limits.maxFiles, objectUrl, update],
  );
  useEffect(() => {
    const pool = urls.current;
    const controller = new AbortController();
    const file = takeStagedFile();
    if (file) addItem([file]);
    const from = new URLSearchParams(location.search).get("from");
    if (from)
      void fetch(artifactUrl(from, false), { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok)
            throw new Error(
              "This result is no longer available. Select the original file instead.",
            );
          const blob = await r.blob();
          if (!controller.signal.aborted)
            addItem([
              new File(
                [blob],
                r.headers.get("x-unikit-original-name") ?? "stored-image",
                { type: blob.type },
              ),
            ]);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setFailure({ message: e.message });
        });
    return () => {
      controller.abort();
      runRef.current?.abort();
      for (const url of pool) URL.revokeObjectURL(url);
      pool.clear();
    };
  }, [addItem]);
  const removeItem = (key: string) => {
    const it = snapshot.current.find((i) => i.key === key);
    release(it?.preview);
    release(it?.outputUrl);
    update((q) => q.filter((i) => i.key !== key));
  };
  const reset = () => {
    if (runRef.current) return;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
    update(() => []);
    setFailure(null);
    setRecorded(true);
  };
  const run = async (settings: ImageOptimizeSettings, mode: Processor) => {
    const pending = snapshot.current.filter(
      (i) =>
        i.status === "ready" ||
        i.status === "failed" ||
        (i.status === "completed" && i.settingsKey !== settingsKey),
    );
    if (!pending.length || runRef.current) return;
    const ctrl = new AbortController();
    runRef.current = ctrl;
    setBusy(true);
    setFailure(null);
    const receipts: ImageResult[] = [];
    try {
      for (const [idx, item] of pending.entries()) {
        if (ctrl.signal.aborted) break;
        setProgress(
          `${mode === "device" ? "On-device encoding" : "Temporary server encoding"} · ${idx + 1} of ${pending.length}`,
        );
        update((q) =>
          q.map((i) =>
            i.key === item.key
              ? { ...i, status: "processing", error: undefined }
              : i,
          ),
        );
        const start = performance.now();
        try {
          const data =
            mode === "device"
              ? await processOnDevice(
                  item.file,
                  settings,
                  limits.maxDecodedPixels,
                  ctrl.signal,
                )
              : await processExtended(item.file, settings, ctrl.signal);
          if (ctrl.signal.aborted) break;
          release(item.outputUrl);
          const url = objectUrl(data.blob);
          update((q) =>
            q.map((i) =>
              i.key === item.key
                ? {
                    ...i,
                    status: "completed",
                    result: data.result,
                    settingsKey,
                    output: data.blob,
                    outputUrl: url,
                  }
                : i,
            ),
          );
          receipts.push(data.result);
        } catch (e) {
          if (ctrl.signal.aborted) break;
          const message =
            e instanceof Error ? e.message : "Could not process this file.";
          const result: ImageResult = {
            id: crypto.randomUUID(),
            filename: item.file.name,
            outputFilename: item.file.name,
            status: "failed",
            inputBytes: item.file.size,
            outputBytes: 0,
            savedBytes: 0,
            savingsPercent: 0,
            inputWidth: null,
            inputHeight: null,
            outputWidth: null,
            outputHeight: null,
            outputFormat: "—",
            inputContentType: item.file.type,
            durationMs: Math.round(performance.now() - start),
            message,
          };
          update((q) =>
            q.map((i) =>
              i.key === item.key
                ? { ...i, status: "failed", result, error: message }
                : i,
            ),
          );
          receipts.push(result);
        }
      }
      if (!ctrl.signal.aborted && receipts.length) {
        const done = receipts.filter((i) => i.status === "completed");
        push({
          tone:
            done.length === receipts.length
              ? "ok"
              : done.length
                ? "warn"
                : "danger",
          title: `${done.length} of ${receipts.length} images converted`,
          description: done.length
            ? "Download your results below."
            : "Review the file messages and retry.",
        });
        try {
          await api.post(
            "/api/v1/history/local",
            {
              engine: mode,
              items: receipts.map((r) => ({
                filename: r.filename.slice(0, 120),
                outputFilename: r.outputFilename.slice(0, 150),
                status: r.status,
                inputBytes: r.inputBytes,
                outputBytes: r.outputBytes,
                inputWidth: r.inputWidth,
                inputHeight: r.inputHeight,
                outputWidth: r.outputWidth,
                outputHeight: r.outputHeight,
                outputFormat: r.outputFormat,
                retainedOriginal: r.retainedOriginal,
              })),
            },
            { signal: ctrl.signal },
          );
          setRecorded(true);
        } catch {
          if (!ctrl.signal.aborted) setRecorded(false);
        }
      }
    } finally {
      update((q) =>
        q.map((i) =>
          i.status === "processing" ? { ...i, status: "ready" } : i,
        ),
      );
      if (runRef.current === ctrl) runRef.current = null;
      setBusy(false);
    }
  };
  const cancel = () => {
    runRef.current?.abort();
    push({
      tone: "neutral",
      title: "Stopped waiting",
      description:
        "Completed downloads are kept. An extended-codec request may finish on the server.",
    });
  };
  const completed = items.filter((i) => i.status === "completed"),
    failed = items.filter((i) => i.status === "failed"),
    pending = items.filter(
      (i) =>
        i.status === "ready" ||
        i.status === "failed" ||
        (i.status === "completed" && i.settingsKey !== settingsKey),
    );
  const results = items.flatMap((i) => (i.result ? [i.result] : []));
  const totals = completed.reduce(
    (a, i) => ({
      inputBytes: a.inputBytes + i.result!.inputBytes,
      outputBytes: a.outputBytes + i.result!.outputBytes,
      savedBytes: a.savedBytes + i.result!.savedBytes,
    }),
    { inputBytes: 0, outputBytes: 0, savedBytes: 0 },
  );
  const response: ImageOptimizeResponse | null = results.length
    ? {
        jobId: "",
        persisted: recorded,
        status: failed.length
          ? completed.length
            ? "partial"
            : "failed"
          : "completed",
        results,
        totals: {
          ...totals,
          savingsPercent: totals.inputBytes
            ? (100 * totals.savedBytes) / totals.inputBytes
            : 0,
        },
      }
    : null;
  const downloadAll = async () => {
    if (zipping || !completed.length) return;
    setZipping(true);
    try {
      const blob = await bundleOutputs(
        completed.map((i) => ({
          name: i.result!.outputFilename,
          blob: i.output!,
        })),
      );
      triggerDownload(URL.createObjectURL(blob), "unikit-images.zip");
    } catch (e) {
      push({
        tone: "danger",
        title: "ZIP could not be prepared",
        description:
          e instanceof ApiClientError
            ? e.message
            : "Use the individual downloads instead.",
      });
    } finally {
      setZipping(false);
    }
  };
  return {
    items,
    busy,
    zipping,
    progress,
    failure,
    setFailure,
    addItem,
    removeItem,
    reset,
    run,
    cancel,
    completed,
    failed,
    pending,
    response,
    downloadAll,
  };
}
