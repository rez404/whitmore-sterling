import { Contract, JsonRpcProvider, Wallet, parseEther, formatUnits } from "ethers";
const p = new JsonRpcProvider("http://127.0.0.1:8546", 4663);
// account #3, untouched
const w = new Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", p);
const WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", USDG="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ROUTER="0xD089eBB5609Dd1FE604E1f8ecd9B88Bd5d128713";
const SPCX_VAULT="0x4B198a43d666E61d49b508c16322d982913d11Ac";
const vaultAbi=["function token0() view returns (address)","function token1() view returns (address)","function fee() view returns (uint24)","function deposit(uint256,uint256,uint256,uint256) returns (uint256)"];
const erc=["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)","function decimals() view returns (uint8)"];
const router=new Contract(ROUTER,["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"],w);
const weth=new Contract(WETH,[...erc,"function deposit() payable"],w);
const dl=()=>Math.floor(Date.now()/1000)+600;

const v=new Contract(SPCX_VAULT,vaultAbi,p);
const [t0,t1]=await Promise.all([v.token0(),v.token1()]);
const spcx = t0.toLowerCase()===USDG.toLowerCase()? t1 : t0;
console.log("token0",t0,"token1",t1,"spcx",spcx);

const AMT=parseEther("0.05");
await (await weth.deposit({value:AMT})).wait();
await (await weth.approve(ROUTER, AMT)).wait();
await (await router.exactInputSingle({tokenIn:WETH,tokenOut:USDG,fee:500,recipient:w.address,deadline:dl(),amountIn:AMT,amountOutMinimum:0,sqrtPriceLimitX96:0})).wait();
const usdg=new Contract(USDG,erc,w);
const bal=BigInt(await usdg.balanceOf(w.address));
console.log("USDG balance", formatUnits(bal,6));

const half = bal/2n;
await (await usdg.approve(ROUTER, bal)).wait();
for (const f of [500,3000,10000]) {
  try { const o=await router.exactInputSingle.staticCall({tokenIn:USDG,tokenOut:spcx,fee:f,recipient:w.address,deadline:dl(),amountIn:half,amountOutMinimum:0,sqrtPriceLimitX96:0}); console.log(`  USDG->SPCX @${f/10000}%:`, formatUnits(o,18)); }
  catch(e){ console.log(`  USDG->SPCX @${f/10000}%: REVERT`, (e.shortMessage||"").slice(0,60)); }
}
// perform the swap at 0.05%, then try the vault deposit
await (await router.exactInputSingle({tokenIn:USDG,tokenOut:spcx,fee:500,recipient:w.address,deadline:dl(),amountIn:half,amountOutMinimum:0,sqrtPriceLimitX96:0})).wait();
const st=new Contract(spcx,erc,w);
const sBal=BigInt(await st.balanceOf(w.address)), uBal=BigInt(await usdg.balanceOf(w.address));
console.log("holdings: SPCX", formatUnits(sBal,18), " USDG", formatUnits(uBal,6));
await (await st.approve(SPCX_VAULT, sBal)).wait();
await (await usdg.approve(SPCX_VAULT, uBal)).wait();
const a0 = t0.toLowerCase()===USDG.toLowerCase()? uBal : sBal;
const a1 = t0.toLowerCase()===USDG.toLowerCase()? sBal : uBal;
try { const sh = await new Contract(SPCX_VAULT, vaultAbi, w).deposit.staticCall(a0,a1,0,0); console.log("vault.deposit OK shares", formatUnits(sh,18)); }
catch(e){ console.log("vault.deposit REVERT:", (e.shortMessage||e.message||"").slice(0,160)); }
