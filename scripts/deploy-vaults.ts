import { ethers, network } from "hardhat";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { STOCK_MARKETS } from "./stock-markets";

/**
 * Deploys StockLpVault instances against real Uniswap V3 pools.
 *
 * Every pool is checked before anything is deployed: it must exist, hold liquidity,
 * and match the fee tier chosen. Deploying a vault onto an empty pool would produce
 * a contract that reverts on the first deposit.
 *
 *   DRY_RUN=1 SYMBOLS=AAPL,NVDA,TSLA \
 *   OWNER_ADDRESS=0x<multisig> FEE_RECIPIENT=0x<treasury> \
 *   npx hardhat run scripts/deploy-vaults.ts --network robinhoodMainnet
 */

const EXPECTED_CHAIN_ID = 4663n;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

// Verified on chain 4663 on 2026-08-12. The Sushi addresses previously recorded in
// this repo point at a factory with no pools — every RWA pair trades on Uniswap.
const UNISWAP = {
  factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  positionManager: "0xC00BABBB20630974345EeA9f57d8F2FDEb81226B",
};

const FEE_TIERS = [500, 3000, 10000] as const;
const TICK_SPACING: Record<number, number> = { 500: 10, 3000: 60, 10000: 200 };
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/** Widest range the pool allows, aligned to its tick spacing. */
function fullRange(fee: number) {
  const spacing = TICK_SPACING[fee];
  return {
    tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
    tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
  };
}

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = ["function liquidity() view returns (uint128)", "function token0() view returns (address)"];
const ERC20_ABI = ["function symbol() view returns (string)", "function balanceOf(address) view returns (uint256)"];

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const signers = await ethers.getSigners();
  if (signers.length === 0) throw new Error("No signer. Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.");
  const deployer = signers[0];

  const net = await ethers.provider.getNetwork();
  const owner = process.env.OWNER_ADDRESS || deployer.address;
  const feeRecipient = process.env.FEE_RECIPIENT || owner;
  const wanted = (process.env.SYMBOLS || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (!ethers.isAddress(owner) || !ethers.isAddress(feeRecipient))
    throw new Error("OWNER_ADDRESS and FEE_RECIPIENT must be valid addresses");
  if (wanted.length === 0) throw new Error("Set SYMBOLS, e.g. SYMBOLS=AAPL,NVDA");

  console.log("─".repeat(72));
  console.log(dryRun ? "PREFLIGHT (dry run — nothing will be sent)" : "DEPLOY LP VAULTS");
  console.log("─".repeat(72));
  console.log("network       ", network.name, `(chainId ${net.chainId})`);
  console.log("deployer      ", deployer.address, `${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("owner         ", owner);
  console.log("fee recipient ", feeRecipient);
  console.log("symbols       ", wanted.join(", "));
  console.log();

  const problems: string[] = [];
  if (network.name !== "hardhat" && net.chainId !== EXPECTED_CHAIN_ID)
    problems.push(`Wrong chain: expected ${EXPECTED_CHAIN_ID}, connected to ${net.chainId}`);
  if (owner === deployer.address)
    console.log("WARNING: owner is the deployer EOA — use a multisig for production.\n");

  const factory = new ethers.Contract(UNISWAP.factory, FACTORY_ABI, ethers.provider);
  const usdgSymbol = await new ethers.Contract(USDG, ERC20_ABI, ethers.provider).symbol().catch(() => "USDG");

  type Plan = {
    symbol: string;
    token: string;
    pool: string;
    fee: number;
    liquidity: bigint;
    token0: string;
    token1: string;
    tickLower: number;
    tickUpper: number;
  };
  const plans: Plan[] = [];

  for (const symbol of wanted) {
    const market = STOCK_MARKETS.find((m) => m.symbol === symbol);
    const token = market?.token;
    if (!token || !ethers.isAddress(token)) {
      problems.push(`${symbol}: no canonical token address in scripts/stock-markets.ts`);
      continue;
    }

    // Pick the deepest pool across fee tiers — a vault on a thin pool earns nothing
    // and gives depositors terrible execution.
    let best: { pool: string; fee: number; liquidity: bigint } | null = null;
    for (const fee of FEE_TIERS) {
      const addr: string = await factory.getPool(token, USDG, fee).catch(() => ethers.ZeroAddress);
      if (addr === ethers.ZeroAddress) continue;
      const liquidity: bigint = await new ethers.Contract(addr, POOL_ABI, ethers.provider)
        .liquidity()
        .then((v: bigint) => BigInt(v))
        .catch(() => 0n);
      if (liquidity > 0n && (!best || liquidity > best.liquidity)) best = { pool: addr, fee, liquidity };
    }

    if (!best) {
      problems.push(`${symbol}: no Uniswap V3 ${symbol}/${usdgSymbol} pool with liquidity — nothing to LP into`);
      continue;
    }

    const [token0] = [(await new ethers.Contract(best.pool, POOL_ABI, ethers.provider).token0()) as string];
    const sorted = token.toLowerCase() < USDG.toLowerCase() ? [token, USDG] : [USDG, token];
    if (token0.toLowerCase() !== sorted[0].toLowerCase())
      problems.push(`${symbol}: pool token0 ${token0} disagrees with sorted order ${sorted[0]}`);

    const { tickLower, tickUpper } = fullRange(best.fee);
    plans.push({
      symbol,
      token,
      pool: best.pool,
      fee: best.fee,
      liquidity: best.liquidity,
      token0: sorted[0],
      token1: sorted[1],
      tickLower,
      tickUpper,
    });
    console.log(
      `  ${symbol.padEnd(6)} pool ${best.pool}  fee ${(best.fee / 10000).toFixed(2)}%  liquidity ${best.liquidity}`,
    );
  }

  console.log();
  for (const p of problems) console.log("BLOCKER:", p);
  if (problems.length) throw new Error(`${problems.length} blocker(s) — nothing was deployed.`);

  if (dryRun) {
    console.log("Preflight passed. Re-run without DRY_RUN=1 to deploy.");
    return;
  }

  const Vault = await ethers.getContractFactory("StockLpVault");
  const deployed: Record<string, string> = {};
  for (const p of plans) {
    const vault = await Vault.deploy(
      `Whitmore ${p.symbol}/USDG LP`,
      `ws${p.symbol}LP`,
      UNISWAP.positionManager,
      p.token0,
      p.token1,
      p.fee,
      p.tickLower,
      p.tickUpper,
      feeRecipient,
      owner,
    );
    await vault.waitForDeployment();
    const addr = await vault.getAddress();
    deployed[p.symbol] = addr;
    console.log(`deployed ${p.symbol.padEnd(6)} ${addr}`);
  }

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    dex: "uniswap-v3",
    factory: UNISWAP.factory,
    positionManager: UNISWAP.positionManager,
    owner,
    feeRecipient,
    vaults: plans.map((p) => ({ ...p, liquidity: p.liquidity.toString(), vault: deployed[p.symbol] })),
    notes: [
      "StockLpVault is unaudited and custodial. Do not promote it until an audit is complete.",
      "Full-range positions only; the vault does not rebalance.",
      "The platform keeps 10% of collected trading fees. Deposits themselves are never charged.",
    ],
  };
  const out = resolve(__dirname, "../deployments/whitmore-lp-vaults-mainnet.json");
  writeFileSync(out, JSON.stringify(record, null, 2));
  console.log("\nrecord written to", out);

  console.log("\n--- paste into VAULT_ADDRESSES in lending-frontend/src/farms.ts ---");
  console.log("export const VAULT_ADDRESSES: Record<string, string> = {");
  for (const [symbol, addr] of Object.entries(deployed)) console.log(`  ${symbol}: "${addr}",`);
  console.log("};");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
