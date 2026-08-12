import * as React from "react";
import { compactNum } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";

/**
 * Money and quantity display where the fractional part is dimmed.
 *
 * A price column is scanned for magnitude first and precision second, so the
 * dollars carry full contrast and the cents step back. It is the difference
 * between a table that reads and a table that has to be parsed.
 */
export function Money({
  value,
  decimals = 2,
  currency = true,
  compact,
  className,
}: {
  value?: number | null;
  decimals?: number;
  currency?: boolean;
  /** Abbreviate below `sm` — for aggregate figures that will not fit on a phone. */
  compact?: boolean;
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) return <span className={cn("text-ink-4", className)}>—</span>;

  // Only worth abbreviating once the full figure is actually too wide; under
  // five digits both forms are the same length and rounding just loses cents.
  if (compact && Math.abs(value) >= 10_000) {
    return (
      <span className={cn("tabular-nums whitespace-nowrap", className)}>
        <span className="sm:hidden">{compactNum(value, currency)}</span>
        <span className="hidden sm:inline">
          <Money value={value} decimals={decimals} currency={currency} />
        </span>
      </span>
    );
  }

  const fmt = new Intl.NumberFormat(undefined, {
    ...(currency ? { style: "currency" as const, currency: "USD" } : {}),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const parts = fmt.formatToParts(value);
  const headParts: string[] = [];
  const tailParts: string[] = [];
  let seenDecimal = false;
  for (const p of parts) {
    if (p.type === "decimal") seenDecimal = true;
    (seenDecimal ? tailParts : headParts).push(p.value);
  }

  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {headParts.join("")}
      {tailParts.length > 0 && <span className="text-ink-4">{tailParts.join("")}</span>}
    </span>
  );
}

/** Live / stale / pending marker. A dot reads faster than a pill and adds no chrome. */
export function Status({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "idle";
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] whitespace-nowrap text-ink-3">
      <span
        className={cn(
          "size-[6px] shrink-0 rounded-full",
          tone === "good" && "bg-up",
          tone === "warn" && "bg-warn",
          tone === "bad" && "bg-down",
          tone === "idle" && "bg-ink-4",
        )}
      />
      {children}
    </span>
  );
}

/** Small uppercase label used above rules and inside dense strips. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[12.5px] font-medium tracking-[0.1em] text-ink-4 uppercase", className)}>
      {children}
    </span>
  );
}
