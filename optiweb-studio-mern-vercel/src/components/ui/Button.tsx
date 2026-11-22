import { Link } from "react-router-dom";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { buttonClass, type ButtonSize, type ButtonVariant } from "./buttonClass";
export type { ButtonSize, ButtonVariant } from "./buttonClass";

type CommonButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  leading,
  trailing,
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: CommonButtonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={[buttonClass({ variant, size, fullWidth }), className].join(" ")}
    >
      {loading ? <Spinner /> : leading}
      {children}
      {trailing}
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  fullWidth,
  leading,
  trailing,
  children,
  className = "",
}: CommonButtonProps & { href: string }) {
  return (
    <Link
      to={href}
      className={[buttonClass({ variant, size, fullWidth }), className].join(" ")}
    >
      {leading}
      {children}
      {trailing}
    </Link>
  );
}

export function IconButton({
  label,
  children,
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: { label: string; children: ReactNode; variant?: ButtonVariant } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-grid size-9 place-items-center rounded-md border transition-colors duration-150 ${
        variant === "ghost"
          ? "border-transparent text-muted hover:bg-surface-sunken hover:text-ink"
          : "border-line-strong bg-surface text-ink-soft hover:bg-surface-sunken"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`size-3.5 animate-spin ${className}`} role="presentation">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
