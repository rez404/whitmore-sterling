import { formatUnits } from "ethers";
import { CHAIN } from "./chain";

export const usd = (v?: bigint, digits = 2, decimals = 18) =>
  v == null
    ? "—"
    : Number(formatUnits(v, decimals)).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
      });

export const amt = (v?: bigint, digits = 4, decimals = 18) =>
  v == null ? "—" : Number(formatUnits(v, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });

/**
 * Abbreviated figure — 4,416,203 becomes "4.42M".
 *
 * A phone gives a stat column about 160px. A seven-figure number does not fit at
 * headline size, and truncating it ("$4,416,2…") is worse than rounding it: the
 * magnitude is the thing being read at that size, and the exact figure is one
 * breakpoint away.
 */
export const compactNum = (v: number, currency = true) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
    ...(currency ? { style: "currency" as const, currency: "USD" } : {}),
  }).format(v);

/**
 * An amount that never renders a non-zero balance as "0".
 *
 * Vault shares are Uniswap liquidity units carried on an 18-decimal ERC-20, so a
 * real position reads as 0.000000235. Fixed decimal places round that to "0" and
 * tell a depositor their money is gone. Significant digits keep the figure honest
 * at any magnitude.
 */
export const amtSig = (v?: bigint | null, decimals = 18, sig = 4) => {
  if (v == null) return "—";
  const n = Number(formatUnits(v, decimals));
  if (n === 0) return "0";
  return n.toLocaleString(undefined, n >= 1 ? { maximumFractionDigits: sig } : { maximumSignificantDigits: sig });
};

/** A chain amount as a plain number, for components that do their own formatting. */
export const num = (v?: bigint | null, decimals = 18) => (v == null ? null : Number(formatUnits(v, decimals)));

export const short = (a = "") => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const pct = (bps?: bigint | number) => (bps == null ? "—" : `${(Number(bps) / 100).toFixed(2)}%`);

export const priceFmt = (value?: number) =>
  value == null || Number.isNaN(value)
    ? "—"
    : value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value >= 100 ? 2 : value >= 1 ? 3 : 6,
      });

export const explorer = (hash: string, type: "address" | "tx" = hash.length > 42 ? "tx" : "address") =>
  `${CHAIN.explorer}/${type}/${hash}`;

export const positiveDelta = (value: bigint, basis: bigint) => (value > basis ? value - basis : 0n);

/** Health-factor colour band shared by every surface that renders one. */
export function hfTone(health: string): "good" | "warn" | "bad" | undefined {
  if (health === "∞" || health === "—") return undefined;
  const n = Number(health);
  if (Number.isNaN(n)) return undefined;
  if (n < 1.1) return "bad";
  if (n < 1.5) return "warn";
  return "good";
}

/** Relative age of an oracle answer, e.g. "3m ago". Feeds are the ground truth for
 *  risk, so how fresh one is matters more than the exact timestamp. */
export function timeAgo(unixSeconds?: number): string {
  if (!unixSeconds) return "—";
  const s = Math.max(Math.floor(Date.now() / 1000) - unixSeconds, 0);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
