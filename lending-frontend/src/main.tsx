import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserProvider, Contract, MaxUint256, formatUnits, parseUnits } from "ethers";
import { ExternalLink } from "lucide-react";
import { LENDING_POOL_ADDRESS, MARKETS, TREASURY_ADDRESS, USDG_ADDRESS, type MarketConfig } from "./markets";
import { LP_ZAP, PLATFORM_TOKEN, STAKING_VAULT, type VaultPool } from "./farms";
import {
  CHAIN,
  ERC20_ABI,
  FEED_ABI,
  POOL_ABI,
  MULTI_STAKING_ABI,
  VAULT_ABI,
  ZAP_ABI,
  poolRead,
  provider,
  usdgRead,
  type AccountState,
  type DeskTab,
  type MarketState,
  type OracleState,
  type PoolState,
  type PriceMap,
  type TxKind,
} from "./lib/chain";
import { explorer } from "./lib/format";
import { useRoute } from "./lib/route";
import {
  GAS_BUFFER_WEI,
  UNISWAP,
  buildZapLegs,
  executeSwap,
  fullRangeAmounts,
  minAmounts,
  minOut,
  zapMinimums,
  type Quote,
} from "./lib/uniswap";
import { Alert } from "./components/ui/misc";
import { Button } from "./components/ui/button";
import { MobileTabBar, Sidebar, Ticker, Topbar } from "./components/shell";
import { DashboardPage, type Position } from "./pages/dashboard";
import { BorrowPage } from "./pages/borrow";
import { LendingPage } from "./pages/lending";
import { SwapPage } from "./pages/swap";
import { FarmsPage, StakePage } from "./pages/farms";
import { DocumentationPage, LearnPage, SuitsPage } from "./pages/content";
import "./styles.css";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Set when the user disconnects, so a reload does not silently reconnect. */
const DISCONNECTED_KEY = "ws:wallet-disconnected";


async function readWithRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const msg = `${e?.shortMessage || ""} ${e?.message || ""}`;
      if (!msg.includes("429") && !msg.includes("Too Many Requests") && !msg.includes("missing revert data") && i > 0)
        break;
      await sleep(350 * (i + 1));
    }
  }
  throw last;
}

function cleanError(e: any) {
  // Always keep the raw error reachable — the mapped copy below is deliberately
  // lossy, and without this a mis-mapped message hides the real cause.
  console.error("[Whitmore Sterling] error", e);
  const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
  if (msg.includes("user rejected")) return "Wallet request rejected.";

  // Uniswap V3 router/pool reverts, checked before the generic RPC mapping so a
  // real trade failure is never reported as a network problem.
  if (msg.includes("STF"))
    return "The swap could not pull your tokens. Check the balance and that the approval confirmed, then try again.";
  if (msg.includes("Too little received") || msg.includes("Too much requested"))
    return "Price moved past the 1% slippage limit while the trade was in flight. Re-quote and submit again.";
  if (msg.includes("Transaction too old"))
    return "The trade sat too long and its deadline passed. Submit it again.";
  if (msg.includes("SPL")) return "The pool hit its price limit on this trade. Try a smaller amount.";
  if (msg.includes("IIA") || msg.includes("AS"))
    return "This pool has too little liquidity for that size. Try a smaller amount or another asset.";
  if (msg.includes("OracleStale"))
    return "The selected stock feed is stale. Wait for market data to refresh before taking risk.";
  if (msg.includes("OraclePaused"))
    return "This stock token oracle is paused, usually around corporate actions or maintenance.";
  if (msg.includes("UnsafePosition"))
    return "That action would put the account below the required collateral level.";
  if (msg.includes("MarketPaused")) return "This market is paused by the risk desk.";
  if (msg.includes("MarketFrozen"))
    return "This market is frozen for new risk. Repayments and liquidation remain open.";
  if (msg.includes("MarketNotBorrowable")) return "Borrowing is disabled for this stock token.";
  if (msg.includes("LiquidationAmountTooHigh"))
    return "Liquidation amount is above the target-health-factor maximum.";
  if (msg.includes("Too Many Requests") || msg.includes("429"))
    return "The RPC is rate-limiting us. Wait a few seconds and retry — background calls are already throttled.";
  if (msg.includes("missing revert data"))
    return "The contract call reverted without giving a reason. Usually this means the balance, allowance, or pool liquidity will not support this amount. Try a smaller size.";
  if (msg.includes("DustyRemainingDebt"))
    return "That action would leave dust debt. Use a larger repay/liquidation amount.";
  if (msg.includes("InsufficientLiquidity")) return "The USDG lending desk has no available liquidity for that amount.";
  if (msg.includes("ERC20InsufficientBalance") || msg.includes("transfer amount exceeds balance"))
    return "Not enough tokens in the connected wallet for that amount.";
  if (msg.includes("ERC20InsufficientAllowance") || msg.includes("insufficient allowance"))
    return "Token approval is still missing or below the requested amount. Approve once, wait for it to confirm, then submit again.";
  if (msg.includes("RepayTooLarge")) return "Repay amount is larger than the current debt.";
  if (msg.includes("could not decode result data") || e?.code === "BAD_DATA")
    return "The desk could not read on-chain data — a contract call returned no data. This usually means the pool/market address is misconfigured or the RPC hiccuped. Retry; if it persists, the deployment addresses need updating.";
  return msg;
}

function App() {
  const [account, setAccount] = React.useState("");
  const [market, setMarket] = React.useState<MarketConfig>(MARKETS[0]);
  const [pool, setPool] = React.useState<PoolState | null>(null);
  const [marketState, setMarketState] = React.useState<MarketState | null>(null);
  const [accountState, setAccountState] = React.useState<AccountState | null>(null);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [oracle, setOracle] = React.useState<OracleState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [pending, setPending] = React.useState("");
  const [txHash, setTxHash] = React.useState("");
  const [walletChainId, setWalletChainId] = React.useState("");
  const [form, setForm] = React.useState<Record<TxKind, string>>({
    deposit: "",
    borrow: "",
    repay: "",
    withdraw: "",
    supply: "",
    withdrawLiquidity: "",
    supplyEth: "",
    withdrawEth: "",
  });
  // The tab lives in the URL, so a reload or a shared link lands on the same screen.
  const [route, navigate] = useRoute();
  const tab = route.tab;
  const setTab = React.useCallback((next: DeskTab) => navigate({ tab: next }), [navigate]);
  const [filter, setFilter] = React.useState("");
  const [prices, setPrices] = React.useState<PriceMap>({});
  const [swapAmount, setSwapAmount] = React.useState("");
  const [debtDecimals, setDebtDecimals] = React.useState(6);
  const [expandedBorrowSymbol, setExpandedBorrowSymbol] = React.useState(MARKETS[0].symbol);

  const selectedToken = React.useMemo(() => new Contract(market.token, ERC20_ABI, provider), [market.token]);
  const feed = React.useMemo(() => new Contract(market.feed, FEED_ABI, provider), [market.feed]);

  const loadTickerPrices = React.useCallback(async () => {
    // Read every listed feed concurrently in small waves — the RPC proxy batches
    // and rate-limits, so waves keep us fast without tripping 429s.
    const out: PriceMap = {};
    // Waves of 4 match the RPC proxy's upstream chunk size; each read retries so a
    // transient 429 does not permanently drop a symbol from the ticker.
    const WAVE = 4;
    for (let i = 0; i < MARKETS.length; i += WAVE) {
      const slice = MARKETS.slice(i, i + WAVE);
      await Promise.all(
        slice.map(async (m) => {
          try {
            const feedContract = new Contract(m.feed, FEED_ABI, provider);
            const [round, decimals] = await Promise.all([
              readWithRetry(() => feedContract.latestRoundData(), 3),
              readWithRetry(() => feedContract.decimals(), 3),
            ]);
            const updatedAt = Number(round[3]);
            const price = Number(round[1]) / 10 ** Number(decimals);
            out[m.symbol] = { price, stale: Math.floor(Date.now() / 1000) - updatedAt > m.maxStaleness, updatedAt };
          } catch {
            /* leave this symbol out of the map */
          }
        }),
      );
      setPrices({ ...out });
      if (i + WAVE < MARKETS.length) await sleep(120);
    }
  }, []);

  const load = React.useCallback(
    async (addr = account, silent = false) => {
      if (!silent) setLoading(true);
      if (!silent) setError("");
      try {
        // Read all global pool state in parallel, and make each read individually
        // fault-tolerant so one failing call can never blank the whole dashboard.
        const R = function <T>(p: Promise<T>, d: T): Promise<T> {
          return p.then((v) => v).catch(() => d);
        };
        const [
          owner,
          debtAsset,
          treasury,
          liquidity,
          totalDebt,
          totalSuppliedLiquidity,
          protocolReserves,
          borrowAprBps,
          marketRaw,
          round,
          feedDecimals,
          tokenDecimals,
        ] = await Promise.all([
          R(readWithRetry(() => poolRead.owner()) as Promise<string>, ""),
          R(readWithRetry(() => poolRead.debtAsset()) as Promise<string>, USDG_ADDRESS),
          R(readWithRetry(() => poolRead.treasury()) as Promise<string>, TREASURY_ADDRESS),
          R(readWithRetry(() => poolRead.liquidityAvailable()) as Promise<bigint>, 0n),
          R(readWithRetry(() => poolRead.totalDebt()) as Promise<bigint>, 0n),
          R(readWithRetry(() => poolRead.totalSuppliedLiquidity()) as Promise<bigint>, 0n),
          R(readWithRetry(() => poolRead.protocolReserves()) as Promise<bigint>, 0n),
          R(readWithRetry(() => poolRead.currentBorrowAprBps()) as Promise<bigint>, 0n),
          readWithRetry(() => poolRead.markets(market.token)).catch(() => null),
          readWithRetry(() => feed.latestRoundData()).catch(() => null),
          R(readWithRetry(() => feed.decimals()) as Promise<bigint>, 8n),
          R(readWithRetry(() => usdgRead.decimals()) as Promise<bigint>, 6n),
        ]);
        setDebtDecimals(Number(tokenDecimals));
        if (marketRaw) {
          const marketShape: MarketState = {
            listed: marketRaw.listed,
            collateralFactorBps: BigInt(marketRaw.collateralFactorBps),
            liquidationThresholdBps: BigInt(marketRaw.liquidationThresholdBps),
            liquidationBonusBps: BigInt(marketRaw.liquidationBonusBps),
            maxStaleness: BigInt(marketRaw.maxStaleness),
            priceFeed: marketRaw.priceFeed,
            paused: Boolean(marketRaw.paused ?? false),
            frozen: Boolean(marketRaw.frozen ?? false),
            borrowable: Boolean(marketRaw.borrowable ?? true),
          };
          setMarketState(marketShape);
          if (round) {
            const updatedAt = BigInt(round[3]);
            const now = BigInt(Math.floor(Date.now() / 1000));
            setOracle({
              price: BigInt(round[1]),
              decimals: BigInt(feedDecimals),
              updatedAt,
              stale: now - updatedAt > marketShape.maxStaleness,
            });
          } else {
            setOracle(null);
          }
        } else {
          setMarketState(null);
          setOracle(null);
        }
        let ethLiquidity = 0n;
        let totalSuppliedEthLiquidity = 0n;
        let ethSupported = false;
        try {
          ethLiquidity = BigInt(await readWithRetry(() => poolRead.ethLiquidityAvailable(), 2));
          ethSupported = true;
        } catch {}
        try {
          totalSuppliedEthLiquidity = BigInt(await readWithRetry(() => poolRead.totalSuppliedEthLiquidity(), 2));
          ethSupported = true;
        } catch {}
        try {
          await readWithRetry(() => poolRead.ethSupplyCap(), 2);
          ethSupported = true;
        } catch {}
        setPool({
          owner,
          debtAsset,
          treasury,
          liquidity,
          totalDebt,
          totalSuppliedLiquidity,
          protocolReserves,
          borrowAprBps,
          ethLiquidity,
          totalSuppliedEthLiquidity,
          ethSupported,
        });

        if (addr) {
          const safeRead = async (label: string, fn: () => Promise<bigint>) => {
            try {
              return BigInt(await readWithRetry(fn, 2));
            } catch (e) {
              console.warn(`[Whitmore Sterling read fallback] ${label}`, e);
              return 0n;
            }
          };
          const [
            eth,
            usdg,
            stock,
            stockAllowance,
            usdgAllowance,
            collateral,
            debt,
            suppliedLiquidity,
            withdrawableLiquidity,
            suppliedEthLiquidity,
            ethWithdrawableLiquidity,
            accountData,
          ] = await Promise.all([
            safeRead("wallet ETH", () => provider.getBalance(addr)),
            safeRead("wallet USDG", () => usdgRead.balanceOf(addr)),
            safeRead(`wallet ${market.symbol}`, () => selectedToken.balanceOf(addr)),
            safeRead(`${market.symbol} allowance`, () => selectedToken.allowance(addr, LENDING_POOL_ADDRESS)),
            safeRead("USDG allowance", () => usdgRead.allowance(addr, LENDING_POOL_ADDRESS)),
            safeRead("collateral balance", () => poolRead.collateralBalance(addr, market.token)),
            safeRead("debt balance", () => poolRead.debtBalance(addr)),
            safeRead("supplied liquidity", () => poolRead.suppliedLiquidity(addr)),
            safeRead("withdrawable liquidity", () => poolRead.withdrawableLiquidity(addr)),
            safeRead("supplied ETH liquidity", () => poolRead.suppliedEthLiquidity(addr)),
            safeRead("withdrawable ETH liquidity", () => poolRead.ethWithdrawableLiquidity(addr)),
            poolRead.getUserAccountData(addr).catch((e: unknown) => {
              console.warn("[Whitmore Sterling read fallback] account risk", e);
              return null;
            }),
          ]);
          setAccountState({
            eth,
            usdg,
            stock,
            stockAllowance,
            usdgAllowance,
            collateral,
            debt,
            suppliedLiquidity,
            withdrawableLiquidity,
            suppliedEthLiquidity,
            ethWithdrawableLiquidity,
            borrowLimit: accountData?.borrowLimitValue ?? 0n,
            liquidationLimit: accountData?.liquidationLimitValue ?? 0n,
            healthFactor: accountData?.healthFactor ?? 0n,
            collateralValue: accountData?.totalCollateralValue ?? 0n,
          });
          void loadPositions(addr);
        } else {
          setAccountState(null);
          setPositions([]);
        }
      } catch (e) {
        setError(cleanError(e));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [account, feed, market.token, market.symbol, selectedToken],
  );

  /** Real portfolio positions: ask the pool which collateral tokens the user holds. */
  const loadPositions = React.useCallback(async (addr: string) => {
    try {
      const tokens: string[] = await readWithRetry(() => poolRead.getUserCollateralTokens(addr), 2);
      if (!tokens?.length) {
        setPositions([]);
        return;
      }
      const rows = await Promise.all(
        tokens.map(async (token) => {
          const cfg = MARKETS.find((m) => m.token.toLowerCase() === token.toLowerCase());
          const amount = BigInt(await poolRead.collateralBalance(addr, token).catch(() => 0n));
          return { symbol: cfg?.symbol ?? token.slice(0, 6), token, amount };
        }),
      );
      setPositions(rows.filter((r) => r.amount > 0n));
    } catch {
      setPositions([]);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    // Boot-time sanity check: fail loud and clear if the app is pointed at a
    // pool address with no contract code (the class of bug that caused an outage).
    provider
      .getCode(LENDING_POOL_ADDRESS)
      .then((code) => {
        if (!code || code === "0x")
          setError(
            "Configuration error: the lending pool address has no contract on this network — the app is pointed at the wrong deployment.",
          );
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const kickoff = window.setTimeout(loadTickerPrices, 1200);
    const id = window.setInterval(loadTickerPrices, 180000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [loadTickerPrices]);

  React.useEffect(() => {
    // An injected wallet stays authorised after a disconnect, so without this flag
    // the next reload silently reconnects and the button never appears to work.
    if (localStorage.getItem(DISCONNECTED_KEY) !== "1") {
      window.ethereum
        ?.request({ method: "eth_accounts" })
        .then((a: string[]) => setAccount(a?.[0] || ""))
        .catch(() => undefined);
    }
    window.ethereum
      ?.request({ method: "eth_chainId" })
      .then((cid: string) => setWalletChainId(typeof cid === "string" ? cid : ""))
      .catch(() => undefined);
    const onAccounts = (a: string[]) => setAccount(a?.[0] || "");
    const onChain = (cid: string) => {
      setWalletChainId(typeof cid === "string" ? cid : "");
      if (account) void load(account);
    };
    window.ethereum?.on?.("accountsChanged", onAccounts);
    window.ethereum?.on?.("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, [account, load]);

  React.useEffect(() => {
    // Keep balances / health fresh in the background without a loading flicker.
    if (!account) return;
    const id = window.setInterval(() => {
      if (!pending) void load(account, true);
    }, 90000);
    return () => window.clearInterval(id);
  }, [account, pending, load]);

  async function ensureWalletReady() {
    if (!window.ethereum) throw new Error("Install an EVM wallet to access the Whitmore Sterling lending floor.");
    let browser = new BrowserProvider(window.ethereum);
    const network = await browser.getNetwork().catch(() => null);
    if (network?.chainId !== CHAIN.id) {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] });
      } catch {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN.hex,
              chainName: CHAIN.name,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [CHAIN.rpc],
              blockExplorerUrls: [CHAIN.explorer],
            },
          ],
        });
      }
      browser = new BrowserProvider(window.ethereum);
    }
    const signer = await browser.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
    return { browser, signer, addr };
  }

  async function connect() {
    const { addr } = await ensureWalletReady();
    await load(addr);
    return addr;
  }

  async function signerContracts() {
    const { signer, addr } = await ensureWalletReady();
    return {
      account: addr,
      pool: new Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer),
      usdg: new Contract(USDG_ADDRESS, ERC20_ABI, signer),
      stock: new Contract(market.token, ERC20_ABI, signer),
    };
  }

  async function ensureAllowance(token: Contract, amount: bigint, label: string, owner?: string) {
    const wallet = owner || account || (await connect());
    const readToken = new Contract(await token.getAddress(), ERC20_ABI, provider);
    const fresh = BigInt(await readToken.allowance(wallet, LENDING_POOL_ADDRESS));
    if (fresh >= amount) return;
    setPending(`Approving ${label} (one-time)`);
    // Approve the pool once (max) so subsequent deposits/repays/supplies are a single tx.
    const tx = await token.approve(LENDING_POOL_ADDRESS, MaxUint256);
    await tx.wait();
  }

  async function ensureBalance(token: Contract, amount: bigint, label: string, decimals = 18, owner?: string) {
    const wallet = owner || account || (await connect());
    const readToken = new Contract(await token.getAddress(), ERC20_ABI, provider);
    const balance = BigInt(await readToken.balanceOf(wallet));
    if (balance < amount)
      throw new Error(
        `Not enough ${label}. Wallet balance is ${Number(formatUnits(balance, decimals)).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })} ${label}.`,
      );
  }

  async function run(label: string, fn: () => Promise<string>) {
    try {
      setPending(label);
      setError("");
      setSuccess("");
      setTxHash("");
      const msg = await fn();
      setSuccess(msg);
      const accounts = await window.ethereum?.request?.({ method: "eth_accounts" }).catch(() => []);
      const freshAccount = accounts?.[0] || account;
      if (freshAccount) setAccount(freshAccount);
      await load(freshAccount);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setPending("");
    }
  }

  const amountFor = (kind: TxKind) =>
    parseUnits(
      form[kind] || "0",
      kind === "deposit" || kind === "withdraw" || kind === "supplyEth" || kind === "withdrawEth" ? 18 : debtDecimals,
    );
  const setAmount = (kind: TxKind, value: string) =>
    setForm((f) => ({ ...f, [kind]: value.replace(/[^0-9.]/g, "") }));

  function action(kind: TxKind) {
    return run(`${kind} ticket`, async () => {
      const amount = amountFor(kind);
      if (amount <= 0n) throw new Error("Enter an amount above zero.");
      const c = await signerContracts();
      // Simulate first (staticCall) so a doomed call surfaces its reason without being
      // submitted on-chain and wasting gas; then send and record the tx hash.
      const exec = async (fnName: string, args: unknown[], value?: bigint) => {
        const m = (c.pool as any)[fnName];
        if (value !== undefined) {
          await m.staticCall(...args, { value });
          const tx = await m(...args, { value });
          setTxHash(tx.hash);
          await tx.wait();
        } else {
          await m.staticCall(...args);
          const tx = await m(...args);
          setTxHash(tx.hash);
          await tx.wait();
        }
      };
      const usdgFmt = (a: bigint) =>
        Number(formatUnits(a, debtDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 });
      const amt18 = (a: bigint) => Number(formatUnits(a, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });
      if (kind === "deposit") {
        await ensureAllowance(c.stock, amount, market.symbol, c.account);
        await exec("depositCollateral", [market.token, amount]);
        return `Deposited ${amt18(amount)} ${market.symbol} as collateral.`;
      }
      if (kind === "borrow") {
        await exec("borrow", [market.token, amount]);
        return `Borrowed ${usdgFmt(amount)} USDG.`;
      }
      if (kind === "repay") {
        await ensureBalance(c.usdg, amount, "USDG", debtDecimals, c.account);
        await ensureAllowance(c.usdg, amount, "USDG", c.account);
        await exec("repay", [amount]);
        return `Repaid ${usdgFmt(amount)} USDG.`;
      }
      if (kind === "withdraw") {
        await exec("withdrawCollateral", [market.token, amount]);
        return `Withdrew ${amt18(amount)} ${market.symbol}.`;
      }
      if (kind === "supply") {
        await ensureBalance(c.usdg, amount, "USDG", debtDecimals, c.account);
        await ensureAllowance(c.usdg, amount, "USDG", c.account);
        await exec("supplyLiquidity", [amount]);
        return `Supplied ${usdgFmt(amount)} USDG to the lending desk.`;
      }
      if (kind === "supplyEth") {
        if (!pool?.ethSupported)
          throw new Error("This deployed pool does not support native ETH liquidity yet. Deploy the updated contract first.");
        await exec("supplyEthLiquidity", [], amount);
        return `Supplied ${amt18(amount)} ETH liquidity.`;
      }
      if (kind === "withdrawEth") {
        if (!pool?.ethSupported)
          throw new Error("This deployed pool does not support native ETH liquidity yet. Deploy the updated contract first.");
        await exec("withdrawEthLiquidity", [amount]);
        return `Withdrew ${amt18(amount)} ETH liquidity.`;
      }
      await exec("withdrawLiquidity", [amount]);
      return `Withdrew ${usdgFmt(amount)} USDG liquidity.`;
    });
  }

  // Direct Uniswap V3 execution — quote comes from QuoterV2, the trade goes
  // straight to the SwapRouter. No aggregator sits in the middle.
  async function uniswapSwap(
    tokenIn: string,
    tokenOut: string,
    amountWei: bigint,
    isNative: boolean,
    label: string,
    quote: Quote,
  ) {
    return run("Swapping", async () => {
      const { signer, addr } = await ensureWalletReady();

      // Check funds before simulating. A `staticCall` carrying more value than the
      // account holds reverts with no reason data, which is impossible to read.
      const fmtEth = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });
      if (isNative) {
        const bal = await readWithRetry(() => provider.getBalance(addr), 3);
        if (bal < amountWei + GAS_BUFFER_WEI)
          throw new Error(
            `Not enough ETH. This trade needs ${fmtEth(amountWei)} plus gas, and the wallet holds ${fmtEth(bal)}.`,
          );
      } else {
        const bal = BigInt(
          await readWithRetry(() => new Contract(tokenIn, ERC20_ABI, provider).balanceOf(addr), 3),
        );
        if (bal < amountWei)
          throw new Error(`Not enough balance for this trade. The wallet holds ${fmtEth(bal)} of the input token.`);
      }

      if (!isNative) {
        const allowance = BigInt(
          await readWithRetry(() => new Contract(tokenIn, ERC20_ABI, provider).allowance(addr, UNISWAP.router), 3),
        );
        if (allowance < amountWei) {
          setPending("Approving swap (one-time)");
          const at = await new Contract(tokenIn, ERC20_ABI, signer).approve(UNISWAP.router, MaxUint256);
          await at.wait();
        }
      }
      setPending("Confirm swap in wallet");
      const tx = await executeSwap(signer, {
        tokenIn: isNative ? UNISWAP.weth9 : tokenIn,
        tokenOut,
        amountIn: amountWei,
        amountOutMinimum: minOut(quote.amountOut, 100),
        recipient: addr,
        quote,
        isNative,
      });
      setTxHash(tx.hash);
      await tx.wait();
      return `Swapped ${label} for ~${Number(formatUnits(quote.amountOut, 18)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })} tokens.`;
    });
  }

  async function vaultDeposit(vaultPool: VaultPool, amount0: bigint, amount1: bigint) {
    return run("Depositing liquidity", async () => {
      const { signer, addr } = await ensureWalletReady();
      const v = new Contract(vaultPool.vault, VAULT_ABI, signer);
      const pairs: [string, bigint][] = [
        [vaultPool.token0, amount0],
        [vaultPool.token1, amount1],
      ];
      for (const [tk, value] of pairs) {
        if (value > 0n) {
          const allowance = BigInt(await new Contract(tk, ERC20_ABI, provider).allowance(addr, vaultPool.vault));
          if (allowance < value) {
            setPending("Approving token (one-time)");
            const at = await new Contract(tk, ERC20_ABI, signer).approve(vaultPool.vault, MaxUint256);
            await at.wait();
          }
        }
      }
      // Work out what the position will really consume at the current pool price and
      // floor it. Sending zero minimums lets anyone move the price in front of the
      // deposit and hand the depositor fewer shares than they paid for.
      // The vault's own fee tier, not the config default: vaults sit on whichever
      // pool was deepest at deploy time (NVDA is on 0.05%, the rest on 0.30%), and
      // pricing against the wrong pool would produce nonsense slippage floors.
      const vaultFee = Number(await new Contract(vaultPool.vault, VAULT_ABI, provider).fee());
      const expected = await fullRangeAmounts(vaultPool.token0, vaultPool.token1, vaultFee, amount0, amount1);
      if (!expected) throw new Error("Could not read the pool price for this pair. Try again in a moment.");
      const { amount0Min, amount1Min } = minAmounts(expected, 100); // 1%

      setPending("Confirm deposit in wallet");
      await v.deposit.staticCall(amount0, amount1, amount0Min, amount1Min);
      const tx = await v.deposit(amount0, amount1, amount0Min, amount1Min);
      setTxHash(tx.hash);
      await tx.wait();
      return "Deposited liquidity into the vault.";
    });
  }

  /** One-token entry: swap into both sides and deposit, in a single transaction. */
  async function vaultZap(vaultPool: VaultPool, tokenIn: string, amountIn: bigint, isNative: boolean, label: string) {
    return run("Zapping in", async () => {
      if (!LP_ZAP) throw new Error("The zap contract is not deployed yet.");
      const { signer, addr } = await ensureWalletReady();

      const swapToken = isNative ? UNISWAP.weth9 : tokenIn;
      const legs = await buildZapLegs(swapToken, amountIn, vaultPool);
      if (!legs) throw new Error("No route found to build this position. Try a different asset or a smaller size.");

      if (isNative) {
        const bal = await readWithRetry(() => provider.getBalance(addr), 3);
        if (bal < amountIn + GAS_BUFFER_WEI)
          throw new Error(
            `Not enough ETH. This zap needs ${Number(formatUnits(amountIn, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })} plus gas.`,
          );
      } else {
        const allowance = BigInt(
          await readWithRetry(() => new Contract(tokenIn, ERC20_ABI, provider).allowance(addr, LP_ZAP), 3),
        );
        if (allowance < amountIn) {
          setPending("Approving (one-time)");
          const at = await new Contract(tokenIn, ERC20_ABI, signer).approve(LP_ZAP, MaxUint256);
          await at.wait();
        }
      }

      setPending("Confirm in wallet");
      const zap = new Contract(LP_ZAP, ZAP_ABI, signer);
      // The legs guard the swaps; these guard the deposit that follows them. The
      // tier comes from the vault itself — the pairs are not all on the same one.
      const vaultFee = Number(await new Contract(vaultPool.vault, VAULT_ABI, provider).fee());
      const { amount0Min, amount1Min } = await zapMinimums(swapToken, amountIn, legs, vaultPool, vaultFee);
      const args = [vaultPool.vault, swapToken, amountIn, legs, amount0Min, amount1Min];
      const overrides = isNative ? { value: amountIn } : {};
      await zap.zapIn.staticCall(...args, overrides);
      const tx = await zap.zapIn(...args, overrides);
      setTxHash(tx.hash);
      await tx.wait();
      return `Zapped ${label} into the ${vaultPool.symbol}/USDG vault.`;
    });
  }

  async function vaultWithdraw(vaultPool: VaultPool, shares: bigint) {
    return run("Withdrawing", async () => {
      const { signer, addr } = await ensureWalletReady();
      const v = new Contract(vaultPool.vault, VAULT_ABI, signer);
      // The floors are TOKEN amounts, one per side — not liquidity. Deriving them
      // from `positionLiquidity` mixed the two up and fed a raw liquidity number in
      // as a 6-decimal USDG minimum, which reverted every withdrawal with
      // "Price slippage check". Ask the contract what this many shares pays out and
      // take a tolerance off each side.
      const [exp0, exp1] = await v.withdraw.staticCall(shares, 0, 0, { from: addr });
      // 5%, not 1%: a full-range position's split between the two tokens moves with
      // the price, so a tight floor fails on ordinary drift rather than on an attack.
      const min0 = (BigInt(exp0) * 95n) / 100n;
      const min1 = (BigInt(exp1) * 95n) / 100n;
      await v.withdraw.staticCall(shares, min0, min1, { from: addr });
      const tx = await v.withdraw(shares, min0, min1);
      setTxHash(tx.hash);
      await tx.wait();
      return "Withdrew liquidity from the vault.";
    });
  }

  async function stakeAction(kind: "stake" | "unstake" | "claim", amount: bigint) {
    return run(kind === "claim" ? "Claiming rewards" : kind === "stake" ? "Staking" : "Unstaking", async () => {
      const { signer, addr } = await ensureWalletReady();
      const s = new Contract(STAKING_VAULT, MULTI_STAKING_ABI, signer);
      if (kind === "stake") {
        const allowance = BigInt(
          await new Contract(PLATFORM_TOKEN, ERC20_ABI, provider).allowance(addr, STAKING_VAULT),
        );
        if (allowance < amount) {
          setPending("Approving (one-time)");
          const at = await new Contract(PLATFORM_TOKEN, ERC20_ABI, signer).approve(STAKING_VAULT, MaxUint256);
          await at.wait();
        }
        setPending("Confirm stake in wallet");
        const tx = await s.stake(amount);
        setTxHash(tx.hash);
        await tx.wait();
        return "Staked platform token.";
      }
      if (kind === "unstake") {
        const tx = await s.withdraw(amount);
        setTxHash(tx.hash);
        await tx.wait();
        return "Unstaked platform token.";
      }
      const tx = await s.getReward();
      setTxHash(tx.hash);
      await tx.wait();
      return "Claimed all partner rewards.";
    });
  }

  const health =
    accountState?.healthFactor === undefined || accountState.healthFactor > 10n ** 30n
      ? "∞"
      : Number(formatUnits(accountState.healthFactor, 18)).toFixed(2);
  const filteredMarkets = MARKETS.filter((m) =>
    `${m.symbol} ${m.name}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const wrongNetwork = !!account && !!walletChainId && walletChainId.toLowerCase() !== CHAIN.hex;
  // Connecting is not a transaction, so it deliberately does not go through `run`:
  // the address appearing in the top bar is the confirmation, and raising a
  // "transaction confirmed" banner for it is just wrong.
  const connectAction = async () => {
    try {
      setPending("Connecting wallet");
      setError("");
      localStorage.removeItem(DISCONNECTED_KEY);
      await connect();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setPending("");
    }
  };

  /**
   * Disconnect.
   *
   * An injected wallet has no session to end — the page cannot make MetaMask
   * forget it. So we do the two things that are actually in our control: ask the
   * wallet to revoke the account permission if it supports that, and remember
   * locally that this browser is disconnected so a reload does not walk straight
   * back in. Everything derived from the address is cleared with it.
   */
  const disconnectAction = async () => {
    try {
      await window.ethereum?.request?.({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallet does not implement it — the local clear below is still honest.
    }
    localStorage.setItem(DISCONNECTED_KEY, "1");
    setAccount("");
    setAccountState(null);
    setError("");
    setSuccess("");
  };

  const positionsWithPrices: Position[] = positions.map((p) => ({ ...p, price: prices[p.symbol]?.price }));

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar tab={tab} setTab={setTab} />
      <div className="flex min-w-0 flex-1 flex-col" id="top">
        <Ticker prices={prices} selected={market.symbol} />
        <Topbar
          account={account}
          filter={filter}
          setFilter={setFilter}
          onConnect={connectAction}
          onDisconnect={disconnectAction}
          pending={pending}
          tab={tab}
          setTab={setTab}
        />

        {/* pb-24 keeps the last row clear of the fixed phone tab bar. */}
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-6 pb-24 sm:px-5 lg:pb-6">
          <div className="mb-4 space-y-2.5 empty:mb-0">
            {wrongNetwork && (
              <Alert tone="warn" title="Wrong network">
                Your wallet is on chain {walletChainId}. Switch to {CHAIN.name} ({CHAIN.hex}) to transact.
              </Alert>
            )}
            {oracle?.stale && (
              <Alert tone="warn" title="Oracle stale">
                The selected market's price feed is stale or refreshing — borrowing and liquidation may revert until it
                updates.
              </Alert>
            )}
            {pending && <Alert tone="info" title={pending}>Confirm in your wallet, then wait for the receipt.</Alert>}
            {error && (
              <Alert
                tone="bad"
                title="Something went wrong"
                action={
                  <Button size="sm" variant="outline" onClick={() => load(account)}>
                    Retry
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
            {success && (
              <Alert
                tone="good"
                title="Transaction confirmed"
                action={
                  txHash ? (
                    <a
                      href={explorer(txHash, "tx")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[13.5px] text-ink-2 hover:text-ink"
                    >
                      Receipt <ExternalLink className="size-3.5" />
                    </a>
                  ) : undefined
                }
              >
                {success}
              </Alert>
            )}
          </div>

          {tab === "dashboard" && (
            <DashboardPage
              account={account}
              accountState={accountState}
              positions={positionsWithPrices}
              pool={pool}
              market={market}
              prices={prices}
              health={health}
              debtDecimals={debtDecimals}
              loading={loading}
              connect={connectAction}
              go={setTab}
            />
          )}

          {tab === "borrow" && (
            <BorrowPage
              markets={filteredMarkets}
              selectedMarket={market}
              prices={prices}
              marketState={marketState}
              oracle={oracle}
              accountState={accountState}
              pool={pool}
              health={health}
              debtDecimals={debtDecimals}
              form={form}
              setAmount={setAmount}
              action={action}
              account={account}
              pending={pending}
              loading={loading}
              expandedSymbol={expandedBorrowSymbol}
              onToggleMarket={(m) => {
                setMarket(m);
                setExpandedBorrowSymbol((prev) => (prev === m.symbol ? "" : m.symbol));
              }}
              connect={connectAction}
            />
          )}

          {tab === "lending" && (
            <LendingPage
              pool={pool}
              accountState={accountState}
              debtDecimals={debtDecimals}
              form={form}
              setAmount={setAmount}
              action={action}
              account={account}
              pending={pending}
              connect={connectAction}
            />
          )}

          {tab === "swap" && (
            <SwapPage
              market={market}
              prices={prices}
              amount={swapAmount}
              setAmount={setSwapAmount}
              connect={connectAction}
              account={account}
              accountState={accountState}
              debtDecimals={debtDecimals}
              pending={pending}
              uniswapSwap={uniswapSwap}
              onSelectMarket={setMarket}
            />
          )}

          {tab === "farms" && (
            <FarmsPage
              account={account}
              connect={connectAction}
              pending={pending}
              debtDecimals={debtDecimals}
              prices={prices}
              deposit={vaultDeposit}
              withdraw={vaultWithdraw}
              zap={vaultZap}
              selectedSymbol={route.farm ?? ""}
              onSelect={(symbol) => navigate({ tab: "farms", farm: symbol || undefined })}
            />
          )}

          {tab === "stake" && (
            <StakePage account={account} connect={connectAction} pending={pending} action={stakeAction} />
          )}

          {tab === "education" && <LearnPage go={setTab} />}
          {tab === "documentation" && <DocumentationPage pool={pool} />}
          {tab === "suits" && <SuitsPage />}

          <footer className="mt-8 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-4">
            Stock Tokens provide economic exposure to tokenized securities; they are not underlying shares and do not
            grant shareholder rights. The protocol reads Chainlink SVR feeds through the standard AggregatorV3Interface.
            Borrowers pay a 0.25% origination fee, suppliers earn utilisation-based interest, and the protocol retains
            reserves plus a liquidation fee. SVR can recapture liquidation-related OEV, but MEV is not eliminated.
            Stock-token prices follow 24/5 market hours and may pause or go stale outside regular sessions.
          </footer>
        </main>
      </div>

      <MobileTabBar tab={tab} setTab={setTab} />
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[Whitmore Sterling] render error", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <Alert
            tone="bad"
            title="Something went wrong"
            action={
              <Button size="sm" variant="outline" onClick={() => location.reload()}>
                Reload
              </Button>
            }
          >
            {this.state.error.message}
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lightweight global error capture (logs to console; wire to Sentry/analytics when a DSN is available).
window.addEventListener("error", (e) => console.error("[Whitmore Sterling] uncaught error", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("[Whitmore Sterling] unhandled rejection", e.reason));

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
