/**
 * Spot USD prices for tokens that have no Chainlink feed — partner memecoins, in
 * practice. Sourced from DexScreener, which indexes the Uniswap pools on this
 * chain under the `robinhood` slug.
 *
 * These are DEX marks, not oracle prices. They are fine for showing what a
 * reward is worth; they are deliberately NOT used anywhere risk depends on a
 * price, which stays on the Chainlink feeds.
 */
const ENDPOINT = "https://api.dexscreener.com/tokens/v1/robinhood";

export type UsdPrices = Record<string, number>;

export async function fetchUsdPrices(addresses: string[]): Promise<UsdPrices> {
  const unique = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  if (unique.length === 0) return {};

  try {
    const res = await fetch(`${ENDPOINT}/${unique.join(",")}`);
    if (!res.ok) return {};
    const pairs = (await res.json()) as any[];
    if (!Array.isArray(pairs)) return {};

    // A token can trade in several pools. Take the mark from the deepest one —
    // a thin pool's price is noise.
    const best: Record<string, { price: number; liquidity: number }> = {};
    const consider = (addr: string | undefined, price: number, liquidity: number) => {
      if (!addr || !Number.isFinite(price) || price <= 0) return;
      const key = addr.toLowerCase();
      if (!best[key] || liquidity > best[key].liquidity) best[key] = { price, liquidity };
    };

    for (const p of pairs) {
      const liquidity = Number(p?.liquidity?.usd ?? 0);
      const baseUsd = Number(p?.priceUsd);
      consider(p?.baseToken?.address, baseUsd, liquidity);

      // The quote side needs deriving. WETH and USDG are almost always quoted
      // against, never quoted — reading only `baseToken` left them with no price
      // at all, which is why a WETH reward showed a blank mark. `priceNative` is
      // the base priced in the quote, so base-in-USD ÷ that is the quote in USD.
      const perQuote = Number(p?.priceNative);
      if (Number.isFinite(perQuote) && perQuote > 0) {
        consider(p?.quoteToken?.address, baseUsd / perQuote, liquidity);
      }
    }

    const out: UsdPrices = {};
    for (const [addr, v] of Object.entries(best)) out[addr] = v.price;
    return out;
  } catch {
    return {};
  }
}

/** USD value of a raw token amount, or null when no price is known. */
export function usdValue(amount: bigint, decimals: number, price?: number): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return (Number(amount) / 10 ** decimals) * price;
}

/* ------------------------------ pair analytics ----------------------------- */

export type PairStats = {
  pairAddress: string;
  dexId: string;
  url: string;
  priceUsd: number;
  priceChangeH24: number | null;
  liquidityUsd: number;
  liquidityBase: number;
  liquidityQuote: number;
  volume: { m5: number; h1: number; h6: number; h24: number };
  buys24: number;
  sells24: number;
};

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Deepest pool for `token` quoted in `quoteSymbol`, with the analytics the pair
 * page shows. Depth decides which pool is canonical — a thin pool's price and
 * volume are not representative of where the pair actually trades.
 */
export async function fetchPairStats(token: string, quoteSymbol = "USDG"): Promise<PairStats | null> {
  try {
    const res = await fetch(`${ENDPOINT}/${token.toLowerCase()}`);
    if (!res.ok) return null;
    const pairs = (await res.json()) as any[];
    if (!Array.isArray(pairs)) return null;

    const candidates = pairs.filter(
      (p) => p?.quoteToken?.symbol?.toUpperCase() === quoteSymbol.toUpperCase() && num(p?.liquidity?.usd) > 0,
    );
    if (candidates.length === 0) return null;
    const p = candidates.reduce((a, b) => (num(b?.liquidity?.usd) > num(a?.liquidity?.usd) ? b : a));

    return {
      pairAddress: p.pairAddress,
      dexId: p.dexId ?? "",
      url: p.url ?? "",
      priceUsd: num(p.priceUsd),
      priceChangeH24: p?.priceChange?.h24 == null ? null : num(p.priceChange.h24),
      liquidityUsd: num(p?.liquidity?.usd),
      liquidityBase: num(p?.liquidity?.base),
      liquidityQuote: num(p?.liquidity?.quote),
      volume: {
        m5: num(p?.volume?.m5),
        h1: num(p?.volume?.h1),
        h6: num(p?.volume?.h6),
        h24: num(p?.volume?.h24),
      },
      buys24: num(p?.txns?.h24?.buys),
      sells24: num(p?.txns?.h24?.sells),
    };
  } catch {
    return null;
  }
}

/**
 * Fee yield annualised from the last 24 hours. Deliberately returned alongside
 * the window it came from — volume is volatile and one day is not a forecast.
 */
export function feeApr(volume24h: number, feeTier: number, tvlUsd: number): number | null {
  if (!tvlUsd || tvlUsd <= 0) return null;
  return ((volume24h * feeTier) / tvlUsd) * 365 * 100;
}

/** Batched variant — DexScreener accepts up to 30 addresses per request. */
export async function fetchPairStatsBatch(
  tokens: string[],
  quoteSymbol = "USDG",
): Promise<Record<string, PairStats>> {
  const unique = [...new Set(tokens.filter(Boolean).map((t) => t.toLowerCase()))];
  const out: Record<string, PairStats> = {};
  const CHUNK = 30;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${ENDPOINT}/${slice.join(",")}`);
      if (!res.ok) continue;
      const pairs = (await res.json()) as any[];
      if (!Array.isArray(pairs)) continue;

      for (const p of pairs) {
        const base = p?.baseToken?.address?.toLowerCase();
        if (!base || p?.quoteToken?.symbol?.toUpperCase() !== quoteSymbol.toUpperCase()) continue;
        const liq = num(p?.liquidity?.usd);
        if (liq <= 0) continue;
        if (out[base] && out[base].liquidityUsd >= liq) continue;
        out[base] = {
          pairAddress: p.pairAddress,
          dexId: p.dexId ?? "",
          url: p.url ?? "",
          priceUsd: num(p.priceUsd),
          priceChangeH24: p?.priceChange?.h24 == null ? null : num(p.priceChange.h24),
          liquidityUsd: liq,
          liquidityBase: num(p?.liquidity?.base),
          liquidityQuote: num(p?.liquidity?.quote),
          volume: { m5: num(p?.volume?.m5), h1: num(p?.volume?.h1), h6: num(p?.volume?.h6), h24: num(p?.volume?.h24) },
          buys24: num(p?.txns?.h24?.buys),
          sells24: num(p?.txns?.h24?.sells),
        };
      }
    } catch {
      /* leave this chunk out */
    }
  }
  return out;
}
