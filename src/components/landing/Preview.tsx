"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Image as ImageGlyph,
  ArrowDownRight,
  ChevronsLeftRight,
  MousePointer2,
  FileImage,
} from "lucide-react";
import sample from "@/generated/sample.json";
import { formatBytes } from "@/lib/format";

/** Both sides are the actual files described in the measurements, not a filtered mock. */
export function Preview() {
  const [position, setPosition] = useState(48);
  const saved = sample.inputBytes - sample.outputBytes;
  return (
    <figure
      className="studio-preview"
      aria-label="Compare a real JPEG to its WebP conversion"
    >
      <div className="preview-title">
        <span>
          <ImageGlyph size={16} aria-hidden /> Optimization preview
        </span>
        <small>
          <i /> Interactive demo
        </small>
      </div>
      <div className="preview-inset">
        <div
          className="preview-image"
          style={{ "--split": `${position}%` } as React.CSSProperties}
        >
          <Image
            priority
            unoptimized
            src="/samples/alpine-ridge.webp"
            width={sample.width}
            height={sample.height}
            alt="Optimized alpine ridgeline at violet dusk"
            draggable={false}
          />
          <Image
            unoptimized
            src="/samples/alpine-ridge.jpg"
            width={sample.width}
            height={sample.height}
            alt="Original alpine ridgeline"
            className="original-layer"
            draggable={false}
          />
          <div className="preview-label label-a">Original</div>
          <div className="preview-label label-b">Optimized</div>
          <div className="preview-rule">
            <span>
              <ChevronsLeftRight aria-hidden="true" size={18} />
            </span>
          </div>
          <input
            aria-label="Before and after comparison"
            aria-valuetext={`${position}% original`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={position}
            onChange={(e) => setPosition(+e.target.value)}
          />
        </div>
        <div className="preview-file">
          <span>
            <FileImage aria-hidden="true" size={13} /> alpine-ridge.jpg
          </span>
          <b>
            {sample.width} × {sample.height} px
          </b>
        </div>
      </div>
      <dl className="preview-measures">
        <div>
          <dt>Original size</dt>
          <dd>{formatBytes(sample.inputBytes)}</dd>
        </div>
        <div>
          <dt>Optimized size</dt>
          <dd>{formatBytes(sample.outputBytes)}</dd>
        </div>
        <div>
          <dt>Size reduction</dt>
          <dd className="measure-saving">
            <ArrowDownRight aria-hidden="true" size={17} />
            {((saved / sample.inputBytes) * 100).toFixed(1)}%
          </dd>
        </div>
      </dl>
      <figcaption>
        <MousePointer2 aria-hidden="true" size={12} /> Drag to compare{" "}
        <span>
          JPEG <span aria-hidden>→</span> WEBP
        </span>
      </figcaption>
    </figure>
  );
}
