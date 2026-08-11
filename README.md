# Guild Bank

Guild Bank is a normie-friendly retail dApp for lending and borrowing on Robinhood Chain using Robinhood Stock Tokens as collateral and USDG as the borrow/supply asset.

## What this is

- Retail-facing React/Vite frontend with plain-English risk copy.
- Hardhat Solidity pool for:
  - supplying USDG liquidity
  - depositing Robinhood Stock Tokens as collateral
  - borrowing USDG
  - repaying USDG
  - withdrawing collateral only when safe
  - liquidating unhealthy positions
- Robinhood Chain config:
  - chain id: 4663
  - RPC: https://rpc.mainnet.chain.robinhood.com
  - explorer: https://robinhoodchain.blockscout.com
  - USDG: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168

## Critical Robinhood Stock Token rules preserved

- Stock Tokens are ERC-20s with 18 decimals.
- They provide economic exposure to underlying equities/ETFs, not legal or beneficial ownership rights in the underlying securities.
- Contract accounting uses raw ERC-20 balances.
- Chainlink feed prices are intended to be used directly for token value and already include ERC-8056 corporate-action multiplier effects.
- The contract rejects invalid/stale oracle data and token oracle pause flags when available.

## Commands

```bash
npm install
npm run compile
npm test
npm run dev
npm run build
```

## Deployment

Set Chainlink Robinhood price feed addresses from the current Chainlink feed registry before listing production markets. The deploy script intentionally skips any market without a feed env var.

Important: the public Chainlink Robinhood feed page currently shows Robinhood tokenized equity/ETF feeds as Custom SVR feeds with `Standard Proxy: Contact us` and `SVR Proxy: Contact us`. See `deployments/chainlink-robinhood-feeds.md`. Do not list stock-token collateral markets until Chainlink/Robinhood provides the actual proxy addresses for the selected markets.

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ROBINHOOD_MAINNET_RPC=https://rpc.mainnet.chain.robinhood.com
export NVDA_USD_FEED=0x...
export AAPL_USD_FEED=0x...
npm run deploy:robinhood
```

After deploy:

```bash
export VITE_LENDING_POOL_ADDRESS=0xYourPool
npm run build
```

## Production blockers before real users

- Verify every stock token and feed address against current Robinhood + Chainlink docs.
- Add Chainlink L2 sequencer uptime feed checks before mainnet launch.
- Add utilization-based interest indexes and receipt shares; current MVP liquidity is principal-only.
- Add jurisdiction/compliance gating and legal review.
- Audit liquidation math, oracle pause behavior, and token transfer behavior.
- Verify contracts on Blockscout.
