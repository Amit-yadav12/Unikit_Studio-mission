"use client";

import Image from "next/image";

import { useEffect, useState } from "react";
import {
  Download,
  Info,
  Package,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  ImagePlus,
} from "lucide-react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import {
  ErrorState,
  ProgressIndicator,
  StatusBadge,
} from "@/components/ui/Feedback";
import { statusToneFor } from "@/lib/status";
import { Field, Input, SegmentedControl } from "@/components/ui/Form";
import {
  DefinitionRow,
  FormatTag,
  Panel,
  PanelHeader,
  StatStrip,
  TableShell,
  Td,
  Th,
} from "@/components/ui/Layout";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { FileRow } from "@/components/ui/FileRow";
import { SavingsChart } from "@/components/charts/SavingsChart";
import { CompareSlider } from "@/features/images/CompareSlider";

import { api } from "@/lib/api-client";
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatSavingsPercent,
} from "@/lib/format";
import type { Preferences } from "@/types/domain";

import {
  useImageQueue,
  type QueueItem as Item,
  type OptimizerLimits,
} from "./useImageQueue";
import { useRouter } from "next/navigation";
import { stageInspection } from "@/features/assets/transfer";

const FORMATS = [
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "gif", label: "GIF" },
  { value: "tiff", label: "TIFF" },
  { value: "original", label: "Keep" },
] as const;

export function ImageOptimizer({ limits }: { limits: OptimizerLimits }) {
  const [mode, setMode] = useState<"device" | "extended">("device");
  const [format, setFormat] =
    useState<(typeof FORMATS)[number]["value"]>("webp");
  const [policy, setPolicy] = useState<
    "single" | "best-effort" | "no-regression"
  >("single");
  const [quality, setQuality] = useState(78);
  const [maxWidth, setMaxWidth] = useState<string>("");
  const [maxHeight, setMaxHeight] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queue = useImageQueue(
    limits,
    JSON.stringify([mode, format, policy, quality, maxWidth, maxHeight]),
  );
  const {
    items,
    busy,
    zipping,
    progress,
    failure,
    addItem,
    removeItem,
    reset,
    cancel,
    completed,
    failed,
    pending,
    response,
    downloadAll,
  } = queue;
  const showResults = Boolean(response);
  const [loadingSample, setLoadingSample] = useState(false);
  const trySample = async () => {
    setLoadingSample(true);
    try {
      const r = await fetch("/samples/alpine-ridge.jpg");
      if (!r.ok) throw new Error("The sample could not be loaded.");
      addItem([
        new File([await r.blob()], "alpine-ridge.jpg", {
          type: "image/jpeg",
          lastModified: 1,
        }),
      ]);
    } catch {
      queue.setFailure({
        message:
          "The sample could not be loaded. Choose an image or try again.",
      });
    } finally {
      setLoadingSample(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Preferences>("/api/v1/preferences", { signal: controller.signal })
      .then((p) => {
        if (controller.signal.aborted) return;
        setFormat(
          ["gif", "tiff"].includes(p.defaultImageFormat)
            ? "webp"
            : p.defaultImageFormat,
        );
        setQuality(p.defaultQuality);
        if (p.defaultMaxWidth) setMaxWidth(String(p.defaultMaxWidth));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const run = () => {
    const w = maxWidth ? Number(maxWidth) : null,
      h = maxHeight ? Number(maxHeight) : null;
    if (
      [w, h].some(
        (v) => v !== null && (!Number.isInteger(v) || v < 16 || v > 8000),
      )
    ) {
      queue.setFailure({
        message: "Choose a maximum dimension between 16 and 8000 pixels.",
      });
      return;
    }
    void queue.run(
      { format, policy, quality, maxWidth: w, maxHeight: h },
      mode,
    );
  };

  return (
    <div className="optimizer-workflow flex flex-col gap-5">
      {/* ---------------------------------------------------------- select */}
      <Panel aria-labelledby="select-panel">
        <PanelHeader
          id="select-panel"
          title="1 · Select images"
          description="Choose one image or a batch to get started."
          meta={<FormatTag>{limits.maxFiles} max</FormatTag>}
          actions={
            <Button
              variant="ghost"
              size="sm"
              loading={loadingSample}
              disabled={
                busy || loadingSample || items.length >= limits.maxFiles
              }
              onClick={trySample}
              leading={<ImagePlus size={14} aria-hidden />}
            >
              Use sample
            </Button>
          }
        />
        <FileDropzone
          accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff,.bmp,image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff,image/bmp"
          multiple
          disabled={busy}
          onFiles={addItem}
          selectedCount={items.length}
          title="Drop images here"
          description="JPEG, PNG, WebP, AVIF, still GIF and BMP on supported browsers. Use Extended codecs for TIFF and animation."
          constraints={`${limits.maxFileMb} MB per file · ${limits.maxFiles} files per batch · ${(limits.maxDecodedPixels / 1_000_000).toFixed(0)} MP decoded-pixel cap · aspect ratio always preserved`}
        />
        {items.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-md border border-line">
            <ul>
              {items.map((item) => (
                <FileRow
                  key={item.key}
                  name={item.file.name}
                  status={item.status}
                  thumbnail={
                    /\.tiff?$/i.test(item.file.name) ? null : item.preview
                  }
                  detail={`${formatBytes(item.file.size)} · ${(item.file.type || "unknown type").replace("image/", "")}`}
                  saved={
                    item.result?.status === "completed"
                      ? {
                          bytes: item.result.savedBytes,
                          percent: item.result.savingsPercent,
                        }
                      : null
                  }
                  error={item.error ?? null}
                  onRemove={busy ? undefined : () => removeItem(item.key)}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/* ------------------------------------------------------- configure */}
      <Panel aria-labelledby="configure-panel">
        <PanelHeader
          id="configure-panel"
          title="2 · Configure output"
          description="Choose how and where your images are processed."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-expanded={showAdvanced}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              {showAdvanced ? "Hide" : "Show"} dimensions
            </Button>
          }
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Field
              label="Processing engine"
              hint={
                mode === "device"
                  ? "Images are encoded privately in this tab."
                  : "Files are sent to Sharp for this conversion only. Source files and outputs are not saved."
              }
            >
              <SegmentedControl
                name="engine"
                label="Processing engine"
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  if (m === "device" && ["gif", "tiff"].includes(format))
                    setFormat("webp");
                }}
                options={[
                  { value: "device", label: "On-device" },
                  { value: "extended", label: "Extended codecs" },
                ]}
              />
            </Field>
          </div>
          <Field
            label="Strategy"
            htmlFor="policy"
            hint="Compare formats, or keep the original if no output is smaller."
          >
            <SegmentedControl
              name="policy"
              label="Optimization strategy"
              value={policy}
              onChange={setPolicy}
              options={[
                { value: "single", label: "Single" },
                { value: "best-effort", label: "Best-effort" },
                { value: "no-regression", label: "No-regression" },
              ]}
            />
          </Field>
          <Field
            label="Output format"
            htmlFor="format"
            hint="Single mode uses this format. Other strategies compare candidates."
          >
            <SegmentedControl
              name="format"
              label="Output format"
              value={format}
              onChange={setFormat}
              options={FORMATS.filter(
                (e) =>
                  mode === "extended" || !["gif", "tiff"].includes(e.value),
              ).map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          </Field>
          <Field
            label="Quality"
            htmlFor="quality"
            hint={
              ["png", "gif", "tiff"].includes(format) && policy === "single"
                ? format === "gif"
                  ? "GIF uses a 256-colour palette. Its encoder does not use this quality slider."
                  : "Lossless compression preserves detail. Quality is not a lossy slider for this format."
                : `Higher values preserve more detail. Current quality: ${quality}.`
            }
            trailing={
              <span className="font-mono text-xs text-muted tnum">
                {quality}
              </span>
            }
          >
            <input
              disabled={
                ["gif", "tiff", "png"].includes(format) && policy === "single"
              }
              id="quality"
              type="range"
              min={30}
              max={100}
              step={1}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="mt-2 h-1.5 w-full accent-accent"
              aria-valuetext={`${quality} of 100`}
            />
          </Field>
        </div>
        {showAdvanced ? (
          <div className="animate-fade-up mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Field
              label="Max width (px)"
              htmlFor="maxWidth"
              hint="Optional. Larger images are scaled down, never enlarged."
            >
              <Input
                id="maxWidth"
                inputMode="numeric"
                placeholder="e.g. 1920"
                value={maxWidth}
                onChange={(event) =>
                  setMaxWidth(event.target.value.replace(/[^\d]/g, ""))
                }
              />
            </Field>
            <Field
              label="Max height (px)"
              htmlFor="maxHeight"
              hint="Leave empty to constrain width only."
            >
              <Input
                id="maxHeight"
                inputMode="numeric"
                placeholder="e.g. 1080"
                value={maxHeight}
                onChange={(event) =>
                  setMaxHeight(event.target.value.replace(/[^\d]/g, ""))
                }
              />
            </Field>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button
            variant="primary"
            size="lg"
            onClick={run}
            loading={busy}
            disabled={pending.length === 0}
          >
            {busy
              ? "Processing…"
              : `Optimize ${pending.length || ""} file${pending.length === 1 ? "" : "s"}`.trim()}
          </Button>
          {items.length > 0 && !busy ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={reset}
              leading={<Trash2 className="size-3.5" aria-hidden />}
            >
              Clear queue
            </Button>
          ) : null}
          {busy ? (
            <>
              <Button variant="secondary" size="lg" onClick={cancel}>
                Cancel
              </Button>
              <div className="min-w-[180px] flex-1">
                <ProgressIndicator label={progress} />
              </div>
            </>
          ) : null}
        </div>

        {failure ? (
          <div className="mt-4">
            <ErrorState
              title={
                failure.code === "image_engine_unavailable"
                  ? "Image engine unavailable"
                  : "Batch failed"
              }
              message={failure.message}
              hint={[
                failure.hint ??
                  "Your queue is unchanged — adjust the settings and run it again.",
                failure.code ? `Error code: ${failure.code}.` : null,
                failure.requestId ? `Reference: ${failure.requestId}` : null,
              ]
                .filter(Boolean)
                .join(" ")}
              action={
                <Button variant="secondary" size="sm" onClick={run}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : null}
      </Panel>

      {pending.length > 0 && !busy ? (
        <div className="queue-mobile-bar">
          <span>
            <strong>{pending.length} queued</strong> ·{" "}
            {formatBytes(pending.reduce((sum, i) => sum + i.file.size, 0))}
          </span>
          <Button variant="primary" size="sm" onClick={run}>
            Optimize batch
          </Button>
        </div>
      ) : null}
      {/* ---------------------------------------------------------- review */}
      {showResults && response ? (
        <section
          aria-labelledby="review-panel"
          className="animate-fade-up flex flex-col gap-6"
        >
          <Panel aria-labelledby="review-panel">
            <PanelHeader
              id="review-panel"
              title="3 · Review results"
              description="Every value below was measured from the produced buffers."
              meta={
                <StatusBadge tone={statusToneFor(response.status)}>
                  {response.status}
                </StatusBadge>
              }
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {completed.length > 1 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={downloadAll}
                      loading={zipping}
                      leading={<Package className="size-3.5" aria-hidden />}
                    >
                      Download all (ZIP)
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    leading={<RotateCcw className="size-3.5" aria-hidden />}
                  >
                    Optimize another file
                  </Button>
                </div>
              }
            />
            {response.persisted ? null : (
              <div className="mb-4">
                <ErrorState
                  title="History storage is offline"
                  message="The history receipt could not be recorded. Your downloads are still available in this tab."
                  hint="Save your outputs before you leave the page."
                />
              </div>
            )}
            <StatStrip
              items={[
                {
                  label: "Input",
                  value: formatBytes(response.totals.inputBytes),
                  hint: `${response.results.length} files submitted`,
                },
                {
                  label: "Output",
                  value: formatBytes(response.totals.outputBytes),
                  hint: `${completed.length} converted`,
                },
                {
                  label: "Saved",
                  value: formatBytes(response.totals.savedBytes),
                  hint: formatSavingsPercent(response.totals.savingsPercent),
                },
                {
                  label: "Failed",
                  value: String(failed.length),
                  hint:
                    failed.length > 0 ? "details below" : "nothing rejected",
                },
              ]}
            />
            {completed.length > 0 ? (
              <div className="mt-5 border border-line">
                <p className="border-b border-line px-4 py-2.5 text-2xs font-medium tracking-[0.1em] text-muted uppercase">
                  Weight comparison
                </p>
                <div className="p-4">
                  <SavingsChart
                    rows={completed.map((item) => ({
                      label: shorten(item.file.name),
                      input: item.result!.inputBytes,
                      output: item.result!.outputBytes,
                    }))}
                    max={Math.max(
                      1,
                      ...completed.flatMap((item) => [
                        item.result!.inputBytes,
                        item.result!.outputBytes,
                      ]),
                    )}
                  />
                </div>
              </div>
            ) : null}
          </Panel>

          {failed.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Rejected files"
                description="These uploads were not converted. The rest of the batch is unaffected."
              />
              <ul className="flex flex-col gap-2">
                {failed.map((item) => (
                  <li
                    key={item.key}
                    className="border border-danger-border bg-danger-soft px-3 py-2.5"
                  >
                    <p className="truncate text-sm text-ink">
                      {item.file.name}
                    </p>
                    <p className="mt-0.5 text-xs text-danger/85">
                      {item.error}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {completed.length > 0 ? (
            <>
              <Panel padded={false}>
                <div className="px-4 pt-4 sm:px-5">
                  <PanelHeader
                    title="Batch table"
                    description="Aligned figures for scanning a large batch."
                  />
                </div>
                <TableShell minWidth={760}>
                  <thead>
                    <tr>
                      <Th>File</Th>
                      <Th numeric>Before</Th>
                      <Th numeric>After</Th>
                      <Th numeric>Saved</Th>
                      <Th numeric>Dimensions</Th>
                      <Th>Format</Th>
                      <Th numeric>Time</Th>
                      <Th numeric>Download</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {completed.map((item) => (
                      <tr key={item.key}>
                        <Td mono>
                          <span
                            className="block max-w-[13rem] truncate"
                            title={item.file.name}
                          >
                            {item.file.name}
                          </span>
                        </Td>
                        <Td numeric>{formatBytes(item.result!.inputBytes)}</Td>
                        <Td numeric>{formatBytes(item.result!.outputBytes)}</Td>
                        <Td numeric>
                          <span
                            className={
                              item.result!.savedBytes >= 0
                                ? "text-ok"
                                : "text-danger"
                            }
                          >
                            {formatBytes(item.result!.savedBytes)}
                          </span>
                          <span className="ml-1.5 text-muted">
                            {formatSavingsPercent(item.result!.savingsPercent)}
                          </span>
                        </Td>
                        <Td numeric>
                          {formatDimensions(
                            item.result!.outputWidth,
                            item.result!.outputHeight,
                          )}
                        </Td>
                        <Td mono>{item.result!.outputFormat}</Td>
                        <Td numeric>
                          {formatDuration(item.result!.durationMs)}
                        </Td>
                        <Td numeric>
                          <a
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover hover:underline"
                            href={item.outputUrl}
                            download={item.result!.outputFilename}
                          >
                            <Download className="size-3.5" aria-hidden />
                            Save
                          </a>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                {completed.map((item) => (
                  <ResultCard key={item.key} item={item} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {items.length === 0 && !busy ? (
        <Panel as="aside">
          <div className="flex gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-sunken text-accent">
              <Info className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">
                What happens to your files
              </h2>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">
                On-device processing keeps originals and outputs in this tab.
                Extended codecs use temporary server memory for formats your
                browser cannot handle. Only filenames and measurements are
                recorded in history. Download your files before leaving.
              </p>
              <ButtonLink
                href="/app/assets"
                variant="ghost"
                size="sm"
                className="mt-2 px-0"
              >
                Not sure which file to optimize? Analyze it first
              </ButtonLink>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  const router = useRouter();
  const result = item.result!;
  const sameAspect =
    result.outputFormat !== "tiff" &&
    !/\.tiff?$/i.test(item.file.name) &&
    result.inputWidth &&
    result.inputHeight &&
    result.outputWidth &&
    result.outputHeight &&
    Math.abs(
      result.inputWidth / result.inputHeight -
        result.outputWidth / result.outputHeight,
    ) < 0.01;

  return (
    <Panel as="article" aria-label={`Result for ${item.file.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-ink"
            title={item.file.name}
          >
            {item.file.name}
          </p>
          <p
            className="mt-0.5 truncate font-mono text-2xs text-muted"
            title={result.outputFilename}
          >
            {result.outputFilename}
          </p>
        </div>
        <StatusBadge tone={result.savedBytes >= 0 ? "ok" : "danger"}>
          {formatSavingsPercent(result.savingsPercent)}
        </StatusBadge>
      </div>

      <div className="mt-4">
        {sameAspect ? (
          <CompareSlider
            beforeSrc={item.preview}
            afterSrc={item.outputUrl!}
            alt={item.file.name}
            width={result.outputWidth ?? 1}
            height={result.outputHeight ?? 1}
          />
        ) : (
          <div className="checker grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line">
            <figure className="grid place-items-center p-2">
              {/\.tiff?$/i.test(item.file.name) ? (
                <span className="px-2 text-xs text-ink-soft">
                  TIFF preview unavailable in this browser.
                </span>
              ) : (
                <Image
                  unoptimized
                  width={result.inputWidth ?? 320}
                  height={result.inputHeight ?? 200}
                  src={item.preview}
                  alt={`Original ${item.file.name}`}
                  className="max-h-40 w-auto max-w-full object-contain"
                />
              )}
              <figcaption className="mt-1.5 font-mono text-2xs text-muted">
                original
              </figcaption>
            </figure>
            <figure className="grid place-items-center border-l border-line p-2">
              {result.outputFormat === "tiff" ? (
                <span className="text-xs text-ink-soft">
                  Download the TIFF to inspect it in an image editor.
                </span>
              ) : (
                <Image
                  unoptimized
                  width={result.outputWidth ?? 320}
                  height={result.outputHeight ?? 200}
                  src={item.outputUrl!}
                  alt={`Optimized ${item.file.name}`}
                  className="max-h-40 w-auto max-w-full object-contain"
                />
              )}
              <figcaption className="mt-1.5 font-mono text-2xs text-muted">
                optimized
              </figcaption>
            </figure>
          </div>
        )}
      </div>

      {result.retainedOriginal ? (
        <p className="mt-3 text-xs text-muted">
          Original retained — none of the tested outputs was smaller.
        </p>
      ) : null}
      {result.candidates && result.candidates.length > 1 ? (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">
            Compare {result.candidates.length} measured candidates
          </summary>
          {result.candidates.map((c, i) => (
            <p key={i} className="mt-1 font-mono">
              {c.format.toUpperCase()} ·{" "}
              {c.bytes ? formatBytes(c.bytes) : "unavailable"}{" "}
              {c.selected ? "· selected" : ""}
            </p>
          ))}
        </details>
      ) : null}
      <dl className="mt-4">
        <DefinitionRow
          label="Original size"
          value={formatBytes(result.inputBytes)}
        />
        <DefinitionRow
          label="Optimized size"
          value={formatBytes(result.outputBytes)}
        />
        <DefinitionRow
          label="Saved"
          value={
            <span
              className={result.savedBytes >= 0 ? "text-ok" : "text-danger"}
            >
              {formatBytes(result.savedBytes)} (
              {formatSavingsPercent(result.savingsPercent)})
            </span>
          }
        />
        <DefinitionRow
          label="Dimensions"
          value={`${formatDimensions(result.inputWidth, result.inputHeight)} → ${formatDimensions(result.outputWidth, result.outputHeight)}`}
        />
        <DefinitionRow
          label="Output format"
          value={`${result.outputFormat} · ${formatDuration(result.durationMs)}`}
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className={buttonClass({ variant: "primary", size: "sm" })}
          href={item.outputUrl}
          download={result.outputFilename}
        >
          <Download className="size-3.5" aria-hidden />
          Download
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!item.output) return;
            stageInspection(
              new File([item.output], result.outputFilename, {
                type: item.output.type,
              }),
            );
            router.push("/app/assets");
          }}
        >
          Inspect
        </Button>
      </div>
    </Panel>
  );
}

function shorten(name: string, max = 16): string {
  if (name.length <= max) return name;
  const ext = name.slice(name.lastIndexOf("."));
  return `${name.slice(0, max - ext.length - 1)}…${ext}`;
}
