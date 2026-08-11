# Equilendooor Aave-inspired implementation pass

Date: 2026-07-14

Implemented against:
- `contracts/GuildBank.sol`
- `test/guild-bank.spec.ts`
- `lending-frontend/src/main.tsx`

## Implemented

1. Portfolio-wide account data
   - Added `AccountData` struct.
   - Added `getUserAccountData(address)`.
   - Tracks active collateral token list per user.
   - Health factor now uses aggregate collateral/borrow/liquidation limits across all deposited collateral tokens.

2. Coherent per-collateral borrow buckets
   - Added `userDebtByMarket[user][stockToken]`.
   - Added active borrow token list per user.
   - Repay now decrements per-market borrow buckets so `Market.totalBorrowed` remains coherent.
   - Interest sync distributes borrower debt growth into buckets.

3. Target-health-factor liquidation
   - Added `targetHealthFactor`, default `1.1e18`.
   - Added `setTargetHealthFactor`.
   - Added `maxLiquidatableDebt(user, collateralToken)`.
   - Liquidations now reject normal over-target repay amounts via `LiquidationAmountTooHigh`.

4. Liquidation fee mechanics fixed
   - Liquidator no longer pays an extra USDG protocol liquidation fee.
   - Protocol fee is taken from the liquidation bonus collateral slice.
   - Treasury receives collateral from bonus, not a second USDG charge.

5. Dust and deficit handling
   - Added `DUST_THRESHOLD_USDG`.
   - Added `protocolDeficit`.
   - Added `DeficitReported(user, collateralToken, amount)` event.
   - If collateral is exhausted and debt remains, remaining debt is reported as protocol deficit and cleared from user debt.

6. Granular market flags
   - Added per-market `paused`, `frozen`, and `borrowable` flags.
   - Added `setMarketFlags(stockToken, paused, frozen, borrowable)`.
   - Frozen blocks new collateral deposits and borrowing.
   - Repay and liquidation are intentionally not behind global `whenNotPaused`, preserving risk-reducing actions.

7. LP withdrawal rounding hardening
   - Added `_ceilDiv`.
   - `withdrawLiquidity` now burns LP shares rounded up.

8. Frontend ABI/model update
   - Updated `POOL_ABI.markets` tuple shape.
   - Added `getUserAccountData`, `targetHealthFactor`, and `protocolDeficit` ABI entries.
   - Dashboard/account state now uses aggregate account data for borrow limit, liquidation limit, debt, and health factor.
   - Added error copy for market flags, target liquidation, and dust.

## Verification output

`npm test`:
- 18 passing

`npm run compile`:
- Nothing to compile / typings current after successful compile.

`lending-frontend npm run build`:
- TypeScript and Vite production build passed.

## Deployment status

Not deployed to Robinhood mainnet from this pass.

Reason:
- `DEPLOYER_PRIVATE_KEY` was not present in the environment.
- `ROBINHOOD_MAINNET_RPC` was not present in the environment.
- This contract is not upgrade-proxy based, so production rollout requires deploying a new pool address and then updating `lending-frontend/src/markets.ts` / live Vercel config to point at the new address.

## Follow-up before production

- Deploy new pool.
- List all stock markets against the new pool.
- Seed/transfer USDG liquidity if desired.
- Update `LENDING_POOL_ADDRESS` in the frontend.
- Deploy frontend only after the new contract address is live; otherwise the new frontend ABI will not match the currently deployed old pool.
- Re-run live RPC smoke checks for `getUserAccountData`, `markets`, `targetHealthFactor`, and `protocolDeficit`.
