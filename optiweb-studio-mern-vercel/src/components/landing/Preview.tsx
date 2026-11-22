import { useState } from "react";
import { ArrowDownRight, ChevronsLeftRight, FileImage, Image as ImageGlyph, MousePointer2 } from "lucide-react";

import sample from "@/generated/sample.json";
import { formatBytes } from "@/lib/format";

/** Both sides are the actual local files described by the measured byte counts. */
export function Preview() {
  const [position, setPosition] = useState(48);
  const [imagesAvailable, setImagesAvailable] = useState(true);
  const saved = sample.inputBytes - sample.outputBytes;
  const onImageError = () => setImagesAvailable(false);

  return (
    <figure className="studio-preview" aria-label="Compare a real JPEG to its WebP conversion">
      <div className="preview-title">
        <span><ImageGlyph size={16} aria-hidden="true" /> Optimization preview</span>
        <small><i aria-hidden="true" /> Interactive demo</small>
      </div>
      <div className="preview-inset">
        <div className="preview-image" style={{ "--split": `${position}%` } as React.CSSProperties}>
          {imagesAvailable ? (
            <>
              <img
                fetchPriority="high"
                src="/samples/alpine-ridge.webp"
                width={sample.width}
                height={sample.height}
                alt=""
                aria-hidden="true"
                draggable={false}
                onError={onImageError}
              />
              <img
                src="/samples/alpine-ridge.jpg"
                width={sample.width}
                height={sample.height}
                alt=""
                aria-hidden="true"
                className="original-layer"
                draggable={false}
                onError={onImageError}
              />
              <div className="preview-label label-a">Original</div>
              <div className="preview-label label-b">Optimized</div>
              <div className="preview-rule" aria-hidden="true">
                <span><ChevronsLeftRight size={18} /></span>
              </div>
              <input
                aria-label="Before and after comparison"
                aria-valuetext={`${position}% original`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
              />
            </>
          ) : (
            <div className="preview-fallback" role="status">
              <ImageGlyph size={20} aria-hidden="true" />
              <span>Comparison preview is temporarily unavailable.</span>
            </div>
          )}
        </div>
        <div className="preview-file">
          <span><FileImage aria-hidden="true" size={13} /> alpine-ridge.jpg</span>
          <b>{sample.width} × {sample.height} px</b>
        </div>
      </div>
      <dl className="preview-measures">
        <div><dt>Original size</dt><dd>{formatBytes(sample.inputBytes)}</dd></div>
        <div><dt>Optimized size</dt><dd>{formatBytes(sample.outputBytes)}</dd></div>
        <div>
          <dt>Size reduction</dt>
          <dd className="measure-saving">
            <ArrowDownRight aria-hidden="true" size={17} />
            {(saved / sample.inputBytes * 100).toFixed(1)}%
          </dd>
        </div>
      </dl>
      <figcaption>
        <MousePointer2 aria-hidden="true" size={12} /> Drag to compare
        <span>JPEG <span aria-hidden="true">→</span> WEBP</span>
      </figcaption>
    </figure>
  );
}
