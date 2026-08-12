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
