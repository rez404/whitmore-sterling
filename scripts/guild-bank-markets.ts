import { ethers } from "hardhat";
import { STOCK_MARKETS } from "./stock-markets";

const GUILD_BANK = process.env.GUILD_BANK_ADDRESS || "0x3b8E15CC4Cb595B5097A26ff7F318038C50dc59d";
const COLLATERAL_SUPPLY_CAP_TOKENS = process.env.COLLATERAL_SUPPLY_CAP_TOKENS || "1000000";
const BORROW_CAP_USDG = process.env.BORROW_CAP_USDG || "100000";

const ABI = [
  "function owner() view returns (address)",
  "function debtAssetDecimals() view returns (uint8)",
  "function markets(address) view returns (bool listed,uint16 collateralFactorBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint64 maxStaleness,address priceFeed,uint256 borrowCap,uint256 supplyCap,uint256 totalBorrowed,uint256 totalCollateral,bool paused,bool frozen,bool borrowable)",
  "function listMarket(address stockToken,address priceFeed,uint16 collateralFactorBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint64 maxStaleness,uint256 borrowCap,uint256 supplyCap)",
];
const ERC20_ABI = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
const FEED_ABI = ["function decimals() view returns (uint8)", "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];

type Mode = "check" | "list-missing";

function normalize(addr: string) {
  return ethers.getAddress(addr);
}

async function main() {
  const mode = (process.env.GUILD_BANK_MARKET_MODE || "check") as Mode;
  if (mode !== "check" && mode !== "list-missing") throw new Error("Set GUILD_BANK_MARKET_MODE=check or list-missing");

  const provider = ethers.provider;
  const signers = await ethers.getSigners();
  const signer = signers[0];
  const bank = new ethers.Contract(GUILD_BANK, ABI, signer || provider);
  const owner = normalize(await bank.owner());
  const signerAddress = signer ? normalize(await signer.getAddress()) : ethers.ZeroAddress;
  const debtDecimals = Number(await bank.debtAssetDecimals());
  const borrowCap = ethers.parseUnits(BORROW_CAP_USDG, debtDecimals);

  console.log(`GuildBank=${GUILD_BANK}`);
  console.log(`Owner=${owner}`);
  console.log(`Signer=${signerAddress}`);
  console.log(`Mode=${mode}`);

  if (mode === "list-missing" && signerAddress !== owner) {
    throw new Error(`Signer ${signerAddress} is not GuildBank owner ${owner}`);
  }

  const rows: string[] = [];
  const listed: string[] = [];
  const missing: string[] = [];
  const skipped: string[] = [];
  const mismatched: string[] = [];
  const txs: Record<string, string> = {};

  for (const market of STOCK_MARKETS) {
    const token = market.token && ethers.isAddress(market.token) ? normalize(market.token) : undefined;
    if (!token) {
      skipped.push(`${market.symbol}: no canonical token in config (${market.tokenEnv || "tokenEnv only"})`);
      continue;
    }
    const feed = normalize(market.svrFeed);
    const current = await bank.markets(token);
    const tokenContract = new ethers.Contract(token, ERC20_ABI, provider);
    const feedContract = new ethers.Contract(feed, FEED_ABI, provider);
    const [tokenDecimals, feedDecimals, round] = await Promise.all([
      tokenContract.decimals().catch(() => null),
      feedContract.decimals().catch(() => null),
      feedContract.latestRoundData().catch(() => null),
    ]);
    if (tokenDecimals === null) {
      skipped.push(`${market.symbol}: token has no decimals/code at ${token}`);
      continue;
    }
    if (feedDecimals === null || round === null || round[1] <= 0n || round[3] === 0n) {
      skipped.push(`${market.symbol}: feed invalid at ${feed}`);
      continue;
    }
    const supplyCap = ethers.parseUnits(COLLATERAL_SUPPLY_CAP_TOKENS, Number(tokenDecimals));

    if (!current.listed) {
      missing.push(market.symbol);
      if (mode === "list-missing") {
        const tx = await bank.listMarket(
          token,
          feed,
          market.collateralFactorBps,
          market.liquidationThresholdBps,
          market.liquidationBonusBps,
          market.maxStaleness,
          borrowCap,
          supplyCap,
        );
        const receipt = await tx.wait();
        txs[market.symbol] = receipt.hash;
        rows.push(`${market.symbol}: LISTED tx=${receipt.hash}`);
      } else {
        rows.push(`${market.symbol}: MISSING token=${token} feed=${feed}`);
      }
      continue;
    }

    listed.push(market.symbol);
    const expected = {
      feed,
      cf: BigInt(market.collateralFactorBps),
      lt: BigInt(market.liquidationThresholdBps),
      bonus: BigInt(market.liquidationBonusBps),
      staleness: BigInt(market.maxStaleness),
      borrowCap,
      supplyCap,
    };
    const actualFeed = normalize(current.priceFeed);
    const mismatchParts: string[] = [];
    if (actualFeed !== expected.feed) mismatchParts.push(`feed ${actualFeed}!=${expected.feed}`);
    if (BigInt(current.collateralFactorBps) !== expected.cf) mismatchParts.push(`cf ${current.collateralFactorBps}!=${expected.cf}`);
    if (BigInt(current.liquidationThresholdBps) !== expected.lt) mismatchParts.push(`lt ${current.liquidationThresholdBps}!=${expected.lt}`);
    if (BigInt(current.liquidationBonusBps) !== expected.bonus) mismatchParts.push(`bonus ${current.liquidationBonusBps}!=${expected.bonus}`);
    if (BigInt(current.maxStaleness) !== expected.staleness) mismatchParts.push(`staleness ${current.maxStaleness}!=${expected.staleness}`);
    if (BigInt(current.borrowCap) !== expected.borrowCap) mismatchParts.push(`borrowCap ${current.borrowCap}!=${expected.borrowCap}`);
    if (BigInt(current.supplyCap) !== expected.supplyCap) mismatchParts.push(`supplyCap ${current.supplyCap}!=${expected.supplyCap}`);
    if (!current.borrowable || current.paused || current.frozen) mismatchParts.push(`flags paused=${current.paused} frozen=${current.frozen} borrowable=${current.borrowable}`);
    if (mismatchParts.length) {
      mismatched.push(`${market.symbol}: ${mismatchParts.join(", ")}`);
      rows.push(`${market.symbol}: LISTED_MISMATCH ${mismatchParts.join("; ")}`);
    } else {
      rows.push(`${market.symbol}: OK`);
    }
  }

  console.log(rows.join("\n"));
  console.log(`SUMMARY listed=${listed.length} missing=${mode === "list-missing" ? 0 : missing.length} newlyListed=${Object.keys(txs).length} mismatched=${mismatched.length} skipped=${skipped.length}`);
  if (skipped.length) console.log(`SKIPPED\n${skipped.join("\n")}`);
  if (mismatched.length) console.log(`MISMATCHED\n${mismatched.join("\n")}`);
  if (Object.keys(txs).length) console.log(`TXS\n${Object.entries(txs).map(([k, v]) => `${k}: ${v}`).join("\n")}`);
  if (mode === "check" && missing.length) process.exitCode = 2;
  if (mismatched.length) process.exitCode = 3;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
