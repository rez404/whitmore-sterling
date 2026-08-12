import * as React from "react";
import { Contract, formatUnits } from "ethers";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EmptyState, Skeleton } from "@/src/components/ui/misc";
import { Money } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import type { AccountState, DeskTab, PoolState, PriceMap } from "@/src/lib/chain";
import { VAULT_ABI, provider } from "@/src/lib/chain";
import { amt, amtSig, hfTone, num, pct, priceFmt, short, usd } from "@/src/lib/format";
import { LP_VAULTS } from "@/src/farms";
import type { MarketConfig } from "@/src/markets";

export type Position = { symbol: string; token: string; amount: bigint; price?: number };

export function DashboardPage({
  account,
  accountState,
  positions,
  pool,
  market,
  prices,
  health,
  debtDecimals,
  loading,
  connect,
  go,
}: {
  account: string;
  accountState: AccountState | null;
  positions: Position[];
  pool: PoolState | null;
  market: MarketConfig;
  prices: PriceMap;
  health: string;
  debtDecimals: number;
  loading: boolean;
  connect: () => void;
  go: (tab: DeskTab) => void;
}) {
  const debtValue = accountState ? Number(formatUnits(accountState.debt, debtDecimals)) : 0;
  const collateralValue = accountState ? Number(formatUnits(accountState.collateralValue, 18)) : 0;
  const suppliedValue = accountState ? Number(formatUnits(accountState.withdrawableLiquidity, debtDecimals)) : 0;
  const netValue = collateralValue + suppliedValue - debtValue;
  const borrowLimit = accountState ? Number(formatUnits(accountState.borrowLimit, 18)) : 0;
  const capacityLeft = Math.max(borrowLimit - debtValue, 0);
  const utilisation = borrowLimit > 0 ? Math.min((debtValue / borrowLimit) * 100, 100) : 0;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Overview"
        description="Your collateral, debt, and supplied liquidity across every listed market."
        action={
          account ? (
            <Button size="sm" variant="outline" onClick={() => go("borrow")}>
              Open a position <ArrowUpRight />
            </Button>
          ) : undefined
        }
      />

      {!account ? (
        <EmptyState
          title="Connect to load your desk"
          text="Balances, borrow capacity, health factor, and open positions are read live from Robinhood Chain once a wallet is connected."
          action={
            <Button variant="primary" size="sm" onClick={connect}>
              Connect wallet
            </Button>
          }
        />
      ) : loading && !accountState ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <>
          <FigureRow>
            <Figure
              label="Net position"
              size="lg"
              value={<Money value={netValue} compact />}
              hint="Collateral + supplied − debt"
            />
            <Figure label="Collateral value" value={<Money value={collateralValue} compact />} hint="All listed markets" />
            <Figure label="Outstanding debt" value={<Money value={debtValue} compact />} hint="USDG borrowed" />
            <Figure
              label="Health factor"
              value={health}
              tone={hfTone(health)}
              hint={health === "∞" ? "No debt outstanding" : "Liquidation at 1.00"}
            />
          </FigureRow>

          {debtValue > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between text-[14.5px]">
                <span className="text-ink-3">Borrow capacity used</span>
                <span className="text-ink-2">
                  <Money value={debtValue} /> <span className="text-ink-4">of</span> <Money value={borrowLimit} />
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-surface-3">
                <div
                  className={
                    utilisation > 90 ? "h-full bg-down" : utilisation > 70 ? "h-full bg-warn" : "h-full bg-accent"
                  }
                  style={{ width: `${Math.max(utilisation, 2)}%` }}
                />
              </div>
              <p className="text-[13.5px] text-ink-4">
                <Money value={capacityLeft} /> still borrowable before the limit.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Section
              title="Collateral"
              meta={positions.length ? `${positions.length} market${positions.length > 1 ? "s" : ""}` : undefined}
            >
              {positions.length === 0 ? (
                <EmptyState
                  title="No collateral posted"
                  text="Deposit a stock token to start borrowing USDG against it."
                  action={
                    <Button size="sm" variant="outline" onClick={() => go("borrow")}>
                      Browse markets
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  className="min-w-0"
                  head={
                    <>
                      <Th>Asset</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">Value</Th>
                    </>
                  }
                >
                  <tbody>
                    {positions.map((p) => {
                      const value = p.price ? Number(formatUnits(p.amount, 18)) * p.price : undefined;
                      return (
                        <tr key={p.token} className="border-b border-line last:border-0">
                          <Td>
                            <span className="flex items-center gap-3">
                              <TokenIcon symbol={p.symbol} size="lg" />
                              <span className="font-semibold text-ink">{p.symbol}</span>
                            </span>
                          </Td>
                          <Td align="right">{amt(p.amount)}</Td>
                          <Td align="right">
                            <Num>
                              <Money value={value} />
                            </Num>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              )}
            </Section>

            <Section title="Wallet" meta={short(account)}>
              <DataTable
                className="min-w-0"
                head={
                  <>
                    <Th>Asset</Th>
                    <Th align="right">Balance</Th>
                    <Th align="right">Price</Th>
                  </>
                }
              >
                <tbody>
                  <WalletRow
                    symbol="USDG"
                    label="USDG"
                    sub="Borrow & supply asset"
                    value={usd(accountState?.usdg, 2, debtDecimals)}
                  />
                  <WalletRow
                    symbol={market.symbol}
                    label={market.symbol}
                    sub={market.name.replace(" Stock Token", "").replace(" ETF Token", "")}
                    value={amt(accountState?.stock)}
                    price={prices[market.symbol]?.price}
                  />
                  <WalletRow symbol="ETH" label="ETH" sub="Gas" value={amt(accountState?.eth, 5)} />
                  <WalletRow
                    symbol="USDG"
                    label="Supplied"
                    sub="Withdrawable claim"
                    value={usd(accountState?.withdrawableLiquidity, 2, debtDecimals)}
                  />
                </tbody>
              </DataTable>
            </Section>
          </div>
        </>
      )}

      {account && <FarmPositions account={account} prices={prices} debtDecimals={debtDecimals} go={go} />}

      <Section
        title="Protocol"
        meta="Live pool state"
        action={
          <Button size="sm" variant="ghost" onClick={() => go("lending")}>
            Supply liquidity
          </Button>
        }
      >
        <FigureRow className="border-t-0 pt-1">
          <Figure label="Available liquidity" value={<Money value={num(pool?.liquidity, debtDecimals)} compact />} />
          <Figure label="Total supplied" value={<Money value={num(pool?.totalSuppliedLiquidity, debtDecimals)} compact />} />
          <Figure label="Total debt" value={<Money value={num(pool?.totalDebt, debtDecimals)} compact />} />
          <Figure label="Borrow APR" value={pool ? pct(pool.borrowAprBps) : "—"} />
        </FigureRow>
      </Section>
    </div>
  );
}

/**
 * Farm positions on the overview.
 *
 * Someone who has deposited into a vault expects to see it here, not only on the
 * Farms page. The value is not estimated from share supply: each vault is asked
 * what the caller's shares would actually pay out right now, and the two token
 * amounts are marked at the oracle price.
 */
function FarmPositions({
  account,
  prices,
  debtDecimals,
  go,
}: {
  account: string;
  prices: PriceMap;
  debtDecimals: number;
  go: (tab: DeskTab) => void;
}) {
  type Row = { symbol: string; shares: bigint; stock: bigint; usdg: bigint };
  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const live = LP_VAULTS.filter((v) => v.vault);
      const out: Row[] = [];
      await Promise.all(
        live.map(async (v) => {
          try {
            const c = new Contract(v.vault, VAULT_ABI, provider);
            const shares = BigInt(await c.balanceOf(account));
            if (shares === 0n) return;
            const stockIsToken0 = v.token0.toLowerCase() === v.stock.toLowerCase();
            let stock = 0n;
            let usdg = 0n;
            try {
              const res = await c.withdraw.staticCall(shares, 0, 0, { from: account });
              stock = BigInt(stockIsToken0 ? res[0] : res[1]);
              usdg = BigInt(stockIsToken0 ? res[1] : res[0]);
            } catch {
              /* the position is there even if the preview call fails */
            }
            out.push({ symbol: v.symbol, shares, stock, usdg });
          } catch {
            /* skip this vault */
          }
        }),
      );
      if (!cancelled) setRows(out.sort((a, b) => a.symbol.localeCompare(b.symbol)));
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account]);

  if (rows.length === 0) return null;

  const valueOf = (r: Row) =>
    Number(formatUnits(r.stock, 18)) * (prices[r.symbol]?.price ?? 0) + Number(formatUnits(r.usdg, debtDecimals));
  const total = rows.reduce((s, r) => s + valueOf(r), 0);

  return (
    <Section
      title="Farm positions"
      meta={`${rows.length} vault${rows.length > 1 ? "s" : ""} · ${total > 0 ? "" : "value pending"}`}
      action={
        <Button size="sm" variant="ghost" onClick={() => go("farms")}>
          Manage
        </Button>
      }
    >
      <ul className="divide-y divide-[var(--color-line)]">
        {rows.map((r) => (
          <li key={r.symbol} className="flex items-center gap-3 py-3">
            <TokenIcon symbol={r.symbol} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{r.symbol} / USDG</p>
              <p className="truncate text-[13.5px] tabular-nums text-ink-3">
                {amtSig(r.stock)} {r.symbol} + {amt(r.usdg, 2, debtDecimals)} USDG
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[16px] font-medium tabular-nums text-ink">
                {valueOf(r) > 0 ? <Money value={valueOf(r)} /> : <span className="text-ink-4">—</span>}
              </p>
              <p className="text-[12.5px] tabular-nums text-ink-4">{amtSig(r.shares)} shares</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WalletRow({
  symbol,
  label,
  sub,
  value,
  price,
}: {
  symbol: string;
  label: string;
  sub: string;
  value: string;
  price?: number;
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <Td>
        <span className="flex items-center gap-3">
          <TokenIcon symbol={symbol} size="lg" />
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{label}</span>
            <span className="block truncate text-[14px] text-ink-3">{sub}</span>
          </span>
        </span>
      </Td>
      <Td align="right">
        <Num>{value}</Num>
      </Td>
      <Td align="right">{price ? priceFmt(price) : <span className="text-ink-4">—</span>}</Td>
    </tr>
  );
}
