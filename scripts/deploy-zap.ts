import { ethers, network } from "hardhat";

/**
 * Deploys LpZap — one-transaction entry into an LP vault from a single asset.
 *
 * The zap holds no funds between transactions and has no owner, so there is
 * nothing to configure beyond the router and WETH it routes through.
 *
 *   DRY_RUN=1 npx hardhat run scripts/deploy-zap.ts --network robinhoodMainnet
 */

const ROUTER = "0xD089eBB5609Dd1FE604E1f8ecd9B88Bd5d128713"; // Uniswap V3 SwapRouter
const WETH9 = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const EXPECTED_CHAIN_ID = 4663n;

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer. Set PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.");

  const net = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("network  ", network.name, `(chainId ${net.chainId})`);
  console.log("deployer ", deployer.address, `${ethers.formatEther(balance)} ETH`);
  console.log("router   ", ROUTER);
  console.log("weth9    ", WETH9);

  if (network.name !== "hardhat" && net.chainId !== EXPECTED_CHAIN_ID)
    throw new Error(`Wrong chain: expected ${EXPECTED_CHAIN_ID}, connected to ${net.chainId}`);
  if (balance === 0n) throw new Error("Deployer has no ETH for gas");

  // Both dependencies must actually be contracts, or every zap would revert.
  for (const [label, addr] of [["router", ROUTER], ["weth9", WETH9]] as const) {
    if ((await ethers.provider.getCode(addr)) === "0x") throw new Error(`${label} has no contract code: ${addr}`);
  }

  if (dryRun) {
    console.log("\nPreflight passed. Re-run without DRY_RUN=1 to deploy.");
    return;
  }

  const Zap = await ethers.getContractFactory("LpZap");
  const zap = await Zap.deploy(ROUTER, WETH9);
  await zap.waitForDeployment();
  const addr = await zap.getAddress();

  console.log("\nLpZap deployed:", addr);
  console.log("\n--- paste into lending-frontend/src/farms.ts ---");
  console.log(`export const LP_ZAP = "${addr}";`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
