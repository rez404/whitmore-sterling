import { MARKETS, USDG_ADDRESS } from "./markets";

// ---- Fill these in after deploying the contracts. Empty string = "Launching soon" in the UI. ----
export const PLATFORM_TOKEN = "";   // WhitmoreToken address
export const PARTNER_TOKEN = "";    // partner reward token (set when a partner is live)
export const STAKING_POOL = "";     // StakingRewards address (Page 2)

export const SUSHI_V3 = {
  positionManager: "0x51d0e5188afe12d502e29d982d20c190e7816107",
  factory: "0xe51960f1b45f1c9fb6d166e6a884f866fc70433b",
  weth9: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  feeTier: 3000,
};

export type VaultPool = {
  symbol: string;
  name: string;
  vault: string;   // StockLpVault address — filled in per pool after deploy
  token0: string;  // sorted (token0 < token1)
  token1: string;
  stock: string;
  usdg: string;
  feeTier: number;
};

// One LP vault per Robinhood stock-token / USDG pair. Deposit both tokens, earn trading fees from volume.
export const LP_VAULTS: VaultPool[] = MARKETS.map((m) => {
  const a = m.token.toLowerCase();
  const b = USDG_ADDRESS.toLowerCase();
  const [token0, token1] = a < b ? [m.token, USDG_ADDRESS] : [USDG_ADDRESS, m.token];
  return { symbol: m.symbol, name: m.name, vault: "", token0, token1, stock: m.token, usdg: USDG_ADDRESS, feeTier: SUSHI_V3.feeTier };
});
