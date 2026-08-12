import { config } from "./config.js";
import { gasPriceGwei, provider, vaultContract, wallet } from "./chain.js";

export type VaultRun = {
  vault: string;
  at: string;
  outcome: "compounded" | "skipped-no-fees" | "skipped-cooldown" | "skipped-gas" | "skipped-paused" | "dry-run" | "error";
  detail?: string;
  txHash?: string;
  gasUsed?: string;
};

export type KeeperState = {
  startedAt: string;
  lastRunAt: string | null;
  runs: number;
  compounded: number;
  errors: number;
  lastError: string | null;
  keeper: string | null;
  keeperBalanceEth: string | null;
  history: VaultRun[];
};

export const state: KeeperState = {
  startedAt: new Date().toISOString(),
  lastRunAt: null,
  runs: 0,
  compounded: 0,
  errors: 0,
  lastError: null,
  keeper: wallet?.address ?? null,
  keeperBalanceEth: null,
  history: [],
};

const lastRunPerVault = new Map<string, number>();

function record(run: VaultRun) {
  state.history.unshift(run);
  if (state.history.length > 100) state.history.pop();
}

/**
 * Compound one vault.
 *
 * The call is simulated first. `_compound()` returns early when there is nothing
 * to collect, so a simulation that succeeds does not prove fees exist — but one
 * that reverts proves the transaction would be wasted, and that is the case worth
 * catching before paying gas.
 */
async function compoundOne(address: string): Promise<VaultRun> {
  const at = new Date().toISOString();
  const key = address.toLowerCase();

  const last = lastRunPerVault.get(key);
  if (last && (Date.now() - last) / 1000 < config.minSecondsBetweenRuns) {
    return { vault: address, at, outcome: "skipped-cooldown" };
  }

  const vault = vaultContract(address);

  try {
    // A paused vault still lets compound() through, but there is no point paying
    // gas for a vault the owner has stopped.
    const paused = await vault.paused().catch(() => false);
    if (paused) return { vault: address, at, outcome: "skipped-paused" };

    const positionId: bigint = await vault.positionId();
    if (positionId === 0n) {
      return { vault: address, at, outcome: "skipped-no-fees", detail: "no position minted yet" };
    }

    await vault.compound.staticCall();

    if (config.dryRun || !wallet) {
      lastRunPerVault.set(key, Date.now());
      return { vault: address, at, outcome: "dry-run", detail: "simulation succeeded; DRY_RUN is on" };
    }

    const tx = await vault.compound();
    const receipt = await tx.wait();
    lastRunPerVault.set(key, Date.now());
    state.compounded += 1;
    return {
      vault: address,
      at,
      outcome: "compounded",
      txHash: tx.hash,
      gasUsed: receipt?.gasUsed?.toString(),
    };
  } catch (e: any) {
    const detail = (e?.shortMessage || e?.message || String(e)).slice(0, 200);
    state.errors += 1;
    state.lastError = `${address}: ${detail}`;
    return { vault: address, at, outcome: "error", detail };
  }
}

export async function runOnce(): Promise<VaultRun[]> {
  state.runs += 1;
  state.lastRunAt = new Date().toISOString();

  if (wallet) {
    const bal = await provider.getBalance(wallet.address).catch(() => null);
    state.keeperBalanceEth = bal === null ? null : (Number(bal) / 1e18).toFixed(6);
  }

  const gwei = await gasPriceGwei().catch(() => 0);
  if (gwei > config.maxGasPriceGwei) {
    const run: VaultRun = {
      vault: "*",
      at: new Date().toISOString(),
      outcome: "skipped-gas",
      detail: `gas ${gwei.toFixed(2)} gwei over cap ${config.maxGasPriceGwei}`,
    };
    record(run);
    console.log(`[keeper] skipping run — ${run.detail}`);
    return [run];
  }

  const results: VaultRun[] = [];
  // Sequential on purpose: one wallet, one nonce. Parallel sends would collide.
  for (const vault of config.vaults) {
    const run = await compoundOne(vault);
    results.push(run);
    record(run);
    console.log(`[keeper] ${run.outcome.padEnd(20)} ${run.vault}${run.detail ? ` — ${run.detail}` : ""}${run.txHash ? ` — ${run.txHash}` : ""}`);
  }
  return results;
}

export function startLoop(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runOnce();
    } catch (e: any) {
      state.errors += 1;
      state.lastError = e?.message ?? String(e);
      console.error("[keeper] run failed:", state.lastError);
    }
    if (!stopped) timer = setTimeout(tick, config.intervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
