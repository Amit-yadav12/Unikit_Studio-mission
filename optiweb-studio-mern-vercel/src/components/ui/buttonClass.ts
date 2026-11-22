export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonClassOptions = { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string };

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out select-none disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-[0.5px]";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "studio-action text-white hover:bg-accent-hover hover:border-accent-hover shadow-[0_1px_2px_rgba(23,33,43,0.16)]",
  secondary: "border-line-strong bg-surface text-ink hover:bg-surface-sunken hover:border-faint",
  ghost: "border-transparent bg-transparent text-ink-soft hover:bg-surface-sunken hover:text-ink",
  danger: "border-danger-border bg-danger-soft text-danger hover:brightness-95",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9.5 px-3.5 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonClass({ variant = "secondary", size = "md", fullWidth = false }: ButtonClassOptions = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth ? "w-full" : ""].filter(Boolean).join(" ");
}
