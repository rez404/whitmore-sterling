import { MARKETS, USDG_ADDRESS } from "./markets";

/* ============================================================================
   DEPLOY EDİLDİKTEN SONRA DOLDURULACAK ADRESLER
   Bu dosya tek konfigürasyon noktasıdır. Aşağıdaki üç sabiti ve LP kasası
   adreslerini doldurup frontend'i yeniden derlemek, ilgili sayfaları canlıya
   almak için yeterlidir. Başka hiçbir dosyaya dokunmaya gerek yoktur.
   ========================================================================== */

/** WhitmoreToken ($STERLING) — Stake sayfasında yatırılan varlık. */
export const PLATFORM_TOKEN = "";

/** MultiRewardStaking — boş bırakılırsa Stake sayfası "canlı değil" gösterir. */
export const STAKING_VAULT = "";

/** LpZap — boş bırakılırsa Farms sayfasındaki "One token" sekmesi devre dışı kalır. */
export const LP_ZAP = "";

/**
 * Deploy edilen StockLpVault adresleri, sembol bazında.
 * Örnek:  AAPL: "0x1234…", NVDA: "0x5678…"
 * Listede olmayan sembol, arayüzde "Pending" görünür ve yatırım kabul etmez.
 */
export const VAULT_ADDRESSES: Record<string, string> = {};

/* ============================================================================
   Doğrulanmış zincir adresleri — değiştirmeye gerek yok
   ========================================================================== */

// 2026-08-12'de zincirde doğrulandı. Daha önce burada duran Sushi V3 fabrikasının
// bu zincirde hiç havuzu yok; tüm RWA çiftleri Uniswap'te işlem görüyor.
export const UNISWAP_V3 = {
  positionManager: "0xC00BABBB20630974345EeA9f57d8F2FDEb81226B",
  factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  weth9: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  // Listelenen RWA/USDG havuzları %0.05 ve %0.30'da en derin; Farms sayfası
  // gerçek kademeyi havuz kontratından okur, bu yalnızca varsayılandır.
  feeTier: 3000,
};

export type VaultPool = {
  symbol: string;
  name: string;
  vault: string; // VAULT_ADDRESSES'ten gelir; boşsa kasa henüz canlı değil
  token0: string;
  token1: string;
  stock: string;
  usdg: string;
  feeTier: number;
};

/** Her Robinhood hisse tokenı / USDG çifti için bir LP kasası girişi. */
export const LP_VAULTS: VaultPool[] = MARKETS.map((m) => {
  const a = m.token.toLowerCase();
  const b = USDG_ADDRESS.toLowerCase();
  const [token0, token1] = a < b ? [m.token, USDG_ADDRESS] : [USDG_ADDRESS, m.token];
  return {
    symbol: m.symbol,
    name: m.name,
    vault: VAULT_ADDRESSES[m.symbol] ?? "",
    token0,
    token1,
    stock: m.token,
    usdg: USDG_ADDRESS,
    feeTier: UNISWAP_V3.feeTier,
  };
});
