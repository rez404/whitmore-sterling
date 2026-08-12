import { ethers } from "hardhat";

/**
 * Deploys the low-risk Page 2 contracts only: the platform token + a single-stake StakingRewards pool.
 * The custodial StockLpVault is intentionally NOT deployed here — it needs a fork test + audit first.
 *
 * Run with a FRESH deployer key (never one pasted into a chat):
 *   DEPLOYER_PRIVATE_KEY=0x... \
 *   OWNER_ADDRESS=<your multisig> FEE_RECIPIENT=<treasury/multisig> \
 *   REWARD_TOKEN=<partner token, or leave unset for USDG interim> PLATFORM_SUPPLY=1000000 \
 *   npx hardhat run scripts/deploy-farms.ts --network robinhoodMainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer — set DEPLOYER_PRIVATE_KEY in your environment (.env).");

  const owner = process.env.OWNER_ADDRESS || deployer.address;       // strongly recommend a multisig
  const feeRecipient = process.env.FEE_RECIPIENT || owner;
  const rewardToken = process.env.REWARD_TOKEN || "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // USDG interim until a partner token exists
  const supply = ethers.parseUnits(process.env.PLATFORM_SUPPLY || "1000000", 18);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:      ", deployer.address);
  console.log("Gas balance:   ", ethers.formatEther(bal), "ETH");
  console.log("Owner:         ", owner);
  console.log("Fee recipient: ", feeRecipient);
  console.log("Reward token:  ", rewardToken);
  if (owner === deployer.address) console.warn("WARNING: owner is the deployer EOA — set OWNER_ADDRESS to a multisig for production.");

  const Token = await ethers.getContractFactory("WhitmoreToken");
  const platform = await Token.deploy(owner, supply);
  await platform.waitForDeployment();
  const platformAddr = await platform.getAddress();
  console.log("\nWhitmoreToken deployed:", platformAddr);

  const Staking = await ethers.getContractFactory("StakingRewards");
  const staking = await Staking.deploy(owner, rewardToken, platformAddr, feeRecipient);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("StakingRewards deployed:", stakingAddr);

  console.log("\n--- paste into lending-frontend/src/farms.ts, then redeploy the frontend ---");
  console.log(`export const PLATFORM_TOKEN = "${platformAddr}";`);
  console.log(`export const PARTNER_TOKEN = "${rewardToken}";`);
  console.log(`export const STAKING_POOL = "${stakingAddr}";`);
}

main().catch((e) => { console.error(e); process.exit(1); });
