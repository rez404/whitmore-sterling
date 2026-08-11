import { ethers } from "hardhat";
import { STOCK_MARKETS } from "./stock-markets";

function envAddress(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name];
  return value && ethers.isAddress(value) ? value : undefined;
}

async function main() {
  const usdg = process.env.USDG_ADDRESS || "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  if (!ethers.isAddress(usdg)) throw new Error(`Invalid USDG_ADDRESS: ${usdg}`);

  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  if (!ethers.isAddress(treasury)) throw new Error(`Invalid TREASURY_ADDRESS: ${treasury}`);
  const sequencer = process.env.SEQUENCER_UPTIME_FEED && ethers.isAddress(process.env.SEQUENCER_UPTIME_FEED) ? process.env.SEQUENCER_UPTIME_FEED : ethers.ZeroAddress;
  const debtToken = new ethers.Contract(usdg, ["function decimals() view returns (uint8)"], deployer);
  const debtDecimals = Number(await debtToken.decimals());
  const borrowCap = ethers.parseUnits(process.env.BORROW_CAP_USDG || "100000", debtDecimals);
  const liquiditySupplyCap = ethers.parseUnits(process.env.SUPPLY_CAP_USDG || "1000000", debtDecimals);
  const collateralSupplyCapUnits = process.env.COLLATERAL_SUPPLY_CAP_TOKENS || "1000000";

  const Pool = await ethers.getContractFactory("GuildBank");
  const pool = await Pool.deploy(usdg, deployer.address, treasury, sequencer);
  await pool.waitForDeployment();
  console.log("GuildBank", await pool.getAddress());
  console.log("treasury", treasury);
  console.log("sequencerUptimeFeed", sequencer);
  console.log("borrowCap", borrowCap.toString());
  console.log("liquiditySupplyCap", liquiditySupplyCap.toString());
  console.log("collateralSupplyCapTokens", collateralSupplyCapUnits);
  await (await pool.setGlobalSupplyCap(liquiditySupplyCap)).wait();

  for (const market of STOCK_MARKETS) {
    const token = envAddress(market.tokenEnv) || market.token;
    if (!token || !ethers.isAddress(token)) {
      console.log(`skip ${market.symbol}: set ${market.tokenEnv || `${market.symbol}_TOKEN`} to a canonical Robinhood Stock Token address`);
      continue;
    }

    const feed = envAddress(market.feedEnv) || market.svrFeed;
    if (!feed || !ethers.isAddress(feed)) {
      console.log(`skip ${market.symbol}: set ${market.feedEnv} to a valid Chainlink SVR feed`);
      continue;
    }

    const stockToken = new ethers.Contract(token, ["function decimals() view returns (uint8)"], deployer);
    const stockDecimals = Number(await stockToken.decimals());
    const collateralSupplyCap = ethers.parseUnits(collateralSupplyCapUnits, stockDecimals);

    const tx = await pool.listMarket(
      token,
      feed,
      market.collateralFactorBps,
      market.liquidationThresholdBps,
      market.liquidationBonusBps,
      market.maxStaleness,
      borrowCap,
      collateralSupplyCap,
    );
    await tx.wait();
    console.log(`listed ${market.symbol}`, token, feed, "collateralSupplyCap", collateralSupplyCap.toString());
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

