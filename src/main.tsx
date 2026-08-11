import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, getAddress, parseUnits } from "ethers";
import "./styles.css";
import { BankkrollGame } from "./BankkrollGame";

declare global { interface Window { ethereum?: any } }

type CatalogGame = {
  id: string;
  name: string;
  image: string;
  background: string;
  description: string;
  tag?: string;
  multipliersBps: number[];
  minWager: string;
  maxWager: string;
};

type ChainGame = {
  id: bigint;
  creator: string;
  active: boolean;
  name: string;
  minWager: bigint;
  maxWager: bigint;
  creatorFeeBps: bigint;
  protocolFeeBps: bigint;
  maxMultiplierBps: bigint;
  multipliersBps: bigint[];
};

type PoolState = {
  owner: string;
  treasury: string;
  entropyAdmin: string;
  totalAssets: bigint;
  unlockedAssets: bigint;
  lockedLiability: bigint;
  nextGameId: bigint;
  currentEntropyEpoch: bigint;
  epochCommitment: string;
  epochRevealed: boolean;
  lpTotalSupply: bigint;
};

type WalletState = { eth: bigint; usdg: bigint; allowance: bigint; lp: bigint };
type LogItem = { kind: "placed" | "settled" | "created"; tx: string; title: string; meta: string };
type AssetConfig = { id: "usdg" | "weth"; label: string; symbol: string; displaySymbol: string; token: string; pool: string; lpName: string; lpSymbol: string; wrap?: boolean };

const CHAIN = {
  id: 4663n,
  hex: "0x1237",
  name: "Robinhood Chain",
  rpc: typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
};

const FACTORY_ADDRESS = "0xC11dEAF70f9B5482a8ac71468ff3738Eecec1Fae";
const ASSETS: AssetConfig[] = [
  { id: "usdg", label: "USDG", symbol: "USDG", displaySymbol: "USDG", token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", pool: "0x63F3b47D727Dd1aAdf81F32Cc9Cd2d56946ccF6F", lpName: "Robinhood USDG Casino LP", lpSymbol: "rhUSDG-LP" },
  { id: "weth", label: "ETH", symbol: "WETH", displaySymbol: "ETH", token: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", pool: "0xe3cA6CC4cEe6C13F8442793705BC31638fad63D2", lpName: "Robinhood WETH Casino LP", lpSymbol: "rhWETH-LP", wrap: true },
];
const CONTRACTS = { factory: FACTORY_ADDRESS, pool: ASSETS[0].pool, usdg: ASSETS[0].token };

const CATSINO_GAMES: CatalogGame[] = [
  { id: "dice", name: "Dice", image: "/games/dice/logo.png", background: "#E91E63", description: "Dice from BankkRoll Gamba V2: choose a roll-under number, balance chance and payout, then roll.", tag: "BankkRoll", multipliersBps: [0,0,0,0,0,57000], minWager: "1", maxWager: "25" },
  { id: "slots", name: "Slots", image: "/games/slots/logo.png", background: "#2196F3", description: "Slots from BankkRoll Gamba V2: spin reels, reveal symbols, and chase matching multipliers.", tag: "BankkRoll", multipliersBps: [0,0,0,5000,10000,20000,40000,65000], minWager: "1", maxWager: "20" },
  { id: "flip", name: "Flip", image: "/games/flip/logo.png", background: "#FFEB3B", description: "Flip from BankkRoll Gamba V2: pick heads or tails and flip the 3D coin.", tag: "BankkRoll", multipliersBps: [0,18500], minWager: "1", maxWager: "50" },
  { id: "hilo", name: "HiLo", image: "/games/hilo/logo.png", background: "#F44336", description: "HiLo from BankkRoll Gamba V2: decide whether the next card lands higher or lower.", tag: "BankkRoll", multipliersBps: [0,0,12000,16000,22000,30000], minWager: "1", maxWager: "25" },
  { id: "mines", name: "Mines", image: "/games/mines/logo.png", background: "#9C27B0", description: "Mines from BankkRoll Gamba V2: choose safe squares, avoid mines, and climb the profit ladder.", tag: "BankkRoll", multipliersBps: [0,0,0,7000,10000,15000,25000], minWager: "1", maxWager: "20" },
  { id: "roulette", name: "Roulette", image: "/games/roulette/logo.png", background: "#4CAF50", description: "Roulette from BankkRoll Gamba V2: place chips on the table and spin for the selected outcome.", tag: "BankkRoll", multipliersBps: Array(36).fill(0).concat([65000]), minWager: "1", maxWager: "10" },
  { id: "plinko", name: "Plinko", image: "/games/plinko/logo.png", background: "#00BCD4", description: "Plinko from BankkRoll Gamba V2: drop a chip through pegs and land in a multiplier bucket.", tag: "BankkRoll", multipliersBps: [0,1000,3000,5000,8000,12000,16000,20000], minWager: "1", maxWager: "20" },
  { id: "crash", name: "Crash", image: "/games/crash/logo.png", background: "#FF9800", description: "Crash from BankkRoll Gamba V2: pick a target multiplier and watch the rocket fly or crash.", tag: "BankkRoll", multipliersBps: [0,0,5000,8000,11000,15000,22000], minWager: "1", maxWager: "20" },
  { id: "keno", name: "Keno", image: "/games/keno/logo.png", background: "#673AB7", description: "Keno from BankkRoll Gamba V2: select up to 10 numbers and reveal the draw.", tag: "BankkRoll", multipliersBps: Array(39).fill(0).concat([65000]), minWager: "1", maxWager: "10" },
  { id: "limbo", name: "Limbo", image: "/games/limbo/logo.png", background: "#FFC107", description: "Limbo from BankkRoll Gamba V2: choose a target multiplier and see if the result clears it.", tag: "BankkRoll", multipliersBps: Array(99).fill(0).concat([50000]), minWager: "1", maxWager: "10" },
];

const LOBBY_SPOTS = [
  { id: "dice", x: 26.8, y: 15.1, w: 13.7, h: 18.8 }, { id: "slots", x: 40.6, y: 15.1, w: 13.7, h: 18.8 }, { id: "flip", x: 54.3, y: 15.1, w: 13.7, h: 18.8 }, { id: "hilo", x: 68.0, y: 15.1, w: 13.7, h: 18.8 },
  { id: "mines", x: 26.8, y: 38.5, w: 13.7, h: 17.8 }, { id: "roulette", x: 40.6, y: 38.5, w: 13.7, h: 17.8 }, { id: "plinko", x: 54.3, y: 38.5, w: 13.7, h: 17.8 }, { id: "crash", x: 68.0, y: 38.5, w: 13.7, h: 17.8 },
  { id: "keno", x: 40.6, y: 61.6, w: 13.7, h: 18.0 }, { id: "limbo", x: 54.3, y: 61.6, w: 13.7, h: 18.0 },
];

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
const WETH_ABI = [...ERC20_ABI, "function deposit() payable", "function withdraw(uint256)"];
const POOL_ABI = [
  "function owner() view returns (address)", "function treasury() view returns (address)", "function entropyAdmin() view returns (address)", "function totalAssets() view returns (uint256)", "function unlockedAssets() view returns (uint256)", "function lockedLiability() view returns (uint256)", "function nextGameId() view returns (uint256)", "function currentEntropyEpoch() view returns (uint256)", "function entropyEpochs(uint256) view returns (bytes32 commitment, bytes32 seed, bool revealed)", "function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)",
  "function gameInfo(uint256) view returns (address creator,bool active,string name,uint256 minWager,uint256 maxWager,uint16 creatorFeeBps,uint16 protocolFeeBps,uint32 maxMultiplierBps,uint16[] multipliersBps)",
  "function createGame((string name,address creator,uint256 minWager,uint256 maxWager,uint16 creatorFeeBps,uint16 protocolFeeBps,uint16[] multipliersBps) cfg) returns (uint256)",
  "function depositLiquidity(uint256 assets,address receiver) returns (uint256)", "function withdrawLiquidity(uint256 shares,address receiver) returns (uint256)", "function placeWager(uint256 gameId,uint256 wager) returns (uint256)", "function settleWager(uint256 requestId)", "function revealEntropyAndCommitNext(bytes32 seed,bytes32 nextCommitment)",
  "event WagerPlaced(uint256 indexed requestId,uint256 indexed gameId,address indexed player,uint256 wager,uint256 maxLiability,uint256 entropyEpoch)", "event WagerSettled(uint256 indexed requestId,uint256 indexed gameId,address indexed player,uint256 outcomeIndex,uint256 multiplierBps,uint256 payout,uint256 creatorFee,uint256 protocolFee)", "event GameCreated(uint256 indexed gameId,address indexed creator,string name,uint256 minWager,uint256 maxWager)",
];

const provider = new JsonRpcProvider(CHAIN.rpc, Number(CHAIN.id));

const fmt = (v?: bigint, d = 4) => v == null ? "—" : Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: d });
const short = (a = "") => a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "";
const evm = (url: string) => { window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate")); };
const explorer = (v: string, type: "tx" | "address" = v.length > 42 ? "tx" : "address") => `${CHAIN.explorer}/${type === "tx" ? "tx" : "address"}/${v}`;
const clean = (e: any) => {
  const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
  if (msg.includes("user rejected")) return "Wallet request rejected.";
  if (msg.includes("InsufficientUnlockedLiquidity")) return "The Catsino pool needs more unlocked USDG liquidity for that max payout.";
  if (msg.includes("InvalidOdds")) return "That game's odds are too rich for the configured fees.";
  if (msg.includes("EntropyNotRevealed")) return "This request waits for the entropy admin to reveal its epoch seed.";
  if (msg.includes("BadEntropySeed")) return "Seed does not match the active epoch commitment.";
  return msg;
};

function App() {
  const [path, setPath] = React.useState(location.pathname);
  const [account, setAccount] = React.useState("");
  const [pool, setPool] = React.useState<PoolState | null>(null);
  const [wallet, setWallet] = React.useState<WalletState | null>(null);
  const [assetId, setAssetId] = React.useState<AssetConfig["id"]>((localStorage.getItem("catsino-asset") as AssetConfig["id"]) || "usdg");
  const [chainGames, setChainGames] = React.useState<ChainGame[]>([]);
  const [logs, setLogs] = React.useState<LogItem[]>([]);
  const [wager, setWager] = React.useState("1");
  const [lpAmount, setLpAmount] = React.useState("100");
  const [withdrawAmount, setWithdrawAmount] = React.useState("0");
  const [wrapAmount, setWrapAmount] = React.useState("0.01");
  const [requestId, setRequestId] = React.useState("");
  const [seed, setSeed] = React.useState("");
  const [nextCommitment, setNextCommitment] = React.useState("");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  React.useEffect(() => {
    const onRoute = () => setPath(location.pathname);
    addEventListener("popstate", onRoute);
    return () => removeEventListener("popstate", onRoute);
  }, []);

  const assetConfig = ASSETS.find((a) => a.id === assetId) || ASSETS[0];
  const poolRead = React.useMemo(() => new Contract(assetConfig.pool, POOL_ABI, provider), [assetConfig.pool]);
  const tokenRead = React.useMemo(() => new Contract(assetConfig.token, assetConfig.wrap ? WETH_ABI : ERC20_ABI, provider), [assetConfig.token, assetConfig.wrap]);
  React.useEffect(() => { localStorage.setItem("catsino-asset", assetConfig.id); }, [assetConfig.id]);
  React.useEffect(() => { setWager(assetConfig.wrap ? "0.001" : "1"); setLpAmount(assetConfig.wrap ? "0.01" : "100"); }, [assetConfig.id, assetConfig.wrap]);

  const gameId = path.replace(/^\//, "") || "";
  const docs = gameId === "docs";
  const lps = gameId === "lps";
  const backendExplorer = gameId === "explorer";
  const catalog = CATSINO_GAMES.find((g) => g.id === gameId);
  const chainByName = React.useMemo(() => new Map(chainGames.map((g) => [g.name, g])), [chainGames]);
  const CHAIN_NAME_BY_ID: Record<string, string[]> = { dice: ["Dice", "Lucky Litter Dice"], slots: ["Slots", "Meow Slots"], flip: ["Flip", "Cat Coin Flip"], hilo: ["HiLo", "Nine Lives HiLo"], mines: ["Mines", "Alley Mines"], roulette: ["Roulette", "Catnip Roulette"], plinko: ["Plinko", "Yarn Plinko"], crash: ["Crash", "Rocket Cat Crash"], keno: ["Keno"], limbo: ["Limbo"] };
  const selectedChainGame = catalog ? (CHAIN_NAME_BY_ID[catalog.id] || [catalog.name]).map((n) => chainByName.get(n)).find(Boolean) : undefined;
  const owner = !!account && !!pool && account.toLowerCase() === pool.owner.toLowerCase();
  const entropyAdmin = !!account && !!pool && account.toLowerCase() === pool.entropyAdmin.toLowerCase();

  const load = React.useCallback(async (addr = account) => {
    const [ownerAddr, treasury, entropy, totalAssets, unlockedAssets, lockedLiability, nextGameId, epoch, lpTotalSupply] = await Promise.all([
      poolRead.owner(), poolRead.treasury(), poolRead.entropyAdmin(), poolRead.totalAssets(), poolRead.unlockedAssets(), poolRead.lockedLiability(), poolRead.nextGameId(), poolRead.currentEntropyEpoch(), poolRead.totalSupply(),
    ]);
    const epochData = await poolRead.entropyEpochs(epoch);
    setPool({ owner: ownerAddr, treasury, entropyAdmin: entropy, totalAssets, unlockedAssets, lockedLiability, nextGameId, currentEntropyEpoch: epoch, epochCommitment: epochData.commitment, epochRevealed: epochData.revealed, lpTotalSupply });

    const loaded: ChainGame[] = [];
    for (let id = 1n; id < nextGameId && id < 80n; id++) {
      try {
        const info = await poolRead.gameInfo(id);
        loaded.push({ id, creator: info.creator, active: info.active, name: info.name, minWager: info.minWager, maxWager: info.maxWager, creatorFeeBps: BigInt(info.creatorFeeBps), protocolFeeBps: BigInt(info.protocolFeeBps), maxMultiplierBps: BigInt(info.maxMultiplierBps), multipliersBps: info.multipliersBps.map((x: bigint | number) => BigInt(x)) });
      } catch {}
    }
    setChainGames(loaded);
    if (addr) {
      const [eth, usdg, allowance, lp] = await Promise.all([provider.getBalance(addr), tokenRead.balanceOf(addr), tokenRead.allowance(addr, assetConfig.pool), poolRead.balanceOf(addr)]);
      setWallet({ eth, usdg, allowance, lp });
    } else setWallet(null);
    await loadLogs(poolRead, setLogs);
  }, [account, poolRead, tokenRead, assetConfig.pool]);

  React.useEffect(() => { load().catch((e) => setError(clean(e))); }, [load]);
  React.useEffect(() => {
    window.ethereum?.request({ method: "eth_accounts" }).then((a: string[]) => { if (a?.[0]) setAccount(a[0]); }).catch(() => undefined);
    const onAccounts = (a: string[]) => setAccount(a?.[0] || "");
    window.ethereum?.on?.("accountsChanged", onAccounts);
    return () => window.ethereum?.removeListener?.("accountsChanged", onAccounts);
  }, []);

  async function connect() {
    if (!window.ethereum) throw new Error("Install an EVM wallet to use Robinhood Chain.");
    const browser = new BrowserProvider(window.ethereum);
    const network = await browser.getNetwork().catch(() => null);
    if (network?.chainId !== CHAIN.id) {
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] }); }
      catch { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer] }] }); }
    }
    const signer = await browser.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
    await load(addr);
    return addr;
  }

  async function signedPool() {
    if (!account) await connect();
    const browser = new BrowserProvider(window.ethereum);
    return new Contract(assetConfig.pool, POOL_ABI, await browser.getSigner());
  }

  async function ensureAllowance(amount: bigint) {
    const addr = account || await connect();
    const allowance = wallet?.allowance ?? await tokenRead.allowance(addr, assetConfig.pool);
    if (allowance >= amount) return;
    const browser = new BrowserProvider(window.ethereum);
    const token = new Contract(assetConfig.token, assetConfig.wrap ? WETH_ABI : ERC20_ABI, await browser.getSigner());
    setPending("Approving USDG");
    const tx = await token.approve(assetConfig.pool, amount);
    await tx.wait();
  }

  async function run(fn: () => Promise<string>) {
    try { setError(""); setSuccess(""); const msg = await fn(); setSuccess(msg); setPending("Confirmed"); await load(account); setTimeout(() => setPending(""), 900); }
    catch (e) { setPending(""); setError(clean(e)); }
  }

  const play = () => run(async () => {
    if (!selectedChainGame) throw new Error("This Catsino game is not listed on the Robinhood pool yet. The owner can bootstrap all games from the lobby.");
    const amount = parseUnits(wager || "0", 18);
    if (amount <= 0n) throw new Error("Enter a wager above zero.");
    await ensureAllowance(amount);
    const c = await signedPool();
    setPending(`Playing ${selectedChainGame.name}`);
    const tx = await c.placeWager(selectedChainGame.id, amount);
    const receipt = await tx.wait();
    const event = receipt.logs.map((log: any) => { try { return c.interface.parseLog(log); } catch { return null; } }).find((e: any) => e?.name === "WagerPlaced");
    if (event) setRequestId(event.args.requestId.toString());
    return event ? `Wager placed. Request #${event.args.requestId.toString()} is ready after entropy reveal.` : "Wager placed.";
  });

  const deposit = () => run(async () => {
    const amount = parseUnits(lpAmount || "0", 18);
    await ensureAllowance(amount);
    const c = await signedPool();
    setPending("Adding liquidity");
    const tx = await c.depositLiquidity(amount, account || await connect()); await tx.wait();
    return `Added ${fmt(amount)} ${assetConfig.displaySymbol} to Catsino LP.`;
  });

  const withdraw = () => run(async () => {
    const amount = parseUnits(withdrawAmount || "0", 18);
    const c = await signedPool(); setPending("Withdrawing liquidity");
    const tx = await c.withdrawLiquidity(amount, account || await connect()); await tx.wait();
    return `Withdrew ${fmt(amount)} LP shares.`;
  });

  const settle = () => run(async () => {
    const id = BigInt(requestId || "0"); if (!id) throw new Error("Enter a request ID.");
    const c = await signedPool(); setPending(`Settling #${id}`);
    const tx = await c.settleWager(id); await tx.wait();
    return `Settled request #${id}.`;
  });

  const reveal = () => run(async () => {
    if (!entropyAdmin) throw new Error("Only the entropy admin can reveal epochs.");
    if (!/^0x[0-9a-fA-F]{64}$/.test(seed) || !/^0x[0-9a-fA-F]{64}$/.test(nextCommitment)) throw new Error("Seed and next commitment must both be bytes32 hex.");
    const c = await signedPool(); setPending("Revealing entropy");
    const tx = await c.revealEntropyAndCommitNext(seed, nextCommitment); await tx.wait();
    return "Entropy revealed and next epoch committed.";
  });

  const wrapEth = () => run(async () => {
    if (!assetConfig.wrap) throw new Error("Wrapping is only available for ETH/WETH.");
    if (!account) await connect();
    const amount = parseUnits(wrapAmount || "0", 18);
    const browser = new BrowserProvider(window.ethereum);
    const token = new Contract(assetConfig.token, WETH_ABI, await browser.getSigner());
    setPending("Wrapping ETH");
    const tx = await token.deposit({ value: amount }); await tx.wait();
    return `Wrapped ${fmt(amount)} ETH into WETH.`;
  });

  const unwrapEth = () => run(async () => {
    if (!assetConfig.wrap) throw new Error("Unwrapping is only available for ETH/WETH.");
    if (!account) await connect();
    const amount = parseUnits(wrapAmount || "0", 18);
    const browser = new BrowserProvider(window.ethereum);
    const token = new Contract(assetConfig.token, WETH_ABI, await browser.getSigner());
    setPending("Unwrapping WETH");
    const tx = await token.withdraw(amount); await tx.wait();
    return `Unwrapped ${fmt(amount)} WETH into ETH.`;
  });

  const bootstrap = () => run(async () => {
    if (!owner) throw new Error("Connect the pool owner wallet to create Catsino games.");
    const c = await signedPool();
    const existing = new Set(chainGames.map((g) => g.name));
    const missing = CATSINO_GAMES.filter((g) => !existing.has(g.name));
    if (!missing.length) return "All Catsino games are already listed.";
    for (const game of missing) {
      setPending(`Creating ${game.name}`);
      const tx = await c.createGame({ name: game.name, creator: getAddress(account), minWager: parseUnits(game.minWager, 18), maxWager: parseUnits(game.maxWager, 18), creatorFeeBps: 100, protocolFeeBps: 50, multipliersBps: game.multipliersBps });
      await tx.wait();
    }
    return `Created ${missing.length} Catsino games on Robinhood.`;
  });

  return <>
    <Header account={account} wallet={wallet} pool={pool} asset={assetConfig} setAssetId={setAssetId} connect={() => run(async () => { await connect(); return "Wallet connected."; })} />
    <main className="main-wrapper">
      {error && <Notice kind="error" title="Catsino scratched out" text={error} retry={() => load(account)} />}
      {success && <Notice kind="success" title="Confirmed" text={success} />}
      {lps && pool && pool.unlockedAssets === 0n && <Notice kind="warn" title="No house liquidity yet" text={`The ${assetConfig.displaySymbol} pool is live, but players need LPs to deposit before covered wagers can run.`} />}
      {docs ? <DocsPage pool={pool} chainGames={chainGames} asset={assetConfig} /> : lps ? <LpsPage wallet={wallet} pool={pool} asset={assetConfig} setAssetId={setAssetId} wrapAmount={wrapAmount} setWrapAmount={setWrapAmount} wrapEth={wrapEth} unwrapEth={unwrapEth} lpAmount={lpAmount} setLpAmount={setLpAmount} deposit={deposit} withdrawAmount={withdrawAmount} setWithdrawAmount={setWithdrawAmount} withdraw={withdraw} account={account} connect={() => run(async () => { await connect(); return "Wallet connected."; })} pending={pending} entropyAdmin={entropyAdmin} seed={seed} setSeed={setSeed} nextCommitment={nextCommitment} setNextCommitment={setNextCommitment} reveal={reveal} /> : backendExplorer ? <BackendExplorerPage pool={pool} chainGames={chainGames} logs={logs} asset={assetConfig} setAssetId={setAssetId} /> : <>
        {catalog ? <GamePage catalog={catalog} chainGame={selectedChainGame} pool={pool} wallet={wallet} asset={assetConfig} wager={wager} setWager={setWager} play={play} pending={pending} requestId={requestId} setRequestId={setRequestId} settle={settle} /> : <Dashboard chainGames={chainGames} bootstrap={bootstrap} owner={owner} pending={pending} />}
        <GameSlider />
      </>}
    </main>
  </>;
}

function Header({ account, wallet, pool, asset, setAssetId, connect }: { account: string; wallet: WalletState | null; pool: PoolState | null; asset: AssetConfig; setAssetId: (id: AssetConfig["id"]) => void; connect: () => void }) {
  return <header className="header"><button className="logo-btn" onClick={() => evm("/")} aria-label="Catsino home"><img src="/logo.png" alt="Catsino logo" /></button><div className="header-actions"><AssetSwitcher asset={asset} setAssetId={setAssetId} /><button className="ghost-link" onClick={() => evm("/lps")}>LP's</button><button className="ghost-link" onClick={() => evm("/explorer")}>Explorer</button><button className="ghost-link" onClick={() => evm("/docs")}>Docs</button><a href={explorer(asset.pool, "address")} target="_blank" rel="noreferrer">Pool</a><span className="pill">🐟 {fmt(pool?.totalAssets)} {asset.displaySymbol}</span><span className="pill">🧶 {fmt(wallet?.usdg)} {asset.displaySymbol}</span><button onClick={connect}>{account ? short(account) : "Connect"}</button></div></header>;
}

function AssetSwitcher({ asset, setAssetId }: { asset: AssetConfig; setAssetId: (id: AssetConfig["id"]) => void }) {
  return <div className="asset-switcher" aria-label="Playable asset">{ASSETS.map((a) => <button key={a.id} className={a.id === asset.id ? "active" : ""} onClick={() => setAssetId(a.id)}>{a.label}</button>)}</div>;
}

function DocsPage({ pool, chainGames, asset }: { pool: PoolState | null; chainGames: ChainGame[]; asset: AssetConfig }) {
  const liveGames = chainGames.length;
  const risks = ["LPs take the other side of player wagers", "locked liability cannot be withdrawn", "admin commit/reveal can withhold entropy", "real-money USDG wagering needs legal review"];
  return <article className="docs-page">
    <button className="back docs-back" onClick={() => evm("/")}>← Catsino lobby</button>
    <section className="docs-hero">
      <p className="eyebrow">Robinhood Catsino docs</p>
      <h1>How the wager contracts and LP vault work.</h1>
      <p>The Robinhood version keeps the same Catsino game lobby and game list, but swaps Solana/Gamba accounts for EVM contracts: a factory, one USDG pool, ERC-20 LP shares, game configs, wager requests, and commit/reveal settlement.</p>
      <div className="doc-addresses">
        <a href={explorer(FACTORY_ADDRESS, "address")} target="_blank" rel="noreferrer"><span>Factory</span><b>{FACTORY_ADDRESS}</b></a>
        <a href={explorer(asset.pool, "address")} target="_blank" rel="noreferrer"><span>{asset.displaySymbol} pool</span><b>{asset.pool}</b></a>
        <a href={explorer(asset.token, "address")} target="_blank" rel="noreferrer"><span>Asset</span><b>{asset.symbol} · {asset.token}</b></a>
      </div>
    </section>

    <section className="docs-grid">
      <DocCard title="1. Factory" kicker="RobinhoodGambleFiFactory">
        <p>The factory deploys one wager pool per ERC-20 asset and records the canonical pool in <code>poolForAsset(asset)</code>. For this site the asset is the selected Robinhood asset.</p>
        <ul><li>Creates the ERC-20 LP pool contract.</li><li>Stores the asset → pool mapping.</li><li>Gives explorers and frontends a single source of truth.</li></ul>
      </DocCard>
      <DocCard title="2. Pool" kicker="RobinhoodGambleFiPool">
        <p>The pool is the house vault. It holds the selected asset, mints LP shares, stores games, accepts wagers, locks worst-case payout liability, and settles results.</p>
        <ul><li><code>totalAssets()</code>: USDG held by the house.</li><li><code>lockedLiability()</code>: payout capacity reserved for open wagers.</li><li><code>unlockedAssets()</code>: withdrawable / newly usable liquidity.</li></ul>
      </DocCard>
      <DocCard title="3. Game configs" kicker="Gamba bet array → multipliersBps">
        <p>Each Catsino game is an onchain config: name, creator, min/max wager, fees, and an outcome table. In Gamba the table is <code>bet</code>; here it is <code>multipliersBps</code>.</p>
        <ul><li><code>10000</code> = 1x payout.</li><li><code>0</code> = loss outcome.</li><li>Average multiplier plus fees must stay ≤ 100% to reject upside-down house odds.</li></ul>
      </DocCard>
      <DocCard title="4. Wagers" kicker="approve → placeWager → request id">
        <p>Players approve USDG, call <code>placeWager(gameId, amount)</code>, and receive a request id. The contract transfers the wager in and locks the maximum possible payout plus fees before accepting.</p>
        <ul><li>No wager is accepted unless the LP pool can cover its worst case.</li><li>Open requests are bound to the current entropy epoch.</li><li>Anyone can later settle a request after entropy reveal.</li></ul>
      </DocCard>
      <DocCard title="5. Settlement" kicker="commit/reveal entropy">
        <p>The entropy admin commits a hash for each epoch. After wagers are placed, the admin reveals the seed and commits the next one. Settlement hashes the seed with request data to pick an outcome index.</p>
        <ul><li>Before reveal: requests are pending.</li><li>After reveal: <code>settleWager(requestId)</code> pays player, creator, and treasury if applicable.</li><li>Production should move to audited VRF/threshold entropy before public real-money launch.</li></ul>
      </DocCard>
      <DocCard title="6. LP shares" kicker="rhUSDG-LP">
        <p>Liquidity providers deposit the selected asset and receive ERC-20 LP shares. Withdrawals burn shares and return the proportional amount of unlocked USDG.</p>
        <ul><li>Player losses increase pool assets and LP share value.</li><li>Player wins decrease pool assets and LP share value.</li><li>Locked wager liability is excluded from safe withdrawal capacity.</li></ul>
      </DocCard>
    </section>

    <section className="flow-panel">
      <h2>End-to-end flow</h2>
      <div className="flow-steps">
        {[
          ["LP deposits USDG", "Pool receives the selected asset and mints LP shares."],
          ["Owner lists games", "Catsino game names and payout tables are stored onchain."],
          ["Player wagers", "USDG approval then placeWager locks max liability."],
          ["Entropy reveal", "Admin reveals seed for the epoch and commits the next epoch."],
          ["Settlement", "Outcome index selects payout multiplier; fees and winnings are paid."],
          ["LP exits", "LP burns shares to withdraw unlocked proportional USDG."],
        ].map(([title, text], i) => <div className="flow-step" key={title}><span>{i + 1}</span><b>{title}</b><p>{text}</p></div>)}
      </div>
    </section>

    <section className="docs-grid docs-grid-small">
      <DocCard title="Live pool state" kicker="Read from Robinhood Chain">
        <dl><Stat label="Games listed" value={`${liveGames}/12`} /><Stat label="Total assets" value={`${fmt(pool?.totalAssets)} ${asset.displaySymbol}`} /><Stat label="Unlocked assets" value={`${fmt(pool?.unlockedAssets)} ${asset.displaySymbol}`} /><Stat label="Locked liability" value={`${fmt(pool?.lockedLiability)} ${asset.displaySymbol}`} /><Stat label="Entropy epoch" value={pool?.currentEntropyEpoch.toString() ?? "—"} /></dl>
      </DocCard>
      <DocCard title="Risk disclosures" kicker="Do not hide this from LPs">
        <ul>{risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
      </DocCard>
      <DocCard title="Contracts verified" kicker="Blockscout">
        <p>Both the factory and pool are verified on Blockscout. Users can inspect source, transactions, events, and token balances directly.</p>
        <p><a className="inline-link" href={explorer(FACTORY_ADDRESS, "address")} target="_blank" rel="noreferrer">Open factory</a> · <a className="inline-link" href={explorer(asset.pool, "address")} target="_blank" rel="noreferrer">Open pool</a></p>
      </DocCard>
    </section>
  </article>;
}

function DocCard({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return <section className="doc-card"><span>{kicker}</span><h2>{title}</h2>{children}</section>;
}

function LpsPage(props: { wallet: WalletState | null; pool: PoolState | null; asset: AssetConfig; setAssetId: (id: AssetConfig["id"]) => void; wrapAmount: string; setWrapAmount: (v: string) => void; wrapEth: () => void; unwrapEth: () => void; lpAmount: string; setLpAmount: (v: string) => void; deposit: () => void; withdrawAmount: string; setWithdrawAmount: (v: string) => void; withdraw: () => void; account: string; connect: () => void; pending: string; entropyAdmin: boolean; seed: string; setSeed: (v: string) => void; nextCommitment: string; setNextCommitment: (v: string) => void; reveal: () => void }) {
  return <article className="lps-page">
    <section className="docs-hero lp-hero"><p className="eyebrow">LP's</p><h1>Fund the Catsino house.</h1><p>Choose USDG or ETH/WETH, deposit into that Robinhood pool, receive LP shares, and take the house side of every listed Catsino game. LP controls and entropy admin tools live here now — they are removed from the game lobby and game pages.</p><AssetSwitcher asset={props.asset} setAssetId={props.setAssetId} /></section>
    <LpPanel wallet={props.wallet} pool={props.pool} asset={props.asset} wrapAmount={props.wrapAmount} setWrapAmount={props.setWrapAmount} wrapEth={props.wrapEth} unwrapEth={props.unwrapEth} lpAmount={props.lpAmount} setLpAmount={props.setLpAmount} deposit={props.deposit} withdrawAmount={props.withdrawAmount} setWithdrawAmount={props.setWithdrawAmount} withdraw={props.withdraw} account={props.account} connect={props.connect} pending={props.pending} />
    <AdminPanel pool={props.pool} entropyAdmin={props.entropyAdmin} seed={props.seed} setSeed={props.setSeed} nextCommitment={props.nextCommitment} setNextCommitment={props.setNextCommitment} reveal={props.reveal} />
    <section className="docs-grid docs-grid-small"><DocCard title="How LP share value moves" kicker="House exposure"><p>Player losses add USDG to the pool and raise LP share value. Player wins remove USDG and lower LP share value. Open wagers reserve locked liability so LPs cannot withdraw funds promised to potential payouts.</p></DocCard><DocCard title="Withdrawal rule" kicker="Unlocked only"><p>Withdrawals burn rhUSDG-LP shares and return proportional unlocked assets. If active wagers are pending, some liquidity stays locked until those requests settle.</p></DocCard><DocCard title="Risk" kicker="Read before depositing"><p>LPs are not earning fixed yield. They are underwriting chance-game payouts. Real-money USDG wagering needs legal review, jurisdiction controls, and audited randomness before public scale.</p></DocCard></section>
  </article>;
}

function BackendExplorerPage({ pool, chainGames, logs, asset, setAssetId }: { pool: PoolState | null; chainGames: ChainGame[]; logs: LogItem[]; asset: AssetConfig; setAssetId: (id: AssetConfig["id"]) => void }) {
  const totalWagered = logs.filter(l => l.kind === "placed").length;
  const settled = logs.filter(l => l.kind === "settled").length;
  const pools = ASSETS.map((a) => ({ token: a.label === "ETH" ? "Wrapped Ether" : "Robinhood USDG", symbol: a.displaySymbol, type: "PUBLIC", liquidity: a.id === asset.id ? `${fmt(pool?.totalAssets)} ${a.displaySymbol}` : "view asset", tvl: a.id === asset.id ? `${fmt(pool?.totalAssets)} ${a.displaySymbol}` : "view asset", ratio: pool?.lpTotalSupply && pool.lpTotalSupply > 0n ? (Number(pool.totalAssets) / Number(pool.lpTotalSupply)).toFixed(3) : "1.000" , id: a.id }));
  return <article className="explorer-page">
    <section className="explorer-hero"><div><p className="eyebrow">Catsino backend explorer</p><h1>Robinhood wager network</h1><p>Gamba-style backend explorer for the deployed Catsino factory, USDG pool, games, LP vault, and recent wager events.</p></div><div><AssetSwitcher asset={asset} setAssetId={setAssetId} /><button className="primary explorer-cta" onClick={() => evm("/lps")}>Create / manage LP</button></div></section>
    <section className="explorer-stats"><Stat label="Volume" value={`${fmt(pool?.totalAssets)} ${asset.displaySymbol}`} /><Stat label="Estimated fees" value="1.5% max rake" /><Stat label="Plays" value={String(totalWagered)} /><Stat label="Players" value="onchain events" /><Stat label="Active games" value={`${chainGames.filter(g => g.active).length}`} /><Stat label="Settled" value={String(settled)} /></section>
    <section className="explorer-columns"><div className="explorer-card"><div className="table-head"><h2>7d Leaderboard</h2><button>View all</button></div><div className="rank-list">{logs.slice(0,5).map((l,i)=><a key={l.tx+i} href={explorer(l.tx)} target="_blank" rel="noreferrer"><b>{i+1}</b><span>{l.title}</span><em>{l.meta}</em></a>)}{!logs.length && <p className="muted">No plays yet.</p>}</div></div><div className="explorer-card"><div className="table-head"><h2>Top Platforms this week</h2><button>View all</button></div><div className="rank-list"><a><b>1</b><span>Catsino Robinhood</span><em>{fmt(pool?.totalAssets)} {asset.displaySymbol} TVL</em></a></div></div></section>
    <section className="explorer-card"><div className="table-head"><h2>Top Pools</h2><button onClick={() => evm("/lps")}>Manage LP</button></div><div className="explorer-table"><div className="thead"><span>Pool</span><span>Liquidity</span><span>TVL</span><span>Ratio</span></div>{pools.map(p=><div className="trow" key={p.symbol}><span><b>{p.token}</b><small>{p.symbol} · {p.type}</small></span><span>{p.liquidity}</span><span>{p.tvl}</span><span>{p.ratio}</span></div>)}</div></section>
    <section className="explorer-card"><div className="table-head"><h2>Recent Plays</h2><button>Load more</button></div><div className="explorer-table plays"><div className="thead"><span>Platform</span><span>Player / Request</span><span>Wager</span><span>Payout</span><span>Tx</span></div>{logs.length ? logs.map((l,i)=><a className="trow" href={explorer(l.tx)} target="_blank" rel="noreferrer" key={l.tx+i}><span>Catsino {asset.displaySymbol}</span><span>{l.title}</span><span>{l.kind === "placed" ? l.meta : "—"}</span><span>{l.kind === "settled" ? l.meta : "pending"}</span><span>{short(l.tx)}</span></a>) : <div className="empty"><span>🐾</span><b>No wager events yet</b><p>Once games are bootstrapped and funded, plays and settlements appear here.</p></div>}</div></section>
  </article>;
}

function Dashboard({ chainGames, bootstrap, owner, pending }: { chainGames: ChainGame[]; bootstrap: () => void; owner: boolean; pending: string }) {
  return <section className="lobby-shell"><div className="mobile-hint">Swipe the cat tower to pick a game.</div><div className="lobby-scroller"><div className="lobby-stage">{LOBBY_SPOTS.map((spot) => <button key={spot.id} className="hotspot" style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }} onClick={() => evm(`/${spot.id}`)} aria-label={`Play ${CATSINO_GAMES.find(g => g.id === spot.id)?.name}`}/>)}</div></div><div className="bootstrap-card"><b>{chainGames.length}/12 games live on Robinhood</b><span>{owner ? "Create any missing games so the Robinhood pool matches Solana Catsino." : "Connect owner wallet to bootstrap exact Catsino game list."}</span><button disabled={!owner || !!pending} onClick={bootstrap}>{pending || "Bootstrap all Catsino games"}</button></div></section>;
}

function GameSlider() { return <section className="slider" aria-label="All Catsino games">{CATSINO_GAMES.map((game) => <button key={game.id} className="game-card" style={{ background: game.background }} onClick={() => evm(`/${game.id}`)}><span className="pattern"/><span className="glow"/>{game.tag && <i>{game.tag}</i>}<img src={game.image} alt=""/><b>{game.name}</b><em>Play</em></button>)}</section>; }

function GamePage({ catalog, chainGame, pool, wallet, asset, wager, setWager, play, pending, requestId, setRequestId, settle }: { catalog: CatalogGame; chainGame?: ChainGame; pool: PoolState | null; wallet: WalletState | null; asset: AssetConfig; wager: string; setWager: (v: string) => void; play: () => void; pending: string; requestId: string; setRequestId: (v: string) => void; settle: () => void }) {
  const maxPayout = chainGame ? parseUnits(wager || "0", 18) * chainGame.maxMultiplierBps / 10000n : 0n;
  const canPlay = !!chainGame && !!pool && pool.unlockedAssets > 0n && !pending;
  return <section className="game-layout">
    <div className="game-screen playable-screen" style={{ background: catalog.background }}>
      <button className="back" onClick={() => evm("/")}>← Lobby</button>
      <GameVisual game={catalog} active={!!chainGame?.active} symbol={asset.displaySymbol} />
    </div>
    <aside className="controls player-card">
      <div className="quick-badge">{asset.displaySymbol} mode</div>
      <h2>{catalog.name}</h2>
      <p>{catalog.description}</p>
      <dl><Stat label="You have" value={`${fmt(wallet?.usdg)} ${asset.displaySymbol}`} /><Stat label="House can cover" value={`${fmt(pool?.unlockedAssets)} ${asset.displaySymbol}`} /><Stat label="Top prize" value={`${fmt(maxPayout)} ${asset.displaySymbol}`} /><Stat label="Play size" value={chainGame ? `${fmt(chainGame.minWager)}–${fmt(chainGame.maxWager)} ${asset.displaySymbol}` : "Preparing"} /></dl>
      {!pool || pool.unlockedAssets === 0n ? <div className="friendly-note"><b>House needs funds first.</b><span>LPs add liquidity on the LP’s page. Once funded, this button is all players need.</span><button onClick={() => evm('/lps')}>Go to LP’s</button></div> : null}
      <label htmlFor="wager">Amount to play</label><div className="row"><input id="wager" inputMode="decimal" autoComplete="off" value={wager} onChange={(e) => setWager(e.target.value)} /><button onClick={() => setWager(chainGame ? fmt(chainGame.minWager, 6).replace(/,/g, "") : catalog.minWager)}>Min</button><button onClick={() => setWager(chainGame ? fmt(chainGame.maxWager, 6).replace(/,/g, "") : catalog.maxWager)}>Max</button></div>
      <button className="primary play-now" disabled={!canPlay} onClick={play}>{pending || (canPlay ? `Play now` : chainGame ? "Waiting for liquidity" : "Game loading")}</button>
      <details className="advanced-settle"><summary>Finish a pending play</summary><p>If a wallet closes mid-play, paste the request number here to finish settlement after entropy is revealed.</p><div className="row"><input id="request" inputMode="numeric" value={requestId} onChange={(e) => setRequestId(e.target.value.replace(/\D/g, ""))} placeholder="Request #" /><button onClick={settle}>Finish</button></div></details>
    </aside>
  </section>;
}


const slotIcons = ["/game-assets/slots/slot-cat-7x.png", "/game-assets/slots/slot-cat-5x.png", "/game-assets/slots/slot-cat-3x.png", "/game-assets/slots/slot-cat-2x.png", "/game-assets/slots/slot-emoji-cool.png"];
const cards = ["A♠", "K♥", "Q♦", "J♣", "9♠", "7♥"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function GameVisual({ game, active, symbol }: { game: CatalogGame; active: boolean; symbol: string }) {
  return <div className="real-game exact-bankkroll-host"><div className="game-title"><span>{active ? "Live on Robinhood" : "Coming online"}</span><h1>{game.name}</h1></div><BankkrollGame id={game.id} name={game.name} description={game.description} /><div className="game-status"><span>{active ? "Ready" : "Waiting"}</span><span>BankkRoll Gamba V2 exact source</span><span>{symbol}</span></div></div>;
}

function VisualShell({ game, active, children, footer }: { game: CatalogGame; active: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  return <div className="real-game"><div className="game-title"><span>{active ? "Live on Robinhood" : "Coming online"}</span><h1>{game.name}</h1></div>{children}<div className="game-status"><span>{active ? "Ready" : "Waiting"}</span><span>Same Catsino game</span>{footer}</div></div>;
}

function SlotsVisual({ game, active, symbol }: { game: CatalogGame; active: boolean; symbol: string }) {
  const [reels, setReels] = React.useState([0,1,2]);
  const [spinning, setSpinning] = React.useState(false);
  const spin = () => { setSpinning(true); let n=0; const id=setInterval(()=>{ setReels([0,1,2].map(()=>Math.floor(Math.random()*slotIcons.length))); if(++n>10){clearInterval(id); setSpinning(false);} },90); };
  return <VisualShell game={game} active={active} footer={<span>{symbol} reels</span>}><div className="slot-machine"><div className="slot-window">{reels.map((r,i)=><div className="slot-reel" key={i}><img src={slotIcons[r]} alt="slot symbol" /></div>)}</div><button onClick={spin}>{spinning ? "Spinning…" : "Preview spin"}</button></div></VisualShell>;
}
function DiceVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [target,setTarget]=React.useState(50); const [roll,setRoll]=React.useState(42);
  return <VisualShell game={game} active={active} footer={<span>{target}% chance</span>}><div className="dice-board"><div className="dice-result">{roll}</div><input aria-label="Roll under target" type="range" min="5" max="95" value={target} onChange={e=>setTarget(+e.target.value)} /><button onClick={()=>setRoll(Math.floor(Math.random()*100)+1)}>Roll preview</button><div className="dice-track"><span style={{width:`${target}%`}} /></div><b>Roll under {target}</b></div></VisualShell>;
}
function MinesVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [cells,setCells]=React.useState<string[]>(Array(25).fill(""));
  const scratch=(i:number)=>setCells(c=>c.map((x,n)=>n===i?(Math.random()<.18?"💥":"🐟"):x));
  const reset=()=>setCells(Array(25).fill(""));
  return <VisualShell game={game} active={active} footer={<span>scratch tiles</span>}><div className="mines-grid">{cells.map((c,i)=><button key={i} onClick={()=>scratch(i)} className={c?"open":""}>{c || "🐾"}</button>)}</div><button className="mini-action" onClick={reset}>Reset board</button></VisualShell>;
}
function RouletteVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [rot,setRot]=React.useState(20); const [num,setNum]=React.useState(7);
  const spin=()=>{ const n=Math.floor(Math.random()*37); setNum(n); setRot(r=>r+720+n*9.7); };
  return <VisualShell game={game} active={active} footer={<span>number {num}</span>}><div className="roulette-wrap"><div className="roulette-wheel" style={{transform:`rotate(${rot}deg)`}}>{Array.from({length:12}).map((_,i)=><i key={i} style={{transform:`rotate(${i*30}deg)`}} />)}<b>{num}</b></div><button onClick={spin}>Spin preview</button></div></VisualShell>;
}
function PlinkoVisual({ game, active, race=false }: { game: CatalogGame; active: boolean; race?: boolean }) {
  const [drop,setDrop]=React.useState(45);
  return <VisualShell game={game} active={active} footer={<span>{race ? "race lanes" : "yarn drop"}</span>}><div className="plinko-board">{Array.from({length:55}).map((_,i)=><span key={i} className="peg" />)}<div className="plinko-ball" style={{left:`${drop}%`}}>🧶</div><div className="buckets">{[.5,1,2,3,5].map(x=><b key={x}>{x}x</b>)}</div></div><button className="mini-action" onClick={()=>setDrop(Math.floor(15+Math.random()*70))}>{race?"Launch kittens":"Drop yarn"}</button></VisualShell>;
}
function FlipVisual({ game, active, pvp=false }: { game: CatalogGame; active: boolean; pvp?: boolean }) {
  const [heads,setHeads]=React.useState(true); const [flip,setFlip]=React.useState(false);
  const go=()=>{setFlip(true); setTimeout(()=>{setHeads(Math.random()>.5); setFlip(false)},520)};
  return <VisualShell game={game} active={active} footer={<span>{pvp?"1v1 alley":"coin side"}</span>}><div className="coin-table"><div className={`coin ${flip?'flipping':''}`}><img src={heads?"/game-assets/flip/heads.png":"/game-assets/flip/tails.png"} alt={heads?"heads":"tails"}/></div><button onClick={go}>{pvp?"Flip for table":"Flip preview"}</button></div></VisualShell>;
}
function CrashVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [mult,setMult]=React.useState(1.0); const [flying,setFlying]=React.useState(false);
  const launch=()=>{ setFlying(true); setMult(1); let n=0; const id=setInterval(()=>{n++; setMult(1+n*.17); if(n>18){clearInterval(id); setFlying(false)}},80); };
  return <VisualShell game={game} active={active} footer={<span>{mult.toFixed(2)}x</span>}><div className="crash-sky"><div className="rocket" style={{transform:`translate(${Math.min(mult*26,80)}px, ${-Math.min(mult*28,120)}px)`}}>🚀🐈</div><svg viewBox="0 0 300 140"><path d="M0 130 C80 120 110 60 170 70 S240 25 300 10" /></svg></div><button className="mini-action" onClick={launch}>{flying?"Flying…":"Launch preview"}</button></VisualShell>;
}
function HiloVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [card,setCard]=React.useState(pick(cards)); const next=()=>setCard(pick(cards));
  return <VisualShell game={game} active={active} footer={<span>higher / lower</span>}><div className="hilo-table"><div className="playing-card">{card}</div><div className="hilo-buttons"><button onClick={next}>Higher</button><button onClick={next}>Lower</button></div></div></VisualShell>;
}
function BlackjackVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [hand,setHand]=React.useState(["A♠","K♥"]); const deal=()=>setHand([pick(cards),pick(cards),...(Math.random()>.5?[pick(cards)]:[])]);
  return <VisualShell game={game} active={active} footer={<span>beat dealer</span>}><div className="blackjack-table"><div className="dealer">Dealer <span>🂠</span><span>🂠</span></div><div className="hand">{hand.map((c,i)=><b key={i}>{c}</b>)}</div><button onClick={deal}>Deal preview</button></div></VisualShell>;
}
function JackpotVisual({ game, active, symbol }: { game: CatalogGame; active: boolean; symbol: string }) {
  const [lit,setLit]=React.useState(0); return <VisualShell game={game} active={active} footer={<span>rare bowl</span>}><div className="jackpot-vault">{Array.from({length:10}).map((_,i)=><span key={i} className={i===lit?'lit':''}>🐟</span>)}<b>Fat Cat Pot</b><em>{symbol}</em></div><button className="mini-action" onClick={()=>setLit(Math.floor(Math.random()*10))}>Spin jackpot</button></VisualShell>;
}

function KenoVisual({ game, active }: { game: CatalogGame; active: boolean }) {
  const [selected, setSelected] = React.useState<number[]>([]);
  const [revealed, setRevealed] = React.useState<Set<number>>(new Set());
  const [won, setWon] = React.useState<boolean | null>(null);
  const toggle = (n: number) => setSelected((xs) => xs.includes(n) ? xs.filter((x) => x !== n) : xs.length < 10 ? [...xs, n] : xs);
  const draw = () => { const hits = new Set<number>(); while (hits.size < 10) hits.add(Math.floor(Math.random() * 40) + 1); setRevealed(new Set()); setWon(null); Array.from(hits).forEach((n, i) => setTimeout(() => { setRevealed((old) => new Set([...old, n])); if (i === 9) setWon(Array.from(hits).some((h) => selected.includes(h))); }, i * 120)); };
  const clear = () => { setSelected([]); setRevealed(new Set()); setWon(null); };
  return <VisualShell game={game} active={active} footer={<span>{selected.length}/10 picked</span>}><div className="keno-board">{Array.from({ length: 40 }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => toggle(n)} className={`${selected.includes(n) ? "selected" : ""} ${revealed.has(n) ? "revealed" : ""} ${revealed.has(n) && selected.includes(n) ? "hit" : ""}`}>{n}</button>)}</div><div className="hilo-buttons"><button onClick={clear}>Clear</button><button onClick={draw} disabled={!selected.length}>Draw preview</button></div>{won != null && <b className={won ? "win-text" : "lose-text"}>{won ? "Hit!" : "Try again"}</b>}</VisualShell>;
}
function LimboVisual({ game, active, symbol }: { game: CatalogGame; active: boolean; symbol: string }) {
  const [target, setTarget] = React.useState(20); const [result, setResult] = React.useState(0); const [win, setWin] = React.useState<boolean | null>(null);
  const run = () => { setResult(0); setWin(null); const ok = Math.random() < 1 / target; const end = ok ? target + Math.random() * target * .2 : 1 + Math.random() * Math.max(1, target - 1); let n=0; const id=setInterval(()=>{ n++; setResult(1 + (end - 1) * (n / 22)); if(n>=22){ clearInterval(id); setWin(ok); }}, 45); };
  return <VisualShell game={game} active={active} footer={<span>{target}x target</span>}><div className="limbo-stage"><div className={win == null ? "" : win ? "win" : "lose"}>{result.toFixed(2)}x</div><div className="limbo-stats"><span><b>{target}%</b> Win chance</span><span><b>{target}x</b> Multiplier</span><span><b>{symbol}</b> Payout asset</span></div><input aria-label="Target multiplier" type="range" min="2" max="100" value={target} onChange={(e)=>setTarget(+e.target.value)} /><button onClick={run}>Play preview</button></div></VisualShell>;
}

function DefaultVisual({ game, active }: { game: CatalogGame; active: boolean }) { return <VisualShell game={game} active={active}><div className="default-game-art"><img src={game.image} alt=""/><span>Ready to play</span></div></VisualShell>; }

function LpPanel(props: { wallet: WalletState | null; pool: PoolState | null; asset: AssetConfig; wrapAmount?: string; setWrapAmount?: (v: string) => void; wrapEth?: () => void; unwrapEth?: () => void; lpAmount: string; setLpAmount: (v: string) => void; deposit: () => void; withdrawAmount: string; setWithdrawAmount: (v: string) => void; withdraw: () => void; account: string; connect: () => void; pending: string }) {
  return <section className="panel-grid"><div className="panel"><h2>LP Vault</h2><p>Deposit {props.asset.displaySymbol} and receive {props.asset.lpSymbol} shares. This funds the Catsino house.</p><div className="stats"><Stat label="Your asset" value={`${fmt(props.wallet?.usdg)} ${props.asset.displaySymbol}`} /><Stat label="Your LP" value={`${fmt(props.wallet?.lp)} ${props.asset.lpSymbol}`} /><Stat label="LP supply" value={`${fmt(props.pool?.lpTotalSupply)} ${props.asset.lpSymbol}`} /></div><label htmlFor="lpAmount">Deposit {props.asset.displaySymbol}</label>{props.asset.wrap && <div className="wrap-box"><label htmlFor="wrapAmount">Wrap / unwrap ETH</label><div className="row"><input id="wrapAmount" inputMode="decimal" value={props.wrapAmount || ""} onChange={(e) => props.setWrapAmount?.(e.target.value)} /><button onClick={props.wrapEth}>Wrap</button><button onClick={props.unwrapEth}>Unwrap</button></div></div>}<div className="row"><input id="lpAmount" inputMode="decimal" value={props.lpAmount} onChange={(e) => props.setLpAmount(e.target.value)} /><button onClick={() => props.setLpAmount(fmt(props.wallet?.usdg, 6).replace(/,/g, ""))}>Max</button></div><button className="primary" onClick={props.account ? props.deposit : props.connect}>{props.account ? "Deposit liquidity" : "Connect to deposit"}</button><label htmlFor="withdrawLp">Withdraw LP shares</label><div className="row"><input id="withdrawLp" inputMode="decimal" value={props.withdrawAmount} onChange={(e) => props.setWithdrawAmount(e.target.value)} /><button onClick={() => props.setWithdrawAmount(fmt(props.wallet?.lp, 6).replace(/,/g, ""))}>Max</button></div><button onClick={props.withdraw}>Withdraw liquidity</button></div></section>;
}

function AdminPanel(props: { pool: PoolState | null; entropyAdmin: boolean; seed: string; setSeed: (v: string) => void; nextCommitment: string; setNextCommitment: (v: string) => void; reveal: () => void }) {
  return <section className="panel"><h2>Provably Fair</h2><p>Commit/reveal entropy for Robinhood Catsino. Do not publish the seed until reveal.</p><div className="commitment"><b>Current epoch #{props.pool?.currentEntropyEpoch.toString() ?? "—"}</b><span>{props.pool?.epochCommitment ?? "—"}</span></div><label htmlFor="seed">Current seed bytes32</label><input id="seed" value={props.seed} onChange={(e) => props.setSeed(e.target.value)} placeholder="0x…" autoComplete="off" /><label htmlFor="nextCommit">Next commitment bytes32</label><input id="nextCommit" value={props.nextCommitment} onChange={(e) => props.setNextCommitment(e.target.value)} placeholder="0x…" autoComplete="off" /><button disabled={!props.entropyAdmin} onClick={props.reveal}>{props.entropyAdmin ? "Reveal epoch" : "Entropy admin only"}</button></section>;
}

function Recent({ logs }: { logs: LogItem[] }) { return <section className="panel"><h2>Recent Paw Prints</h2>{logs.length ? <div className="recent-list">{logs.map((l) => <a key={`${l.tx}-${l.title}`} href={explorer(l.tx)} target="_blank" rel="noreferrer"><b>{l.title}</b><span>{l.meta}</span></a>)}</div> : <div className="empty"><span>🐾</span><b>No recent events found</b><p>Plays, settlements, and game creation will appear here.</p></div>}<p className="compliance"><b>Compliance:</b> Catsino uses redeemable USDG wagers. Real-money chance games may require licensing, age gates, geofencing, responsible gaming controls, and legal review.</p></section>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><dt>{label}</dt><dd>{value}</dd></div>; }
function Notice({ kind, title, text, retry }: { kind: string; title: string; text: string; retry?: () => void }) { return <div className={`notice ${kind}`}><b>{title}</b><span>{text}</span>{retry && <button onClick={retry}>Retry</button>}</div>; }

async function loadLogs(poolRead: Contract, setter: (logs: LogItem[]) => void) {
  const latest = await provider.getBlockNumber();
  const from = Math.max(9203702, latest - 250000);
  const [created, placed, settled] = await Promise.all([poolRead.queryFilter(poolRead.filters.GameCreated(), from, latest), poolRead.queryFilter(poolRead.filters.WagerPlaced(), from, latest), poolRead.queryFilter(poolRead.filters.WagerSettled(), from, latest)]);
  const mapped = [...created, ...placed, ...settled].sort((a: any, b: any) => Number(b.blockNumber) - Number(a.blockNumber)).slice(0, 16).map((ev: any) => {
    if (ev.fragment.name === "GameCreated") return { kind: "created", tx: ev.transactionHash, title: `Game #${ev.args.gameId.toString()} created`, meta: ev.args.name } as LogItem;
    if (ev.fragment.name === "WagerSettled") return { kind: "settled", tx: ev.transactionHash, title: `Request #${ev.args.requestId.toString()} settled`, meta: `${fmt(ev.args.payout)} asset paid · ${Number(ev.args.multiplierBps) / 10000}x` } as LogItem;
    return { kind: "placed", tx: ev.transactionHash, title: `Request #${ev.args.requestId.toString()} placed`, meta: `${fmt(ev.args.wager)} asset wager · game #${ev.args.gameId.toString()}` } as LogItem;
  });
  setter(mapped);
}

createRoot(document.getElementById("root")!).render(<App />);
