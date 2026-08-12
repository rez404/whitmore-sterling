# Repository Summary

Last reviewed: 2026-08-12 (commit `3de90bf`, branch `master`, clean tree).

## TL;DR

This repo holds **two separate Robinhood Chain (chainId 4663) dApps** that share one Hardhat
project, one `contracts/` folder, and one test suite:

| Product | Frontend | Core contract | Status |
| --- | --- | --- | --- |
| **Whitmore Sterling** — tokenized-equity credit desk (the active product) | `lending-frontend/` | `contracts/GuildBank.sol` | Deployed on mainnet, 24 markets listed, 0 liquidity supplied |
| **Catsino / GambleFi** — Gamba-style onchain casino (earlier project) | `src/` (repo root app) | `contracts/RobinhoodGambleFi.sol` | Deployed on mainnet (2 pools, 12 games), pools empty, entropy epoch 1 unrevealed |

Naming across the repo is inconsistent and reflects the project's history:
`package.json` is named `guild-bank`, the root `README.md` and `index.html` describe "Guild Bank"
lending, but the root `src/` app that actually builds from them is the **casino**. The lending
product now lives entirely in `lending-frontend/` and brands itself **Whitmore Sterling**.
Older docs also call it *Equilendooor* and *robinhood-stock-lending*.

---

## 1. Chain and shared assets

- Chain: **Robinhood Chain**, id `4663` (`0x1237`)
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com` (Blockscout)
- **USDG** (debt/liquidity asset): `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — **6 decimals**
- **WETH9**: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- Stock Tokens: 18-decimal ERC-20s giving *economic exposure* to equities/ETFs — not shares,
  no voting or ownership rights
- Oracles: Chainlink **SVR proxies** per symbol (`AggregatorV3Interface`), catalogued in
  `deployments/chainlink-robinhood-feeds.md` and `deployments/robinhood-svr-feeds.env.example`
- SushiSwap V3 (verified 2026-08-12, `deployments/robinhood-sushi-v3.json`):
  NPM `0x51d0e518…`, factory `0xe51960f1…`, RouteProcessor `0x8e6fd69a…`, default fee tier 3000

## 2. Whitmore Sterling — the lending protocol

### 2.1 `contracts/GuildBank.sol` (707 lines)

A single-debt-asset (USDG), many-collateral-market lending pool. Aave-inspired but deliberately
much simpler. `Ownable + Pausable + ReentrancyGuard`, `SafeERC20` throughout.

**Mechanics**

- **Liquidity supply**: LPs deposit USDG, receive internal *shares* (no separate LP token).
  `withdrawLiquidity` burns shares with **ceil rounding** so rounding always favours solvency.
- **Native ETH liquidity**: `supplyEthLiquidity` / `withdrawEthLiquidity` plus a `receive()`
  fallback that treats bare transfers as deposits. Note: **there is no yield source for the ETH
  side** — nothing ever increases `totalSuppliedEthLiquidity` other than deposits, so ETH shares
  stay 1:1 until an ETH-side yield mechanism is added. The UI states this honestly.
- **Collateral**: `depositCollateral` / `withdrawCollateral` per listed stock-token market,
  with a per-market `supplyCap` and per-user active-token tracking (arrays are pruned to zero).
- **Borrowing**: `borrow(stockToken, amount)` draws USDG. 25 bps origination fee to treasury,
  per-market `borrowCap`, liquidity check, then a **portfolio-wide** health check.
  Debt itself is global (`debtPrincipal[user]`) but is also bucketed per market
  (`userDebtByMarket`) so `Market.totalBorrowed` stays coherent through repays and interest sync.
- **Interest**: global `borrowIndex`, accrued on interaction.
  `util = debt / (cash + debt)`, `rate = base + slope * util`
  (base 2% APR, slope 30% APR, both stored per-second). Interest splits between suppliers and
  `protocolReserves` via `reserveFactorBps` (20%).
- **Risk model**: `getUserAccountData()` walks every collateral token and returns total collateral
  value, weighted borrow limit, weighted liquidation limit, total debt value and health factor.
  `_isHealthy` (used on borrow/withdraw) is the *stricter* collateral-factor check, not HF > 1.
- **Liquidations**: target-health-factor sizing via `maxLiquidatableDebt()`, `closeFactorBps` as a
  fallback cap, dust protection (`DustyRemainingDebt`), collateral-exhaustion path that records a
  `protocolDeficit`, emits `DeficitReported`, and **socializes the bad debt** into supplier share
  value. The protocol liquidation fee (20%) is taken **out of the bonus collateral**, never as an
  extra USDG charge on the liquidator.
- **Oracle safety**: rejects non-positive answers, `updatedAt == 0`, `answeredInRound < roundId`,
  staleness beyond per-market `maxStaleness`, optional per-market min/max price bounds, the stock
  token's own `oraclePaused()` flag (via `try/catch`), and an optional L2 sequencer uptime feed
  with a 1-hour grace period.
- **Ops**: `listMarket`, `setMarketFlags(paused/frozen/borrowable)`, `setMarketPriceBounds`,
  `setRiskParams`, `setTargetHealthFactor`, `setTreasury`, caps, global pause.
  Repay and liquidate are intentionally **not** behind `whenNotPaused` so risk-reducing actions
  always stay open.

### 2.2 Deployed state (`deployments/guild-bank-mainnet.json`)

| Field | Value |
| --- | --- |
| GuildBank | `0x3b8E15CC4Cb595B5097A26ff7F318038C50dc59d` |
| Deploy tx / block | `0xaf9e3c43…` / 16,247,650 |
| Owner = treasury = deployer | `0x357606c8E2B273Fb4c51728013A19d66E9DC923B` |
| Debt asset | USDG, 6 decimals, `debtToWadScale = 1e12` |
| Global supply cap | 1,000,000 USDG |
| Sequencer uptime feed | `0x0000…0000` (**disabled**) |
| Markets listed | **24** (10 skipped for missing canonical token addresses) |
| totalDebt / totalSuppliedLiquidity | 0 / 0 at record time |

Listed: AAPL, AMD, AMZN, BABA, COIN, CRCL, CRWV, GOOGL, INTC, META, MSFT, MU, NVDA, ORCL, PLTR,
QQQ, SGOV, SLV, SNDK, SPCX, SPY, TSLA, USAR, USO.
Skipped (need `<SYMBOL>_TOKEN` env override): ASML, CLSK, EWY, GME, IONQ, MSTR, NBIS, RGTI, RKLB, TSM.

Risk tiers range from CF 25% / LT 40% (SPCX, USAR) up to CF 75% / LT 85% (SGOV); liquidation bonus
is 500 bps and `maxStaleness` is 345,600 s (4 days) everywhere.

**Superseded deployments** still recorded in `deployments/`:
`0x377543D376ECA00a4F958186b9eb4e798F5635D3` (v1/v2 records, owner `0x898F183e…`, treasury
`0x3E3738Ab…`), `0xb720C4245A395bFCE0Bb536FA0a5Bd095Dca0e53` (previous), and
`0x283b9a45B51EB071630289Fc1D21313204d4Be45` from the local deploy log. The contract is **not**
proxy-upgradeable, so every change means a new address plus re-listing all markets.

### 2.3 Frontend — `lending-frontend/`

React 19 + Vite 7 + Tailwind 4 + ethers v6, TypeScript. The entire app is one 1,325-line
`src/main.tsx`; `src/markets.ts` (24 market configs + addresses) and `src/farms.ts` are the only
other source files.

Tabs: **Dashboard, Borrow, Lending, Swap, Farms, Stake, Learn, Suits, Documentation.**

Notable engineering:

- All reads go through `/api/rpc`, a serverless proxy (`api/rpc.js`) with a **read-only method
  allowlist**, chunked batch forwarding (4 per upstream call), 429 retry/backoff, and a warm-lambda
  `eth_chainId` cache. Client uses `JsonRpcProvider` batching (`batchMaxCount: 10`).
- Fault tolerance: per-call fallbacks so one failed read can't blank the dashboard, `readWithRetry`,
  a boot-time `getCode()` check that loudly reports a misconfigured pool address, an error boundary,
  and global `error` / `unhandledrejection` capture.
- UX: `staticCall` preflight before every transaction, tx hash + explorer receipt link, projected
  health factor before borrowing, Max buttons, one-time max approvals, wrong-network and stale-oracle
  banners, 90 s silent background refresh, 180 s ticker-price refresh.
- **Swap** executes natively via the Sushi routing API (`api.sushi.com/swap/v7/4663`) — quote,
  approve, then sign the returned router tx in-wallet.
- Correct 6-decimal USDG vs 18-decimal collateral handling throughout (`debtDecimals` is read from
  chain, not hardcoded).
- Branding: black/white Robinhood-style with neon-lime accent `#ccff00`, Space Grotesk, wolf emblem.

### 2.4 Farms & Stake (built, not live)

- `contracts/StockLpVault.sol` — custodial ERC-20-share vault around **one full-range Sushi V3
  position** per stock/USDG pair. Permissionless `compound()` collects trading fees, keeps a 10%
  platform fee (hard-capped 20%), reinvests the rest. Deposits/withdraws compound first so no one
  can skim accrued fees. Header says **AUDIT REQUIRED**; `scripts/deploy-farms.ts` deliberately
  refuses to deploy it.
- `contracts/StakingRewards.sol` — Synthetix pattern, stake the platform token, earn a partner
  token. Rewards are **funded, never minted** (no emissions); 10% platform fee on claim;
  `recoverERC20` refuses the staking token.
- `contracts/WhitmoreToken.sol` — `WHIT`, ERC20 + Burnable + owner-mintable, placeholder ticker.
- `lending-frontend/src/farms.ts` has `PLATFORM_TOKEN`, `PARTNER_TOKEN`, `STAKING_POOL` as **empty
  strings** and every `LP_VAULTS[].vault` empty → both pages render as "Launching soon" and all
  24 farm rows show "Launching". Nothing on these two tabs is functional yet.

## 3. Catsino / GambleFi — the casino side

`contracts/RobinhoodGambleFi.sol` = `RobinhoodGambleFiFactory` + `RobinhoodGambleFiPool`.
ERC-20 LP shares over a wager pool, owner-configured games with a multiplier array, per-wager
**locked liability** so the pool can never be over-exposed, creator/protocol fees capped at 20%
combined, and an EV bound that rejects house-losing odds. Randomness is **commit-reveal**: an
`entropyAdmin` commits `keccak256(seed)`, later reveals the seed and commits the next epoch;
wagers can only be placed against an unrevealed epoch and settled after the reveal.

Deployed (`deployments/robinhood-gamblefi-*.json`):

- Factory `0xC11dEAF70f9B5482a8ac71468ff3738Eecec1Fae` — Blockscout-verified
- USDG pool `0x63F3b47D727Dd1aAdf81F32Cc9Cd2d56946ccF6F` (`rhUSDG-LP`) — verified
- WETH pool `0xe3cA6CC4cEe6C13F8442793705BC31638fad63D2` (`rhWETH-LP`) — 12 games listed
- Owner = treasury = entropy admin = `0x898F183eAa0CB61838AE030Fbb7F95488Cd0a7eb`
- Pools hold **0** assets, epoch 1 is **not revealed**, so nothing is live

Frontend `src/` is the Catsino lobby: 10 game UIs vendored from BankkRoll's Gamba V2 (MIT notice at
`public/games/BANKKROLL-MIT-NOTICE.txt`) behind `src/bankkroll/gambaShim.tsx`, using
three.js/r3f, matter-js, styled-components.

## 4. Tooling, tests, deployment

- **Hardhat 2.28**, Solidity **0.8.28**, optimizer 200 runs, `viaIR: true`, OpenZeppelin 5.6.
  `.env` loaded via `dotenv/config` so `DEPLOYER_PRIVATE_KEY` stays out of shell history.
  Blockscout verification wired via `customChains`.
- **Tests** (`test/`, 3 specs, ~30 cases): `guild-bank.spec.ts` covers supply/withdraw, ETH
  liquidity + caps, deposit/borrow with fee, portfolio account data across multiple collaterals,
  borrow-bucket coherence, over-borrow and unsafe-withdraw rejection, target-HF liquidation, all
  oracle failure states, interest/reserves, caps, dust/deficit, market flags, LP rounding, real
  6-decimal USDG math, and bad-debt socialization. `staking.spec.ts` (5) and
  `robinhood-gamblefi.spec.ts` (5) cover the other contracts. Docs record 18 passing for the Aave
  pass and 11 for GambleFi. **`node_modules` is not installed in this checkout**, so nothing was
  re-run during this review — `npm install && npm test` to verify.
- **Scripts**: `deploy.ts` (pool + list all markets, skipping any without a token/feed),
  `guild-bank-markets.ts` (check / list-missing against the live pool),
  `deploy-farms.ts` (token + staking only, warns if owner is the deployer EOA),
  `deploy-gamblefi.ts` (refuses to deploy without a real entropy commitment),
  `stock-markets.ts` (34 market configs with standard + SVR feeds).
- **Deploy targets**: two Vercel projects. Repo root builds the casino (`vite.config.ts`,
  root `vercel.json`); `lending-frontend/` builds Whitmore Sterling with its own `vercel.json`
  (SPA rewrites + `X-Frame-Options`, `nosniff`, referrer and permissions policies).

## 5. Open items and inconsistencies found

**Blocking / correctness**

1. `lending-frontend/README.md` still lists the pool as `0x377543D3…` while the shipped code uses
   `0x3b8E15CC…`. It also states treasury `0x3E3738Ab…` where the live pool's treasury is
   `0x357606c8…`. Stale docs on the address that matters most.
2. **Sequencer uptime feed is `0x0`** on the deployed pool, so `_checkSequencer()` is a no-op —
   which the root README itself lists as a pre-launch blocker.
3. `StockLpVault` is unaudited and undeployed; Farms and Stake are dead UI until addresses land in
   `farms.ts`.
4. Owner, treasury and deployer on the live pool are the **same EOA**. `deploy-farms.ts` already
   warns about this; a multisig is the documented target.
5. `deployments/robinhood-gamblefi-mainnet.json` records that the deployer private key **was pasted
   into a chat and should be considered exposed / rotated**. Confirm that rotation happened —
   note the GambleFi deployer (`0x898F183e…`) is also the owner of the superseded lending pools.
6. Root `api/rpc.js` is an open JSON-RPC relay with **no method allowlist** — unlike the hardened
   `lending-frontend/api/rpc.js`. If the root project is still deployed, it will forward any method
   upstream.

**Hygiene**

7. Repo identity is muddled: `package.json` name `guild-bank`, root README/`index.html` describe
   lending, root `src/` is the casino, `lending-frontend/README.md` says "Guild Bank Frontend" while
   the app says Whitmore Sterling. Docs also reference an old Windows path
   (`C:/Users/roota/robinhood-stock-lending`).
8. `lending-frontend/vercel.json` still rewrites `/api/uniswap/*` to the Uniswap gateway, left over
   from before the Sushi migration.
9. `lending-frontend/components/ui/expandable-card-demo-standard.tsx` + `hooks/use-outside-click.tsx`
   are imported by nothing — leftover shadcn scaffolding.
10. ~82 screenshots in `.tmpcheck/` and 18 `.hermes-*.png` files are committed to git
    (`.tmpcheck` is in `.vercelignore` but not `.gitignore`).
11. `.deploy-stock-lending-20260714-113650.log` documents a pool (`0x283b9a45…`) that no longer
    matches any deployment record.

**Product / legal**

12. Real-money chance games on the casino side need legal and compliance review before launch — the
    deployment record flags this explicitly.
13. Tokenized-equity lending needs jurisdiction gating and legal review (root README's own list),
    plus a full audit of liquidation math, oracle pause behaviour and token transfer behaviour.

---

## Quick reference

```bash
npm install          # required — node_modules is absent
npm run compile      # hardhat compile
npm test             # hardhat test (3 specs)
npm run dev          # Catsino casino app (repo root)

cd lending-frontend && npm install && npm run dev   # Whitmore Sterling on :5174
```

Deploy the lending pool (never paste a key into a prompt — use `.env`):

```bash
DEPLOYER_PRIVATE_KEY=0x... TREASURY_ADDRESS=0x<multisig> \
npm run deploy:robinhood
# then update LENDING_POOL_ADDRESS in lending-frontend/src/markets.ts and redeploy the frontend
```
