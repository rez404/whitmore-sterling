import * as React from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Coins,
  ExternalLink,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  Search,
  Sprout,
  Wallet,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { TokenIcon } from "@/src/components/ui/token";
import { CHAIN, type DeskTab, type PriceMap } from "@/src/lib/chain";
import { explorer, priceFmt, short } from "@/src/lib/format";
import { LENDING_POOL_ADDRESS, MARKETS, TREASURY_ADDRESS } from "@/src/markets";

const NAV: { id: DeskTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "borrow", label: "Borrow", icon: Landmark },
  { id: "lending", label: "Lend", icon: Coins },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
  { id: "farms", label: "Farms", icon: Sprout },
  { id: "stake", label: "Stake", icon: Wallet },
];

const SECONDARY: { id: DeskTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "education", label: "Learn", icon: GraduationCap },
  { id: "documentation", label: "Docs", icon: FileText },
  { id: "suits", label: "Suits", icon: BookOpen },
];

export function Sidebar({ tab, setTab }: { tab: DeskTab; setTab: (t: DeskTab) => void }) {
  const item = (entry: (typeof NAV)[number]) => {
    const Icon = entry.icon;
    const active = tab === entry.id;
    return (
      <button
        key={entry.id}
        data-nav={entry.id}
        onClick={() => setTab(entry.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-md px-3 text-[16px] font-medium transition-colors",
          active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )}
      >
        <Icon className={cn("size-[19px] shrink-0", active ? "text-accent" : "text-ink-3")} />
        {entry.label}
      </button>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col gap-7 border-r border-line bg-surface px-3 py-5 lg:flex">
      <a href="#top" className="flex items-center gap-3 px-2" aria-label="Whitmore Sterling — home">
        <img src="/whitmore-mark.svg" alt="" className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
            Whitmore Sterling
          </span>
          <span className="block text-[11px] leading-tight font-medium tracking-[0.22em] text-ink-4 uppercase">
            Texas
          </span>
        </span>
      </a>

      <nav className="flex flex-col gap-0.5">
        <p className="px-3 pb-1.5 text-[12px] font-semibold tracking-[0.13em] text-ink-4 uppercase">Markets</p>
        {NAV.map(item)}
      </nav>

      <nav className="flex flex-col gap-0.5">
        <p className="px-3 pb-1.5 text-[12px] font-semibold tracking-[0.13em] text-ink-4 uppercase">Resources</p>
        {SECONDARY.map(item)}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5">
        <a
          href={explorer(LENDING_POOL_ADDRESS, "address")}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center justify-between rounded-md px-3 text-[14.5px] text-ink-3 hover:bg-surface-2 hover:text-ink-2"
        >
          Pool contract <ExternalLink className="size-3.5" />
        </a>
        <a
          href={explorer(TREASURY_ADDRESS, "address")}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center justify-between rounded-md px-3 text-[14.5px] text-ink-3 hover:bg-surface-2 hover:text-ink-2"
        >
          Treasury <ExternalLink className="size-3.5" />
        </a>
        <p className="mt-2 px-2.5 text-[12px] leading-snug text-ink-4">
          {MARKETS.length} markets
          <br />
          {CHAIN.name}
        </p>
      </div>
    </aside>
  );
}

/** Mobile/tablet nav — the sidebar collapses into a scrollable strip. */
export function MobileNav({ tab, setTab }: { tab: DeskTab; setTab: (t: DeskTab) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden">
      {[...NAV, ...SECONDARY].map((entry) => {
        const Icon = entry.icon;
        const active = tab === entry.id;
        return (
          <button
            key={entry.id}
            data-nav={entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[14px] font-medium",
              active ? "bg-surface-3 text-ink" : "text-ink-3",
            )}
          >
            <Icon className={cn("size-3.5", active && "text-accent")} />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

export function Ticker({ prices, selected }: { prices: PriceMap; selected: string }) {
  const loaded = MARKETS.filter((m) => prices[m.symbol]);
  // Render nothing until at least a few feeds land — an all-"loading" marquee
  // is noise, not information.
  if (loaded.length < 3) return null;
  return (
    <div className="overflow-hidden border-b border-line bg-surface">
      <div className="marquee flex w-max gap-6 py-2">
        {[...loaded, ...loaded].map((m, i) => {
          const p = prices[m.symbol];
          return (
            <span key={`${m.symbol}-${i}`} className="flex items-center gap-1.5 text-[13px] whitespace-nowrap">
              <TokenIcon symbol={m.symbol} size="sm" />
              <b className={cn("font-semibold", m.symbol === selected ? "text-accent" : "text-ink-2")}>{m.symbol}</b>
              <span className={cn("tabular-nums", p.stale ? "text-warn" : "text-ink-3")}>{priceFmt(p.price)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Topbar({
  account,
  filter,
  setFilter,
  onConnect,
  pending,
}: {
  account: string;
  filter: string;
  setFilter: (v: string) => void;
  onConnect: () => void;
  pending: string;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-bg/80 px-5 py-3 backdrop-blur">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 md:max-w-sm">
        <Search className="size-4 shrink-0 text-ink-4" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search markets"
          aria-label="Search markets"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] placeholder:text-ink-4 focus:outline-none"
        />
      </label>
      <div className="ml-auto flex items-center gap-2">
        <Button variant={account ? "outline" : "primary"} size="sm" onClick={onConnect} disabled={!!pending}>
          <Wallet />
          {account ? short(account) : "Connect wallet"}
        </Button>
      </div>
    </header>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14.5px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}
