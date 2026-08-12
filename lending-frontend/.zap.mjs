import { Contract, JsonRpcProvider, parseEther, formatUnits } from "ethers";
import { readFileSync } from "node:fs";
const src = readFileSync("src/markets.ts", "utf8");
const want = ["SPCX","SPY","NVDA","AAPL","TSLA","MSFT","USO","INTC","SNDK"];
const markets = {};
for (const s of want) {
  const re = new RegExp(`"symbol":\\s*"${s}"[\\s\\S]*?"token":\\s*"(0x[0-9a-fA-F]{40})"`);
  const m = src.match(re); if (m) markets[s] = m[1];
}
const p = new JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com", 4663);
const QUOTER = "0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const abi = ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)"];
const q = new Contract(QUOTER, abi, p);
const TIERS = [500, 3000, 10000];
const amount = parseEther("0.05");

const probe = async (a, b, dec) => {
  const row = [];
  for (const f of TIERS) {
    try { const r = await q.quoteExactInputSingle.staticCall({tokenIn:a,tokenOut:b,amountIn:amount,fee:f,sqrtPriceLimitX96:0}); row.push(`${f/10000}%:${Number(formatUnits(r[0],dec)).toFixed(4)}`); }
    catch { row.push(`${f/10000}%:—`); }
  }
  return row.join("  ");
};
console.log("WETH->USDG".padEnd(14), await probe(WETH, USDG, 6));
for (const [sym, t] of Object.entries(markets)) console.log(`WETH->${sym}`.padEnd(14), await probe(WETH, t, 18));
