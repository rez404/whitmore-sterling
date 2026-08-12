import { Contract, JsonRpcProvider, Wallet, parseEther, formatUnits, solidityPacked } from "ethers";
import { readFileSync } from "node:fs";

const RPC = "http://127.0.0.1:8546";
const p = new JsonRpcProvider(RPC, 4663);
// anvil's first default account
const w = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", p);

const QUOTER = "0x5dEdB1F91F5F56177BB4D193aD281b33e4f13098";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const LP_ZAP = "0x5C59FEaB45B737491A43107f3bD34bb8753Bf2A0";
const TIERS = [500, 3000, 10000];

const q = new Contract(QUOTER, ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)"], p);
const zap = new Contract(LP_ZAP, ["function zapIn(address vault,address tokenIn,uint256 amountIn,(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 amountOutMinimum)[] legs,uint256 amount0Min,uint256 amount1Min) payable returns (uint256 shares)"], w);
const vaultAbi = ["function token0() view returns (address)","function token1() view returns (address)","function balanceOf(address) view returns (uint256)"];

const single = async (a,b,amt,f) => { try { const r = await q.quoteExactInputSingle.staticCall({tokenIn:a,tokenOut:b,amountIn:amt,fee:f,sqrtPriceLimitX96:0}); return BigInt(r[0]); } catch { return null; } };
const best = async (a,b,amt) => {
  let out = null;
  for (const f of TIERS) { const o = await single(a,b,amt,f); if (o != null && o > 0n && (!out || o > out.out)) out = { out: o, fee: f }; }
  return out;
};
const floor = (o) => (o * 9900n) / 10000n;
const leg = async (from,to,amount) => { const b = await best(from,to,amount); return b ? { tokenIn: from, tokenOut: to, fee: b.fee, amountIn: amount, amountOutMinimum: floor(b.out) } : null; };

// mirrors buildZapLegs
async function buildZapLegs(tokenIn, amountIn, pair) {
  const lower = tokenIn.toLowerCase();
  const isT0 = lower === pair.token0.toLowerCase(), isT1 = lower === pair.token1.toLowerCase();
  if (isT0 || isT1) { const other = isT0 ? pair.token1 : pair.token0; const one = await leg(tokenIn, other, amountIn/2n); return one ? [one] : null; }
  const half = amountIn/2n;
  const [a,b] = await Promise.all([leg(tokenIn, pair.token0, half), leg(tokenIn, pair.token1, amountIn-half)]);
  if (a && b) return [a,b];
  for (const [hub, other] of [[pair.token0, pair.token1],[pair.token1, pair.token0]]) {
    const first = await leg(tokenIn, hub, amountIn);
    if (!first) continue;
    const bridge = first.amountOutMinimum / 2n;
    if (bridge === 0n) continue;
    const second = await leg(hub, other, bridge);
    if (second) return [first, second];
  }
  return null;
}

const VAULTS = { SPCX:"0x4B198a43d666E61d49b508c16322d982913d11Ac", MSFT:"0xAa64420b06aF7753dab3c6b34409AC8cfa791941", NVDA:"0x6F5113b8FFC2c78A33731c431Eb3A52B7A2bbafb" };
const AMOUNT = parseEther("0.05");

for (const [sym, vault] of Object.entries(VAULTS)) {
  const v = new Contract(vault, vaultAbi, p);
  const [t0, t1] = await Promise.all([v.token0(), v.token1()]);
  const legs = await buildZapLegs(WETH, AMOUNT, { token0: t0, token1: t1 });
  if (!legs) { console.log(`${sym.padEnd(5)} NO ROUTE`); continue; }
  const plan = legs.map(l => `${l.tokenIn.slice(0,6)}->${l.tokenOut.slice(0,6)}@${l.fee/10000}%`).join(" , ");
  try {
    const before = BigInt(await v.balanceOf(w.address));
    const tx = await zap.zapIn(vault, WETH, AMOUNT, legs, 0n, 0n, { value: AMOUNT });
    const rc = await tx.wait();
    const after = BigInt(await v.balanceOf(w.address));
    console.log(`${sym.padEnd(5)} OK  legs=${legs.length}  shares=${formatUnits(after-before,18).slice(0,10)}  gas=${rc.gasUsed}  [${plan}]`);
  } catch (e) {
    console.log(`${sym.padEnd(5)} FAIL ${(e.shortMessage||e.message||"").slice(0,110)}  [${plan}]`);
  }
}
