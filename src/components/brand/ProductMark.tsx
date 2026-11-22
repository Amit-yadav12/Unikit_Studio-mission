import Image from "next/image";

/** A clean vector trace of the supplied U and five terminal-ended circuit paths. */
export function ProductMark({
  size = 36,
  tone = "ink",
}: {
  size?: number;
  tone?: "ink" | "inverse" | "accent";
}) {
  return (
    <Image
      className={`brand-symbol brand-symbol-${tone}`}
      src="/brand/unikit-symbol.svg"
      unoptimized
      width={Math.round(size * 0.68)}
      height={size}
      style={{ width: Math.round(size * 0.68), height: size }}
      alt="Unikit Studio"
    />
  );
}

export function Wordmark({
  compact = false,
}: {
  compact?: boolean;
  tone?: "ink" | "inverse";
}) {
  return (
    <span className={`brand-wordmark${compact ? " brand-compact" : ""}`}>
      <ProductMark size={compact ? 32 : 38} />
      <span>
        Unikit <span className="brand-second">Studio</span>
      </span>
    </span>
  );
}
