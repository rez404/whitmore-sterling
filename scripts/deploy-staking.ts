import { ethers, network } from "hardhat";
import { writeFileSync } from "fs";
import { resolve } from "path";

/**
 * Deploys the staking side: the platform token (STERLING) and the MultiRewardStaking
 * vault, then optionally registers partner reward streams.
 *
 * Everything is checked before a single transaction is sent, and DRY_RUN=1 runs
 * the whole preflight without spending anything.
 *
 *   DRY_RUN=1 \
 *   OWNER_ADDRESS=0x<multisig> FEE_RECIPIENT=0x<treasury> \
 *   PLATFORM_SUPPLY=1000000 \
 *   REWARD_TOKENS=0xcashcat,0xpons REWARD_DISTRIBUTORS=0xa,0xb REWARD_DURATION=604800 \
 *   npx hardhat run scripts/deploy-staking.ts --network robinhoodMainnet
 *
 * Reuse an existing platform token with PLATFORM_TOKEN=0x...
 */

const EXPECTED_CHAIN_ID = 4663n;

function addressList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function requireAddress(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value || !ethers.isAddress(value)) throw new Error(`Set ${name} to a valid address (got: ${value ?? "unset"})`);
  return ethers.getAddress(value);
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const signers = await ethers.getSigners();
  if (signers.length === 0)
    throw new Error("No signer. Set DEPLOYER_PRIVATE_KEY in .env (repo root or contracts/.env).");
  const deployer = signers[0];

  const net = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  const owner = requireAddress("OWNER_ADDRESS", deployer.address);
  const feeRecipient = requireAddress("FEE_RECIPIENT", owner);
  const supply = ethers.parseUnits(process.env.PLATFORM_SUPPLY || "1000000", 18);
  const existingToken = process.env.PLATFORM_TOKEN;
  const rewardTokens = addressList("REWARD_TOKENS");
  const distributors = addressList("REWARD_DISTRIBUTORS");
  const duration = BigInt(process.env.REWARD_DURATION || 7 * 24 * 60 * 60);

  console.log("─".repeat(68));
  console.log(dryRun ? "PREFLIGHT (dry run — nothing will be sent)" : "DEPLOY");
  console.log("─".repeat(68));
  console.log("network        ", network.name, `(chainId ${net.chainId})`);
  console.log("deployer       ", deployer.address);
  console.log("gas balance    ", ethers.formatEther(balance), "ETH");
  console.log("owner          ", owner);
  console.log("fee recipient  ", feeRecipient);
  console.log("platform token ", existingToken ? `${existingToken} (reused)` : `new, supply ${ethers.formatUnits(supply, 18)}`);
  console.log("reward duration", `${duration}s (${Number(duration) / 86400} days)`);
  console.log("reward tokens  ", rewardTokens.length ? rewardTokens.join(", ") : "(none — add later)");
  console.log();

  /* ------------------------------- preflight ------------------------------- */

  const problems: string[] = [];
  const warnings: string[] = [];

  if (network.name !== "hardhat" && net.chainId !== EXPECTED_CHAIN_ID)
    problems.push(`Wrong chain: expected ${EXPECTED_CHAIN_ID}, connected to ${net.chainId}`);
  if (balance === 0n) problems.push("Deployer has no ETH for gas");
  if (owner === deployer.address)
    warnings.push("Owner is the deployer EOA. Use a multisig for production — the owner can pause and set fees.");
  if (feeRecipient === deployer.address)
    warnings.push("Fee recipient is the deployer EOA. Point it at the treasury.");

  if (distributors.length && distributors.length !== rewardTokens.length)
    problems.push(`REWARD_DISTRIBUTORS has ${distributors.length} entries but REWARD_TOKENS has ${rewardTokens.length}`);
  if (rewardTokens.length > 8) problems.push("At most 8 reward tokens are supported by the vault");

  // Every reward token must actually be an ERC-20 on this chain.
  const resolved: { address: string; symbol: string; distributor: string }[] = [];
  for (let i = 0; i < rewardTokens.length; i++) {
    const addr = rewardTokens[i];
    if (!ethers.isAddress(addr)) {
      problems.push(`REWARD_TOKENS[${i}] is not an address: ${addr}`);
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    if (code === "0x") {
      problems.push(`REWARD_TOKENS[${i}] has no contract code: ${addr}`);
      continue;
    }
    const erc = new ethers.Contract(addr, ["function symbol() view returns (string)"], ethers.provider);
    const symbol = await erc.symbol().catch(() => "<no symbol()>");
    const distributor = distributors[i] ? ethers.getAddress(distributors[i]) : owner;
    resolved.push({ address: ethers.getAddress(addr), symbol, distributor });
    console.log(`  reward ${i + 1}: ${symbol.padEnd(12)} ${addr}  distributor ${distributor}`);
  }
  if (resolved.length) console.log();

  for (const w of warnings) console.log("WARNING:", w);
  for (const p of problems) console.log("BLOCKER:", p);
  if (problems.length) throw new Error(`${problems.length} blocker(s) — nothing was deployed.`);
  if (warnings.length) console.log();

  if (dryRun) {
    console.log("Preflight passed. Re-run without DRY_RUN=1 to deploy.");
    return;
  }

  /* -------------------------------- deploy --------------------------------- */

  let platformAddr: string;
  if (existingToken) {
    platformAddr = ethers.getAddress(existingToken);
    console.log("Reusing platform token", platformAddr);
  } else {
    const Token = await ethers.getContractFactory("WhitmoreToken");
    const platform = await Token.deploy(owner, supply);
    await platform.waitForDeployment();
    platformAddr = await platform.getAddress();
    console.log("WhitmoreToken       ", platformAddr);
  }

  const Vault = await ethers.getContractFactory("MultiRewardStaking");
  const vault = await Vault.deploy(owner, platformAddr, feeRecipient);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("MultiRewardStaking  ", vaultAddr);

  // addRewardToken is onlyOwner; it only works here while the deployer still is the owner.
  const registered: typeof resolved = [];
  if (resolved.length) {
    if (owner !== deployer.address) {
      console.log(
        `\nSkipping reward registration: owner is ${owner}, not the deployer.` +
          `\nCall addRewardToken(token, distributor, ${duration}) from the owner for each:`,
      );
      for (const r of resolved) console.log(`  ${r.symbol.padEnd(12)} ${r.address}  ${r.distributor}`);
    } else {
      for (const r of resolved) {
        const tx = await vault.addRewardToken(r.address, r.distributor, duration);
        await tx.wait();
        registered.push(r);
        console.log(`registered ${r.symbol} (${r.address})`);
      }
    }
  }

  /* -------------------------------- record --------------------------------- */

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    feeRecipient,
    platformToken: platformAddr,
    platformTokenReused: !!existingToken,
    platformSupply: existingToken ? null : supply.toString(),
    stakingVault: vaultAddr,
    rewardDuration: Number(duration),
    rewardTokensRegistered: registered,
    rewardTokensPending: resolved.filter((r) => !registered.includes(r)),
    notes: [
      "MultiRewardStaking is unaudited. Do not promote it until an audit is complete.",
      "Partners fund their own stream: approve the vault, then call notifyRewardAmount(token, amount).",
      "Rewards streamed while nothing is staked stay locked in the contract and cannot be recovered.",
    ],
  };
  const out = resolve(__dirname, "../deployments/whitmore-staking-mainnet.json");
  writeFileSync(out, JSON.stringify(record, null, 2));
  console.log("\nrecord written to", out);

  console.log("\n--- paste into lending-frontend/src/farms.ts, then rebuild the frontend ---");
  console.log(`export const PLATFORM_TOKEN = "${platformAddr}";`);
  console.log(`export const STAKING_VAULT = "${vaultAddr}";`);
  console.log("// LP_ZAP is deployed separately by scripts/deploy-zap.ts");

  console.log("\nNext: each partner approves the vault and calls notifyRewardAmount(token, amount).");
  console.log("The stream only starts once tokens land — the page shows zero until then.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
