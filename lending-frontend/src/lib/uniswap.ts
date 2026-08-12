import { Contract, solidityPacked, type Signer } from "ethers";
import { provider } from "./chain";

/**
 * Direct Uniswap V3 integration.
 *
 * Verified on Robinhood Chain (4663) on 2026-08-12: each address below was
 * checked to report `factory() == UNISWAP.factory`, and the quoter was
 * exercised against the live AAPL/USDG pool. The deployed router is the
 * original SwapRouter (selector 0x414bf389), so `exactInputSingle` takes a
 * deadline — SwapRouter02's shape would revert here.
 */
export const UNISWAP = {
  factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  router: "0xD089eBB5609Dd1FE604E1f8ecd9B88Bd5d128713",
  quoter: "0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098",
  weth9: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  feeTiers: [500, 3000, 10000] as const,
};

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
];

export const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
];

export type Quote = {
  amountOut: bigint;
  /** Single-hop fee tier, or null when the route goes through WETH. */
  fee: number | null;
  /** Encoded multi-hop path, present only for two-hop routes. */
  path?: string;
  /** Human-readable hop list for the UI. */
  hops: string[];
  /** Execution price vs marginal price, as a fraction (0.004 = 0.4%). */
  priceImpact: number | null;
};

const quoter = new Contract(UNISWAP.quoter, QUOTER_ABI, provider);

const retry = async <T,>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let last: any;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const m = `${e?.shortMessage || ""} ${e?.message || ""}`;
      // Only a throttled read is worth repeating; a revert means "no pool here".
      if (!m.includes("429") && !m.includes("Too Many Requests")) throw e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last;
};

const single = async (tokenIn: string, tokenOut: string, amountIn: bigint, fee: number) => {
  try {
    const r = await retry(() =>
      quoter.quoteExactInputSingle.staticCall({ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0 }),
    );
    return BigInt(r[0]);
  } catch {
    return null;
  }
};

const multi = async (path: string, amountIn: bigint) => {
  try {
    const r = await retry(() => quoter.quoteExactInput.staticCall(path, amountIn));
    return BigInt(r[0]);
  } catch {
    return null;
  }
};

const encodePath = (a: string, feeA: number, mid: string, feeB: number, b: string) =>
  solidityPacked(["address", "uint24", "address", "uint24", "address"], [a, feeA, mid, feeB, b]);

/**
 * Best execution across fee tiers, falling back to a WETH hop when no direct
 * pool holds liquidity. Price impact is measured properly: a tiny reference
 * trade gives the marginal rate, and the real quote is compared against it.
 */
export async function quoteBest(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  tokenInSymbol = "IN",
  tokenOutSymbol = "OUT",
): Promise<Quote | null> {
  if (amountIn <= 0n) return null;

  const direct = await Promise.all(UNISWAP.feeTiers.map((f) => single(tokenIn, tokenOut, amountIn, f)));
  let best: { out: bigint; fee: number | null; path?: string; hops: string[] } | null = null;

  direct.forEach((out, i) => {
    if (out != null && out > 0n && (!best || out > best.out)) {
      best = { out, fee: UNISWAP.feeTiers[i], hops: [tokenInSymbol, tokenOutSymbol] };
    }
  });

  // No direct pool with depth — hop through a base asset. Which one depends on
  // the pair: an ETH-in trade has to route via USDG, a USDG-in trade via WETH.
  if (!best) {
    const lower = [tokenIn.toLowerCase(), tokenOut.toLowerCase()];
    const bases = [
      { addr: UNISWAP.weth9, symbol: "WETH" },
      { addr: UNISWAP.usdg, symbol: "USDG" },
    ].filter((b) => !lower.includes(b.addr.toLowerCase()));

    const attempts: { path: string; symbol: string }[] = [];
    for (const base of bases) {
      for (const a of UNISWAP.feeTiers) {
        for (const b of UNISWAP.feeTiers) {
          attempts.push({ path: encodePath(tokenIn, a, base.addr, b, tokenOut), symbol: base.symbol });
        }
      }
    }

    const results = await Promise.all(
      attempts.map(async ({ path, symbol }) => {
        const out = await multi(path, amountIn);
        return out && out > 0n ? { out, path, symbol } : null;
      }),
    );
    for (const r of results) {
      if (r && (!best || r.out > best.out)) {
        best = { out: r.out, fee: null, path: r.path, hops: [tokenInSymbol, r.symbol, tokenOutSymbol] };
      }
    }
  }

  if (!best) return null;
  const chosen = best as { out: bigint; fee: number | null; path?: string; hops: string[] };

  // Marginal rate from a 1/1000th reference trade, used only to size impact.
  let priceImpact: number | null = null;
  const ref = amountIn / 1000n;
  if (ref > 0n) {
    const refOut =
      chosen.fee != null ? await single(tokenIn, tokenOut, ref, chosen.fee) : await multi(chosen.path!, ref);
    if (refOut && refOut > 0n) {
      const marginal = Number(refOut) / Number(ref);
      const actual = Number(chosen.out) / Number(amountIn);
      if (marginal > 0) priceImpact = Math.max(0, (marginal - actual) / marginal);
    }
  }

  return { amountOut: chosen.out, fee: chosen.fee, path: chosen.path, hops: chosen.hops, priceImpact };
}

/** Gas headroom kept aside so a native-ETH trade never spends the fee money. */
export const GAS_BUFFER_WEI = 10n ** 15n; // 0.001 ETH

/** Slippage floor applied to a quote. `bps` is basis points, e.g. 100 = 1%. */
export const minOut = (amountOut: bigint, bps = 100) => (amountOut * BigInt(10_000 - bps)) / 10_000n;

/** Builds and sends the swap. Native ETH is passed as value with WETH9 as tokenIn. */
export async function executeSwap(
  signer: Signer,
  {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMinimum,
    recipient,
    quote,
    isNative,
  }: {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    amountOutMinimum: bigint;
    recipient: string;
    quote: Quote;
    isNative: boolean;
  },
) {
  const router = new Contract(UNISWAP.router, ROUTER_ABI, signer);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const value = isNative ? amountIn : 0n;

  if (quote.fee != null) {
    const params = {
      tokenIn,
      tokenOut,
      fee: quote.fee,
      recipient,
      deadline,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };
    await router.exactInputSingle.staticCall(params, { value });
    return router.exactInputSingle(params, { value });
  }

  const params = { path: quote.path!, recipient, deadline, amountIn, amountOutMinimum };
  await router.exactInput.staticCall(params, { value });
  return router.exactInput(params, { value });
}

/* --------------------------- full-range LP sizing -------------------------- */

const POOL_SLOT0_ABI = ["function slot0() view returns (uint160 sqrtPriceX96,int24,uint16,uint16,uint16,uint32,bool)"];
const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const Q192 = 2n ** 192n;

/**
 * How much of each side a full-range position will actually consume.
 *
 * For a position spanning the whole curve the required ratio is just the pool
 * price: `amount1 = amount0 * P`. Whichever side is short binds, and the surplus
 * on the other side is refunded. Knowing this up front is what lets us set real
 * slippage floors instead of passing zero and hoping.
 */
export async function fullRangeAmounts(
  token0: string,
  token1: string,
  fee: number,
  amount0Desired: bigint,
  amount1Desired: bigint,
): Promise<{ amount0: bigint; amount1: bigint } | null> {
  try {
    const factory = new Contract(UNISWAP.factory, FACTORY_ABI, provider);
    const poolAddress: string = await factory.getPool(token0, token1, fee);
    if (!poolAddress || poolAddress === "0x0000000000000000000000000000000000000000") return null;

    const [sqrtPriceX96] = await new Contract(poolAddress, POOL_SLOT0_ABI, provider).slot0();
    const sqrtP = BigInt(sqrtPriceX96);
    if (sqrtP === 0n) return null;

    // amount1 implied by the whole of amount0, at the current price.
    const impliedAmount1 = (amount0Desired * sqrtP * sqrtP) / Q192;

    if (impliedAmount1 <= amount1Desired) {
      // token0 is the binding side; part of token1 comes back.
      return { amount0: amount0Desired, amount1: impliedAmount1 };
    }
    // token1 binds instead.
    const impliedAmount0 = (amount1Desired * Q192) / (sqrtP * sqrtP);
    return { amount0: impliedAmount0, amount1: amount1Desired };
  } catch {
    return null;
  }
}

/** Slippage floor for a pair of amounts. `bps` is basis points, 100 = 1%. */
export function minAmounts(expected: { amount0: bigint; amount1: bigint }, bps = 100) {
  return {
    amount0Min: (expected.amount0 * BigInt(10_000 - bps)) / 10_000n,
    amount1Min: (expected.amount1 * BigInt(10_000 - bps)) / 10_000n,
  };
}

/* ----------------------------------- zap ---------------------------------- */

export type ZapLeg = {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
};

/**
 * Swap legs that turn a single asset into both sides of a pair.
 *
 * A full-range position wants equal value on each side, so the input is split down
 * the middle by value. Whatever the split misses is refunded by the zap contract,
 * which is why an approximate split is safe here — the alternative, solving the
 * ratio exactly against a moving price, would be wrong by the time it lands.
 */
export async function buildZapLegs(
  tokenIn: string,
  amountIn: bigint,
  pair: { token0: string; token1: string; feeTier: number },
  slippageBps = 100,
): Promise<ZapLeg[] | null> {
  if (amountIn <= 0n) return null;
  const lower = tokenIn.toLowerCase();
  const isToken0 = lower === pair.token0.toLowerCase();
  const isToken1 = lower === pair.token1.toLowerCase();

  const floor = (out: bigint) => (out * BigInt(10_000 - slippageBps)) / 10_000n;

  const leg = async (from: string, to: string, amount: bigint): Promise<ZapLeg | null> => {
    const quote = await quoteBest(from, to, amount);
    if (!quote || quote.fee == null) return null; // the zap only routes single hops
    return { tokenIn: from, tokenOut: to, fee: quote.fee, amountIn: amount, amountOutMinimum: floor(quote.amountOut) };
  };

  if (isToken0 || isToken1) {
    // Already holding one side — swap half into the other.
    const other = isToken0 ? pair.token1 : pair.token0;
    const half = amountIn / 2n;
    const one = await leg(tokenIn, other, half);
    return one ? [one] : null;
  }

  // Foreign asset: split it across both sides.
  const half = amountIn / 2n;
  const [a, b] = await Promise.all([leg(tokenIn, pair.token0, half), leg(tokenIn, pair.token1, amountIn - half)]);
  return a && b ? [a, b] : null;
}
