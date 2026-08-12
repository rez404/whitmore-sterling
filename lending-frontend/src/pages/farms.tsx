import * as React from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Alert, AmountInput, Skeleton } from "@/src/components/ui/misc";
import { Money, Status } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon, TokenPair } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import { cn } from "@/src/lib/utils";
import { ERC20_ABI, MULTI_STAKING_ABI, V3_POOL_ABI, VAULT_ABI, provider, type PriceMap } from "@/src/lib/chain";
import { amt, short } from "@/src/lib/format";
import { fetchPairStatsBatch, fetchUsdPrices, feeApr, usdValue, type PairStats } from "@/src/lib/prices";
import { LP_VAULTS, PLATFORM_TOKEN, STAKING_VAULT, UNISWAP_V3, type VaultPool } from "@/src/farms";
import { USDG_ADDRESS } from "@/src/markets";

export function FarmsPage({
  account,
  connect,
  pending,
  debtDecimals,
  deposit,
  withdraw,
  zap,
}: {
  account: string;
  connect: () => void;
  pending: string;
  debtDecimals: number;
  prices: PriceMap;
  deposit: (pool: VaultPool, a0: bigint, a1: bigint) => Promise<void>;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
  zap: (pool: VaultPool, tokenIn: string, amountIn: bigint, isNative: boolean, label: string) => Promise<void>;
}) {
  const [openSym, setOpenSym] = React.useState("");
  const [stats, setStats] = React.useState<Record<string, PairStats>>({});
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

  const rows = LP_VAULTS.map((pool) => {
    const st = stats[pool.stock.toLowerCase()];
    const tier = st ? feeTiers[st.pairAddress.toLowerCase()] : undefined;
    const apr = st && tier != null ? feeApr(st.volume.h24, tier, st.liquidityUsd) : null;
    return { pool, st, tier, apr };
  });

  const selected = rows.find((r) => r.pool.symbol === openSym);
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
        onBack={() => setOpenSym("")}
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
        <Figure label="Pool TVL" size="lg" value={<Money value={totalTvl} decimals={0} />} hint="Across listed pairs" />
        <Figure label="Volume 24h" value={<Money value={totalVol} decimals={0} />} hint="Traded through these pools" />
        <Figure label="Fees 24h" value={<Money value={totalFees} decimals={0} />} hint="Paid to liquidity providers" />
        <Figure
          label="Vaults live"
          value={`${LP_VAULTS.filter((v) => v.vault).length} / ${LP_VAULTS.length}`}
          hint="Awaiting deployment"
          tone="warn"
        />
      </FigureRow>

      <Alert tone="info" title="Vaults are not deployed yet">
        The pool data below is live from Uniswap. The vault contracts that would deposit on your behalf are written and
        tested but not yet audited or deployed, so nothing can be deposited from here.
      </Alert>

      <Section title="Equity pairs" meta="Sorted by 24h volume · fees shown are what the whole pool earned">
        {loading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <DataTable
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
              {rows
                .slice()
                .sort((a, b) => (b.st?.volume.h24 ?? 0) - (a.st?.volume.h24 ?? 0))
                .map(({ pool, st, tier, apr }) => (
                  <tr
                    key={pool.symbol}
                    onClick={() => st && setOpenSym(pool.symbol)}
                    className={cn(
                      "border-b border-line last:border-0 transition-colors",
                      st ? "cursor-pointer hover:bg-[var(--color-hover)]" : "opacity-50",
                    )}
                  >
                    <Td>
                      <span className="flex items-center gap-3">
                        <TokenPair a={pool.symbol} b="USDG" size="lg" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">{pool.symbol} / USDG</span>
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
                    <Td align="right">
                      {st && tier != null ? <Money value={st.volume.h24 * tier} decimals={0} /> : "—"}
                    </Td>
                    <Td align="right">
                      {apr != null ? <Num className="text-up">{apr.toFixed(1)}%</Num> : <span className="text-ink-4">—</span>}
                    </Td>
                    <Td align="right">
                      <Status tone={pool.vault ? "good" : "idle"}>{pool.vault ? "Live" : "Pending"}</Status>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </DataTable>
        )}
        <p className="pt-1 text-[13px] leading-snug text-ink-4">
          Fee APR annualises the last 24 hours of volume. Volume is volatile, so treat it as a snapshot rather than a
          forecast. It also describes the whole pool — a full-range position earns less than a concentrated one.
        </p>
      </Section>
    </div>
  );
}

type FarmRow = { pool: VaultPool; st?: PairStats; tier?: number; apr: number | null };

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
  const [mode, setMode] = React.useState<"zap" | "pair">("zap");
  const [zapAsset, setZapAsset] = React.useState<"ETH" | "USDG">("ETH");
  const [zapAmount, setZapAmount] = React.useState("");

  const doZap = async () => {
    const native = zapAsset === "ETH";
    let amount = 0n;
    try {
      amount = parseUnits(zapAmount || "0", native ? 18 : debtDecimals);
    } catch {
      amount = 0n;
    }
    if (amount <= 0n) return;
    await zap(pool, native ? UNISWAP_V3.weth9 : USDG_ADDRESS, amount, native, `${zapAmount} ${zapAsset}`);
  };

  const doDeposit = async () => {
    const stockIsToken0 = pool.token0.toLowerCase() === pool.stock.toLowerCase();
    let stockAmt = 0n;
    let usdgAmt = 0n;
    try {
      stockAmt = parseUnits(amtStock || "0", 18);
    } catch {
      stockAmt = 0n;
    }
    try {
      usdgAmt = parseUnits(amtUsdg || "0", debtDecimals);
    } catch {
      usdgAmt = 0n;
    }
    await deposit(pool, stockIsToken0 ? stockAmt : usdgAmt, stockIsToken0 ? usdgAmt : stockAmt);
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
        <Figure label="Pool TVL" value={<Money value={st?.liquidityUsd} decimals={0} />} />
        <Figure label="Volume 24h" value={<Money value={st?.volume.h24} decimals={0} />} />
        <Figure
          label="Fees 24h"
          value={st && tier != null ? <Money value={st.volume.h24 * tier} decimals={0} /> : "—"}
          hint="Paid to LPs"
        />
        <Figure
          label={`${pool.symbol} price`}
          value={<Money value={st?.priceUsd} decimals={st && st.priceUsd < 1 ? 4 : 2} />}
          hint={st?.priceChangeH24 != null ? `${st.priceChangeH24 > 0 ? "+" : ""}${st.priceChangeH24}% 24h` : undefined}
          tone={st?.priceChangeH24 == null ? undefined : st.priceChangeH24 >= 0 ? "good" : "bad"}
        />
      </FigureRow>

      <div className="grid gap-8 lg:grid-cols-2">
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

      <Section title="Add liquidity">
        {!pool.vault ? (
          <Alert tone="warn" title="This vault is not deployed">
            The pool above is live and earning fees, but the vault that would manage a position on your behalf has not
            been deployed or audited yet.
          </Alert>
        ) : (
          <div className="max-w-2xl space-y-4">
            <div className="flex gap-1 rounded-md border border-line bg-surface p-1">
              {(
                [
                  ["zap", "One token"],
                  ["pair", "Both tokens"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-9 flex-1 rounded-sm text-[14px] font-medium transition-colors",
                    mode === m ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "zap" ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <label className="space-y-1.5">
                    <span className="block text-[14px] font-medium text-ink-2">Amount</span>
                    <AmountInput value={zapAmount} onChange={setZapAmount} unit={zapAsset} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="block text-[14px] font-medium text-ink-2">Pay with</span>
                    <select
                      value={zapAsset}
                      onChange={(e) => setZapAsset(e.target.value as "ETH" | "USDG")}
                      className="h-10 rounded-md border border-line bg-surface-2 px-3 text-[14px] font-medium text-ink focus:outline-none"
                    >
                      <option value="ETH">ETH</option>
                      <option value="USDG">USDG</option>
                    </select>
                  </label>
                  <Button variant="primary" disabled={!!pending} onClick={() => (account ? doZap() : connect())}>
                    {account ? "Zap in" : "Connect wallet"}
                  </Button>
                </div>
                <p className="text-[13px] leading-snug text-ink-4">
                  One transaction: your {zapAsset} is swapped into both sides of the pair and deposited. Anything the
                  position cannot use comes straight back to you.
                </p>
              </div>
            ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="space-y-1.5">
                <span className="block text-[14px] font-medium text-ink-2">{pool.symbol}</span>
                <AmountInput value={amtStock} onChange={setAmtStock} unit={pool.symbol} />
              </label>
              <label className="space-y-1.5">
                <span className="block text-[14px] font-medium text-ink-2">USDG</span>
                <AmountInput value={amtUsdg} onChange={setAmtUsdg} unit="USDG" />
              </label>
              <Button variant="primary" disabled={!!pending} onClick={() => (account ? doDeposit() : connect())}>
                {account ? "Deposit" : "Connect wallet"}
              </Button>
            </div>
            )}
            <VaultPosition pool={pool} account={account} pending={pending} withdraw={withdraw} />
          </div>
        )}
        <p className="pt-1 text-[13px] leading-relaxed text-ink-4">
          Providing liquidity is not the same as holding. If {pool.symbol} moves sharply against USDG you end up with
          more of the side that fell — impermanent loss — which can outweigh the fees earned.
        </p>
      </Section>
    </div>
  );
}

function VaultPosition({
  pool,
  account,
  pending,
  withdraw,
}: {
  pool: VaultPool;
  account: string;
  pending: string;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
}) {
  const [shares, setShares] = React.useState(0n);
  React.useEffect(() => {
    if (!account || !pool.vault) return;
    let cancelled = false;
    new Contract(pool.vault, VAULT_ABI, provider)
      .balanceOf(account)
      .then((b: bigint) => {
        if (!cancelled) setShares(BigInt(b));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pool.vault, account]);

  if (!account || shares === 0n)
    return <p className="border-t border-line pt-3 text-[13.5px] text-ink-4">No vault position yet.</p>;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
      <p className="text-[14px] text-ink-2">
        Your shares: <b className="font-semibold tabular-nums text-ink">{amt(shares, 6)}</b>
      </p>
      <Button size="sm" variant="outline" disabled={!!pending} onClick={() => withdraw(pool, shares)}>
        Withdraw all
      </Button>
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
          <DataTable
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
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
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
