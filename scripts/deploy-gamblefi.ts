import { ethers } from "hardhat";

function mustAddress(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value || !ethers.isAddress(value)) throw new Error(`Set ${name} to a valid address`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const asset = mustAddress("GAMBLEFI_ASSET", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"); // USDG
  const treasury = mustAddress("GAMBLEFI_TREASURY", deployer.address);
  const entropyAdmin = mustAddress("GAMBLEFI_ENTROPY_ADMIN", deployer.address);
  const firstCommitment = process.env.GAMBLEFI_FIRST_ENTROPY_COMMITMENT;
  if (!firstCommitment || !/^0x[0-9a-fA-F]{64}$/.test(firstCommitment)) {
    throw new Error("Set GAMBLEFI_FIRST_ENTROPY_COMMITMENT=keccak256(bytes32 secret seed); do not deploy with a public seed");
  }

  const Factory = await ethers.getContractFactory("RobinhoodGambleFiFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("RobinhoodGambleFiFactory", factoryAddress);

  const tx = await factory.createPool(
    asset,
    process.env.GAMBLEFI_LP_NAME || "Robinhood USDG Casino LP",
    process.env.GAMBLEFI_LP_SYMBOL || "rhUSDG-LP",
    treasury,
    entropyAdmin,
    firstCommitment,
  );
  await tx.wait();
  const poolAddress = await factory.poolForAsset(asset);
  console.log("RobinhoodGambleFiPool", poolAddress);
  console.log("asset", asset);
  console.log("treasury", treasury);
  console.log("entropyAdmin", entropyAdmin);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
