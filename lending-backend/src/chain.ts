import { Contract, JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { config } from "./config.js";

export const VAULT_ABI = [
  "function compound()",
  "function positionId() view returns (uint256)",
  "function positionLiquidity() view returns (uint128)",
  "function totalSupply() view returns (uint256)",
  "function performanceFeeBps() view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function paused() view returns (bool)",
];

export const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });

export const wallet = config.keeperKey ? new Wallet(config.keeperKey, provider) : null;

export function vaultContract(address: string) {
  return new Contract(address, VAULT_ABI, wallet ?? provider);
}

export async function gasPriceGwei(): Promise<number> {
  const fee = await provider.getFeeData();
  const price = fee.gasPrice ?? fee.maxFeePerGas ?? 0n;
  return Number(formatUnits(price, "gwei"));
}
