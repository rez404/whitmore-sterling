import { Contract, JsonRpcProvider } from "ethers";
import { LENDING_POOL_ADDRESS, USDG_ADDRESS } from "../markets";

export const CHAIN = {
  id: 4663n,
  hex: "0x1237",
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
};

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

export const FEED_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

export const POOL_ABI = [
  "function owner() view returns (address)",
  "function debtAsset() view returns (address)",
  "function markets(address) view returns (bool listed,uint16 collateralFactorBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint64 maxStaleness,address priceFeed,uint256 borrowCap,uint256 supplyCap,uint256 totalBorrowed,uint256 totalCollateral,bool paused,bool frozen,bool borrowable)",
  "function getUserAccountData(address) view returns (uint256 totalCollateralValue,uint256 borrowLimitValue,uint256 liquidationLimitValue,uint256 totalDebtValue,uint256 healthFactor,uint256 activeCollateralCount)",
  "function targetHealthFactor() view returns (uint256)",
  "function protocolDeficit() view returns (uint256)",
  "function collateralBalance(address,address) view returns (uint256)",
  "function getUserCollateralTokens(address) view returns (address[])",
  "function debtBalance(address) view returns (uint256)",
  "function suppliedLiquidity(address) view returns (uint256)",
  "function withdrawableLiquidity(address) view returns (uint256)",
  "function protocolReserves() view returns (uint256)",
  "function currentBorrowAprBps() view returns (uint256)",
  "function reserveFactorBps() view returns (uint16)",
  "function originationFeeBps() view returns (uint16)",
  "function closeFactorBps() view returns (uint16)",
  "function protocolLiquidationFeeBps() view returns (uint16)",
  "function treasury() view returns (address)",
  "function totalDebt() view returns (uint256)",
  "function totalSuppliedLiquidity() view returns (uint256)",
  "function liquidityAvailable() view returns (uint256)",
  "function supplyEthLiquidity() payable",
  "function withdrawEthLiquidity(uint256)",
  "function suppliedEthLiquidity(address) view returns (uint256)",
  "function ethWithdrawableLiquidity(address) view returns (uint256)",
  "function ethLiquidityAvailable() view returns (uint256)",
  "function totalSuppliedEthLiquidity() view returns (uint256)",
  "function ethSupplyCap() view returns (uint256)",
  "function collateralValueUsd(address,address) view returns (uint256)",
  "function borrowLimit(address,address) view returns (uint256)",
  "function liquidationLimit(address,address) view returns (uint256)",
  "function healthFactor(address,address) view returns (uint256)",
  "function supplyLiquidity(uint256)",
  "function withdrawLiquidity(uint256)",
  "function depositCollateral(address,uint256)",
  "function withdrawCollateral(address,uint256)",
  "function borrow(address,uint256)",
  "function repay(uint256)",
];

export const VAULT_ABI = [
  "function deposit(uint256,uint256,uint256,uint256) returns (uint256)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function withdraw(uint256,uint256,uint256) returns (uint256,uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function positionLiquidity() view returns (uint128)",
  "function performanceFeeBps() view returns (uint256)",
  // Cost basis comes from these. A zap deposits on the caller's behalf, so the
  // `user` on Deposited is the zap contract — the share Transfer is what ties a
  // deposit to a person.
  "event Deposited(address indexed user, uint256 shares, uint256 amount0, uint256 amount1)",
  "event Withdrawn(address indexed user, uint256 shares, uint256 amount0, uint256 amount1)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export const ZAP_ABI = [
  "function zapIn(address vault,address tokenIn,uint256 amountIn,(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 amountOutMinimum)[] legs,uint256 amount0Min,uint256 amount1Min) payable returns (uint256 shares)",
];

export const V3_POOL_ABI = ["function fee() view returns (uint24)"];

export const MULTI_STAKING_ABI = [
  "function stake(uint256)",
  "function withdraw(uint256)",
  "function getReward()",
  "function exit()",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function getRewardTokens() view returns (address[])",
  "function earnedAll(address) view returns (address[] tokens,uint256[] amounts)",
  "function rewardData(address) view returns (address distributor,uint256 duration,uint256 periodFinish,uint256 rate,uint256 lastUpdateTime,uint256 rewardPerTokenStored)",
  "function performanceFeeBps() view returns (uint256)",
  "function unstakeFeeBps() view returns (uint256)",
  "function earnedStaking(address) view returns (uint256)",
];

export const STAKING_ABI = [
  "function stake(uint256)",
  "function withdraw(uint256)",
  "function getReward()",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function periodFinish() view returns (uint256)",
  "function performanceFeeBps() view returns (uint256)",
];

const READ_RPC = typeof window === "undefined" ? CHAIN.rpc : `${window.location.origin}/api/rpc`;
// Batch reads into JSON-RPC arrays (the proxy forwards batches) to cut request volume and avoid 429s.
export const provider = new JsonRpcProvider(READ_RPC, Number(CHAIN.id), { batchMaxCount: 10, batchStallTime: 50 });
export const poolRead = new Contract(LENDING_POOL_ADDRESS, POOL_ABI, provider);
export const usdgRead = new Contract(USDG_ADDRESS, ERC20_ABI, provider);

/* --------------------------------- types --------------------------------- */

export type MarketState = {
  listed: boolean;
  priceFeed: string;
  collateralFactorBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  maxStaleness: bigint;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
};

export type AccountState = {
  eth: bigint;
  usdg: bigint;
  stock: bigint;
  stockAllowance: bigint;
  usdgAllowance: bigint;
  collateral: bigint;
  debt: bigint;
  suppliedLiquidity: bigint;
  withdrawableLiquidity: bigint;
  suppliedEthLiquidity: bigint;
  ethWithdrawableLiquidity: bigint;
  borrowLimit: bigint;
  liquidationLimit: bigint;
  healthFactor: bigint;
  /** Portfolio-wide collateral value in USD wad, across every listed market. */
  collateralValue: bigint;
};

export type OracleState = { price: bigint; decimals: bigint; updatedAt: bigint; stale: boolean };
export type PriceMap = Record<string, { price: number; stale: boolean; updatedAt: number }>;

export type PoolState = {
  liquidity: bigint;
  totalDebt: bigint;
  totalSuppliedLiquidity: bigint;
  protocolReserves: bigint;
  borrowAprBps: bigint;
  owner: string;
  debtAsset: string;
  treasury: string;
  ethLiquidity: bigint;
  totalSuppliedEthLiquidity: bigint;
  ethSupported: boolean;
};

export type TxKind =
  | "deposit"
  | "borrow"
  | "repay"
  | "withdraw"
  | "supply"
  | "withdrawLiquidity"
  | "supplyEth"
  | "withdrawEth";

export type DeskTab =
  | "dashboard"
  | "borrow"
  | "lending"
  | "swap"
  | "farms"
  | "stake"
  | "education"
  | "suits"
  | "documentation";
