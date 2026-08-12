import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { cn } from "@/src/lib/utils";

const SIZES = { xs: "size-4", sm: "size-5", md: "size-7", lg: "size-9", xl: "size-11" } as const;

/**
 * Asset mark. Logos live in `public/tokens/<SYMBOL>.svg`; anything without one
 * (USDG, ETH, an unlisted token) falls back to a lettered chip so rows never
 * collapse to a broken-image icon.
 */
export function TokenIcon({
  symbol,
  size = "md",
  className,
}: {
  symbol: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const sym = (symbol || "?").toUpperCase();
  React.useEffect(() => setFailed(false), [sym]);

  if (failed) {
    return (
      <span
        className={cn(
          SIZES[size],
          "flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-3 text-[0.34em] leading-none font-bold tracking-tight text-ink-2",
          className,
        )}
        aria-hidden="true"
      >
        {sym.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={`/tokens/${sym}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(SIZES[size], "shrink-0 rounded-full", className)}
    />
  );
}

/** Two overlapping marks for an LP pair. */
export function TokenPair({ a, b, size = "md" }: { a: string; b: string; size?: keyof typeof SIZES }) {
  return (
    <span className="flex shrink-0 items-center -space-x-2">
      <TokenIcon symbol={a} size={size} className="ring-2 ring-surface" />
      <TokenIcon symbol={b} size={size} className="ring-2 ring-surface" />
    </span>
  );
}

export type TokenOption = { symbol: string; name?: string; meta?: string };

/** Logo-bearing token dropdown — replaces the native <select> on the swap card. */
export function TokenSelect({
  value,
  options,
  onChange,
  align = "right",
}: {
  value: string;
  options: TokenOption[];
  onChange: (symbol: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const selected = options.find((o) => o.symbol === value);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface-3 pr-2.5 pl-1.5 text-[15px] font-semibold text-ink transition-colors hover:border-line-strong"
      >
        <TokenIcon symbol={value} size="md" />
        {selected?.symbol ?? value}
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute z-30 mt-2 max-h-[320px] w-[268px] overflow-y-auto rounded-lg border border-line-strong bg-surface-2 p-1 shadow-2xl shadow-black/60",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((o) => {
            const active = o.symbol === value;
            return (
              <button
                key={o.symbol}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.symbol);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                  active ? "bg-surface-3" : "hover:bg-surface-3/60",
                )}
              >
                <TokenIcon symbol={o.symbol} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{o.symbol}</span>
                  {o.name && <span className="block truncate text-[12.5px] text-ink-3">{o.name}</span>}
                </span>
                {o.meta && <span className="shrink-0 text-[13px] tabular-nums text-ink-3">{o.meta}</span>}
                {active && <Check className="size-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
