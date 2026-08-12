import * as React from "react";
import { TokenPill } from "@/src/components/ui/token";
import { cn } from "@/src/lib/utils";

/**
 * The field a user commits a size in — swap legs, zap in, vault deposits.
 *
 * One box holds the whole decision: what the leg is for, the figure at a size
 * you cannot mistype, the denomination as a mark rather than a word, and the
 * balance line underneath. Every surface that takes an amount uses this, so the
 * app has exactly one input people have to learn.
 */
export function AmountField({
  caption,
  note,
  value,
  onChange,
  selector,
  token,
  footer,
  readOnly,
  disabled,
  placeholder = "0.0",
  tone,
  className,
}: {
  caption: React.ReactNode;
  /** Right of the caption — usually what the typed amount is worth. */
  note?: React.ReactNode;
  value: string;
  onChange?: (v: string) => void;
  /** Interactive token picker. Takes precedence over `token`. */
  selector?: React.ReactNode;
  /** Fixed denomination, when the side of the trade is not a choice. */
  token?: string;
  footer?: React.ReactNode;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  tone?: "warn";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-surface-2 p-3.5 transition-colors",
        tone === "warn" ? "border-warn/30" : "border-line focus-within:border-line-strong",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium tracking-wide text-ink-4 uppercase">{caption}</span>
        {note && <span className="shrink-0 text-[13px] tabular-nums text-ink-4">{note}</span>}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value.replace(/[^0-9.]/g, "")) : undefined}
          readOnly={readOnly}
          disabled={disabled}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={typeof caption === "string" ? [caption, token].filter(Boolean).join(" ") : undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[30px] font-semibold tabular-nums text-ink placeholder:text-ink-4 focus:outline-none",
            readOnly && "text-ink-2",
          )}
        />
        {selector ?? (token ? <TokenPill symbol={token} /> : null)}
      </div>
      {footer && <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">{footer}</div>}
    </div>
  );
}

/** Right-aligned balance line with a Max affordance — the usual field footer. */
export function BalanceLine({
  label = "Balance",
  amount,
  onMax,
  maxLabel = "Max",
}: {
  label?: string;
  amount: string;
  onMax?: () => void;
  maxLabel?: string;
}) {
  return (
    <>
      <span className="text-ink-4">
        {label} <span className="tabular-nums text-ink-3">{amount}</span>
      </span>
      {onMax && (
        <button
          type="button"
          onClick={onMax}
          className="rounded-sm px-1.5 py-0.5 text-[12.5px] font-semibold tracking-wide text-accent uppercase transition-colors hover:bg-accent-soft"
        >
          {maxLabel}
        </button>
      )}
    </>
  );
}
