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
export const LP_ZAP = "0x5C59FEaB45B737491A43107f3bD34bb8753Bf2A0";

/**
 * Deploy edilen StockLpVault adresleri, sembol bazında.
 * Örnek:  AAPL: "0x1234…", NVDA: "0x5678…"
 * Listede olmayan sembol, arayüzde "Pending" görünür ve yatırım kabul etmez.
 */
export const VAULT_ADDRESSES: Record<string, string> = {
  SPCX: "0x4B198a43d666E61d49b508c16322d982913d11Ac",
  SPY: "0x0a7EF648648d1b1735Dcfc888d3c6952DDa05e0C",
  NVDA: "0x6F5113b8FFC2c78A33731c431Eb3A52B7A2bbafb",
  USO: "0xcce7D3a9251CE143B07A3321732cAD4dF3f08d7a",
  AAPL: "0xE333F9782970462a66199392Ef1def04004463D4",
  TSLA: "0x51db84AC2F8b89087124b735A2E6FB9309650B02",
};

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
