import * as React from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import { ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Alert, AmountInput } from "@/src/components/ui/misc";
import { Money, Status } from "@/src/components/ui/figure";
import { DataTable, Figure, FigureRow, Num, Section, Td, Th } from "@/src/components/ui/table";
import { TokenIcon, TokenPair } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import { cn } from "@/src/lib/utils";
import { ERC20_ABI, STAKING_ABI, VAULT_ABI, provider, type PriceMap } from "@/src/lib/chain";
import { amt, priceFmt } from "@/src/lib/format";
import { LP_VAULTS, PLATFORM_TOKEN, STAKING_POOL, type VaultPool } from "@/src/farms";

export function FarmsPage({
  account,
  connect,
  pending,
  debtDecimals,
  prices,
  deposit,
  withdraw,
}: {
  account: string;
  connect: () => void;
  pending: string;
  debtDecimals: number;
  prices: PriceMap;
  deposit: (pool: VaultPool, a0: bigint, a1: bigint) => Promise<void>;
  withdraw: (pool: VaultPool, shares: bigint) => Promise<void>;
}) {
  const [openSym, setOpenSym] = React.useState("");
  const [amtStock, setAmtStock] = React.useState("");
  const [amtUsdg, setAmtUsdg] = React.useState("");
  const live = LP_VAULTS.filter((v) => v.vault);

  const doDeposit = async (pool: VaultPool) => {
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Farms"
        description="Deposit a stock token and USDG into a concentrated-liquidity vault. The vault collects trading fees, keeps a 10% platform cut, and compounds the rest back into the position."
      />

      {live.length === 0 && (
        <Alert tone="info" title="Vaults not deployed yet">
          The vault contract is written and tested but not live. Nothing on this page can be deposited into until the
          vault addresses are published.
        </Alert>
      )}

      <Section title="Liquidity vaults" meta={`${live.length} live · ${LP_VAULTS.length - live.length} pending deployment`}>
        <DataTable
          head={
            <>
              <Th>Pair</Th>
              <Th align="right">Oracle price</Th>
              <Th align="right">Fee tier</Th>
              <Th align="right">Platform fee</Th>
              <Th align="right">Status</Th>
            </>
          }
        >
          {LP_VAULTS.map((pool) => {
            const isLive = !!pool.vault;
            const isOpen = openSym === pool.symbol;
            const price = prices[pool.symbol]?.price;
            return (
              <tbody key={pool.symbol} className={cn("border-b border-line", isOpen && "bg-[var(--color-hover)]")}>
                <tr
                  onClick={() => {
                    if (!isLive) return;
                    setOpenSym(isOpen ? "" : pool.symbol);
                    setAmtStock("");
                    setAmtUsdg("");
                  }}
                  className={cn(
                    "transition-colors",
                    isLive ? "cursor-pointer hover:bg-[var(--color-hover)]" : "opacity-55",
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
                  <Td align="right">
                    <Num>
                      <Money value={price} />
                    </Num>
                  </Td>
                  <Td align="right">0.30%</Td>
                  <Td align="right">10%</Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-3">
                      <Status tone={isLive ? "good" : "idle"}>{isLive ? "Live" : "Pending"}</Status>
                      {isLive && (
                        <ChevronDown className={cn("size-4 text-ink-4 transition-transform", isOpen && "rotate-180")} />
                      )}
                    </span>
                  </Td>
                </tr>

                {isOpen && isLive && (
                  <tr>
                    <Td colSpan={5} className="pt-0 pb-5">
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                        <label className="space-y-1.5">
                          <span className="block text-[14px] font-medium text-ink-2">{pool.symbol}</span>
                          <AmountInput value={amtStock} onChange={setAmtStock} unit={pool.symbol} />
                        </label>
                        <label className="space-y-1.5">
                          <span className="block text-[14px] font-medium text-ink-2">USDG</span>
                          <AmountInput value={amtUsdg} onChange={setAmtUsdg} unit="USDG" />
                        </label>
                        <Button
                          variant="primary"
                          disabled={!!pending}
                          onClick={() => (account ? doDeposit(pool) : connect())}
                        >
                          {account ? "Deposit" : "Connect wallet"}
                        </Button>
                      </div>
                      <VaultPosition pool={pool} account={account} pending={pending} withdraw={withdraw} />
                    </Td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </DataTable>
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
  const live = !!STAKING_POOL;
  const [staked, setStaked] = React.useState(0n);
  const [earned, setEarned] = React.useState(0n);
  const [rewardRate, setRewardRate] = React.useState(0n);
  const [amount, setAmount] = React.useState("");
  const [walletBal, setWalletBal] = React.useState(0n);

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const load = async () => {
      try {
        const s = new Contract(STAKING_POOL, STAKING_ABI, provider);
        const [bal, ern, rate, wallet] = await Promise.all([
          account ? s.balanceOf(account) : Promise.resolve(0n),
          account ? s.earned(account) : Promise.resolve(0n),
          s.rewardRate(),
          account && PLATFORM_TOKEN
            ? new Contract(PLATFORM_TOKEN, ERC20_ABI, provider).balanceOf(account)
            : Promise.resolve(0n),
        ]);
        if (!cancelled) {
          setStaked(BigInt(bal));
          setEarned(BigInt(ern));
          setRewardRate(BigInt(rate));
          setWalletBal(BigInt(wallet));
        }
      } catch {
        /* not deployed / rpc hiccup */
      }
    };
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account, live]);

  let parsed = 0n;
  try {
    parsed = parseUnits(amount || "0", 18);
  } catch {
    parsed = 0n;
  }
  const noRewards = rewardRate === 0n;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stake"
        description="Stake the Whitmore Sterling platform token to earn a partner's reward token. Rewards are funded by the partner — the contract mints nothing."
      />

      {!live ? (
        <div className="max-w-2xl space-y-3 border-t border-line pt-6">
          <Status tone="idle">Not deployed</Status>
          <h2 className="text-[21px] font-medium text-ink">Staking pool is not live yet</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
              The contract is written and tested. It streams a partner's token to stakers over a funding period and
              takes a 10% platform fee on rewards claimed. Until a partner funds a stream, staking would earn nothing —
            so the pool stays unpublished rather than advertising a yield that does not exist.
          </p>
        </div>
      ) : (
        <>
          <FigureRow>
            <Figure label="Your stake" size="lg" value={account ? amt(staked) : "—"} />
            <Figure label="Claimable" value={account ? amt(earned) : "—"} tone={earned > 0n ? "good" : undefined} />
            <Figure
              label="Reward stream"
              value={noRewards ? "Inactive" : "Streaming"}
              tone={noRewards ? "warn" : "good"}
            />
            <Figure label="Platform fee" value="10%" hint="On rewards claimed" />
          </FigureRow>

          {noRewards && (
            <Alert tone="warn" title="No reward stream running">
              Staking is open, but nothing accrues until a partner funds the pool.
            </Alert>
          )}

          <Section title="Manage stake" meta={account ? `Wallet ${amt(walletBal)} WHIT` : undefined}>
            <div className="max-w-md space-y-3">
              <AmountInput
                value={amount}
                onChange={setAmount}
                unit="WHIT"
                onMax={account && walletBal > 0n ? () => setAmount(formatUnits(walletBal, 18)) : undefined}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!!pending || !account}
                  onClick={() => (account ? action("stake", parsed) : connect())}
                >
                  {account ? "Stake" : "Connect wallet"}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!pending || !account || staked === 0n}
                  onClick={() => action("unstake", parsed > 0n && parsed <= staked ? parsed : staked)}
                >
                  Unstake
                </Button>
                <Button
                  variant="outline"
                  disabled={!!pending || !account || earned === 0n}
                  onClick={() => action("claim", 0n)}
                >
                  Claim rewards
                </Button>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
