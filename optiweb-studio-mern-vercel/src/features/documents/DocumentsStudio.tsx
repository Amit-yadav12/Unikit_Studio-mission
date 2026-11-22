import { useRef, useState } from "react";
import { Archive, ArrowDownToLine, ArrowLeftRight, Check, FileImage, FileOutput, FileText, Images, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Layout";
import { StatusBadge } from "@/components/ui/Feedback";
import { formatBytes, formatSavingsPercent } from "@/lib/format";
import { MAX_DOCUMENT_BYTES, MAX_IMAGE_INPUTS } from "./documentLimits";
import type { DocumentOperation, DocumentResult } from "./documentLimits";
import { assertDocumentSize } from "./documentValidation";

type Operation = { id: DocumentOperation; title: string; detail: string; accepts: string; icon: typeof FileText; multi?: boolean };

const OPERATIONS: Operation[] = [
  { id: "compress-pdf", title: "Compress PDF", detail: "Lossless rewrite or balanced, raster-based reduction.", accepts: ".pdf,application/pdf", icon: FileText },
  { id: "pdf-to-images", title: "PDF to images", detail: "Export each page as a PNG or JPEG, in order.", accepts: ".pdf,application/pdf", icon: FileImage },
  { id: "images-to-pdf", title: "Images to PDF", detail: "Combine PNG and JPEG images into one PDF.", accepts: ".png,.jpg,.jpeg,image/png,image/jpeg", icon: Images, multi: true },
  { id: "pdf-to-pptx", title: "PDF to PowerPoint", detail: "One full-page image per slide; not editable text.", accepts: ".pdf,application/pdf", icon: FileOutput },
  { id: "compress-pptx", title: "Optimize PowerPoint", detail: "Reduce supported embedded raster images safely.", accepts: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", icon: Archive },
  { id: "pptx-to-pdf", title: "PowerPoint to PDF", detail: "Render supported slides as a static visual PDF.", accepts: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", icon: ArrowLeftRight },
];

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resultStatus(result: DocumentResult): { label: string; tone: "ok" | "warn" } {
  if (result.keptOriginal) return { label: "Original retained", tone: "warn" };
  if (result.outputBytes < result.sourceBytes) return { label: "Smaller output", tone: "ok" };
  return { label: "Conversion ready", tone: "ok" };
}

export function DocumentsStudio() {
  const [operation, setOperation] = useState<DocumentOperation>("compress-pdf");
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [pdfMode, setPdfMode] = useState<"lossless" | "balanced">("balanced");
  const [imageFormat, setImageFormat] = useState<"png" | "jpeg">("png");
  const [progress, setProgress] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DocumentResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = OPERATIONS.find((item) => item.id === operation)!;
  const chosenFiles = operation === "images-to-pdf" ? images : file ? [file] : [];
  const inputBytes = chosenFiles.reduce((total, entry) => total + entry.size, 0);

  function changeOperation(next: DocumentOperation) {
    if (working) return;
    setOperation(next);
    setFile(null);
    setImages([]);
    setError("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFiles(list: FileList | null) {
    setError(""); setResult(null);
    if (!list?.length) return;
    try {
      const selected = Array.from(list);
      if (operation === "images-to-pdf") {
        if (selected.length > MAX_IMAGE_INPUTS) throw new Error(`Choose no more than ${MAX_IMAGE_INPUTS} images at once.`);
        const total = selected.reduce((sum, item) => sum + item.size, 0);
        if (total > MAX_DOCUMENT_BYTES) throw new Error("Image-to-PDF inputs are limited to 15 MB total.");
        setImages(selected); setFile(null);
      } else {
        if (selected.length !== 1) throw new Error("Choose one document at a time.");
        assertDocumentSize(selected[0]);
        setFile(selected[0]); setImages([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not use this selection.");
      setFile(null); setImages([]);
    }
  }

  async function process() {
    if (!chosenFiles.length || working) return;
    setWorking(true); setError(""); setResult(null); setProgress("Loading the local document engine");
    const onProgress = (completed: number, total: number, label?: string) => {
      setProgress(label || `Processing ${completed} of ${total}`);
    };
    try {
      let outcome: DocumentResult;
      if (operation === "compress-pptx" || operation === "pptx-to-pdf") {
        const processors = await import("./pptxProcessors");
        outcome = operation === "compress-pptx"
          ? await processors.compressPptx(file!, onProgress)
          : await processors.pptxToPdf(file!, onProgress);
      } else {
        const processors = await import("./pdfProcessors");
        if (operation === "compress-pdf") outcome = await processors.compressPdf(file!, pdfMode, onProgress);
        else if (operation === "pdf-to-images") outcome = await processors.pdfToImages(file!, imageFormat, onProgress);
        else if (operation === "images-to-pdf") outcome = await processors.imagesToPdf(images, onProgress);
        else outcome = await processors.pdfToPptx(file!, onProgress);
      }
      setResult(outcome);
      setProgress("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be processed.");
      setProgress("");
    } finally { setWorking(false); }
  }

  function download() {
    if (!result) return;
    saveBlob(result.output, result.outputName);
  }

  const savings = result && result.outputBytes < result.sourceBytes ? result.sourceBytes - result.outputBytes : 0;
  const status = result ? resultStatus(result) : null;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="overflow-hidden" padded={false}>
        <div className="border-b border-line bg-surface-sunken/45 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center border border-accent-border bg-accent-soft text-accent"><Sparkles className="size-5" aria-hidden /></span>
              <div><p className="font-mono text-2xs tracking-[0.14em] text-muted uppercase">Documents · local studio</p><h2 className="mt-1 text-base font-semibold text-ink">Choose a document tool</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">Your document stays in this browser tab. No document bytes, file names or processing results are sent to an API or saved on a server.</p></div>
            </div>
            <StatusBadge tone="ok" icon={<LockKeyhole className="size-3" aria-hidden />}>On-device</StatusBadge>
          </div>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {OPERATIONS.map((item) => {
            const Icon = item.icon;
            const active = operation === item.id;
            return <button key={item.id} type="button" onClick={() => changeOperation(item.id)} aria-pressed={active} className={`group flex min-h-24 items-start gap-3 bg-surface px-4 py-4 text-left transition-colors hover:bg-surface-sunken/60 ${active ? "ring-1 ring-inset ring-accent-border bg-accent-soft/35" : ""}`}>
              <span className={`grid size-9 shrink-0 place-items-center border ${active ? "border-accent-border bg-accent-soft text-accent" : "border-line bg-surface-sunken text-muted"}`}><Icon className="size-4" aria-hidden /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{item.detail}</span></span>
              {active && <Check className="ml-auto size-4 shrink-0 text-accent" aria-hidden />}
            </button>;
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)]">
        <Panel>
          <PanelHeader title={current.title} description={current.multi ? "Choose up to 20 supported images, 15 MB total." : "One PDF or .pptx at a time, up to 15 MB."} />
          <label htmlFor="documents-file" className={`flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-6 text-center transition-colors ${chosenFiles.length ? "border-accent-border bg-accent-soft/30" : "border-line-strong bg-surface-sunken/30 hover:border-accent-border hover:bg-accent-soft/20"}`}>
            <span className="grid size-10 place-items-center border border-line bg-surface text-accent"><current.icon className="size-5" aria-hidden /></span>
            <span className="mt-3 text-sm font-semibold text-ink">{chosenFiles.length ? `${chosenFiles.length} file${chosenFiles.length > 1 ? "s" : ""} selected` : current.multi ? "Choose PNG or JPEG images" : "Choose a document"}</span>
            <span className="mt-1 max-w-md text-xs text-muted">{chosenFiles.length ? chosenFiles.map((item) => item.name).join(" · ") : `Accepted: ${current.accepts.split(",").filter((part) => part.startsWith(".")).join(", ")}. Maximum 15 MB.`}</span>
            <input ref={inputRef} id="documents-file" type="file" className="sr-only" accept={current.accepts} multiple={current.multi} onChange={(event) => selectFiles(event.currentTarget.files)} disabled={working} aria-label={current.multi ? "Choose images" : "Choose one document"} />
          </label>
          {chosenFiles.length > 0 && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span>{current.multi ? `${images.length} images · ${formatBytes(inputBytes)} total` : chosenFiles[0].name}</span><button type="button" onClick={() => { setFile(null); setImages([]); setResult(null); if (inputRef.current) inputRef.current.value = ""; }} className="inline-flex items-center gap-1 text-ink-soft hover:text-danger" disabled={working}><X className="size-3.5" aria-hidden />Remove</button></div>}

          {operation === "compress-pdf" && <fieldset className="mt-4"><legend className="mb-2 text-xs font-medium text-ink">Compression approach</legend><div className="grid gap-2 sm:grid-cols-2">
            <label className={`flex cursor-pointer gap-2 border p-3 ${pdfMode === "lossless" ? "border-accent-border bg-accent-soft/30" : "border-line bg-surface"}`}><input type="radio" name="pdf-compression" checked={pdfMode === "lossless"} onChange={() => setPdfMode("lossless")} /><span><span className="block text-xs font-semibold text-ink">Lossless rewrite</span><span className="mt-1 block text-2xs leading-relaxed text-muted">Preserves page content; may make little or no size reduction. Original retained if output grows.</span></span></label>
            <label className={`flex cursor-pointer gap-2 border p-3 ${pdfMode === "balanced" ? "border-accent-border bg-accent-soft/30" : "border-line bg-surface"}`}><input type="radio" name="pdf-compression" checked={pdfMode === "balanced"} onChange={() => setPdfMode("balanced")} /><span><span className="block text-xs font-semibold text-ink">Balanced · raster pages</span><span className="mt-1 block text-2xs leading-relaxed text-muted">Recommended for size reduction; pages become JPEG images, not searchable text.</span></span></label>
          </div></fieldset>}
          {operation === "pdf-to-images" && <div className="mt-4"><label htmlFor="document-image-format" className="mb-1.5 block text-xs font-medium text-ink">Export image format</label><select id="document-image-format" value={imageFormat} onChange={(event) => setImageFormat(event.target.value as "png" | "jpeg")} className="h-9 border border-line-strong bg-surface px-2 text-sm text-ink"><option value="png">PNG · lossless, larger</option><option value="jpeg">JPEG · smaller, white background</option></select></div>}
          {error && <div role="alert" className="mt-4 border border-danger-border bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger">{error}</div>}
          {working && <div className="mt-4 flex items-center gap-2 border border-accent-border bg-accent-soft/30 px-3 py-2.5 text-xs text-accent-hover" role="status" aria-live="polite"><LoaderCircle className="size-4 animate-spin" aria-hidden />{progress || "Processing locally…"}</div>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void process()} disabled={!chosenFiles.length || working} className="inline-flex min-h-10 items-center justify-center gap-2 border border-accent bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"><Sparkles className="size-4" aria-hidden />{working ? "Working…" : "Process in browser"}</button>
            {chosenFiles.length > 0 && <span className="text-xs text-muted">Input · {formatBytes(inputBytes)}</span>}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel><PanelHeader title="At a glance" /><dl className="divide-y divide-line text-xs">
            <div className="flex justify-between gap-3 py-2"><dt className="text-muted">PDF / PPTX file size</dt><dd className="font-mono text-ink">15 MB max</dd></div>
            <div className="flex justify-between gap-3 py-2"><dt className="text-muted">PDF pages</dt><dd className="font-mono text-ink">200 max</dd></div>
            <div className="flex justify-between gap-3 py-2"><dt className="text-muted">PPTX slides</dt><dd className="font-mono text-ink">120 max</dd></div>
            <div className="flex justify-between gap-3 py-2"><dt className="text-muted">Image inputs</dt><dd className="font-mono text-ink">20 · 15 MB total</dd></div>
          </dl><p className="mt-3 text-2xs leading-relaxed text-muted">Per-operation page and pixel caps also apply to protect browser memory. Legacy .ppt files are not supported.</p></Panel>
          <Panel><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /><div><h3 className="text-xs font-semibold text-ink">Private by design</h3><p className="mt-1 text-xs leading-relaxed text-muted">No document upload, API processing, server storage or history. Downloads are created locally from browser memory. Temporary object URLs are revoked after use.</p></div></div></Panel>
        </div>
      </div>

      {result && status && <Panel className="border-accent-border"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-ink">Result ready</h2><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div><p className="mt-1 text-xs text-muted">{result.outputName}</p></div><button type="button" onClick={download} className="inline-flex min-h-9 items-center gap-2 border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-sunken"><ArrowDownToLine className="size-4" aria-hidden />Download locally</button></div>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 md:grid-cols-4">
          <div><dt className="text-2xs font-medium tracking-wide text-muted uppercase">Original</dt><dd className="mt-1 font-mono text-sm text-ink">{formatBytes(result.sourceBytes)}</dd></div>
          <div><dt className="text-2xs font-medium tracking-wide text-muted uppercase">Output</dt><dd className="mt-1 font-mono text-sm text-ink">{formatBytes(result.outputBytes)}</dd></div>
          <div><dt className="text-2xs font-medium tracking-wide text-muted uppercase">Measured savings</dt><dd className="mt-1 font-mono text-sm text-ink">{savings ? `${formatBytes(savings)} · ${formatSavingsPercent(Math.round((savings / result.sourceBytes) * 1000) / 10)}` : "None; no saving claimed"}</dd></div>
          <div><dt className="text-2xs font-medium tracking-wide text-muted uppercase">Count · time</dt><dd className="mt-1 font-mono text-sm text-ink">{result.pagesOrSlides == null ? "—" : `${result.pagesOrSlides} pages/slides`} · {(result.durationMs / 1000).toFixed(2)} s</dd></div>
        </dl>
        {result.notices.length > 0 && <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3">{result.notices.map((notice, index) => <li key={`${index}-${notice}`} className="flex gap-2 text-xs leading-relaxed text-warn"><span aria-hidden>!</span><span>{notice}</span></li>)}</ul>}
      </Panel>}
      <p className="text-2xs leading-relaxed text-muted">Selecting and processing a file happens only in this browser tab. The output is generated in memory. Leaving the page clears the working session.</p>
    </div>
  );
}
