import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { TokenUnit } from "@/src/components/ui/token";
import { cn } from "@/src/lib/utils";

/* ---------------------------------- Input --------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-line bg-surface-2 px-3 text-sm text-ink",
        "placeholder:text-ink-4 focus:border-line-strong focus:outline-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/**
 * Compact amount field for dense forms.
 *
 * The unit is drawn as the asset's mark plus its ticker rather than as a word:
 * on a page where four fields sit side by side, the logo is what tells them
 * apart at a glance, and it is the same mark the row above uses.
 */
export function AmountInput({
  value,
  onChange,
  unit,
  onMax,
  id,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  onMax?: () => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 pr-2.5 transition-colors focus-within:border-line-strong",
        disabled && "opacity-60",
      )}
    >
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] tabular-nums text-ink placeholder:text-ink-4 focus:outline-none"
      />
      {onMax && (
        <button
          type="button"
          onClick={onMax}
          className="rounded-sm px-1.5 py-0.5 text-[12px] font-semibold tracking-wide text-accent uppercase transition-colors hover:bg-accent-soft"
        >
          Max
        </button>
      )}
      {unit && <TokenUnit symbol={unit} className="border-l border-line py-1 pl-2.5" />}
    </div>
  );
}

/* ---------------------------------- Badge --------------------------------- */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-ink-2",
        good: "bg-up/12 text-up",
        warn: "bg-warn/12 text-warn",
        bad: "bg-down/12 text-down",
        accent: "bg-accent-soft text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ---------------------------------- Stat ---------------------------------- */

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3.5", className)}>
      <dt className="truncate text-[13px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate text-[16px] font-semibold tabular-nums",
          tone === "good" && "text-up",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-down",
          !tone && "text-ink",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 truncate text-[12px] text-ink-4">{hint}</p>}
    </div>
  );
}

/** Hairline grid of stats — one shared border, no nested boxes. */
export function StatGrid({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4 [&>*]:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------- Feedback -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

const alertVariants = cva("flex items-start gap-3 rounded-md border px-4 py-3 text-[14px]", {
  variants: {
    tone: {
      info: "border-line bg-surface text-ink-2",
      good: "border-up/25 bg-up/8 text-up",
      warn: "border-warn/25 bg-warn/8 text-warn",
      bad: "border-down/25 bg-down/8 text-down",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Alert({
  title,
  children,
  tone,
  action,
}: VariantProps<typeof alertVariants> & {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(alertVariants({ tone }))} role="status">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5 text-ink-2">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line px-6 py-7 text-center">
      <p className="text-[14.5px] font-semibold text-ink">{title}</p>
      <p className="max-w-md text-[13.5px] text-ink-3">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------------------------- Prose --------------------------------- */

/** Long-form section used by the Docs and Learn pages. */
export function Article({
  eyebrow,
  title,
  children,
  id,
  className,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <article id={id} className={cn("scroll-mt-24 rounded-lg border border-line bg-surface p-6", className)}>
      {eyebrow && (
        <p className="mb-2 text-[12px] font-semibold tracking-[0.14em] text-ink-4 uppercase">{eyebrow}</p>
      )}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-ink-2 [&_code]:rounded-sm [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink [&_li]:leading-relaxed [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}

export function Callout({ title, children, tone = "info" }: { title: string; children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        tone === "warn" ? "border-warn/25 bg-warn/8" : "border-line bg-surface-2",
      )}
    >
      <p className={cn("text-[14px] font-semibold", tone === "warn" ? "text-warn" : "text-ink")}>{title}</p>
      <div className="mt-1 text-[14px] text-ink-2">{children}</div>
    </div>
  );
}
