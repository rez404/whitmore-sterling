import * as React from "react";
import { formatUnits, parseUnits } from "ethers";
import { ArrowDown, ArrowUpRight, Copy, Info } from "lucide-react";
import { AmountField, BalanceLine } from "@/src/components/ui/amount-field";
import { Button } from "@/src/components/ui/button";
import { Card, CardBody } from "@/src/components/ui/card";
import { Money, Status } from "@/src/components/ui/figure";
import { Figure, Section } from "@/src/components/ui/table";
import { TokenIcon, TokenSelect } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import { cn } from "@/src/lib/utils";
import { type AccountState, type PriceMap } from "@/src/lib/chain";
import { GAS_BUFFER_WEI, UNISWAP, minOut, quoteBest, type Quote } from "@/src/lib/uniswap";
import { amt, explorer, pct, priceFmt, short, timeAgo } from "@/src/lib/format";
import { MARKETS, USDG_ADDRESS, type MarketConfig } from "@/src/markets";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function SwapPage({
  market,
  prices,
  amount,
  setAmount,
  connect,
  account,
  accountState,
  debtDecimals,
  pending,
  uniswapSwap,
  onSelectMarket,
}: {
  market: MarketConfig;
  prices: PriceMap;
  amount: string;
  setAmount: (v: string) => void;
  connect: () => void;
  account: string;
  accountState: AccountState | null;
  debtDecimals: number;
  pending: string;
  uniswapSwap: (
    tokenIn: string,
    tokenOut: string,
    amountWei: bigint,
    isNative: boolean,
    label: string,
    quote: Quote,
  ) => Promise<void>;
  onSelectMarket: (m: MarketConfig) => void;
}) {
  const inputs = React.useMemo(
    () => [
      { key: "ETH", address: NATIVE, decimals: 18, native: true, name: "Ether · gas asset" },
      { key: "USDG", address: USDG_ADDRESS, decimals: debtDecimals, native: false, name: "Global Dollar" },
    ],
    [debtDecimals],
  );
  const [inKey, setInKey] = React.useState("ETH");
  const input = inputs.find((i) => i.key === inKey) || inputs[0];
  const outMarket = market;
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [quoteErr, setQuoteErr] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const raw = (amount || "").trim();
    if (!raw || Number(raw) <= 0) {
      setQuote(null);
      setQuoteErr("");
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteErr("");
    const timer = window.setTimeout(async () => {
      try {
        const amountWei = parseUnits(raw, input.decimals);
        // Native ETH quotes against the WETH9 pool — the router wraps on the way in.
        const tokenIn = input.native ? UNISWAP.weth9 : input.address;
        const q = await quoteBest(tokenIn, outMarket.token, amountWei, input.key, outMarket.symbol);
        if (cancelled) return;
        if (q) setQuote(q);
        else {
          setQuote(null);
          setQuoteErr("No Uniswap pool with depth for this pair at this size.");
        }
      } catch {
        if (!cancelled) {
          setQuote(null);
          setQuoteErr("Quote failed. Try again.");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, inKey, outMarket.token, outMarket.symbol, input.address, input.decimals, input.native, input.key]);

  const outAmount = quote
    ? Number(formatUnits(quote.amountOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "";
  const impact = quote?.priceImpact ?? null;
  const balance = input.native ? accountState?.eth : accountState?.usdg;
  const oraclePrice = prices[outMarket.symbol];
  const received = quote
    ? Number(formatUnits(minOut(quote.amountOut, 100), 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "";

  const doSwap = async () => {
    if (!account) return connect();
    const raw = (amount || "").trim();
    if (!raw || Number(raw) <= 0) return;
    if (!quote) return;
    await uniswapSwap(
      input.address,
      outMarket.token,
      parseUnits(raw, input.decimals),
      input.native,
      `${raw} ${input.key}`,
      quote,
    );
  };

  const copyAddress = () => {
    navigator.clipboard?.writeText(outMarket.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Swap"
        description="Buy tokenized equities with ETH or USDG, directly against Uniswap V3 pools. Quotes come from the on-chain quoter; your wallet signs the router transaction."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        {/* ------------------------------- trade card ------------------------------- */}
        <Card className="self-start overflow-visible">
          <CardBody className="space-y-1.5 p-4">
            <AmountField
              caption="You pay"
              value={amount}
              onChange={setAmount}
              selector={
                <TokenSelect
                  value={input.key}
                  onChange={setInKey}
                  options={inputs.map((i) => ({ symbol: i.key, name: i.name }))}
                />
              }
              footer={
                account && balance != null ? (
                  <BalanceLine
                    amount={`${amt(balance, input.native ? 5 : 2, input.decimals)} ${input.key}`}
                    maxLabel={input.native ? "Max · less gas" : "Max"}
                    onMax={() => {
                      const spendable = input.native
                        ? balance > GAS_BUFFER_WEI
                          ? balance - GAS_BUFFER_WEI
                          : 0n
                        : balance;
                      setAmount(formatUnits(spendable, input.decimals));
                    }}
                  />
                ) : (
                  <span className="text-ink-4">Connect to see balance</span>
                )
              }
            />

            <div className="relative flex justify-center">
              <span className="absolute -top-3.5 flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-2">
                <ArrowDown className="size-4 text-ink-2" />
              </span>
            </div>

            <AmountField
              caption="You receive"
              value={quoting ? "" : outAmount}
              readOnly
              selector={
                <TokenSelect
                  value={outMarket.symbol}
                  onChange={(sym) => {
                    const next = MARKETS.find((m) => m.symbol === sym);
                    if (next) onSelectMarket(next);
                  }}
                  options={MARKETS.map((m) => ({
                    symbol: m.symbol,
                    name: m.name.replace(" Stock Token", "").replace(" ETF Token", ""),
                    meta: prices[m.symbol] ? priceFmt(prices[m.symbol].price) : undefined,
                  }))}
                />
              }
              footer={
                quoting ? (
                  <span className="text-ink-4">Fetching best route…</span>
                ) : oraclePrice ? (
                  <span className="text-ink-4">
                    Oracle {priceFmt(oraclePrice.price)} · {timeAgo(oraclePrice.updatedAt)}
                  </span>
                ) : undefined
              }
            />

            {(quote || quoteErr) && (
              <div className="!mt-3 space-y-1.5 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                {quoteErr ? (
                  <p className="text-[13.5px] text-warn">{quoteErr}</p>
                ) : (
                  <>
                    <Line
                      label="Rate"
                      value={
                        outAmount && Number(amount) > 0
                          ? `1 ${input.key} ≈ ${(
                              Number(outAmount.replace(/,/g, "")) / Number(amount)
                            ).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${outMarket.symbol}`
                          : "—"
                      }
                    />
                    <Line
                      label="Price impact"
                      value={impact == null ? "—" : `${(impact * 100).toFixed(2)}%`}
                      tone={impact == null ? undefined : impact > 0.05 ? "bad" : impact > 0.01 ? "warn" : undefined}
                    />
                    <Line label="Minimum received" value={`${received} ${outMarket.symbol}`} />
                    <Line label="Max slippage" value="1.00%" />
                    <Line
                      label="Route"
                      value={
                        quote
                          ? quote.fee != null
                            ? `${quote.hops.join(" → ")} · ${(quote.fee / 10000).toFixed(2)}%`
                            : quote.hops.join(" → ")
                          : "—"
                      }
                    />
                    <Line label="Venue" value="Uniswap V3" />
                  </>
                )}
              </div>
            )}

            <div className="!mt-3">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={doSwap}
                disabled={!!pending || (!!account && !quote)}
              >
                {!account
                  ? "Connect wallet"
                  : pending
                    ? "Working…"
                    : quoting
                      ? "Fetching quote…"
                      : quote
                        ? `Swap for ${outMarket.symbol}`
                        : "Enter an amount"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------ asset panel ------------------------------ */}
        <Section className="self-start" title="Asset" meta={outMarket.symbol}>
          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <TokenIcon symbol={outMarket.symbol} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="truncate text-[21px] font-medium text-ink">{outMarket.symbol}</h2>
                  <Status tone={oraclePrice?.stale ? "warn" : "good"}>
                    {oraclePrice?.stale ? "Stale feed" : "Live"}
                  </Status>
                </div>
                <p className="truncate text-[14.5px] text-ink-3">{outMarket.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[32px] leading-none font-semibold text-ink">
                  <Money value={oraclePrice?.price} />
                </p>
                <p className="mt-1.5 text-[13px] text-ink-4">Chainlink SVR</p>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-8 gap-y-5 border-y border-line py-5">
              <Figure label="Max LTV" value={pct(outMarket.collateralFactorBps)} />
              <Figure label="Liquidation" value={pct(outMarket.liquidationThresholdBps)} />
              <Figure label="Liq. bonus" value={pct(outMarket.liquidationBonusBps)} />
            </dl>

            <div className="space-y-1.5">
              <Line label="Token" value={short(outMarket.token)} mono />
              <Line label="Price feed" value={short(outMarket.feed)} mono />
              <Line label="Max staleness" value={`${Math.round(outMarket.maxStaleness / 3600)}h`} />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={copyAddress}>
                <Copy /> {copied ? "Copied" : "Copy address"}
              </Button>
              <a
                href={explorer(outMarket.token, "address")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[14px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
              >
                Explorer <ArrowUpRight className="size-3.5" />
              </a>
            </div>

            <p className="flex gap-2 border-t border-line pt-4 text-[13.5px] leading-relaxed text-ink-4">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              The oracle price is the lending pool's risk feed. It is independent of the DEX route and can differ from
              the price you trade at — especially outside market hours.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "warn" | "bad";
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
      <span className="text-ink-3">{label}</span>
      <span
        className={cn(
          "truncate text-right tabular-nums",
          mono && "font-mono text-[13px]",
          tone === "bad" ? "text-down" : tone === "warn" ? "text-warn" : "text-ink-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}
