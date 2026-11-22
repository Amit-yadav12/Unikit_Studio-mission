export const BRAND_NAME="Unikit Studio";
export const BRAND_TAGLINE="Runs in your browser";

/** A clean vector trace of the supplied U and five terminal-ended circuit paths. */
export function ProductMark({ size = 36, tone = "ink" }: { size?: number; tone?: "ink" | "inverse" | "accent" }) {
  return <img className={`brand-symbol brand-symbol-${tone}`} src="/brand/unikit-symbol.svg" width={Math.round(size * .68)} height={size} style={{ width: Math.round(size*.68), height: size }} alt="Unikit Studio" />;
}

export function Wordmark({ compact = false }: { compact?: boolean; tagline?:boolean; tone?: "ink" | "inverse" }) {
  return <span className={`brand-wordmark${compact ? " brand-compact" : ""}`}><ProductMark size={compact ? 32 : 38}/><span>Unikit <span className="brand-second">Studio</span></span></span>;
}
