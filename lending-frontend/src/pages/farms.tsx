import * as React from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import { ArrowDown, ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { AmountField, BalanceLine } from "@/src/components/ui/amount-field";
import { Button } from "@/src/components/ui/button";
import { Alert, AmountInput, Skeleton } from "@/src/components/ui/misc";
import { Money, Status } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon, TokenPair, TokenSelect } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import { cn } from "@/src/lib/utils";
import { ERC20_ABI, MULTI_STAKING_ABI, V3_POOL_ABI, VAULT_ABI, provider, type PriceMap } from "@/src/lib/chain";
import { GAS_BUFFER_WEI } from "@/src/lib/uniswap";
import { amt, priceFmt, short } from "@/src/lib/format";
import { fetchPairStatsBatch, fetchUsdPrices, feeApr, usdValue, type PairStats } from "@/src/lib/prices";
import { LP_VAULTS, LP_ZAP, PLATFORM_TOKEN, STAKING_VAULT, UNISWAP_V3, type VaultPool } from "@/src/farms";
import { USDG_ADDRESS } from "@/src/markets";

export function FarmsPage({
  account,
  connect,
  pending,
  debtDecimals,
  deposit,
  withdraw,
  zap,
  selectedSymbol,
  onSelect,
}: {
  account: string;
  connect: () => void;
  pending: string;
  debtDecimals: number;
  prices: PriceMap;
  deposit: (pool: VaultPool, a0: bigint, a1: bigint) => Promise<void>;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
  zap: (pool: VaultPool, tokenIn: string, amountIn: bigint, isNative: boolean, label: string) => Promise<void>;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}) {
  const [stats, setStats] = React.useState<Record<string, PairStats>>({});
  const [myShares, setMyShares] = React.useState<Record<string, bigint>>({});
  const [feeTiers, setFeeTiers] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);

  // Pool analytics come from the indexer in one batched call, then the fee tier is
  // read from each pool contract — the indexer does not report it and the APR is
  // wrong without it.
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const byToken = await fetchPairStatsBatch(LP_VAULTS.map((v) => v.stock));
      if (cancelled) return;
      setStats(byToken);
      setLoading(false);

      const tiers: Record<string, number> = {};
      await Promise.all(
        Object.values(byToken).map(async (st) => {
          try {
            const fee = await new Contract(st.pairAddress, V3_POOL_ABI, provider).fee();
            tiers[st.pairAddress.toLowerCase()] = Number(fee) / 1_000_000;
          } catch {
            /* leave it out rather than guess a tier */
          }
        }),
      );
      if (!cancelled) setFeeTiers(tiers);
    };
    load();
    const id = window.setInterval(load, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Which vaults the connected wallet is actually in, so a depositor does not have
  // to open every pair to find their money.
  React.useEffect(() => {
    if (!account) {
      setMyShares({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const live = LP_VAULTS.filter((v) => v.vault);
      const out: Record<string, bigint> = {};
      await Promise.all(
        live.map(async (v) => {
          try {
            const bal = await new Contract(v.vault, VAULT_ABI, provider).balanceOf(account);
            if (BigInt(bal) > 0n) out[v.symbol] = BigInt(bal);
          } catch {
            /* skip this vault */
          }
        }),
      );
      if (!cancelled) setMyShares(out);
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account]);

  const rows = LP_VAULTS.map((pool) => {
    const st = stats[pool.stock.toLowerCase()];
    const tier = st ? feeTiers[st.pairAddress.toLowerCase()] : undefined;
    const apr = st && tier != null ? feeApr(st.volume.h24, tier, st.liquidityUsd) : null;
    return { pool, st, tier, apr };
  });

  const selected = rows.find((r) => r.pool.symbol === selectedSymbol);
  const byVolume = (a: FarmRow, b: FarmRow) => (b.st?.volume.h24 ?? 0) - (a.st?.volume.h24 ?? 0);
  const withVault = rows.filter((r) => r.pool.vault).sort(byVolume);
  const withoutVault = rows.filter((r) => !r.pool.vault && r.st).sort(byVolume);
  const myPositions = rows.filter((r) => myShares[r.pool.symbol]);
  const totalTvl = rows.reduce((s, r) => s + (r.st?.liquidityUsd ?? 0), 0);
  const totalVol = rows.reduce((s, r) => s + (r.st?.volume.h24 ?? 0), 0);
  const totalFees = rows.reduce((s, r) => s + (r.st && r.tier != null ? r.st.volume.h24 * r.tier : 0), 0);

  if (selected) {
    return (
      <FarmDetail
        row={selected}
        account={account}
        connect={connect}
        pending={pending}
        debtDecimals={debtDecimals}
        deposit={deposit}
        withdraw={withdraw}
        zap={zap}
        onBack={() => onSelect("")}
      />
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Farms"
        description="Provide liquidity to tokenized-equity pairs on Uniswap V3 and earn the trading fees they generate. The vault compounds fees back into the position and keeps 10% of the fees earned — your deposit itself is never charged."
      />

      <FigureRow>
        <Figure label="Pool TVL" size="lg" value={<Money value={totalTvl} decimals={0} compact />} hint="Across listed pairs" />
        <Figure label="Volume 24h" value={<Money value={totalVol} decimals={0} compact />} hint="Traded through these pools" />
        <Figure label="Fees 24h" value={<Money value={totalFees} decimals={0} compact />} hint="Paid to liquidity providers" />
        <Figure
          label="Vaults live"
          value={`${LP_VAULTS.filter((v) => v.vault).length} / ${LP_VAULTS.length}`}
          hint={`${LP_VAULTS.filter((v) => v.vault).length} deployed`}
        />
      </FigureRow>


      {myPositions.length > 0 && (
        <Section title="Your positions" meta={`${myPositions.length} vault${myPositions.length > 1 ? "s" : ""}`}>
          <ul className="md:hidden">
            {myPositions.map(({ pool, apr }) => (
              <li key={pool.symbol} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => onSelect(pool.symbol)}
                  className="flex w-full items-center gap-3 py-3.5 text-left"
                >
                  <TokenPair a={pool.symbol} b="USDG" size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{pool.symbol} / USDG</span>
                    <span className="block truncate text-[13.5px] tabular-nums text-ink-3">
                      {amt(myShares[pool.symbol] ?? 0n, 4)} shares
                    </span>
                  </span>
                  {apr != null && (
                    <span className="shrink-0 text-[16px] font-semibold tabular-nums text-up">
                      {apr.toFixed(1)}%
                    </span>
                  )}
                  <span className="shrink-0 text-ink-4">→</span>
                </button>
              </li>
            ))}
          </ul>
          <DataTable
            className="hidden md:block"
            head={
              <>
                <Th>Pair</Th>
                <Th align="right">Your shares</Th>
                <Th align="right">Fee APR</Th>
                <Th align="right" />
              </>
            }
          >
            <tbody>
              {myPositions.map(({ pool, apr }) => (
                <tr
                  key={pool.symbol}
                  onClick={() => onSelect(pool.symbol)}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-[var(--color-hover)]"
                >
                  <Td>
                    <span className="flex items-center gap-3">
                      <TokenPair a={pool.symbol} b="USDG" size="lg" />
                      <span className="font-semibold text-ink">{pool.symbol} / USDG</span>
                    </span>
                  </Td>
                  <Td align="right">
                    <Num>{amt(myShares[pool.symbol] ?? 0n, 4)}</Num>
                  </Td>
                  <Td align="right">
                    {apr != null ? <Num className="text-up">{apr.toFixed(1)}%</Num> : "—"}
                  </Td>
                  <Td align="right">
                    <span className="text-[14px] text-ink-3">Manage →</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}

      {loading ? (
        <div className="space-y-2 py-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <>
          <Section
            title="Vaults"
            meta={`${withVault.length} live · deposit and the vault manages the position for you`}
          >
            {withVault.length === 0 ? (
              <p className="py-2 text-[15px] text-ink-4">No vaults deployed yet.</p>
            ) : (
              <PairTable rows={withVault} onSelect={onSelect} />
            )}
          </Section>

          {/* The pools without a vault are still worth showing: this table is the only
              place these yields are visible anywhere, and it is where the next vault
              gets chosen from. */}
          <Section
            title="Other pools"
            meta={`${withoutVault.length} pairs trading on Uniswap · no vault yet`}
          >
            <PairTable rows={withoutVault} onSelect={onSelect} muted />
          </Section>
        </>
      )}

      <p className="text-[13px] leading-snug text-ink-4">
        Fee APR annualises the last 24 hours of volume. Volume is volatile, so treat it as a snapshot rather than a
        forecast. It also describes the whole pool — a full-range position earns less than a concentrated one.
      </p>
    </div>
  );
}

type FarmRow = { pool: VaultPool; st?: PairStats; tier?: number; apr: number | null };

function PairTable({
  rows,
  onSelect,
  muted,
}: {
  rows: FarmRow[];
  onSelect: (symbol: string) => void;
  muted?: boolean;
}) {
  return (
    <>
      {/* Seven columns do not fit a phone, and sideways-scrolling a table puts the
          APR — the number people opened the page for — off screen. Same data,
          stacked, with the headline figure kept in view. */}
      <ul className="md:hidden">
        {rows.map(({ pool, st, tier, apr }) => (
          <li key={pool.symbol} className="border-b border-line last:border-0">
            <button
              type="button"
              disabled={!st}
              onClick={() => st && onSelect(pool.symbol)}
              className="w-full py-3.5 text-left transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <TokenPair a={pool.symbol} b="USDG" size="lg" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-semibold", muted ? "text-ink-2" : "text-ink")}>
                    {pool.symbol} / USDG
                  </span>
                  <span className="block truncate text-[13.5px] text-ink-3">
                    {pool.name.replace(" Stock Token", "").replace(" ETF Token", "")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      "block text-[18px] leading-tight font-semibold tabular-nums",
                      apr == null ? "text-ink-4" : muted ? "text-ink-2" : "text-up",
                    )}
                  >
                    {apr != null ? `${apr.toFixed(1)}%` : "—"}
                  </span>
                  <span className="block text-[11.5px] tracking-wide text-ink-4 uppercase">Fee APR</span>
                </span>
              </div>
              <dl className="mt-2.5 grid grid-cols-3 gap-3">
                <MiniStat label="TVL" value={<Money value={st?.liquidityUsd} decimals={0} compact />} />
                <MiniStat label="Vol 24h" value={<Money value={st?.volume.h24} decimals={0} compact />} />
                <MiniStat label="Fee tier" value={tier != null ? `${(tier * 100).toFixed(2)}%` : "—"} />
              </dl>
            </button>
          </li>
        ))}
      </ul>

      <DataTable
        className="hidden md:block"
        head={
        <>
          <Th>Pair</Th>
          <Th align="right">Fee tier</Th>
          <Th align="right">TVL</Th>
          <Th align="right">Volume 24h</Th>
          <Th align="right">Fees 24h</Th>
          <Th align="right">Fee APR</Th>
          <Th align="right">Status</Th>
        </>
      }
    >
      <tbody>
        {rows.map(({ pool, st, tier, apr }) => (
          <tr
            key={pool.symbol}
            onClick={() => st && onSelect(pool.symbol)}
            className={cn(
              "border-b border-line last:border-0 transition-colors",
              st ? "cursor-pointer hover:bg-[var(--color-hover)]" : "opacity-50",
            )}
          >
            <Td>
              <span className="flex items-center gap-3">
                <TokenPair a={pool.symbol} b="USDG" size="lg" />
                <span className="min-w-0">
                  <span className={cn("block font-semibold", muted ? "text-ink-2" : "text-ink")}>
                    {pool.symbol} / USDG
                  </span>
                  <span className="block truncate text-[14px] text-ink-3">
                    {pool.name.replace(" Stock Token", "").replace(" ETF Token", "")}
                  </span>
                </span>
              </span>
            </Td>
            <Td align="right">{tier != null ? `${(tier * 100).toFixed(2)}%` : "—"}</Td>
            <Td align="right">
              <Num>
                <Money value={st?.liquidityUsd} decimals={0} />
              </Num>
            </Td>
            <Td align="right">
              <Money value={st?.volume.h24} decimals={0} />
            </Td>
            <Td align="right">{st && tier != null ? <Money value={st.volume.h24 * tier} decimals={0} /> : "—"}</Td>
            <Td align="right">
              {apr != null ? (
                <Num className={muted ? "text-ink-2" : "text-up"}>{apr.toFixed(1)}%</Num>
              ) : (
                <span className="text-ink-4">—</span>
              )}
            </Td>
            <Td align="right">
              <Status tone={pool.vault ? "good" : "idle"}>{pool.vault ? "Live" : "No vault"}</Status>
            </Td>
          </tr>
        ))}
      </tbody>
      </DataTable>
    </>
  );
}

/** Label-over-figure pair used inside the stacked mobile rows. */
function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] tracking-wide text-ink-4 uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] tabular-nums text-ink-2">{value}</dd>
    </div>
  );
}

function FarmDetail({
  row,
  account,
  connect,
  pending,
  debtDecimals,
  deposit,
  withdraw,
  zap,
  onBack,
}: {
  row: FarmRow;
  account: string;
  connect: () => void;
  pending: string;
  debtDecimals: number;
  deposit: (pool: VaultPool, a0: bigint, a1: bigint) => Promise<void>;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
  zap: (pool: VaultPool, tokenIn: string, amountIn: bigint, isNative: boolean, label: string) => Promise<void>;
  onBack: () => void;
}) {
  const { pool, st, tier, apr } = row;
  const [amtStock, setAmtStock] = React.useState("");
  const [amtUsdg, setAmtUsdg] = React.useState("");
  const [mode, setMode] = React.useState<"zap" | "pair">(LP_ZAP ? "zap" : "pair");
  const [zapAsset, setZapAsset] = React.useState<"ETH" | "USDG">("ETH");
  const [zapAmount, setZapAmount] = React.useState("");
  const [wallet, setWallet] = React.useState<{ eth: bigint; usdg: bigint; stock: bigint } | null>(null);

  // What the depositor actually has to work with. Without this the Max buttons
  // are guesses and the button says "Deposit" for an amount that will revert.
  React.useEffect(() => {
    if (!account) {
      setWallet(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [eth, usdg, stock] = await Promise.all([
          provider.getBalance(account),
          new Contract(pool.usdg, ERC20_ABI, provider).balanceOf(account),
          new Contract(pool.stock, ERC20_ABI, provider).balanceOf(account),
        ]);
        if (!cancelled) setWallet({ eth: BigInt(eth), usdg: BigInt(usdg), stock: BigInt(stock) });
      } catch {
        /* rpc hiccup — keep the previous values rather than blanking the field */
      }
    };
    load();
    const id = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account, pool.usdg, pool.stock]);

  const parse = (v: string, decimals: number) => {
    try {
      return parseUnits(v || "0", decimals);
    } catch {
      return 0n;
    }
  };
  const zapWei = parse(zapAmount, zapAsset === "ETH" ? 18 : debtDecimals);
  const stockWei = parse(amtStock, 18);
  const usdgWei = parse(amtUsdg, debtDecimals);

  const doZap = async () => {
    const native = zapAsset === "ETH";
    if (zapWei <= 0n) return;
    await zap(pool, native ? UNISWAP_V3.weth9 : USDG_ADDRESS, zapWei, native, `${zapAmount} ${zapAsset}`);
  };

  const doDeposit = async () => {
    const stockIsToken0 = pool.token0.toLowerCase() === pool.stock.toLowerCase();
    await deposit(pool, stockIsToken0 ? stockWei : usdgWei, stockIsToken0 ? usdgWei : stockWei);
  };

  const windows = st
    ? ([
        ["5m", st.volume.m5],
        ["1h", st.volume.h1],
        ["6h", st.volume.h6],
        ["24h", st.volume.h24],
      ] as const)
    : [];
  const peak = Math.max(...windows.map(([, v]) => v), 1);
  const baseShare = st && st.liquidityUsd > 0 ? ((st.liquidityBase * st.priceUsd) / st.liquidityUsd) * 100 : 50;

  /* ----------------------------- deposit state ----------------------------- */

  // A full-range position splits value evenly between the two sides, so the
  // balanced counterpart of N stock is simply N × price in USDG. Off-ratio
  // amounts are not lost — the vault returns whatever the position cannot use —
  // but matching the ratio is what actually gets deployed.
  const mark = st?.priceUsd ?? null;
  const matchUsdg = mark != null && stockWei > 0n ? Number(formatUnits(stockWei, 18)) * mark : null;
  const matchStock = mark != null && mark > 0 && usdgWei > 0n ? Number(formatUnits(usdgWei, debtDecimals)) / mark : null;

  const zapBalance = zapAsset === "ETH" ? wallet?.eth : wallet?.usdg;
  const zapDecimals = zapAsset === "ETH" ? 18 : debtDecimals;
  const zapOverBalance = zapBalance != null && zapWei > zapBalance;
  const pairOverBalance = wallet != null && (stockWei > wallet.stock || usdgWei > wallet.usdg);
  const zapReady = zapWei > 0n && !zapOverBalance;
  const pairReady = (stockWei > 0n || usdgWei > 0n) && !pairOverBalance;

  const depositLabel = !account
    ? "Connect wallet"
    : pending
      ? "Working…"
      : mode === "zap"
        ? zapWei <= 0n
          ? "Enter an amount"
          : zapOverBalance
            ? `Not enough ${zapAsset}`
            : "Zap in"
        : stockWei <= 0n && usdgWei <= 0n
          ? "Enter an amount"
          : pairOverBalance
            ? "Amount exceeds balance"
            : "Deposit";

  return (
    <div className="space-y-7">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[14px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Farms
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <TokenPair a={pool.symbol} b="USDG" size="xl" />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[26px] font-semibold tracking-tight text-ink">{pool.symbol} / USDG</h1>
              {tier != null && (
                <span className="rounded-sm border border-line px-2 py-0.5 text-[13px] text-ink-3">
                  v3 · {(tier * 100).toFixed(2)}%
                </span>
              )}
            </div>
            <p className="text-[14.5px] text-ink-3">
              {pool.name.replace(" Stock Token", "").replace(" ETF Token", "")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[12.5px] font-medium tracking-[0.1em] text-ink-4 uppercase">Fee APR</p>
          <p className="mt-1 text-[30px] leading-none font-semibold text-up">
            {apr != null ? `${apr.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-1 text-[13px] text-ink-4">from the last 24h</p>
        </div>
      </div>

      <FigureRow>
        <Figure label="Pool TVL" value={<Money value={st?.liquidityUsd} decimals={0} compact />} />
        <Figure label="Volume 24h" value={<Money value={st?.volume.h24} decimals={0} compact />} />
        <Figure
          label="Fees 24h"
          value={st && tier != null ? <Money value={st.volume.h24 * tier} decimals={0} compact /> : "—"}
          hint="Paid to LPs"
        />
        <Figure
          label={`${pool.symbol} price`}
          value={<Money value={st?.priceUsd} decimals={st && st.priceUsd < 1 ? 4 : 2} />}
          hint={st?.priceChangeH24 != null ? `${st.priceChangeH24 > 0 ? "+" : ""}${st.priceChangeH24}% 24h` : undefined}
          tone={st?.priceChangeH24 == null ? undefined : st.priceChangeH24 >= 0 ? "good" : "bad"}
        />
      </FigureRow>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="Pool composition">
          <div className="space-y-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="bg-accent" style={{ width: `${Math.min(Math.max(baseShare, 2), 98)}%` }} />
              <div className="flex-1 bg-ink-4/40" />
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="flex items-center gap-2">
                <TokenIcon symbol={pool.symbol} size="sm" />
                <span className="text-ink-2">{pool.symbol}</span>
                <span className="tabular-nums text-ink">
                  {st ? st.liquidityBase.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-ink">
                  {st ? st.liquidityQuote.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                </span>
                <span className="text-ink-2">USDG</span>
                <TokenIcon symbol="USDG" size="sm" />
              </span>
            </div>
            {st && (
              <a
                href={st.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 pt-1 text-[13.5px] text-ink-3 hover:text-ink"
              >
                Pool {short(st.pairAddress)} on {st.dexId} <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </Section>

        <Section title="Activity" meta={st ? `${st.buys24} buys · ${st.sells24} sells in 24h` : undefined}>
          {/* Real windows the indexer reports. No interpolated time series — that would
              be invented data dressed up as a chart. */}
          <div className="space-y-2.5">
            {windows.map(([label, v]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[13px] text-ink-4">{label}</span>
                <span className="h-5 flex-1 overflow-hidden rounded-sm bg-surface-3">
                  <span className="block h-full bg-accent/50" style={{ width: `${Math.max((v / peak) * 100, 1)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-[13.5px] tabular-nums text-ink-2">
                  <Money value={v} decimals={0} />
                </span>
              </div>
            ))}
            <p className="pt-1 text-[13px] text-ink-4">Volume traded in each window, newest at the top.</p>
          </div>
        </Section>
      </div>

      <Section
        title="Add liquidity"
        meta={tier != null ? `Uniswap V3 · ${(tier * 100).toFixed(2)}% fee tier` : undefined}
      >
        {!pool.vault ? (
          <Alert tone="warn" title="No vault for this pair yet">
            This pool is live and earning fees, but no vault has been deployed for it. Vaults exist for the
            highest-volume pairs; the rest can be added later.
          </Alert>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,420px)] lg:items-start lg:gap-12">
            {/* ------------------------------- the ticket ------------------------------ */}
            <div className="space-y-2">
              <div className="mb-4 flex gap-1 rounded-md border border-line bg-surface-2 p-1">
                {(
                  [
                    ["zap", "One token", !LP_ZAP],
                    ["pair", "Both tokens", false],
                  ] as const
                ).map(([m, label, disabled]) => (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    onClick={() => setMode(m)}
                    className={cn(
                      "h-9 flex-1 rounded-sm text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-4",
                      mode === m ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "zap" ? (
                <>
                  <AmountField
                    caption="You deposit"
                    value={zapAmount}
                    onChange={setZapAmount}
                    tone={zapOverBalance ? "warn" : undefined}
                    selector={
                      <TokenSelect
                        value={zapAsset}
                        onChange={(s) => setZapAsset(s as "ETH" | "USDG")}
                        options={[
                          { symbol: "ETH", name: "Ether · gas asset" },
                          { symbol: "USDG", name: "Global Dollar" },
                        ]}
                      />
                    }
                    footer={
                      account && zapBalance != null ? (
                        <BalanceLine
                          amount={`${amt(zapBalance, zapAsset === "ETH" ? 5 : 2, zapDecimals)} ${zapAsset}`}
                          maxLabel={zapAsset === "ETH" ? "Max · less gas" : "Max"}
                          onMax={() => {
                            const spendable =
                              zapAsset === "ETH"
                                ? zapBalance > GAS_BUFFER_WEI
                                  ? zapBalance - GAS_BUFFER_WEI
                                  : 0n
                                : zapBalance;
                            setZapAmount(formatUnits(spendable, zapDecimals));
                          }}
                        />
                      ) : (
                        <span className="text-ink-4">Connect to see balance</span>
                      )
                    }
                  />

                  <Connector icon={<ArrowDown className="size-4 text-ink-2" />} />

                  {/* What comes back is a vault share, not a token you can pick — so it
                      is shown as a destination rather than a second editable leg. */}
                  <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                    <p className="text-[12.5px] font-medium tracking-wide text-ink-4 uppercase">You receive</p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <TokenPair a={pool.symbol} b="USDG" size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold text-ink">{pool.symbol} / USDG</p>
                        <p className="truncate text-[13.5px] text-ink-3">Vault shares · full-range position</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <AmountField
                    caption="You deposit"
                    note={matchUsdg != null ? <Money value={matchUsdg} decimals={2} /> : undefined}
                    value={amtStock}
                    onChange={setAmtStock}
                    token={pool.symbol}
                    tone={wallet && stockWei > wallet.stock ? "warn" : undefined}
                    footer={
                      account && wallet ? (
                        <BalanceLine
                          amount={`${amt(wallet.stock, 4)} ${pool.symbol}`}
                          onMax={() => setAmtStock(formatUnits(wallet.stock, 18))}
                        />
                      ) : (
                        <span className="text-ink-4">Connect to see balance</span>
                      )
                    }
                  />

                  <Connector icon={<Plus className="size-4 text-ink-2" />} />

                  <AmountField
                    caption="And"
                    value={amtUsdg}
                    onChange={setAmtUsdg}
                    token="USDG"
                    tone={wallet && usdgWei > wallet.usdg ? "warn" : undefined}
                    footer={
                      account && wallet ? (
                        <BalanceLine
                          amount={`${amt(wallet.usdg, 2, debtDecimals)} USDG`}
                          onMax={() => setAmtUsdg(formatUnits(wallet.usdg, debtDecimals))}
                        />
                      ) : (
                        <span className="text-ink-4">Connect to see balance</span>
                      )
                    }
                  />

                  {/* Only offered when one side is filled and the other is not —
                      otherwise it would silently overwrite a deliberate amount. */}
                  {mark != null && (
                    <>
                      {stockWei > 0n && usdgWei === 0n && matchUsdg != null && (
                        <MatchRatio
                          onClick={() => setAmtUsdg(matchUsdg.toFixed(Math.min(debtDecimals, 6)))}
                          text={`Balance the pair — add ${matchUsdg.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDG`}
                        />
                      )}
                      {usdgWei > 0n && stockWei === 0n && matchStock != null && (
                        <MatchRatio
                          onClick={() => setAmtStock(matchStock.toFixed(8))}
                          text={`Balance the pair — add ${matchStock.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.symbol}`}
                        />
                      )}
                    </>
                  )}
                </>
              )}

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={!!pending || (!!account && (mode === "zap" ? !zapReady : !pairReady))}
                  onClick={() => (account ? (mode === "zap" ? doZap() : doDeposit()) : connect())}
                >
                  {depositLabel}
                </Button>
              </div>
            </div>

            {/* ------------------------------ what you get ----------------------------- */}
            <div className="space-y-4">
              <dl className="space-y-2.5 text-[14px]">
                <Detail label="Position range" value="Full range" />
                <Detail label="Fee tier" value={tier != null ? `${(tier * 100).toFixed(2)}%` : "—"} />
                <Detail
                  label="Pool fee APR"
                  value={apr != null ? `${apr.toFixed(1)}%` : "—"}
                  tone={apr != null ? "good" : undefined}
                />
                <Detail label="Vault fee" value="10% of fees earned" />
                <Detail label="Charged on deposit" value="Nothing" />
                <Detail label="Max slippage" value="1.00%" />
                {mark != null && (
                  <Detail
                    label="Current price"
                    value={`1 ${pool.symbol} ≈ ${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDG`}
                  />
                )}
              </dl>

              <div className="space-y-3 border-t border-line pt-4 text-[13.5px] leading-relaxed text-ink-3">
                <p>
                  {mode === "zap" ? (
                    <>
                      One transaction. Your {zapAsset} is swapped into both sides of the pair at the current price and
                      deposited into the vault. Whatever the position cannot use comes straight back to your wallet.
                    </>
                  ) : (
                    <>
                      Both sides are deposited at the pool's current ratio. Any excess on either side is returned in the
                      same transaction, so an unbalanced entry costs you nothing but gas.
                    </>
                  )}
                </p>
                <p>
                  The vault holds one full-range Uniswap V3 position and collects its fees back into it on every deposit
                  and withdrawal, so your share grows without you doing anything.
                </p>
                <p className="text-ink-4">
                  Providing liquidity is not the same as holding. If {pool.symbol} moves sharply against USDG you end up
                  with more of the side that fell — impermanent loss — which can outweigh the fees earned. The vault
                  contract is unaudited and custodial.
                </p>
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Your position" meta={`${pool.symbol} / USDG vault`}>
        <div className="max-w-2xl">
          <VaultPosition pool={pool} account={account} pending={pending} withdraw={withdraw} symbol={pool.symbol} />
        </div>
      </Section>
    </div>
  );
}

/** The joint between two stacked legs — an arrow for a swap, a plus for a pair. */
function Connector({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="relative flex h-0 justify-center">
      <span className="absolute -top-4 z-10 flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-2">
        {icon}
      </span>
    </div>
  );
}

function MatchRatio({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-dashed border-line px-3 py-2 text-left text-[13.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
    >
      {text}
    </button>
  );
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-4">{label}</dt>
      <dd className={cn("truncate text-right tabular-nums", tone === "good" ? "text-up" : "text-ink-2")}>{value}</dd>
    </div>
  );
}

/**
 * A depositor's position in one vault.
 *
 * The amounts are not estimated: `withdraw` is simulated against the vault with the
 * caller's own address, so the two numbers shown are exactly what the contract would
 * hand back right now, fees included.
 */
function VaultPosition({
  pool,
  account,
  pending,
  withdraw,
  symbol,
}: {
  pool: VaultPool;
  account: string;
  pending: string;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
  symbol: string;
}) {
  const [shares, setShares] = React.useState(0n);
  const [totalSupply, setTotalSupply] = React.useState(0n);
  const [pct, setPct] = React.useState(100);
  const [preview, setPreview] = React.useState<{ amount0: bigint; amount1: bigint } | null>(null);
  const [stockIsToken0, setStockIsToken0] = React.useState(true);

  React.useEffect(() => {
    if (!account || !pool.vault) return;
    let cancelled = false;
    const load = async () => {
      try {
        const v = new Contract(pool.vault, VAULT_ABI, provider);
        const [bal, supply, t0] = await Promise.all([v.balanceOf(account), v.totalSupply(), v.token0()]);
        if (cancelled) return;
        setShares(BigInt(bal));
        setTotalSupply(BigInt(supply));
        setStockIsToken0(String(t0).toLowerCase() === pool.stock.toLowerCase());
      } catch {
        /* rpc hiccup — leave the previous values */
      }
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pool.vault, pool.stock, account]);

  const selected = (shares * BigInt(pct)) / 100n;

  // Ask the contract what this many shares is worth, rather than guessing from liquidity.
  React.useEffect(() => {
    if (!account || !pool.vault || selected === 0n) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const v = new Contract(pool.vault, VAULT_ABI, provider);
        const out = await v.withdraw.staticCall(selected, 0, 0, { from: account });
        if (!cancelled) setPreview({ amount0: BigInt(out[0]), amount1: BigInt(out[1]) });
      } catch {
        if (!cancelled) setPreview(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pool.vault, account, selected]);

  if (!account) {
    return <p className="text-[14px] text-ink-4">Connect a wallet to see your position in this vault.</p>;
  }
  if (shares === 0n) {
    return <p className="text-[14px] text-ink-4">You have no position in this vault yet.</p>;
  }

  const share = totalSupply > 0n ? Number((shares * 10000n) / totalSupply) / 100 : 0;
  const stockOut = preview ? (stockIsToken0 ? preview.amount0 : preview.amount1) : null;
  const usdgOut = preview ? (stockIsToken0 ? preview.amount1 : preview.amount0) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-3">
        <Figure label="Your shares" value={amt(shares, 4)} />
        <Figure label="Share of vault" value={`${share.toFixed(4)}%`} />
        <Figure
          label="Withdrawable now"
          value={
            preview ? (
              <span className="text-[19px]">
                {amt(stockOut ?? 0n, 4)} <span className="text-ink-3">{symbol}</span>
              </span>
            ) : (
              "—"
            )
          }
          hint={preview ? `+ ${amt(usdgOut ?? 0n, 2, 6)} USDG` : "principal + earned fees"}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">Withdraw</span>
          <span className="text-[13.5px] tabular-nums text-ink-4">{pct}% of your position</span>
        </div>
        <div className="flex gap-1.5">
          {[25, 50, 75, 100].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPct(v)}
              className={cn(
                "h-8 flex-1 rounded-sm border text-[13.5px] transition-colors",
                pct === v
                  ? "border-line-strong bg-surface-3 text-ink"
                  : "border-line text-ink-3 hover:border-line-strong hover:text-ink",
              )}
            >
              {v === 100 ? "Max" : `${v}%`}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={!!pending || selected === 0n}
          onClick={() => withdraw(pool, selected)}
        >
          Withdraw {pct === 100 ? "everything" : `${pct}%`}
        </Button>
        <p className="text-[13px] leading-snug text-ink-4">
          Withdrawing collects the position's outstanding fees first, so your share of them comes out with the
          principal.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- Stake --------------------------------- */

type RewardRow = {
  token: string;
  symbol: string;
  decimals: number;
  earned: bigint;
  perDay: bigint;
  active: boolean;
  /** DEX spot mark, used only to show what a reward is worth. */
  priceUsd?: number;
};

/**
 * Illustrative numbers for reviewing the layout before anything is deployed.
 *
 * Gated on `import.meta.env.DEV`, so Vite strips it from the production bundle
 * entirely — a preview can never be mistaken for live data by a real user.
 */
const PREVIEW_REWARDS: RewardRow[] = [
  { token: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", symbol: "CASHCAT", decimals: 18, earned: 18420n * 10n ** 18n, perDay: 71428n * 10n ** 18n, active: true, priceUsd: 0.1445 },
  { token: "0x39dBED3a2bd333467115dE45665cC57F813C4571", symbol: "PONS", decimals: 18, earned: 2140n * 10n ** 18n, perDay: 8571n * 10n ** 18n, active: true, priceUsd: 0.04761 },
  { token: "0xe934e36A439C94017B64a3FecE66AF12099aBF50", symbol: "STONKBROKER", decimals: 18, earned: 940n * 10n ** 18n, perDay: 0n, active: false, priceUsd: 0.03527 },
];
const PREVIEW = {
  staked: 12500n * 10n ** 18n,
  totalStaked: 4231880n * 10n ** 18n,
  walletBal: 3100n * 10n ** 18n,
  feeBps: 1000n,
  rewards: PREVIEW_REWARDS,
};

export function StakePage({
  account,
  connect,
  pending,
  action,
}: {
  account: string;
  connect: () => void;
  pending: string;
  action: (kind: "stake" | "unstake" | "claim", amount: bigint) => Promise<void>;
}) {
  const deployed = !!STAKING_VAULT;
  const preview = !deployed && import.meta.env.DEV;
  const live = deployed || preview;
  const [staked, setStaked] = React.useState(preview ? PREVIEW.staked : 0n);
  const [totalStaked, setTotalStaked] = React.useState(preview ? PREVIEW.totalStaked : 0n);
  const [walletBal, setWalletBal] = React.useState(preview ? PREVIEW.walletBal : 0n);
  const [feeBps, setFeeBps] = React.useState(PREVIEW.feeBps);
  const [rewards, setRewards] = React.useState<RewardRow[]>(preview ? PREVIEW.rewards : []);
  const [amount, setAmount] = React.useState("");
  const [mode, setMode] = React.useState<"stake" | "unstake">("stake");
  const [penaltyBps, setPenaltyBps] = React.useState(preview ? 1000n : 0n);
  const [ownEarned, setOwnEarned] = React.useState(preview ? 640n * 10n ** 18n : 0n);

  React.useEffect(() => {
    if (!deployed) return;
    let cancelled = false;

    const load = async () => {
      try {
        const v = new Contract(STAKING_VAULT, MULTI_STAKING_ABI, provider);
        const [bal, total, fee, penalty, own, tokens] = await Promise.all([
          account ? v.balanceOf(account) : Promise.resolve(0n),
          v.totalSupply(),
          v.performanceFeeBps(),
          v.unstakeFeeBps(),
          account ? v.earnedStaking(account) : Promise.resolve(0n),
          v.getRewardTokens() as Promise<string[]>,
        ]);

        // Reward tokens come from the vault itself, so a partner added on-chain
        // shows up here without a frontend release.
        const earnedMap = new Map<string, bigint>();
        if (account) {
          const res = await v.earnedAll(account);
          (res[0] as string[]).forEach((t, i) => earnedMap.set(t.toLowerCase(), BigInt(res[1][i])));
        }

        const now = Math.floor(Date.now() / 1000);
        const rows: RewardRow[] = await Promise.all(
          (tokens as string[]).map(async (token) => {
            const erc = new Contract(token, ERC20_ABI, provider);
            const [symbol, decimals, data] = await Promise.all([
              erc.symbol().catch(() => token.slice(0, 6)),
              erc.decimals().catch(() => 18),
              v.rewardData(token),
            ]);
            return {
              token,
              symbol: String(symbol),
              decimals: Number(decimals),
              earned: earnedMap.get(token.toLowerCase()) ?? 0n,
              perDay: BigInt(data.rate) * 86400n,
              active: Number(data.periodFinish) > now,
            };
          }),
        );

        const wallet =
          account && PLATFORM_TOKEN
            ? BigInt(await new Contract(PLATFORM_TOKEN, ERC20_ABI, provider).balanceOf(account))
            : 0n;

        const marks = await fetchUsdPrices(rows.map((r) => r.token));
        for (const r of rows) r.priceUsd = marks[r.token.toLowerCase()];

        if (!cancelled) {
          setStaked(BigInt(bal));
          setTotalStaked(BigInt(total));
          setFeeBps(BigInt(fee));
          setPenaltyBps(BigInt(penalty));
          setOwnEarned(BigInt(own));
          setRewards(rows);
          setWalletBal(wallet);
        }
      } catch {
        /* not deployed yet, or a transient RPC failure */
      }
    };

    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account, deployed]);

  let parsed = 0n;
  try {
    parsed = parseUnits(amount || "0", 18);
  } catch {
    parsed = 0n;
  }

  const anyActive = rewards.some((r) => r.active);
  const anyClaimable = rewards.some((r) => r.earned > 0n) || ownEarned > 0n;
  const claimableUsd = rewards.reduce((sum, r) => sum + (usdValue(r.earned, r.decimals, r.priceUsd) ?? 0), 0);
  const perDayUsd = rewards.reduce((sum, r) => sum + (r.active ? (usdValue(r.perDay, r.decimals, r.priceUsd) ?? 0) : 0), 0);
  const anyPriced = rewards.some((r) => r.priceUsd != null);
  const share = totalStaked > 0n ? Number((staked * 10000n) / totalStaked) / 100 : 0;
  const connected = preview || !!account;
  const sourceBalance = mode === "stake" ? walletBal : staked;
  const projectedStake = mode === "stake" ? staked + parsed : staked > parsed ? staked - parsed : 0n;
  const projectedTotal =
    mode === "stake" ? totalStaked + parsed : totalStaked > parsed ? totalStaked - parsed : 0n;
  const projectedShare = projectedTotal > 0n ? Number((projectedStake * 10000n) / projectedTotal) / 100 : 0;
  const penaltyPct = Number(penaltyBps) / 100;
  const penaltyAmount = mode === "unstake" ? (parsed * penaltyBps) / 10000n : 0n;
  const receiveAmount = parsed - penaltyAmount;

  if (!live) {
    return (
      <div className="space-y-7">
        <PageHeader
          title="Stake"
          description="Stake the Whitmore Sterling platform token and earn every partner reward token at once."
        />
        <div className="max-w-2xl space-y-3 border-t border-line pt-6">
          <Status tone="idle">Not deployed</Status>
          <h2 className="text-[21px] font-medium text-ink">Staking vault is not live yet</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            The vault is written and tested: one stake earns every registered partner token in parallel, and a new
            partner can be added without anyone unstaking. Rewards are funded by partners — nothing is minted here. It
            stays unpublished until a partner funds a stream, rather than advertising a yield that does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Stake"
        description="Stake STERLING once and earn every partner reward stream in parallel. Rewards are funded by partners, never minted."
      />

      <FigureRow>
        <Figure label="Your stake" size="lg" value={connected ? amt(staked) : "—"} hint={`STERLING · ${share.toFixed(2)}% of vault`} />
        <Figure label="Total staked" value={amt(totalStaked)} hint="STERLING in the vault" />
        <Figure
          label="Claimable"
          value={connected && anyPriced ? <Money value={claimableUsd} /> : connected ? "—" : "—"}
          hint={anyPriced ? "Across every stream" : "No market price"}
          tone={claimableUsd > 0 ? "good" : undefined}
        />
        <Figure
          label="Unstake penalty"
          value={`${penaltyPct}%`}
          hint="Paid to the stakers who stay"
          tone="warn"
        />
      </FigureRow>

      {preview && (
        <Alert tone="warn" title="Preview — sample numbers, nothing is deployed">
          This layout is filled with illustrative data so it can be reviewed before launch. It appears only on the dev
          server and is stripped from production builds. No contract is read and the buttons do nothing.
        </Alert>
      )}

      {!preview && !anyActive && rewards.length > 0 && (
        <Alert tone="warn" title="No reward stream running">
          Staking is open, but nothing accrues until a partner funds a stream.
        </Alert>
      )}

      <Section title="Reward streams" meta={`${rewards.length} partner${rewards.length === 1 ? "" : "s"}`}>
        {rewards.length === 0 ? (
          <p className="py-2 text-[15px] text-ink-4">No partner tokens registered yet.</p>
        ) : (
          <>
          <ul className="md:hidden">
            {rewards.map((r) => (
              <li key={r.token} className="flex items-center gap-3 border-b border-line py-3.5 last:border-0">
                <TokenIcon symbol={r.symbol} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{r.symbol}</p>
                  <p className="truncate text-[13px] text-ink-4">
                    {r.active ? `${amt(r.perDay, 0, r.decimals)} / day` : "Stream ended"}
                    {r.priceUsd != null && <> · {priceFmt(r.priceUsd)}</>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-medium tabular-nums text-ink">
                    {connected ? amt(r.earned, 2, r.decimals) : "—"}
                  </p>
                  <p className="text-[11.5px] tracking-wide text-ink-4 uppercase">Claimable</p>
                </div>
              </li>
            ))}
          </ul>
          <DataTable
            className="hidden md:block"
            head={
              <>
                <Th>Partner</Th>
                <Th align="right">Price</Th>
                <Th align="right">Rewards / day</Th>
                <Th align="right">Claimable</Th>
                <Th align="right">Status</Th>
              </>
            }
          >
            <tbody>
              {rewards.map((r) => (
                <tr key={r.token} className="border-b border-line last:border-0">
                  <Td>
                    <span className="flex items-center gap-3">
                      <TokenIcon symbol={r.symbol} size="lg" />
                      <span className="font-semibold text-ink">{r.symbol}</span>
                    </span>
                  </Td>
                  <Td align="right">
                    {r.priceUsd != null ? (
                      <Money value={r.priceUsd} decimals={r.priceUsd < 1 ? 4 : 2} />
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </Td>
                  <Td align="right">
                    {r.active ? (
                      <span>
                        {amt(r.perDay, 0, r.decimals)}
                        {r.priceUsd != null && (
                          <span className="block text-[13px] text-ink-4">
                            <Money value={usdValue(r.perDay, r.decimals, r.priceUsd)} />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </Td>
                  <Td align="right">
                    {connected ? (
                      <span>
                        <Num>{amt(r.earned, 4, r.decimals)}</Num>
                        {r.priceUsd != null && (
                          <span className="block text-[13px] text-ink-4">
                            <Money value={usdValue(r.earned, r.decimals, r.priceUsd)} />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </Td>
                  <Td align="right">
                    <Status tone={r.active ? "good" : "idle"}>{r.active ? "Streaming" : "Ended"}</Status>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          </>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Section title="Manage stake">
          <div className="space-y-4">
            <div className="flex gap-1 rounded-md border border-line bg-surface p-1">
              {(["stake", "unstake"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setAmount("");
                  }}
                  className={cn(
                    "h-9 flex-1 rounded-sm text-[14px] font-medium capitalize transition-colors",
                    mode === m ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label className="text-[14px] text-ink-2">Amount</label>
                <span className="text-[13px] text-ink-4">
                  {mode === "stake" ? "Wallet" : "Staked"} {amt(sourceBalance)} STERLING
                </span>
              </div>
              <AmountInput value={amount} onChange={setAmount} unit="STERLING" />
              <div className="flex gap-1.5">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={sourceBalance === 0n}
                    onClick={() => setAmount(formatUnits((sourceBalance * BigInt(p)) / 100n, 18))}
                    className="h-7 flex-1 rounded-sm border border-line text-[13px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
                  >
                    {p === 100 ? "Max" : `${p}%`}
                  </button>
                ))}
              </div>
            </div>

            {parsed > 0n && (
              <dl className="space-y-2 border-t border-line pt-3 text-[14px]">
                <div className="flex justify-between">
                  <dt className="text-ink-3">Stake after</dt>
                  <dd className="tabular-nums text-ink">{amt(projectedStake)} STERLING</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-3">Share of vault</dt>
                  <dd className="tabular-nums text-ink">
                    {projectedShare.toFixed(2)}%
                    <span className="ml-1.5 text-ink-4">from {share.toFixed(2)}%</span>
                  </dd>
                </div>
                {mode === "unstake" && penaltyBps > 0n && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-warn">Exit penalty ({penaltyPct}%)</dt>
                      <dd className="tabular-nums text-warn">−{amt(penaltyAmount)} STERLING</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-2">
                      <dt className="text-ink-2">You receive</dt>
                      <dd className="tabular-nums text-ink">{amt(receiveAmount)} STERLING</dd>
                    </div>
                  </>
                )}
              </dl>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!!pending || preview || !account || (!!account && parsed <= 0n) || parsed > sourceBalance}
              onClick={() =>
                account ? action(mode === "stake" ? "stake" : "unstake", parsed) : connect()
              }
            >
              {!account
                ? "Connect wallet"
                : parsed <= 0n
                  ? "Enter an amount"
                  : parsed > sourceBalance
                    ? "Amount exceeds balance"
                    : mode === "stake"
                      ? "Stake STERLING"
                      : "Unstake STERLING"}
            </Button>

            <p className="text-[13px] leading-snug text-ink-4">
              {penaltyBps > 0n ? (
                <>
                  There is no lock-up — you can unstake whenever you like — but{" "}
                  <b className="font-medium text-warn">{penaltyPct}% of the amount you withdraw</b> is handed to the
                  stakers who stay. Pending rewards remain claimable either way.
                </>
              ) : (
                <>No lock-up and no exit penalty. Pending rewards remain claimable.</>
              )}
            </p>
          </div>
        </Section>

        <Section title="Rewards">
          <div className="space-y-4">
            <div>
              <p className="text-[12.5px] font-medium tracking-[0.1em] text-ink-4 uppercase">Total claimable</p>
              <p className="mt-2 text-[34px] leading-none font-semibold text-ink">
                {connected && anyPriced ? <Money value={claimableUsd} /> : <span className="text-ink-4">—</span>}
              </p>
            </div>

            {(rewards.length > 0 || ownEarned > 0n) && (
              <ul className="space-y-2.5 border-t border-line pt-3">
                {ownEarned > 0n && (
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <TokenIcon symbol="STERLING" size="sm" />
                      <span className="truncate text-[14px] text-ink-2">
                        STERLING <span className="text-ink-4">· from exit penalties</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[14px] tabular-nums text-ink">
                      {connected ? amt(ownEarned, 2) : "—"}
                    </span>
                  </li>
                )}
                {rewards.map((r) => (
                  <li key={r.token} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <TokenIcon symbol={r.symbol} size="sm" />
                      <span className="truncate text-[14px] text-ink-2">{r.symbol}</span>
                    </span>
                    <span className="shrink-0 text-right text-[14px] tabular-nums text-ink">
                      {connected ? amt(r.earned, 2, r.decimals) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <Button
              variant={anyClaimable ? "primary" : "outline"}
              size="lg"
              className="w-full"
              disabled={!!pending || preview || !account || !anyClaimable}
              onClick={() => action("claim", 0n)}
            >
              Claim all rewards
            </Button>

            <p className="text-[13px] leading-snug text-ink-4">
              One transaction pays every token, less the {Number(feeBps) / 100}% platform fee. Prices are DEX marks from
              each partner's deepest pool, not oracle prices.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
