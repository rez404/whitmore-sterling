import { MARKETS, USDG_ADDRESS } from "./markets";

/* ============================================================================
   DEPLOY EDİLDİKTEN SONRA DOLDURULACAK ADRESLER
   Bu dosya tek konfigürasyon noktasıdır. Aşağıdaki üç sabiti ve LP kasası
   adreslerini doldurup frontend'i yeniden derlemek, ilgili sayfaları canlıya
   almak için yeterlidir. Başka hiçbir dosyaya dokunmaya gerek yoktur.
   ========================================================================== */

/**
 * WhitmoreToken ($STERLING) — Stake sayfasında yatırılan varlık.
 * Zincirde doğrulandı 2026-08-12: "Sterling", 18 ondalık, 1.000.000.000 sabit
 * arz, transferde kesinti yok (staking muhasebesi için şart — stakingToken
 * kontratta immutable, yanlış token bağlanırsa geri dönüşü yok).
 *
 * DİKKAT: aynı sembolle ikinci bir deploy daha var (0xbE46…4a3E, "Whitmore
 * Sterling"). Kullanılan bu değil.
 */
export const PLATFORM_TOKEN = "0xAEE5405B417C1825c29DcAa770ab3A4eE3eeC798";

/** MultiRewardStaking — boş bırakılırsa Stake sayfası "canlı değil" gösterir. */
export const STAKING_VAULT = "0xfAD7a60a648fab6ab7a32c703F583344Dc662a4c";

/** LpZap — boş bırakılırsa Farms sayfasındaki "One token" sekmesi devre dışı kalır. */
export const LP_ZAP = "0x5C59FEaB45B737491A43107f3bD34bb8753Bf2A0";

/**
 * Deploy edilen StockLpVault adresleri, sembol bazında.
 * Örnek:  AAPL: "0x1234…", NVDA: "0x5678…"
 * Listede olmayan sembol, arayüzde "Pending" görünür ve yatırım kabul etmez.
 */
export const VAULT_ADDRESSES: Record<string, string> = {
  SPCX: "0xf9c517C9b9e1852DacF7f732Ebcd8D8f46C8940d",
  SPY: "0x12a02057327c7a9DCe8106833dDAFf8fF50EF60A",
  NVDA: "0xe42F4E69a76fdf4b13A7147B415A925DAe79e692",
  USO: "0x2c54D7b389bB8acac0703952619ac6053BB70DA6",
  AAPL: "0x76F67a97d5d14b083145669E042Eb87554F83C62",
  TSLA: "0xFd01aDBC9475A5a8E60dc15F8F1ff9F30183748b",
  INTC: "0x76f3A4bE7de531b36E0c49739F40BDdC8Ca327B5",
  SNDK: "0xeEd07c736984b64BB12048E794c56e98e1dB2771",
  MSFT: "0x9b803e78eCb8348077ccAd6f0DCf4389D4E2438D",
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
