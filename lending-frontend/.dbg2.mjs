import { Contract, JsonRpcProvider, Wallet, NonceManager, parseEther, formatUnits, parseUnits } from "ethers";
const p = new JsonRpcProvider("http://127.0.0.1:8546", 4663);
const w = new NonceManager(new Wallet("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", p)); // acct #6
const addr = await w.getAddress();
const WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", USDG="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ROUTER="0xD089eBB5609Dd1FE604E1f8ecd9B88Bd5d128713";
const SPCX_VAULT="0x4B198a43d666E61d49b508c16322d982913d11Ac";
const vaultAbi=["function token0() view returns (address)","function token1() view returns (address)","function fee() view returns (uint24)","function deposit(uint256,uint256,uint256,uint256) returns (uint256)","function positionLiquidity() view returns (uint128)","function totalSupply() view returns (uint256)","function tickLower() view returns (int24)","function tickUpper() view returns (int24)","function tokenId() view returns (uint256)"];
const erc=["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"];
const router=new Contract(ROUTER,["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"],w);
const weth=new Contract(WETH,[...erc,"function deposit() payable"],w);
const dl=()=>Math.floor(Date.now()/1000)+600;
const SPCX="0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa";

const v=new Contract(SPCX_VAULT,vaultAbi,p);
for (const f of ["tickLower","tickUpper","tokenId","positionLiquidity","totalSupply","fee"]) {
  try { console.log(" ", f, (await v[f]()).toString()); } catch { console.log(" ", f, "n/a"); }
}

const AMT=parseEther("0.05");
await (await weth.deposit({value:AMT})).wait();
await (await weth.approve(ROUTER, AMT)).wait();
await (await router.exactInputSingle({tokenIn:WETH,tokenOut:USDG,fee:500,recipient:addr,deadline:dl(),amountIn:AMT,amountOutMinimum:0,sqrtPriceLimitX96:0})).wait();
const usdg=new Contract(USDG,erc,w), st=new Contract(SPCX,erc,w);
const bal=BigInt(await usdg.balanceOf(addr));
await (await usdg.approve(ROUTER, bal)).wait();
await (await router.exactInputSingle({tokenIn:USDG,tokenOut:SPCX,fee:500,recipient:addr,deadline:dl(),amountIn:bal/2n,amountOutMinimum:0,sqrtPriceLimitX96:0})).wait();
const sBal=BigInt(await st.balanceOf(addr)), uBal=BigInt(await usdg.balanceOf(addr));
console.log("holdings SPCX", formatUnits(sBal,18), "USDG", formatUnits(uBal,6));
await (await st.approve(SPCX_VAULT, sBal)).wait();
await (await usdg.approve(SPCX_VAULT, uBal)).wait();
const vw = new Contract(SPCX_VAULT, vaultAbi, w);
for (const [a0,a1,tag] of [[sBal,uBal,"full"],[sBal/2n,uBal/2n,"half"],[sBal,0n,"stock only"],[0n,uBal,"usdg only"]]) {
  try { const sh = await vw.deposit.staticCall(a0,a1,0,0); console.log(`deposit ${tag}: OK shares=${formatUnits(sh,18)}`); }
  catch(e){ console.log(`deposit ${tag}: REVERT ${(e.shortMessage||e.message||"").slice(0,120)}`); }
}
