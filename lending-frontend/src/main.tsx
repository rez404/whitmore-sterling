import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, formatUnits, parseUnits } from "ethers";
import { LENDING_POOL_ADDRESS, MARKETS, MarketConfig, TREASURY_ADDRESS, USDG_ADDRESS } from "./markets";
import "./styles.css";

declare global { interface Window { ethereum?: any } }

type MarketState = {
  listed: boolean;
  priceFeed: string;
  collateralFactorBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  maxStaleness: bigint;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
};

type AccountState = {
  eth: bigint;
  usdg: bigint;
  stock: bigint;
  stockAllowance: bigint;
  usdgAllowance: bigint;
  collateral: bigint;
  debt: bigint;
  suppliedLiquidity: bigint;
  withdrawableLiquidity: bigint;
  suppliedEthLiquidity: bigint;
  ethWithdrawableLiquidity: bigint;
  borrowLimit: bigint;
  liquidationLimit: bigint;
  healthFactor: bigint;
};

type OracleState = { price: bigint; decimals: bigint; updatedAt: bigint; stale: boolean };
type PriceMap = Record<string, { price: number; stale: boolean; updatedAt: number }>;

type PoolState = { liquidity: bigint; totalDebt: bigint; totalSuppliedLiquidity: bigint; protocolReserves: bigint; borrowAprBps: bigint; owner: string; debtAsset: string; treasury: string; ethLiquidity: bigint; totalSuppliedEthLiquidity: bigint; ethSupported: boolean };

type TxKind = "deposit" | "borrow" | "repay" | "withdraw" | "supply" | "withdrawLiquidity" | "supplyEth" | "withdrawEth";
type DeskTab = "dashboard" | "borrow" | "lending" | "swap" | "education" | "suits" | "documentation";

const CHAIN = {
  id: 4663n,
  hex: "0x1237",
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const FEED_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

const POOL_ABI = [
  "function owner() view returns (address)",
  "function debtAsset() view returns (address)",
  "function markets(address) view returns (bool listed,uint16 collateralFactorBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint64 maxStaleness,address priceFeed,uint256 borrowCap,uint256 supplyCap,uint256 totalBorrowed,uint256 totalCollateral,bool paused,bool frozen,bool borrowable)",
  "function getUserAccountData(address) view returns (uint256 totalCollateralValue,uint256 borrowLimitValue,uint256 liquidationLimitValue,uint256 totalDebtValue,uint256 healthFactor,uint256 activeCollateralCount)",
  "function targetHealthFactor() view returns (uint256)",
  "function protocolDeficit() view returns (uint256)",
  "function collateralBalance(address,address) view returns (uint256)",
  "function debtBalance(address) view returns (uint256)",
  "function suppliedLiquidity(address) view returns (uint256)",
  "function withdrawableLiquidity(address) view returns (uint256)",
  "function protocolReserves() view returns (uint256)",
  "function currentBorrowAprBps() view returns (uint256)",
  "function reserveFactorBps() view returns (uint16)",
  "function originationFeeBps() view returns (uint16)",
  "function closeFactorBps() view returns (uint16)",
  "function protocolLiquidationFeeBps() view returns (uint16)",
  "function treasury() view returns (address)",
  "function totalDebt() view returns (uint256)",
  "function totalSuppliedLiquidity() view returns (uint256)",
  "function liquidityAvailable() view returns (uint256)",
  "function supplyEthLiquidity() payable",
  "function withdrawEthLiquidity(uint256)",
  "function suppliedEthLiquidity(address) view returns (uint256)",
  "function ethWithdrawableLiquidity(address) view returns (uint256)",
  "function ethLiquidityAvailable() view returns (uint256)",
  "function totalSuppliedEthLiquidity() view returns (uint256)",
  "function ethSupplyCap() view returns (uint256)",
  "function collateralValueUsd(address,address) view returns (uint256)",
  "function borrowLimit(address,address) view returns (uint256)",
  "function liquidationLimit(address,address) view returns (uint256)",
  "function healthFactor(address,address) view returns (uint256)",
  "function supplyLiquidity(uint256)",
  "function withdrawLiquidity(uint256)",
  "function depositCollateral(address,uint256)",
  "function withdrawCollateral(address,uint256)",
  "function borrow(address,uint256)",
  "function repay(uint256)",
];

const READ_RPC = typeof window === "undefined" ? CHAIN.rpc : `${window.location.origin}/api/rpc`;
const provider = new JsonRpcProvider(READ_RPC, Number(CHAIN.id), { batchMaxCount: 1 });
const poolRead = new Contract(LENDING_POOL_ADDRESS, POOL_ABI, provider);
const usdgRead = new Contract(USDG_ADDRESS, ERC20_ABI, provider);

const usd = (v?: bigint, digits = 2, decimals = 18) => v == null ? "—" : Number(formatUnits(v, decimals)).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits });
const amt = (v?: bigint, digits = 4) => v == null ? "—" : Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: digits });
const short = (a = "") => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
const pct = (bps?: bigint | number) => bps == null ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;
const priceFmt = (value?: number) => value == null || Number.isNaN(value) ? "—" : value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: value >= 100 ? 2 : 4 });
const explorer = (hash: string, type: "address" | "tx" = hash.length > 42 ? "tx" : "address") => `${CHAIN.explorer}/${type}/${hash}`;
const positiveDelta = (value: bigint, basis: bigint) => value > basis ? value - basis : 0n;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function readWithRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i += 1) {
    try { return await fn(); }
    catch (e: any) {
      last = e;
      const msg = `${e?.shortMessage || ""} ${e?.message || ""}`;
      if (!msg.includes("429") && !msg.includes("Too Many Requests") && !msg.includes("missing revert data") && i > 0) break;
      await sleep(350 * (i + 1));
    }
  }
  throw last;
}

function cleanError(e: any) {
  const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
  if (msg.includes("user rejected")) return "Wallet request rejected.";
  if (msg.includes("OracleStale")) return "The selected stock feed is stale. Wait for market data to refresh before taking risk.";
  if (msg.includes("OraclePaused")) return "This stock token oracle is paused, usually around corporate actions or maintenance.";
  if (msg.includes("UnsafePosition")) return "That action would put the account below the required collateral level.";
  if (msg.includes("MarketPaused")) return "This market is paused by the risk desk.";
  if (msg.includes("MarketFrozen")) return "This market is frozen for new risk. Repayments and liquidation remain open.";
  if (msg.includes("MarketNotBorrowable")) return "Borrowing is disabled for this stock token.";
  if (msg.includes("LiquidationAmountTooHigh")) return "Liquidation amount is above the target-health-factor maximum.";
  if (msg.includes("missing revert data") || msg.includes("Too Many Requests") || msg.includes("429")) return "RPC read failed while loading contract data. Wait a few seconds and retry; the app is reducing background calls now.";
  if (msg.includes("DustyRemainingDebt")) return "That action would leave dust debt. Use a larger repay/liquidation amount.";
  if (msg.includes("InsufficientLiquidity")) return "The USDG lending desk has no available liquidity for that amount.";
  if (msg.includes("ERC20InsufficientBalance") || msg.includes("transfer amount exceeds balance")) return "Not enough tokens in the connected wallet for that amount.";
  if (msg.includes("ERC20InsufficientAllowance") || msg.includes("insufficient allowance")) return "Token approval is still missing or below the requested amount. Approve once, wait for it to confirm, then submit again.";
  if (msg.includes("RepayTooLarge")) return "Repay amount is larger than the current debt.";
  if (msg.includes("could not decode result data") || e?.code === "BAD_DATA") return "The desk could not read on-chain data — a contract call returned no data. This usually means the pool/market address is misconfigured or the RPC hiccuped. Retry; if it persists, the deployment addresses need updating.";
  return msg;
}

function App() {
  const [account, setAccount] = React.useState("");
  const [market, setMarket] = React.useState<MarketConfig>(MARKETS[0]);
  const [pool, setPool] = React.useState<PoolState | null>(null);
  const [marketState, setMarketState] = React.useState<MarketState | null>(null);
  const [accountState, setAccountState] = React.useState<AccountState | null>(null);
  const [oracle, setOracle] = React.useState<OracleState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [pending, setPending] = React.useState("");
  const [txHash, setTxHash] = React.useState("");
  const [walletChainId, setWalletChainId] = React.useState("");
  const [form, setForm] = React.useState<Record<TxKind, string>>({ deposit: "1", borrow: "25", repay: "25", withdraw: "1", supply: "100", withdrawLiquidity: "25", supplyEth: "0.1", withdrawEth: "0.05" });
  const [tab, setTab] = React.useState<DeskTab>("dashboard");
  const [filter, setFilter] = React.useState("");
  const [prices, setPrices] = React.useState<PriceMap>({});
  const [swapAmount, setSwapAmount] = React.useState("0.1");
  const [debtDecimals, setDebtDecimals] = React.useState(6);
  const [expandedBorrowSymbol, setExpandedBorrowSymbol] = React.useState(MARKETS[0].symbol);

  const selectedToken = React.useMemo(() => new Contract(market.token, ERC20_ABI, provider), [market.token]);
  const feed = React.useMemo(() => new Contract(market.feed, FEED_ABI, provider), [market.feed]);

  const loadTickerPrices = React.useCallback(async () => {
    const entries: Array<readonly [string, { price: number; stale: boolean; updatedAt: number } | undefined]> = [];
    for (const m of MARKETS) {
      try {
        const feedContract = new Contract(m.feed, FEED_ABI, provider);
        const [round, decimals] = await Promise.all([feedContract.latestRoundData(), feedContract.decimals()]);
        const updatedAt = Number(round[3]);
        const raw = Number(round[1]);
        const price = raw / 10 ** Number(decimals);
        const stale = Math.floor(Date.now() / 1000) - updatedAt > m.maxStaleness;
        entries.push([m.symbol, { price, stale, updatedAt }] as const);
      } catch {
        entries.push([m.symbol, undefined] as const);
      }
      if (entries.length % 4 === 0) {
        setPrices(Object.fromEntries(entries.filter(([, v]) => v)) as PriceMap);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }
    }
    setPrices(Object.fromEntries(entries.filter(([, v]) => v)) as PriceMap);
  }, []);

  const load = React.useCallback(async (addr = account, silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      // Read all global pool state in parallel, and make each read individually
      // fault-tolerant so one failing call can never blank the whole dashboard.
      const R = function <T>(p: Promise<T>, d: T): Promise<T> { return p.then(function (v) { return v; }).catch(function () { return d; }); };
      const [owner, debtAsset, treasury, liquidity, totalDebt, totalSuppliedLiquidity, protocolReserves, borrowAprBps, marketRaw, round, feedDecimals, tokenDecimals] = await Promise.all([
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
          setOracle({ price: BigInt(round[1]), decimals: BigInt(feedDecimals), updatedAt, stale: now - updatedAt > marketShape.maxStaleness });
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
      try { ethLiquidity = BigInt(await readWithRetry(() => poolRead.ethLiquidityAvailable(), 2)); ethSupported = true; } catch {}
      try { totalSuppliedEthLiquidity = BigInt(await readWithRetry(() => poolRead.totalSuppliedEthLiquidity(), 2)); ethSupported = true; } catch {}
      try { await readWithRetry(() => poolRead.ethSupplyCap(), 2); ethSupported = true; } catch {}
      setPool({ owner, debtAsset, treasury, liquidity, totalDebt, totalSuppliedLiquidity, protocolReserves, borrowAprBps, ethLiquidity, totalSuppliedEthLiquidity, ethSupported });
      if (addr) {
        const safeRead = async (label: string, fn: () => Promise<bigint>) => {
          try { return BigInt(await readWithRetry(fn, 2)); }
          catch (e) { console.warn(`[Whitmore Sterling read fallback] ${label}`, e); return 0n; }
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
          pool?.ethSupported === false ? Promise.resolve(0n) : safeRead("supplied ETH liquidity", () => poolRead.suppliedEthLiquidity(addr)),
          pool?.ethSupported === false ? Promise.resolve(0n) : safeRead("withdrawable ETH liquidity", () => poolRead.ethWithdrawableLiquidity(addr)),
          poolRead.getUserAccountData(addr).catch((e: unknown) => { console.warn("[Whitmore Sterling read fallback] account risk", e); return null; }),
        ]);
        setAccountState({ eth, usdg, stock, stockAllowance, usdgAllowance, collateral, debt, suppliedLiquidity, withdrawableLiquidity, suppliedEthLiquidity, ethWithdrawableLiquidity, borrowLimit: accountData?.borrowLimitValue ?? 0n, liquidationLimit: accountData?.liquidationLimitValue ?? 0n, healthFactor: accountData?.healthFactor ?? 0n });
      } else {
        setAccountState(null);
      }
    } catch (e) {
      setError(cleanError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [account, feed, market.token, selectedToken]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    // Boot-time sanity check: fail loud and clear if the app is pointed at a
    // pool address with no contract code (the class of bug that caused an outage).
    provider.getCode(LENDING_POOL_ADDRESS).then((code) => {
      if (!code || code === "0x") setError("Configuration error: the lending pool address has no contract on this network — the app is pointed at the wrong deployment.");
    }).catch(() => undefined);
  }, []);
  React.useEffect(() => {
    const kickoff = window.setTimeout(loadTickerPrices, 9000);
    const id = window.setInterval(loadTickerPrices, 180000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(id); };
  }, [loadTickerPrices]);
  React.useEffect(() => {
    window.ethereum?.request({ method: "eth_accounts" }).then((a: string[]) => {
      const addr = a?.[0] || "";
      setAccount(addr);
    }).catch(() => undefined);
    window.ethereum?.request({ method: "eth_chainId" }).then((cid: string) => setWalletChainId(typeof cid === "string" ? cid : "")).catch(() => undefined);
    const onAccounts = (a: string[]) => {
      const addr = a?.[0] || "";
      setAccount(addr);
    };
    const onChain = (cid: string) => { setWalletChainId(typeof cid === "string" ? cid : ""); if (account) void load(account); };
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
    const id = window.setInterval(() => { if (!pending) void load(account, true); }, 45000);
    return () => window.clearInterval(id);
  }, [account, pending, load]);

  async function ensureWalletReady() {
    if (!window.ethereum) throw new Error("Install an EVM wallet to access the Whitmore Sterling lending floor.");
    let browser = new BrowserProvider(window.ethereum);
    const network = await browser.getNetwork().catch(() => null);
    if (network?.chainId !== CHAIN.id) {
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] }); }
      catch { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer] }] }); }
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
    return { account: addr, pool: new Contract(LENDING_POOL_ADDRESS, POOL_ABI, signer), usdg: new Contract(USDG_ADDRESS, ERC20_ABI, signer), stock: new Contract(market.token, ERC20_ABI, signer) };
  }

  async function ensureAllowance(token: Contract, amount: bigint, label: string, owner?: string) {
    const wallet = owner || account || await connect();
    const readToken = new Contract(await token.getAddress(), ERC20_ABI, provider);
    const fresh = BigInt(await readToken.allowance(wallet, LENDING_POOL_ADDRESS));
    if (fresh >= amount) return;
    setPending(`Approving ${label} (one-time)`);
    // Approve the pool once (max) so subsequent deposits/repays/supplies are a single tx.
    const tx = await token.approve(LENDING_POOL_ADDRESS, MaxUint256);
    await tx.wait();
  }

  async function ensureBalance(token: Contract, amount: bigint, label: string, decimals = 18, owner?: string) {
    const wallet = owner || account || await connect();
    const readToken = new Contract(await token.getAddress(), ERC20_ABI, provider);
    const balance = BigInt(await readToken.balanceOf(wallet));
    if (balance < amount) throw new Error(`Not enough ${label}. Wallet balance is ${Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${label}.`);
  }

  async function run(label: string, fn: () => Promise<string>) {
    try {
      setPending(label); setError(""); setSuccess(""); setTxHash("");
      const msg = await fn();
      setSuccess(msg);
      const accounts = await window.ethereum?.request?.({ method: "eth_accounts" }).catch(() => []);
      const freshAccount = accounts?.[0] || account;
      if (freshAccount) setAccount(freshAccount);
      await load(freshAccount);
    } catch (e) { setError(cleanError(e)); }
    finally { setPending(""); }
  }

  const amountFor = (kind: TxKind) => parseUnits(form[kind] || "0", kind === "deposit" || kind === "withdraw" || kind === "supplyEth" || kind === "withdrawEth" ? 18 : debtDecimals);
  const setAmount = (kind: TxKind, value: string) => setForm((f) => ({ ...f, [kind]: value.replace(/[^0-9.]/g, "") }));

  function action(kind: TxKind) {
    return run(`${kind} ticket`, async () => {
      const amount = amountFor(kind);
      if (amount <= 0n) throw new Error("Enter an amount above zero.");
      const c = await signerContracts();
      // Simulate first (staticCall) so a doomed call surfaces its reason without being
      // submitted on-chain and wasting gas; then send and record the tx hash.
      const exec = async (fnName: string, args: unknown[], value?: bigint) => {
        const m = (c.pool as any)[fnName];
        if (value !== undefined) { await m.staticCall(...args, { value }); const tx = await m(...args, { value }); setTxHash(tx.hash); await tx.wait(); }
        else { await m.staticCall(...args); const tx = await m(...args); setTxHash(tx.hash); await tx.wait(); }
      };
      const usdgFmt = (a: bigint) => Number(formatUnits(a, debtDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 });
      if (kind === "deposit") { await ensureAllowance(c.stock, amount, market.symbol, c.account); await exec("depositCollateral", [market.token, amount]); return `Deposited ${amt(amount)} ${market.symbol} as collateral.`; }
      if (kind === "borrow") { await exec("borrow", [market.token, amount]); return `Borrowed ${usdgFmt(amount)} USDG.`; }
      if (kind === "repay") { await ensureBalance(c.usdg, amount, "USDG", debtDecimals, c.account); await ensureAllowance(c.usdg, amount, "USDG", c.account); await exec("repay", [amount]); return `Repaid ${usdgFmt(amount)} USDG.`; }
      if (kind === "withdraw") { await exec("withdrawCollateral", [market.token, amount]); return `Withdrew ${amt(amount)} ${market.symbol}.`; }
      if (kind === "supply") { await ensureBalance(c.usdg, amount, "USDG", debtDecimals, c.account); await ensureAllowance(c.usdg, amount, "USDG", c.account); await exec("supplyLiquidity", [amount]); return `Supplied ${usdgFmt(amount)} USDG to the lending desk.`; }
      if (kind === "supplyEth") { if (!pool?.ethSupported) throw new Error("This deployed pool does not support native ETH liquidity yet. Deploy the updated contract first."); await exec("supplyEthLiquidity", [], amount); return `Supplied ${amt(amount)} ETH liquidity.`; }
      if (kind === "withdrawEth") { if (!pool?.ethSupported) throw new Error("This deployed pool does not support native ETH liquidity yet. Deploy the updated contract first."); await exec("withdrawEthLiquidity", [amount]); return `Withdrew ${amt(amount)} ETH liquidity.`; }
      await exec("withdrawLiquidity", [amount]); return `Withdrew ${usdgFmt(amount)} USDG liquidity.`;
    });
  }

  const health = accountState?.healthFactor === undefined || accountState.healthFactor > 10n ** 30n ? "∞" : Number(formatUnits(accountState.healthFactor, 18)).toFixed(2);
  const price = oracle ? Number(oracle.price) / 10 ** Number(oracle.decimals) : undefined;
  const utilization = pool && pool.totalSuppliedLiquidity > 0n ? Number(pool.totalDebt * 10000n / pool.totalSuppliedLiquidity) / 100 : 0;
  const depositInterestEarned = accountState ? positiveDelta(accountState.withdrawableLiquidity, accountState.suppliedLiquidity) : 0n;
  const ethDepositInterestEarned = accountState ? positiveDelta(accountState.ethWithdrawableLiquidity, accountState.suppliedEthLiquidity) : 0n;
  const walletMetric = (value: string) => account ? (accountState ? value : "Reading wallet...") : "Connect wallet";
  const filteredMarkets = MARKETS.filter((m) => `${m.symbol} ${m.name}`.toLowerCase().includes(filter.toLowerCase()));
  const wrongNetwork = !!account && !!walletChainId && walletChainId.toLowerCase() !== CHAIN.hex;

  return <div className="app-frame">
    <aside className="side-rail" aria-label="Primary navigation">
      <a className="brand-mark brand-lockup" href="#top" aria-label="Whitmore Sterling — Home">
        <img className="brand-crest" src="/whitmore-sterling-logo.png" alt="Whitmore Sterling crest" />
        <span className="brand-word">Whitmore Sterling</span>
        <span className="brand-sub">Equity Credit Desk</span>
      </a>
      <nav className="rail-nav">
        <p>Explore</p>
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><span>▦</span>Dashboard</button>
        <button className={tab === "borrow" ? "active" : ""} onClick={() => setTab("borrow")}><span>⊕</span>Borrow</button>
        <button className={tab === "lending" ? "active" : ""} onClick={() => setTab("lending")}><span>◈</span>Lending</button>
        <button className={tab === "swap" ? "active" : ""} onClick={() => setTab("swap")}><span>⇄</span>Swap</button>
        <button className={tab === "education" ? "active" : ""} onClick={() => setTab("education")}><span>◎</span>Learn</button>
        <button className={tab === "suits" ? "active" : ""} onClick={() => setTab("suits")}><span>♛</span>Suits</button>
        <button className={tab === "documentation" ? "active" : ""} onClick={() => setTab("documentation")}><span>▤</span>Documentation</button>
      </nav>
      <div className="rail-section">
        <p>Protocol</p>
        <a href={explorer(LENDING_POOL_ADDRESS, "address")} target="_blank" rel="noreferrer">Verified contract <span>↗</span></a>
        <a href={explorer(TREASURY_ADDRESS, "address")} target="_blank" rel="noreferrer">Treasury <span>↗</span></a>
      </div>
      <div className="rail-rewards"><b>Whitmore Sterling markets</b><span>{MARKETS.length} listed equity feeds</span></div>
    </aside>

    <div className="app-shell" id="top">
    <TickerTape markets={MARKETS} selected={market.symbol} prices={prices} />
    <div className="topbar">
      <label className="global-search"><span>⌕</span><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search stock tokens and SVR markets..." /></label>
      <div className="topbar-actions"><button className="ghost" onClick={() => setTab("swap")}>Swap</button><button className="ghost" onClick={() => setTab("lending")}>Deposit</button><button className="ghost" onClick={() => setTab("borrow")}>Borrow</button><button className="primary" onClick={() => run("Connecting wallet", async () => { await connect(); return "Wallet connected."; })}>{account ? short(account) : "Enter Whitmore Sterling"}</button></div>
    </div>

    {wrongNetwork && <Notice kind="warn" title="Wrong network" text={`Your wallet is on chain ${walletChainId}. Switch to ${CHAIN.name} (${CHAIN.hex}) to transact.`} />}
    {oracle?.stale && <Notice kind="warn" title="Oracle stale" text="The selected market's price feed is stale or refreshing — borrowing and liquidation may revert until it updates." />}
    {error && <Notice kind="error" title="Desk alert" text={error} action={() => load(account)} />}
    {success && <Notice kind="success" title="Ticket confirmed" text={success} />}
    {success && txHash && <a className="terminal-link tx-receipt" href={explorer(txHash, "tx")} target="_blank" rel="noreferrer">View transaction ↗</a>}

    <main className="trading-grid">
      {tab === "dashboard" && <DashboardView account={account} accountState={accountState} pool={pool} market={market} prices={prices} health={health} debtDecimals={debtDecimals} connect={() => run("Connecting wallet", async () => { await connect(); return "Wallet connected."; })} />}

      {tab === "borrow" && <BorrowTablePage
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
        onToggleMarket={(m) => { setMarket(m); setExpandedBorrowSymbol((prev) => prev === m.symbol ? "" : m.symbol); }}
        connect={() => run("Connecting wallet", async () => { await connect(); return "Wallet connected."; })}
      />}

      {tab === "swap" && <SwapPanel market={market} prices={prices} amount={swapAmount} setAmount={setSwapAmount} connect={() => run("Connecting wallet", async () => { await connect(); return "Wallet connected."; })} account={account} />}

      {tab === "lending" && <section className="panel lp-panel">
        <div className="panel-head"><span>Liquidity Desk</span><b>USDG supply · {pool ? pct(pool.borrowAprBps) + " borrow APR" : "APR loading"}</b></div>
        <dl className="stats-grid">
          <Stat label="Available liquidity" value={usd(pool?.liquidity, 2, debtDecimals)} />
          <Stat label="Total supplied" value={usd(pool?.totalSuppliedLiquidity, 2, debtDecimals)} />
          <Stat label="Total debt" value={usd(pool?.totalDebt, 2, debtDecimals)} />
          <Stat label="Utilization" value={`${utilization.toFixed(2)}%`} />
          <Stat label="Protocol reserves" value={usd(pool?.protocolReserves, 2, debtDecimals)} />
          <Stat label="Treasury" value={pool ? short(pool.treasury) : short(TREASURY_ADDRESS)} />
          <Stat label="ETH liquidity" value={!pool ? "Checking contract" : pool.ethSupported ? `${amt(pool.ethLiquidity)} ETH` : "Awaiting upgrade"} />
          <Stat label="Total ETH supplied" value={!pool ? "Checking contract" : pool.ethSupported ? `${amt(pool.totalSuppliedEthLiquidity)} ETH` : "Awaiting upgrade"} />
        </dl>
        <div className="yield-metrics">
          <div><span>Your USDG supplied</span><b>{walletMetric(accountState ? usd(accountState.withdrawableLiquidity, 2, debtDecimals) : "")}</b><small>Current withdrawable claim from your pool shares.</small></div>
          <div><span>Interest on deposit earned</span><b>{walletMetric(accountState ? usd(depositInterestEarned, 6, debtDecimals) : "")}</b><small>Estimated USDG gain from liquidity-share value.</small></div>
          <div><span>Your ETH supplied</span><b>{walletMetric(accountState ? `${amt(accountState.ethWithdrawableLiquidity)} ETH` : "")}</b><small>Native ETH liquidity shares. Requires the upgraded pool contract.</small></div>
          <div><span>ETH interest earned</span><b>{walletMetric(accountState ? `${amt(ethDepositInterestEarned, 8)} ETH` : "")}</b><small>Tracks ETH share gains when ETH-side yield is enabled.</small></div>
        </div>
        {pool && !pool.ethSupported && <div className="empty-inline"><b>ETH liquidity contract upgrade pending</b><span>The frontend is wired for native ETH supply/withdraw, but the current deployed pool address does not expose the new ETH liquidity functions yet.</span></div>}
        {pool?.liquidity === 0n && <div className="empty-inline"><b>No liquidity yet</b><span>Borrowing stays disabled until LPs supply USDG.</span></div>}
        <Ticket title="Supply USDG" id="supply" value={form.supply} setValue={(v) => setAmount("supply", v)} button="Supply liquidity" onSubmit={() => action("supply")} disabled={!!pending} />
        <Ticket title="Withdraw supplied USDG" id="withdrawLiquidity" value={form.withdrawLiquidity} setValue={(v) => setAmount("withdrawLiquidity", v)} button="Withdraw liquidity" onSubmit={() => action("withdrawLiquidity")} disabled={!!pending} />
        <Ticket title="Supply native ETH" id="supplyEth" value={form.supplyEth} setValue={(v) => setAmount("supplyEth", v)} button="Supply ETH liquidity" onSubmit={() => action("supplyEth")} disabled={!!pending || !pool?.ethSupported} helper={!pool ? "Checking upgraded pool contract..." : !pool.ethSupported ? "Deploy the upgraded pool contract to enable native ETH deposits." : "Native ETH deposit: no ERC-20 approval needed."} />
        <Ticket title="Withdraw supplied ETH" id="withdrawEth" value={form.withdrawEth} setValue={(v) => setAmount("withdrawEth", v)} button="Withdraw ETH liquidity" onSubmit={() => action("withdrawEth")} disabled={!!pending || !pool?.ethSupported} />
      </section>}

      {tab === "education" && <EducationPage go={(next) => setTab(next)} />}

      {tab === "suits" && <SuitsPage />}

      {tab === "documentation" && <Documentation pool={pool} />}
    </main>

    <section className="disclosure panel">
      <h2>Floor notes</h2>
      <p>Stock Tokens provide economic exposure to tokenized securities; they are not underlying shares and do not grant shareholder rights. The protocol uses Chainlink SVR feeds through the standard AggregatorV3Interface. Borrowers pay a 0.25% origination fee, suppliers earn utilization-based interest, and the protocol retains reserves plus a liquidation fee; SVR can recapture liquidation-related OEV, but MEV is not eliminated. Stock-token prices follow 24/5 market hours and may pause or go stale outside regular sessions.</p>
    </section>
    </div>
  </div>;
}

function BorrowTablePage({ markets, selectedMarket, prices, marketState, oracle, accountState, pool, health, debtDecimals, form, setAmount, action, account, pending, loading, expandedSymbol, onToggleMarket, connect }: { markets: MarketConfig[]; selectedMarket: MarketConfig; prices: PriceMap; marketState: MarketState | null; oracle: OracleState | null; accountState: AccountState | null; pool: PoolState | null; health: string; debtDecimals: number; form: Record<TxKind, string>; setAmount: (kind: TxKind, value: string) => void; action: (kind: TxKind) => Promise<void>; account: string; pending: string; loading: boolean; expandedSymbol: string; onToggleMarket: (market: MarketConfig) => void; connect: () => void }) {
  const selectedPrice = prices[selectedMarket.symbol]?.price;
  const selectedStale = prices[selectedMarket.symbol]?.stale || oracle?.stale;
  const scale = 10n ** BigInt(18 - debtDecimals);
  const parseUsdg = (s: string) => { try { return parseUnits(s || "0", debtDecimals); } catch { return 0n; } };
  const fmtUsdg = (v: bigint) => formatUnits(v, debtDecimals);
  const fmt18 = (v: bigint) => formatUnits(v, 18);
  // Projected account-wide health factor after borrowing `extra` USDG (18-wad HF).
  const projectBorrowHF = (extra: bigint): string | null => {
    if (!accountState) return null;
    const newDebtWad = (accountState.debt + extra) * scale;
    if (newDebtWad === 0n) return "∞";
    return Number(formatUnits(accountState.liquidationLimit * (10n ** 18n) / newDebtWad, 18)).toFixed(2);
  };
  const maxBorrow = (): bigint => {
    if (!accountState || !pool) return 0n;
    const debtWad = accountState.debt * scale;
    const availUsdg = (accountState.borrowLimit > debtWad ? accountState.borrowLimit - debtWad : 0n) / scale;
    const capped = availUsdg < pool.liquidity ? availUsdg : pool.liquidity;
    return capped * 99n / 100n; // small safety margin against rounding at the limit
  };
  const maxRepay = (): bigint => {
    if (!accountState) return 0n;
    return accountState.debt < accountState.usdg ? accountState.debt : accountState.usdg;
  };
  const projectedBorrowHF = projectBorrowHF(parseUsdg(form.borrow));
  const borrowHfDanger = projectedBorrowHF !== null && projectedBorrowHF !== "∞" && Number(projectedBorrowHF) < 1.1;
  return <section className="borrow-page panel">
    <div className="panel-head borrow-head"><span>Collateral markets</span><b>{markets.length} visible · click a row to open deposit inputs</b></div>
    <div className="borrow-command-strip">
      <div><span>Selected market</span><b>{selectedMarket.symbol} / USD</b><small>{selectedMarket.name}</small></div>
      <div><span>SVR oracle</span><b>{selectedPrice == null ? "—" : priceFmt(selectedPrice)}</b><small>{selectedStale ? "Stale or loading" : "Live feed"}</small></div>
      <div><span>Health factor</span><b>{account ? health : "Connect"}</b><small>Account-wide risk check</small></div>
      <div><span>Available liquidity</span><b>{usd(pool?.liquidity, 2, debtDecimals)}</b><small>USDG borrowable from the pool</small></div>
    </div>
    <div className="borrow-risk-line">
      {loading ? <Skeleton /> : accountState ? <>
        <div className="risk-meter"><div style={{ width: health === "∞" ? "100%" : `${Math.min(Number(health) * 35, 100)}%` }} /></div>
        <dl className="stats-grid">
          <Stat label="Borrow limit" value={usd(accountState.borrowLimit)} />
          <Stat label="Your debt" value={usd(accountState.debt, 2, debtDecimals)} />
          <Stat label="Collateral posted" value={`${amt(accountState.collateral)} ${selectedMarket.symbol}`} />
          <Stat label="Oracle status" value={selectedStale ? "Stale" : "Live"} tone={selectedStale ? "warn" : "good"} />
        </dl>
      </> : <EmptyState title="Connect to load your desk" text="Wallet connection unlocks balances, allowances, borrow limit, and health factor." action="Connect wallet" onClick={connect} />}
    </div>
    <div className="borrow-market-table" role="table" aria-label="Borrow collateral market table">
      <div className="borrow-table-row borrow-table-header" role="row">
        <span>Asset</span><span>Oracle price</span><span>Collateral</span><span>Liquidation</span><span>Status</span><span />
      </div>
      {markets.map((m) => {
        const p = prices[m.symbol];
        const isSelected = m.symbol === selectedMarket.symbol;
        const isOpen = expandedSymbol === m.symbol;
        const collateralFactor = isSelected && marketState ? pct(marketState.collateralFactorBps) : pct(m.collateralFactorBps);
        const liquidation = isSelected && marketState ? pct(marketState.liquidationThresholdBps) : pct(m.liquidationThresholdBps);
        return <div className={`borrow-market-item ${isOpen ? "open" : ""}`} key={m.symbol}>
          <button className="borrow-table-row borrow-market-trigger" type="button" onClick={() => onToggleMarket(m)} aria-expanded={isOpen}>
            <span><b>{m.symbol}</b><small>{m.name}</small></span>
            <span>{p ? priceFmt(p.price) : "loading"}</span>
            <span>{collateralFactor}</span>
            <span>{liquidation}</span>
            <span>{p?.stale ? "Stale feed" : "Borrowable"}</span>
            <span>{isOpen ? "Close" : "Open"}</span>
          </button>
          {isOpen && <div className="borrow-expand-panel">
            <div className="borrow-expand-copy">
              <b>{m.symbol} collateral desk</b>
              <span>Deposit this stock token as collateral, borrow USDG against it, or manage the selected-market position.</span>
            </div>
            <div className="borrow-inline-ticket">
              <label htmlFor="borrow-table-deposit">Deposit collateral</label>
              <div className="ticket-input"><input id="borrow-table-deposit" value={form.deposit} onChange={(e) => setAmount("deposit", e.target.value)} inputMode="decimal" />{accountState && <button type="button" className="max-chip" onClick={() => setAmount("deposit", fmt18(accountState.stock))}>Max</button>}</div>
              <button type="button" onClick={() => action("deposit")} disabled={!!pending}>Deposit {m.symbol}</button>
            </div>
            <div className="borrow-inline-ticket">
              <label htmlFor="borrow-table-borrow">Borrow USDG</label>
              <div className="ticket-input"><input id="borrow-table-borrow" value={form.borrow} onChange={(e) => setAmount("borrow", e.target.value)} inputMode="decimal" />{accountState && pool && <button type="button" className="max-chip" onClick={() => setAmount("borrow", fmtUsdg(maxBorrow()))}>Max</button>}</div>
              <button type="button" onClick={() => action("borrow")} disabled={!!pending || !pool || pool.liquidity === 0n}>Borrow USDG</button>
            </div>
            {account && accountState && Number(form.borrow) > 0 && <div className={`hf-projection ${borrowHfDanger ? "danger" : ""}`}>Health factor after borrow: <b>{projectedBorrowHF}</b>{projectedBorrowHF !== "∞" && Number(projectedBorrowHF) < 1 ? " — below 1.0; this borrow will revert." : borrowHfDanger ? " — near liquidation, consider a smaller amount." : ""}</div>}
            <div className="borrow-inline-ticket quiet">
              <label htmlFor="borrow-table-repay">Repay</label>
              <div className="ticket-input"><input id="borrow-table-repay" value={form.repay} onChange={(e) => setAmount("repay", e.target.value)} inputMode="decimal" />{accountState && <button type="button" className="max-chip" onClick={() => setAmount("repay", fmtUsdg(maxRepay()))}>Max</button>}</div>
              <button type="button" onClick={() => action("repay")} disabled={!!pending}>Repay</button>
            </div>
            <div className="borrow-inline-ticket quiet">
              <label htmlFor="borrow-table-withdraw">Withdraw collateral</label>
              <div className="ticket-input"><input id="borrow-table-withdraw" value={form.withdraw} onChange={(e) => setAmount("withdraw", e.target.value)} inputMode="decimal" />{accountState && accountState.debt === 0n && <button type="button" className="max-chip" onClick={() => setAmount("withdraw", fmt18(accountState.collateral))}>Max</button>}</div>
              <button type="button" onClick={() => action("withdraw")} disabled={!!pending}>Withdraw</button>
            </div>
          </div>}
        </div>;
      })}
    </div>
  </section>;
}

function DashboardView({ account, accountState, pool, market, prices, health, debtDecimals, connect }: { account: string; accountState: AccountState | null; pool: PoolState | null; market: MarketConfig; prices: PriceMap; health: string; debtDecimals: number; connect: () => void }) {
  const currentPrice = prices[market.symbol]?.price ?? 0;
  const collateralValue = accountState ? Number(formatUnits(accountState.collateral, 18)) * currentPrice : 0;
  const usdgValue = accountState ? Number(formatUnits(accountState.usdg, debtDecimals)) : 0;
  const suppliedValue = pool ? Number(formatUnits(pool.totalSuppliedLiquidity, debtDecimals)) : 0;
  const debtValue = accountState ? Number(formatUnits(accountState.debt, debtDecimals)) : 0;
  const balance = accountState ? collateralValue + usdgValue : 0;
  const hasPosition = accountState ? accountState.collateral > 0n || accountState.debt > 0n : false;
  const hasWalletBalance = accountState ? accountState.usdg > 0n || accountState.stock > 0n : false;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  return <section className="dashboard-page">
    <div className="dashboard-topline">
      <h2>{greeting}</h2>
    </div>

    <div className="dashboard-hero-card">
      <aside className="dashboard-summary">
        <span>Balance ⓘ</span>
        <strong>{balance.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</strong>
        <dl>
          <div><dt>Position APY ⓘ</dt><dd>{pool ? pct(pool.borrowAprBps) : "0.00%"}</dd></div>
          <div><dt>Total Earnings ⓘ</dt><dd>{suppliedValue > 0 ? "$0.00" : "$0.00"}</dd></div>
          <div><dt>Health Factor</dt><dd>{account ? health : "—"}</dd></div>
        </dl>
      </aside>
      <div className="dashboard-chart" aria-label="Balance chart">
        <div className="chart-range"><button>1D</button><button className="active">1W</button><button>1M</button><button>6M</button><button>1Y</button><button>All</button></div>
        <svg viewBox="0 0 760 230" role="img" aria-label="Balance over time">
          <defs><linearGradient id="dashGlow" x1="0" x2="1"><stop offset="0" stopColor="#9b8f7a"/><stop offset=".55" stopColor="#6f7880"/><stop offset="1" stopColor="#a64b4b"/></linearGradient></defs>
          <path d="M0 178 H760" stroke="rgba(185,185,187,.18)" />
          <path d="M0 150 C130 150 180 120 270 132 S430 180 540 96 S680 84 760 64" fill="none" stroke="url(#dashGlow)" strokeWidth="3" opacity={balance > 0 ? 1 : .35}/>
          <path d="M0 151 C130 151 180 121 270 133 S430 181 540 97 S680 85 760 65 V230 H0 Z" fill="rgba(200,255,0,.05)" opacity={balance > 0 ? 1 : .25}/>
        </svg>
        <p><i /> Balance</p>
      </div>
    </div>

    <DashboardSection title="Positions">
      {hasPosition ? <div className="position-row"><span>{market.symbol}</span><b>{collateralValue.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</b><em>Debt {debtValue.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</em></div> : <EmptyBox title="No Positions" text="Deposit an asset from your wallet to open a position" />}
    </DashboardSection>
    <DashboardSection title="Your Balance">
      {hasWalletBalance ? <div className="balance-grid"><Stat label="USDG" value={usd(accountState?.usdg, 2, debtDecimals)} /><Stat label={market.symbol} value={`${amt(accountState?.stock)} ${market.symbol}`} /><Stat label="Selected oracle" value={priceFmt(currentPrice)} /><Stat label="Wallet" value={short(account)} /></div> : <EmptyBox title="No Wallet Balance" text="Deposit assets to your account address" action="Fund your Account" onClick={connect} />}
    </DashboardSection>
    <DashboardSection title="Activity">
      <EmptyBox title="No Activity" text="You haven't made any transactions" />
    </DashboardSection>
  </section>;
}

function DashboardSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="dash-section"><h3>{title}</h3>{children}</section>; }
function EmptyBox({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) { return <div className="dash-empty"><b>{title}</b><span>{text}</span>{action && <button type="button" onClick={onClick}>{action}</button>}</div>; }

function SwapPanel({ market, prices, amount, setAmount, connect, account }: { market: MarketConfig; prices: PriceMap; amount: string; setAmount: (v: string) => void; connect: () => void; account: string }) {
  const price = prices[market.symbol]?.price;
  const uniUrl = `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=ETH&outputCurrency=${market.token}&exactField=input&exactAmount=${encodeURIComponent(amount || "0")}`;
  const swapIn = async () => {
    if (!account) await connect();
    window.open(uniUrl, "_blank", "noopener,noreferrer");
  };
  return <section className="panel swap-panel">
    <div className="panel-head"><span>Swap In</span><b>ETH → {market.symbol}</b></div>
    <div className="swap-card">
      <div className="swap-row"><span>From</span><label><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" aria-label="ETH amount to swap in" /><b>ETH</b></label></div>
      <button className="swap-flip" type="button" aria-label="Swap direction">→</button>
      <div className="swap-row"><span>To</span><label><input value={market.symbol} readOnly aria-label={`Selected ${market.symbol} output`} /><b>{market.symbol}</b></label></div>
      <dl className="stats-grid swap-stats">
        <Stat label="Current stock viewed" value={market.symbol} />
        <Stat label="Oracle price" value={priceFmt(price)} />
        <Stat label="Token address" value={short(market.token)} />
        <Stat label="Route" value="ETH input prefilled" tone="good" />
      </dl>
      <p className="swap-note">Swap In opens a prefilled ETH → {market.symbol} route for the stock token you are currently viewing. Whitmore Sterling does not fake quotes or auto-sign transactions: the wallet/Uniswap route still shows the executable quote and asks for confirmation before ETH leaves the wallet.</p>
      <div className="swap-actions">
        <button className="primary swap-in-button" type="button" onClick={swapIn}>Swap In</button>
        <button type="button" onClick={connect}>{account ? short(account) : "Connect wallet"}</button>
        <a className="terminal-link" href={uniUrl} target="_blank" rel="noreferrer">Open route ↗</a>
        <button type="button" onClick={() => navigator.clipboard?.writeText(market.token)}>Copy token</button>
      </div>
    </div>
  </section>;
}

function Documentation({ pool }: { pool: PoolState | null }) {
  const listedSymbols = MARKETS.map((m) => m.symbol).join(", ");
  return <section className="panel docs-panel">
    <div className="docs-hero">
      <div>
        <p className="eyebrow">Protocol documentation</p>
        <h2>How Whitmore Sterling works, end to end.</h2>
        <p>Whitmore Sterling is a collateralized lending desk for Robinhood Chain stock tokens. Users can post supported tokenized equities as collateral, borrow USDG against that value, repay later, and withdraw the posted assets if the account remains healthy. Separate liquidity suppliers provide USDG to fund borrower withdrawals and earn utilization-driven interest.</p>
      </div>
      <div className="docs-ledger" aria-label="Live protocol summary">
        <span>Live pool</span><b>{short(LENDING_POOL_ADDRESS)}</b>
        <span>Debt asset</span><b>USDG · 6 decimals</b>
        <span>Markets</span><b>{MARKETS.length} listed</b>
        <span>Borrow APR</span><b>{pool ? pct(pool.borrowAprBps) : "loading"}</b>
      </div>
    </div>

    <div className="docs-toc" aria-label="Documentation sections">
      <a href="#docs-overview">Overview</a>
      <a href="#docs-assets">Assets</a>
      <a href="#docs-borrowing">Borrowing</a>
      <a href="#docs-liquidity">Liquidity</a>
      <a href="#docs-risk">Risk engine</a>
      <a href="#docs-liquidations">Liquidations</a>
      <a href="#docs-fees">Fees</a>
      <a href="#docs-ux">Transaction flow</a>
    </div>

    <div className="docs-manual">
      <article id="docs-overview" className="doc-section wide">
        <span>01 · System model</span>
        <h3>What the protocol is</h3>
        <p>At its core, the protocol has one lending pool contract, one USDG debt asset, and many listed stock-token collateral markets. The pool does not create pretend balances in the UI. Every balance, allowance, market parameter, oracle answer, debt amount, and liquidity value is read from Robinhood Chain contracts through RPC.</p>
        <p>The system separates two user roles. Borrowers deposit stock tokens and borrow USDG. Liquidity suppliers deposit USDG and receive internal pool shares that represent a claim on the supplied liquidity plus supplier interest. Both roles interact with the same pool, but the accounting for collateral, debt, and liquidity shares is intentionally separate.</p>
        <ul>
          <li>Borrowers use tokenized stocks as collateral instead of selling them.</li>
          <li>Lenders supply USDG so borrowers can draw liquidity.</li>
          <li>Prices come from configured oracle feeds for each listed stock token.</li>
          <li>Risk parameters decide how much can be borrowed and when liquidation becomes possible.</li>
        </ul>
      </article>

      <article id="docs-assets" className="doc-section">
        <span>02 · Assets</span>
        <h3>Stock tokens, USDG, and decimals</h3>
        <p>Supported collateral assets are tokenized equity exposure tokens such as {listedSymbols}. These are ERC-20-style tokens that can be approved, transferred, deposited, and withdrawn by smart contracts. They are economic exposure instruments, not shareholder voting rights or traditional brokerage custody.</p>
        <p>USDG is the pool debt and liquidity asset. The live USDG token uses 6 decimals, so the frontend parses USDG amounts with 6 decimals while stock-token collateral is handled as 18-decimal token units. This matters: using the wrong decimals can make approvals look much larger than the amount a user typed.</p>
        <div className="doc-callout"><b>Important:</b><p>Always verify token addresses before depositing. The listed market board links each supported stock token and the verified pool contract so users can inspect addresses in the block explorer.</p></div>
      </article>

      <article id="docs-borrowing" className="doc-section">
        <span>03 · Borrower lifecycle</span>
        <h3>Deposit collateral, then borrow USDG</h3>
        <p>A borrower starts by selecting a listed stock token. The app reads the market configuration and oracle price, then the borrower approves the pool to move the selected collateral token. After the approval confirms, the deposit transaction transfers the stock token into the pool and records it under that wallet.</p>
        <p>Borrowing is a second transaction. The pool accrues interest, checks that the market is listed, not paused, not frozen, and borrowable, checks the market borrow cap, checks available USDG liquidity, then updates the borrower debt before transferring USDG out. If the requested borrow would make the account unsafe, the transaction reverts.</p>
        <ol>
          <li>Approve the stock token only if allowance is below the requested deposit.</li>
          <li>Deposit collateral into the pool.</li>
          <li>Borrow USDG up to the borrow limit, leaving a health buffer.</li>
          <li>Repay USDG later to reduce debt and unlock collateral.</li>
        </ol>
      </article>

      <article id="docs-liquidity" className="doc-section">
        <span>04 · Liquidity suppliers</span>
        <h3>Supplying USDG to fund borrowers</h3>
        <p>Liquidity suppliers deposit USDG into the lending desk. The pool mints internal liquidity shares, not a separate wallet token. When the pool has no previous liquidity, shares start one-to-one with the supplied amount. After interest accrues, shares represent a proportional claim on total supplied liquidity.</p>
        <p>Withdrawals burn the supplier’s internal shares and return USDG if enough idle liquidity is available. If most liquidity has been borrowed, a supplier may need to wait for borrowers to repay, new liquidity to enter, or interest to accumulate before withdrawing the desired amount.</p>
        <p>The frontend now checks the connected wallet’s fresh USDG balance and fresh allowance before asking for approval, then uses the actual 6-decimal USDG amount when submitting supply liquidity.</p>
      </article>

      <article id="docs-risk" className="doc-section wide">
        <span>05 · Risk engine</span>
        <h3>Borrow limits, health factor, caps, and oracle safety</h3>
        <p>Each market has its own collateral factor, liquidation threshold, liquidation bonus, max staleness window, borrow cap, and supply cap. The collateral factor determines normal borrowing capacity. The liquidation threshold determines when the account can be liquidated. A borrower should treat the borrow limit as a maximum, not a target.</p>
        <p>Health factor compares liquidation-limit collateral value against debt. A value above 1.0 means the account is above the liquidation line. A value near 1.0 is dangerous because price movement, interest accrual, or oracle updates can push the account into liquidation territory. The dashboard shows health factor so borrowers can add collateral or repay before reaching that line.</p>
        <div className="risk-matrix">
          <div><b>Collateral factor</b><small>How much value can be borrowed in normal conditions.</small></div>
          <div><b>Liquidation threshold</b><small>The line where liquidation can begin.</small></div>
          <div><b>Borrow cap</b><small>Maximum total debt allowed for a market.</small></div>
          <div><b>Staleness guard</b><small>Blocks unsafe operations when oracle data is too old.</small></div>
        </div>
      </article>

      <article id="docs-oracles" className="doc-section">
        <span>06 · Price feeds</span>
        <h3>How stock-token value is calculated</h3>
        <p>The pool uses AggregatorV3Interface-compatible feeds for listed markets. When a user deposits, borrows, withdraws, or liquidates, the contract reads the latest feed answer, checks that the price is positive, checks that the answer is not stale, and normalizes the feed decimals into 18-decimal USD value math.</p>
        <p>Stock-token markets can pause outside regular trading sessions or during oracle disruption. If an oracle is stale or paused, the safer outcome is to block sensitive actions instead of letting users borrow against invalid prices.</p>
      </article>

      <article id="docs-interest" className="doc-section">
        <span>07 · Interest model</span>
        <h3>Utilization-driven borrowing cost</h3>
        <p>Interest accrues when users interact with the pool. The contract measures elapsed time, calculates utilization as debt divided by cash plus debt, then applies a base rate plus a utilization slope. Higher utilization means liquidity is scarcer, so the borrow APR rises.</p>
        <p>When interest accrues, borrower debt grows through the borrow index. A portion of interest goes to suppliers by increasing total supplied liquidity, and a reserve portion is retained by the protocol. This keeps supplier accounting share-based instead of manually updating every lender every block.</p>
      </article>

      <article id="docs-liquidations" className="doc-section wide">
        <span>08 · Liquidations</span>
        <h3>What happens when a position becomes unsafe</h3>
        <p>If a borrower’s health factor drops below the minimum, a liquidator can repay part of the borrower’s USDG debt and receive discounted collateral. The liquidation flow repays debt, seizes collateral based on price and bonus settings, sends a portion of the bonus collateral to the protocol treasury, and leaves the borrower closer to the target health factor when possible.</p>
        <p>The design includes close-factor logic, target-health-factor logic, dust protection, and deficit reporting. If collateral is exhausted and debt remains, the protocol records a deficit so the bad-debt condition is explicit instead of silently hidden.</p>
        <div className="doc-callout warn"><b>User rule:</b><p>Do not wait for the interface to warn you. If health factor approaches 1.0, repay USDG or deposit more collateral before liquidation bots can act.</p></div>
      </article>

      <article id="docs-fees" className="doc-section">
        <span>09 · Fees and reserves</span>
        <h3>Where value moves</h3>
        <p>Borrowers pay a 0.25% origination fee when borrowing. Borrow interest is split between suppliers and protocol reserves using the reserve factor. Liquidations include a protocol liquidation fee that takes a portion of the liquidation bonus collateral, not an extra USDG charge on top of the repay amount.</p>
        <ul>
          <li>Origination fee: 25 bps on newly borrowed USDG.</li>
          <li>Reserve factor: 20% of accrued interest to protocol reserves.</li>
          <li>Protocol liquidation fee: 20% of liquidation bonus collateral.</li>
          <li>Base rate plus utilization slope determines live borrow APR.</li>
        </ul>
      </article>

      <article id="docs-ux" className="doc-section">
        <span>10 · App transaction flow</span>
        <h3>Why some actions need two wallet prompts</h3>
        <p>ERC-20 tokens require approval before another contract can move them. That is why deposit collateral, repay USDG, and supply USDG can involve an approval transaction followed by the actual pool transaction. The app checks current allowance first. If allowance is enough, it skips approval and submits the pool action directly.</p>
        <p>Every transaction should be treated as final only after confirmation. If a wallet prompt is rejected, the app does not submit the next transaction. If a transaction confirms but the UI looks stale, reload the account state; the chain is the source of truth.</p>
      </article>

      <article className="doc-section">
        <span>11 · Admin controls</span>
        <h3>Market operations</h3>
        <p>The owner can list markets, update market flags, pause or unpause the pool, update risk parameters, update the target health factor, and change treasury. These controls are powerful because lending markets must react to bad feeds, frozen assets, changing liquidity, and market risk.</p>
        <p>Production operation should use secure treasury/admin practices. A multisig and public change process are better than a single hot wallet for long-lived market administration.</p>
      </article>

      <article className="doc-section">
        <span>12 · Practical examples</span>
        <h3>How to think about a position</h3>
        <p>If you deposit a stock token worth $1,000 and its collateral factor is 45%, the normal borrow limit is about $450. Borrowing the full limit leaves little room for price drops. Borrowing $200-$300 creates more cushion, especially for volatile markets or after-hours price gaps.</p>
        <p>If the collateral price falls, health factor falls. If interest accrues, debt rises and health factor also falls. Repaying USDG lowers debt. Depositing more collateral increases the buffer. Withdrawing collateral removes buffer and is blocked if it would make the account unsafe.</p>
      </article>
    </div>

    <dl className="stats-grid docs-stats">
      <Stat label="Pool" value={short(LENDING_POOL_ADDRESS)} />
      <Stat label="Treasury" value={pool ? short(pool.treasury) : short(TREASURY_ADDRESS)} />
      <Stat label="Markets" value={`${MARKETS.length} listed`} />
      <Stat label="Borrow APR" value={pool ? pct(pool.borrowAprBps) : "—"} />
    </dl>
  </section>;
}

function EducationPage({ go }: { go: (tab: DeskTab) => void }) {
  return <section className="panel education-page">
    <div className="education-hero learn-hero">
      <div>
        <p className="eyebrow">Tokenized stock academy</p>
        <h2>Keep the asset. Use the value.</h2>
        <p>Tokenized stocks turn market exposure into wallet-native assets. Whitmore Sterling teaches the next step: using those assets inside a lending market so holders can access USDG liquidity without automatically selling the position they wanted to keep.</p>
      </div>
      <div className="liquidity-card asset-stack" aria-label="Asset liquidity stack">
        <span>Gas and base asset</span><b>ETH / WETH</b><i />
        <span>Collateral</span><b>Stock Tokens</b><i />
        <span>Borrowed liquidity</span><b>USDG</b><i />
        <small>ETH powers Robinhood Chain transactions. WETH is the ERC-20 wrapped form. Stock tokens are the current lending collateral in this pool.</small>
      </div>
    </div>

    <div className="learn-toc" aria-label="Learn sections">
      <a href="#learn-assets">Assets</a>
      <a href="#learn-tokenized-stocks">Tokenized stocks</a>
      <a href="#learn-eth">ETH / WETH</a>
      <a href="#learn-lending">Why lending</a>
      <a href="#learn-health">Health factor</a>
      <a href="#learn-playbooks">Playbooks</a>
      <a href="#learn-risks">Risks</a>
    </div>

    <div id="learn-assets" className="learn-map">
      <article>
        <span>01</span>
        <h3>ETH</h3>
        <p>ETH is the native gas asset for Robinhood Chain transactions. You need it to pay transaction fees when approving tokens, depositing collateral, borrowing, repaying, supplying liquidity, or withdrawing.</p>
      </article>
      <article>
        <span>02</span>
        <h3>WETH</h3>
        <p>WETH is wrapped ETH: an ERC-20 version of ETH that can be approved and moved by smart contracts. Verified on Robinhood Chain in this project as WETH at 0x0Bd7…AD73 with 18 decimals.</p>
      </article>
      <article>
        <span>03</span>
        <h3>Stock tokens</h3>
        <p>Stock tokens are the current collateral assets for this lending pool. They track equity or ETF exposure and can be posted as collateral when the market is listed and the oracle is live.</p>
      </article>
      <article>
        <span>04</span>
        <h3>USDG</h3>
        <p>USDG is the debt and liquidity asset. Borrowers receive USDG. Suppliers deposit USDG. The live token uses 6 decimals, which is why the app parses USDG differently from 18-decimal stock tokens.</p>
      </article>
    </div>

    <div className="learn-manual">
      <article id="learn-tokenized-stocks" className="learn-section wide">
        <span>01 · Foundation</span>
        <h3>What tokenized stocks are</h3>
        <p>Tokenized stocks are blockchain tokens designed to represent economic exposure to public companies, ETFs, or similar market instruments. Instead of living only inside a brokerage database, the exposure can move through wallet transactions and interact with smart contracts.</p>
        <p>This does not mean every tokenized stock gives shareholder rights, voting rights, direct ownership of the underlying security, or traditional brokerage protections. The practical user mental model is simpler: it is a transferable token whose price is meant to follow a real-world market reference.</p>
        <p>Because the token is wallet-native, a user can hold Apple, Tesla, Nvidia, QQQ, SPY, SGOV, ETH, stablecoins, and other assets in the same onchain environment. That makes portfolio actions programmable: collateral, liquidity, swaps, settlement, account health, and automation can all be expressed through smart contracts.</p>
      </article>

      <article id="learn-eth" className="learn-section">
        <span>02 · ETH on the site</span>
        <h3>Where ETH fits</h3>
        <p>ETH is now explained as a first-class asset in the Learn section because users need to understand the difference between gas, collateral, and borrowed liquidity. ETH pays network fees. WETH is the ERC-20 version of ETH. Stock tokens are the assets this pool currently accepts as collateral. USDG is what the pool lends and receives.</p>
        <p>Adding ETH to the education layer does not automatically make ETH collateral in the current lending pool. To make ETH or WETH functional collateral, the pool would need a listed WETH market, a verified price feed, configured risk parameters, and contract state that recognizes WETH as a listed market.</p>
        <div className="learn-warning"><b>Practical rule:</b><p>Keep a small ETH balance for gas. Use WETH only where the interface explicitly supports wrapped ETH as an ERC-20 asset. Do not assume native ETH can be deposited into an ERC-20 collateral form unless the contract supports wrapping or a listed WETH market.</p></div>
      </article>

      <article id="learn-lending" className="learn-section">
        <span>03 · Why lending exists</span>
        <h3>Why borrow instead of sell?</h3>
        <p>Selling turns an asset into cash but ends the position. Borrowing lets a holder keep exposure while unlocking liquidity. If you believe an asset is worth holding, but you temporarily need spendable liquidity, collateralized lending gives you another choice besides selling.</p>
        <p>The cost is risk. A loan has interest. Collateral can fall in value. If the position becomes unsafe, liquidators can repay debt and seize collateral. The correct mindset is not “free money.” It is “controlled leverage against an asset I want to keep.”</p>
      </article>

      <article className="learn-section wide">
        <span>04 · The complete borrower flow</span>
        <h3>From holding a stock token to borrowing USDG</h3>
        <div className="learn-steps">
          <div><b>1. Acquire the asset</b><small>Buy or receive a supported stock token and verify the token address.</small></div>
          <div><b>2. Keep ETH for gas</b><small>Approvals, deposits, borrows, repays, and withdrawals all require transaction fees.</small></div>
          <div><b>3. Approve collateral</b><small>The token approval allows the pool to move the exact collateral token you selected.</small></div>
          <div><b>4. Deposit collateral</b><small>The pool records your posted stock token balance under your wallet.</small></div>
          <div><b>5. Borrow conservatively</b><small>Take less than the maximum so price moves do not instantly threaten the account.</small></div>
          <div><b>6. Monitor health</b><small>Watch health factor, debt, price, liquidity, and oracle freshness.</small></div>
          <div><b>7. Repay USDG</b><small>Repayment lowers debt and improves health.</small></div>
          <div><b>8. Withdraw collateral</b><small>Once debt is repaid or safely reduced, withdraw the stock token you posted.</small></div>
        </div>
      </article>

      <article id="learn-health" className="learn-section">
        <span>05 · Health factor</span>
        <h3>The number that matters most</h3>
        <p>Health factor is the safety score of a borrowing position. It compares liquidation-limit collateral value against debt. Above 1.0 means the account is above the liquidation line. Below 1.0 means the account can be liquidated.</p>
        <p>A high health factor gives time to react. A low health factor means even a small price move, interest accrual, stale oracle update, or market gap can push the account into danger. The safest users borrow below the limit and keep repayment liquidity available.</p>
        <ul>
          <li>Health improves when you repay debt.</li>
          <li>Health improves when you add more collateral.</li>
          <li>Health worsens when collateral price falls.</li>
          <li>Health worsens as interest increases debt.</li>
          <li>Health worsens when you withdraw collateral.</li>
        </ul>
      </article>

      <article className="learn-section">
        <span>06 · Allowances</span>
        <h3>Why approvals appear before actions</h3>
        <p>ERC-20 assets cannot be pulled by a pool until the wallet grants allowance. Approval is permission. Deposit collateral, repay USDG, and supply USDG can each require an approval transaction before the actual pool transaction.</p>
        <p>The app checks fresh onchain allowance before asking again. If allowance is already enough, the next click should go directly to the pool action. If a wallet keeps asking for approval, the usual causes are wrong token decimals, approving the wrong token, approving the wrong spender, rejected transactions, or stale wallet state.</p>
      </article>

      <article id="learn-playbooks" className="learn-section wide">
        <span>07 · User playbooks</span>
        <h3>How different users might use the platform</h3>
        <div className="playbook-grid">
          <div><b>Long-term holder</b><small>Posts a stock token they want to keep, borrows a modest amount of USDG, and repays before health becomes tight.</small></div>
          <div><b>Liquidity supplier</b><small>Supplies USDG to back borrowers, watches utilization and available liquidity, and understands withdrawals depend on idle cash.</small></div>
          <div><b>Portfolio operator</b><small>Uses multiple listed markets, watches correlations, and avoids borrowing against every asset at the same time.</small></div>
          <div><b>Risk manager</b><small>Monitors health factor, price feeds, market status, borrow caps, and liquidation thresholds before signing.</small></div>
        </div>
      </article>

      <article id="learn-risks" className="learn-section wide">
        <span>08 · Risks</span>
        <h3>What users must understand before signing</h3>
        <p>Tokenized assets make markets programmable, but they do not remove risk. Lending adds smart contract risk, oracle risk, liquidation risk, liquidity risk, market-hours risk, token issuer risk, wallet risk, and user error risk. A polished interface does not guarantee a safe position.</p>
        <div className="risk-matrix learn-risk-grid">
          <div><b>Liquidation risk</b><small>Collateral can be seized if debt becomes too large relative to collateral value.</small></div>
          <div><b>Oracle risk</b><small>Bad, stale, paused, or delayed prices can block actions or change risk quickly.</small></div>
          <div><b>Liquidity risk</b><small>Borrowing requires supplied USDG. LP withdrawals require idle liquidity.</small></div>
          <div><b>Market gap risk</b><small>Stock-token prices may move sharply around market opens, closes, or news.</small></div>
          <div><b>Smart contract risk</b><small>Code can contain bugs even when designed carefully.</small></div>
          <div><b>Approval risk</b><small>Approving the wrong spender or token can expose funds. Always verify addresses.</small></div>
        </div>
      </article>
    </div>

    <div className="flow-strip learn-flow">
      <div><b>ETH</b><small>Pay gas and optionally wrap into WETH where supported.</small></div>
      <div><b>Stock token</b><small>Hold market exposure as a wallet-native collateral asset.</small></div>
      <div><b>USDG</b><small>Borrow liquidity or supply the pool for lending depth.</small></div>
      <div><b>Health factor</b><small>The safety gauge that decides liquidation risk.</small></div>
    </div>

    <div className="education-actions">
      <button className="primary" type="button" onClick={() => go("borrow")}>Start with collateral</button>
      <button type="button" onClick={() => go("lending")}>Supply USDG liquidity</button>
      <button type="button" onClick={() => go("documentation")}>Read protocol docs</button>
    </div>
  </section>;
}

function SuitsPage() {
  const suitsUrl = "https://opensea.io/collection/suitsonchain/overview";
  return <section className="panel suits-page">
    <div className="suits-head">
      <div>
        <p className="eyebrow">Suits onchain</p>
        <h2>Put on the standard.</h2>
        <p>The Suit is an identity marker for discipline, self-mastery, and the decision to become the best version of yourself.</p>
      </div>
      <a className="terminal-link" href={suitsUrl} target="_blank" rel="noreferrer">Open on OpenSea ↗</a>
    </div>

    <div className="suits-manifesto">
      <figure className="suits-portrait">
        <img src="/suits-manifesto.png" alt="Suits NFT character portrait" />
      </figure>
      <div className="suits-copy">
        <p>The Suits NFT collection represents more than digital artwork—it symbolizes a commitment to self-development, discipline, and personal evolution. A suit has long been associated with professionalism, confidence, and purpose. Within this collection, wearing the suit is not about status or wealth; it is about making the conscious decision to become the best version of yourself. Each piece represents the mindset that growth is earned through consistency, accountability, and the courage to continually improve.</p>
        <p>The ideology of the Suit is rooted in the belief that success begins with identity. When someone “puts on the suit,” they are choosing to think differently, act intentionally, and carry themselves with integrity regardless of their circumstances. The suit becomes a daily reminder that excellence is built through preparation, resilience, lifelong learning, and the willingness to lead by example. It represents a standard that is set internally rather than one defined by the opinions of others.</p>
        <p>As an NFT collection, Suits creates a community united by ambition rather than appearance. Every holder becomes part of a movement that values self-mastery, meaningful relationships, and leaving a positive impact on the world. The artwork serves as a symbol of this shared philosophy—a visual reminder that the most valuable investment anyone can make is in themselves. In a culture often focused on quick success, Suits stands for the enduring pursuit of character, purpose, and continuous growth.</p>
      </div>
    </div>

    <a className="opensea-link-card" href={suitsUrl} target="_blank" rel="noreferrer" aria-label="Open Suits on OpenSea">
      <span>OpenSea collection</span>
      <strong>Suits onchain</strong>
      <em>{suitsUrl}</em>
      <b>View collection ↗</b>
    </a>
  </section>;
}

function TickerTape({ markets, selected, prices }: { markets: MarketConfig[]; selected: string; prices: PriceMap }) {
  return <div className="ticker-tape" aria-label="Live listed market prices"><div>{[...markets, ...markets].map((m, i) => { const p = prices[m.symbol]; return <span key={`${m.symbol}-${i}`} className={m.symbol === selected ? "hot" : p?.stale ? "stale" : ""}>{m.symbol}<em>{p ? priceFmt(p.price) : "loading"}</em></span>; })}</div></div>;
}

function Ticket(props: { title: string; id: TxKind; value: string; setValue: (v: string) => void; button: string; onSubmit: () => void; disabled: boolean; helper?: string }) {
  return <form className="ticket" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
    <label htmlFor={props.id}>{props.title}</label>
    <div className="ticket-row"><input id={props.id} type="text" inputMode="decimal" autoComplete="off" value={props.value} onChange={(e) => props.setValue(e.target.value)} /><button type="submit" disabled={props.disabled}>{props.button}</button></div>
    {props.helper && <p className="field-help">{props.helper}</p>}
  </form>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) { return <div className={`stat ${tone || ""}`}><dt>{label}</dt><dd>{value}</dd></div>; }
function Notice({ kind, title, text, action }: { kind: string; title: string; text: string; action?: () => void }) { return <div className={`notice ${kind}`}><b>{title}</b><span>{text}</span>{action && <button onClick={action}>Retry</button>}</div>; }
function EmptyState({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) { return <div className="empty-state"><b>{title}</b><span>{text}</span><button onClick={onClick}>{action}</button></div>; }
function Skeleton() { return <div className="skeleton-stack"><span /><span /><span /></div>; }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[Whitmore Sterling] render error", error); }
  render() {
    if (this.state.error) {
      return <div className="notice error" style={{ margin: 24 }}><b>Something went wrong</b><span>{this.state.error.message}</span><button onClick={() => location.reload()}>Reload</button></div>;
    }
    return this.props.children;
  }
}

// Lightweight global error capture (logs to console; wire to Sentry/analytics when a DSN is available).
window.addEventListener("error", (e) => console.error("[Whitmore Sterling] uncaught error", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("[Whitmore Sterling] unhandled rejection", e.reason));

createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);

