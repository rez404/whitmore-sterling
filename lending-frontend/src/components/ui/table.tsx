import * as React from "react";
import { cn } from "@/src/lib/utils";

/**
 * Page section. Deliberately NOT a card: a typographic header over a hairline,
 * with content sitting directly on the page background. Boxing every section in
 * a bordered panel is what makes a dense app read as generic — borders here are
 * reserved for separating data, not for decoration.
 */
export function Section({
  title,
  meta,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-b border-line pb-3">
          <h2 className="text-[13px] font-semibold tracking-[0.13em] text-ink-2 uppercase">{title}</h2>
          <div className="flex items-baseline gap-3">
            {meta && <p className="text-[14px] text-ink-4">{meta}</p>}
            {action}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------------------------- table --------------------------------- */

export function DataTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse px-1 text-left">
        <thead>
          <tr className="border-b border-line">{head}</tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 pb-2 text-[12.5px] font-semibold tracking-[0.09em] text-ink-4 uppercase",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn("px-3 py-3 text-[15.5px] text-ink-2", align === "right" && "text-right tabular-nums", className)}
    >
      {children}
    </td>
  );
}

/** Numeric emphasis — the figure a user actually scans the column for. */
export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-medium tabular-nums text-ink", className)}>{children}</span>;
}

/* -------------------------- key/value figure strip ------------------------- */

/**
 * Top-of-page figures. A row of labelled numbers separated by hairlines —
 * no boxes, no backgrounds.
 */
export function FigureRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-10 gap-y-6 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Figure({
  label,
  value,
  hint,
  tone,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "good" | "warn" | "bad";
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12.5px] font-medium tracking-[0.1em] text-ink-4 uppercase">{label}</dt>
      <dd
        className={cn(
          "mt-2 truncate tabular-nums",
          size === "lg" ? "text-[34px] leading-none font-semibold" : "text-[26px] leading-none font-medium",
          tone === "good" && "text-up",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-down",
          !tone && "text-ink",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-1.5 truncate text-[13.5px] text-ink-4">{hint}</p>}
    </div>
  );
}
