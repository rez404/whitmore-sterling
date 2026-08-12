function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got: ${v}`);
  return n;
}

function addressList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
  chainId: num("CHAIN_ID", 4663),
  keeperKey: process.env.KEEPER_PRIVATE_KEY ?? "",
  vaults: addressList("VAULTS"),

  intervalMs: num("COMPOUND_INTERVAL_MS", 60 * 60 * 1000),
  minSecondsBetweenRuns: num("MIN_SECONDS_BETWEEN_RUNS", 600),
  maxGasPriceGwei: num("MAX_GAS_PRICE_GWEI", 50),

  // Defaults to on. Sending real transactions has to be opted into explicitly,
  // so a misconfigured deploy burns nothing.
  dryRun: (process.env.DRY_RUN ?? "1") === "1",

  port: num("PORT", 8080),
};

export function assertRunnable() {
  const problems: string[] = [];
  if (config.vaults.length === 0) problems.push("VAULTS is empty — nothing to compound");
  if (!config.dryRun && !config.keeperKey) problems.push("KEEPER_PRIVATE_KEY is required unless DRY_RUN=1");
  if (problems.length) throw new Error(problems.join("; "));
}

export { required };
