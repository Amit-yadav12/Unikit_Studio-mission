import { ProductMark } from "@/components/brand/ProductMark";

export default function Loading() {
  return (
    <main id="main" className="grid min-h-[75vh] place-items-center bg-canvas">
      <div
        role="status"
        className="flex flex-col items-center gap-3 text-sm text-muted"
      >
        <ProductMark size={44} />
        <span>Opening Unikit Studio…</span>
        <span className="h-0.5 w-20 animate-pulse-soft rounded bg-accent" />
      </div>
    </main>
  );
}
