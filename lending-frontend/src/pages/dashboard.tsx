import { formatUnits } from "ethers";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EmptyState, Skeleton } from "@/src/components/ui/misc";
import { Money } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import type { AccountState, DeskTab, PoolState, PriceMap } from "@/src/lib/chain";
import { amt, hfTone, num, pct, priceFmt, short, usd } from "@/src/lib/format";
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
