import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import path from "path";

// Secrets are read from the repo root .env first, then contracts/.env. dotenv does
// not overwrite an already-set variable, so the root file wins when both exist.
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "contracts/.env") });

const ROBINHOOD_MAINNET_RPC = process.env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com";
// Accept either name — DEPLOYER_PRIVATE_KEY is what the docs use, PRIVATE_KEY is what
// most .env files end up with.
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Fork the live chain when FORK=1 so contracts can be exercised against the
      // real Uniswap pools and token balances instead of mocks.
      forking:
        process.env.FORK === "1"
          ? {
              url: ROBINHOOD_MAINNET_RPC,
              // Pinned so fork runs are reproducible and the RPC can serve the state.
              blockNumber: process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined,
            }
          : undefined,
      // NOTE: FORK=1 does not currently work against the public RPC. Two blockers,
      // both external: the node is not an archive node (pinned blocks fail with
      // "metadata is not found"), and Hardhat rejects execution on chain 4663 with
      // "No known hardfork for execution" even with the history declared below.
      // Revisit with an archive RPC before relying on fork tests.
      chains: {
        4663: { hardforkHistory: { shanghai: 0 } },
      },
    },
    robinhoodMainnet: { url: ROBINHOOD_MAINNET_RPC, chainId: 4663, accounts },
    // Anvil forking the live chain. Hardhat's own forking cannot execute against
    // chain 4663 (no hardfork history) and the public RPC is not archival, so the
    // fork is driven by anvil and Hardhat simply talks to it as a normal node.
    //   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
    anvilFork: { url: "http://127.0.0.1:8545", chainId: 4663 },
    anvilFork2: { url: "http://127.0.0.1:8546", chainId: 4663 },
  },
  etherscan: {
    apiKey: { robinhoodMainnet: process.env.BLOCKSCOUT_API_KEY || "unused" },
    customChains: [
      {
        network: "robinhoodMainnet",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },
};
export default config;
