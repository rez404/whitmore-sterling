import * as React from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  Coins,
  Copy,
  ExternalLink,
  LogOut,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Landmark,
  Menu,
  Search,
  Sprout,
  Wallet,
  X,
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
        <img src="/wolf.svg" alt="" className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
            Whitmore Sterling
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

/**
 * Phone navigation, in two halves.
 *
 * The six things people came to do sit in a bar fixed to the bottom of the
 * screen, where a thumb reaches without stretching. Everything else — reading
 * material and contract links — lives behind the hamburger at the top, because
 * it is looked up occasionally and does not deserve permanent screen space.
 */
export function MobileTabBar({ tab, setTab }: { tab: DeskTab; setTab: (t: DeskTab) => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-lg lg:hidden"
      // Keeps the bar clear of the iOS home indicator.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-[560px]">
        {NAV.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              data-nav={entry.id}
              onClick={() => setTab(entry.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 transition-colors",
                active ? "text-ink" : "text-ink-4",
              )}
            >
              <Icon className={cn("size-[21px] shrink-0", active && "text-accent")} />
              <span className="w-full truncate px-0.5 text-center text-[10.5px] leading-none font-medium">
                {entry.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The hamburger and the sheet it opens. Resources, contracts, chain. */
export function MobileMenu({ tab, setTab }: { tab: DeskTab; setTab: (t: DeskTab) => void }) {
  const [open, setOpen] = React.useState(false);

  // A menu that survives a back gesture or an orientation change is worse than
  // no menu, and the page behind it should not scroll while it is up.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (t: DeskTab) => {
    setTab(t);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-2 transition-colors hover:text-ink lg:hidden"
      >
        <Menu className="size-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto rounded-b-lg border-b border-line bg-surface p-4 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <img src="/wolf.svg" alt="" className="size-9 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
                    Whitmore Sterling
                  </span>
                  <span className="block text-[11px] leading-tight font-medium tracking-[0.22em] text-ink-4 uppercase">
                    Texas
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-2"
              >
                <X className="size-[18px]" />
              </button>
            </div>

            <nav className="mt-5 flex flex-col gap-0.5">
              <p className="px-3 pb-1.5 text-[12px] font-semibold tracking-[0.13em] text-ink-4 uppercase">Resources</p>
              {SECONDARY.map((entry) => {
                const Icon = entry.icon;
                const active = tab === entry.id;
                return (
                  <button
                    key={entry.id}
                    data-nav={entry.id}
                    onClick={() => go(entry.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-md px-3 text-[16px] font-medium transition-colors",
                      active ? "bg-surface-3 text-ink" : "text-ink-2",
                    )}
                  >
                    <Icon className={cn("size-[19px] shrink-0", active ? "text-accent" : "text-ink-3")} />
                    {entry.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-5 flex flex-col gap-0.5 border-t border-line pt-4">
              <a
                href={explorer(LENDING_POOL_ADDRESS, "address")}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-between rounded-md px-3 text-[15px] text-ink-3"
              >
                Pool contract <ExternalLink className="size-3.5" />
              </a>
              <a
                href={explorer(TREASURY_ADDRESS, "address")}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-between rounded-md px-3 text-[15px] text-ink-3"
              >
                Treasury <ExternalLink className="size-3.5" />
              </a>
              <p className="mt-2 px-3 text-[12.5px] leading-snug text-ink-4">
                {MARKETS.length} markets · {CHAIN.name}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
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
  onDisconnect,
  pending,
  tab,
  setTab,
}: {
  account: string;
  filter: string;
  setFilter: (v: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  pending: string;
  tab: DeskTab;
  setTab: (t: DeskTab) => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur sm:px-5">
      <MobileMenu tab={tab} setTab={setTab} />
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
        {account ? (
          <WalletMenu account={account} onDisconnect={onDisconnect} />
        ) : (
          <Button variant="primary" size="sm" onClick={onConnect} disabled={!!pending}>
            <Wallet />
            {/* The hamburger costs width on a phone; the verb alone is enough. */}
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect wallet</span>
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * The connected address, and what you can do with it.
 *
 * Clicking the address used to do nothing, which reads as a broken button. An
 * injected wallet cannot really be signed out of from the page, so the menu is
 * honest about what it offers: copy, inspect, and stop using it here.
 */
function WalletMenu({ account, onDisconnect }: { account: string; onDisconnect: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = () => {
    navigator.clipboard?.writeText(account);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Wallet />
        {short(account)}
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[240px] overflow-hidden rounded-lg border border-line-strong bg-surface-2 shadow-2xl shadow-black/60">
          <div className="border-b border-line px-3.5 py-3">
            <p className="text-[12px] tracking-wide text-ink-4 uppercase">Connected</p>
            <p className="mt-1 truncate font-mono text-[13px] text-ink-2">{account}</p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Copy className="size-4 shrink-0 text-ink-3" />
            {copied ? "Copied" : "Copy address"}
          </button>
          <a
            href={explorer(account, "address")}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[14px] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ExternalLink className="size-4 shrink-0 text-ink-3" />
            View on explorer
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className="flex w-full items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-left text-[14px] text-down transition-colors hover:bg-down/10"
          >
            <LogOut className="size-4 shrink-0" />
            Disconnect
          </button>
        </div>
      )}
    </div>
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
