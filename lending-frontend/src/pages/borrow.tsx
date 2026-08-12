import { formatUnits, parseUnits } from "ethers";
import { ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Alert, AmountInput, EmptyState, Skeleton } from "@/src/components/ui/misc";
import { Money, Status } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import { cn } from "@/src/lib/utils";
import type { AccountState, MarketState, OracleState, PoolState, PriceMap, TxKind } from "@/src/lib/chain";
import { amt, hfTone, pct, priceFmt, usd } from "@/src/lib/format";
import type { MarketConfig } from "@/src/markets";

export function BorrowPage({
  markets,
  selectedMarket,
  prices,
  marketState,
  oracle,
  accountState,
  pool,
  health,
  debtDecimals,
  form,
  setAmount,
  action,
  account,
  pending,
  loading,
  expandedSymbol,
  onToggleMarket,
  connect,
}: {
  markets: MarketConfig[];
  selectedMarket: MarketConfig;
  prices: PriceMap;
  marketState: MarketState | null;
  oracle: OracleState | null;
  accountState: AccountState | null;
  pool: PoolState | null;
  health: string;
  debtDecimals: number;
  form: Record<TxKind, string>;
  setAmount: (kind: TxKind, value: string) => void;
  action: (kind: TxKind) => Promise<void>;
  account: string;
  pending: string;
  loading: boolean;
  expandedSymbol: string;
  onToggleMarket: (market: MarketConfig) => void;
  connect: () => void;
}) {
  const scale = 10n ** BigInt(18 - debtDecimals);
  const parseUsdg = (s: string) => {
    try {
      return parseUnits(s || "0", debtDecimals);
    } catch {
      return 0n;
    }
  };
  const fmtUsdg = (v: bigint) => formatUnits(v, debtDecimals);
  const fmt18 = (v: bigint) => formatUnits(v, 18);

  // Projected account-wide health factor after borrowing `extra` USDG (18-wad HF).
  const projectBorrowHF = (extra: bigint): string | null => {
    if (!accountState) return null;
    const newDebtWad = (accountState.debt + extra) * scale;
    if (newDebtWad === 0n) return "∞";
    return Number(formatUnits((accountState.liquidationLimit * 10n ** 18n) / newDebtWad, 18)).toFixed(2);
  };
  const maxBorrow = (): bigint => {
    if (!accountState || !pool) return 0n;
    const debtWad = accountState.debt * scale;
    const availUsdg = (accountState.borrowLimit > debtWad ? accountState.borrowLimit - debtWad : 0n) / scale;
    const capped = availUsdg < pool.liquidity ? availUsdg : pool.liquidity;
    return (capped * 99n) / 100n; // small safety margin against rounding at the limit
  };
  const maxRepay = (): bigint => {
    if (!accountState) return 0n;
    return accountState.debt < accountState.usdg ? accountState.debt : accountState.usdg;
  };

  const projectedBorrowHF = projectBorrowHF(parseUsdg(form.borrow));
  const borrowBlocked = projectedBorrowHF !== null && projectedBorrowHF !== "∞" && Number(projectedBorrowHF) < 1;
  const borrowRisky = projectedBorrowHF !== null && projectedBorrowHF !== "∞" && Number(projectedBorrowHF) < 1.1;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Borrow"
        description="Post a tokenized equity as collateral and draw USDG against it. Repay any time to release the position."
      />

      <FigureRow>
        <Figure
          label="Borrow limit"
          value={account ? usd(accountState?.borrowLimit) : "—"}
          hint="Across all collateral"
        />
        <Figure label="Your debt" value={account ? usd(accountState?.debt, 2, debtDecimals) : "—"} hint="USDG" />
        <Figure label="Health factor" value={account ? health : "—"} tone={account ? hfTone(health) : undefined} />
        <Figure
          label="Pool liquidity"
          value={usd(pool?.liquidity, 2, debtDecimals)}
          hint={pool?.liquidity === 0n ? "Nothing available to borrow" : "Borrowable now"}
          tone={pool?.liquidity === 0n ? "warn" : undefined}
        />
      </FigureRow>

      {!account && (
        <Alert
          title="Wallet not connected"
          action={
            <Button size="sm" variant="primary" onClick={connect}>
              Connect
            </Button>
          }
        >
          Market parameters are live below. Balances, borrow limit, and health factor load once you connect.
        </Alert>
      )}

      <Section title="Collateral markets" meta={`${markets.length} listed · select a row to deposit or borrow`}>
        {loading && markets.length === 0 ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <EmptyState title="No markets match" text="Clear the search filter to see all listed markets." />
        ) : (
          <DataTable
            head={
              <>
                <Th>Asset</Th>
                <Th align="right">Oracle price</Th>
                <Th align="right">Max LTV</Th>
                <Th align="right">Liquidation</Th>
                <Th align="right">Liq. bonus</Th>
                <Th align="right">Status</Th>
              </>
            }
          >
            {markets.map((m) => {
              const p = prices[m.symbol];
              const isSelected = m.symbol === selectedMarket.symbol;
              const isOpen = expandedSymbol === m.symbol;
              const cf = isSelected && marketState ? pct(marketState.collateralFactorBps) : pct(m.collateralFactorBps);
              const lt =
                isSelected && marketState ? pct(marketState.liquidationThresholdBps) : pct(m.liquidationThresholdBps);
              const stale = p?.stale || (isSelected && oracle?.stale);
              return (
                <tbody key={m.symbol} className={cn("border-b border-line", isOpen && "bg-[var(--color-hover)]")}>
                  <tr
                    onClick={() => onToggleMarket(m)}
                    aria-expanded={isOpen}
                    className="group cursor-pointer transition-colors hover:bg-[var(--color-hover)]"
                  >
                    <Td>
                      <span className="flex items-center gap-3">
                        <TokenIcon symbol={m.symbol} size="lg" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">{m.symbol}</span>
                          <span className="block truncate text-[14px] text-ink-3">
                            {m.name.replace(" Stock Token", "").replace(" ETF Token", "")}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td align="right">
                      <Num>
                        <Money value={p?.price} decimals={p && p.price < 1 ? 4 : 2} />
                      </Num>
                    </Td>
                    <Td align="right">{cf}</Td>
                    <Td align="right">{lt}</Td>
                    <Td align="right">{pct(m.liquidationBonusBps)}</Td>
                    <Td align="right">
                      <span className="inline-flex items-center gap-3">
                        <Status tone={stale ? "warn" : "good"}>{stale ? "Stale" : "Live"}</Status>
                        <ChevronDown
                          className={cn("size-4 text-ink-4 transition-transform", isOpen && "rotate-180")}
                        />
                      </span>
                    </Td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <Td colSpan={6} className="pt-0 pb-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <ActionField
                            label={`Deposit ${m.symbol}`}
                            hint="Adds collateral and raises your borrow limit."
                            value={form.deposit}
                            onChange={(v) => setAmount("deposit", v)}
                            unit={m.symbol}
                            onMax={accountState ? () => setAmount("deposit", fmt18(accountState.stock)) : undefined}
                            button="Deposit"
                            variant="primary"
                            onSubmit={() => action("deposit")}
                            disabled={!!pending || !account}
                          />
                          <ActionField
                            label="Borrow USDG"
                            hint={
                              projectedBorrowHF && Number(form.borrow) > 0
                                ? `Health factor after borrow: ${projectedBorrowHF}`
                                : "Draw USDG against posted collateral."
                            }
                            hintTone={borrowBlocked ? "bad" : borrowRisky ? "warn" : undefined}
                            value={form.borrow}
                            onChange={(v) => setAmount("borrow", v)}
                            unit="USDG"
                            onMax={accountState && pool ? () => setAmount("borrow", fmtUsdg(maxBorrow())) : undefined}
                            button="Borrow"
                            variant="primary"
                            onSubmit={() => action("borrow")}
                            disabled={!!pending || !account || !pool || pool.liquidity === 0n}
                          />
                          <ActionField
                            label="Repay USDG"
                            hint="Lowers debt and improves health."
                            value={form.repay}
                            onChange={(v) => setAmount("repay", v)}
                            unit="USDG"
                            onMax={accountState ? () => setAmount("repay", fmtUsdg(maxRepay())) : undefined}
                            button="Repay"
                            onSubmit={() => action("repay")}
                            disabled={!!pending || !account}
                          />
                          <ActionField
                            label={`Withdraw ${m.symbol}`}
                            hint="Blocked if it would make the account unsafe."
                            value={form.withdraw}
                            onChange={(v) => setAmount("withdraw", v)}
                            unit={m.symbol}
                            onMax={
                              accountState && accountState.debt === 0n
                                ? () => setAmount("withdraw", fmt18(accountState.collateral))
                                : undefined
                            }
                            button="Withdraw"
                            onSubmit={() => action("withdraw")}
                            disabled={!!pending || !account}
                          />
                        </div>

                        {account && accountState && (
                          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1.5 text-[14px] text-ink-3">
                            <span>
                              Posted{" "}
                              <Num>
                                {amt(accountState.collateral)} {m.symbol}
                              </Num>
                            </span>
                            <span>
                              Wallet{" "}
                              <Num>
                                {amt(accountState.stock)} {m.symbol}
                              </Num>
                            </span>
                            <span>
                              Max staleness <Num>{Math.round(m.maxStaleness / 3600)}h</Num>
                            </span>
                          </div>
                        )}
                      </Td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </DataTable>
        )}
      </Section>
    </div>
  );
}

function ActionField({
  label,
  hint,
  hintTone,
  value,
  onChange,
  unit,
  onMax,
  button,
  onSubmit,
  disabled,
  variant = "secondary",
}: {
  label: string;
  hint?: string;
  hintTone?: "warn" | "bad";
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  onMax?: () => void;
  button: string;
  onSubmit: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="text-[14px] font-medium text-ink-2">{label}</label>
      <AmountInput value={value} onChange={onChange} unit={unit} onMax={onMax} disabled={disabled} />
      <Button type="submit" variant={variant} size="sm" disabled={disabled}>
        {button}
      </Button>
      {hint && (
        <p
          className={cn(
            "text-[13px] leading-snug",
            hintTone === "bad" ? "text-down" : hintTone === "warn" ? "text-warn" : "text-ink-4",
          )}
        >
          {hint}
        </p>
      )}
    </form>
  );
}
