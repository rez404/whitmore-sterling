# Equilendooor model review: Aave v4 ideas worth borrowing

Reviewed on 2026-07-14 against local repo `C:/Users/roota/robinhood-stock-lending`.

Grounding:
- Core contract: `contracts/GuildBank.sol`
- Tests: `test/guild-bank.spec.ts`
- Deployment config: `scripts/deploy.ts`, `scripts/stock-markets.ts`
- Frontend market/app model: `lending-frontend/src/markets.ts`, `lending-frontend/src/main.tsx`
- Reference skill: `aave-v4-lending-architecture`
- Commands run: `npm test` and `npm run compile` both passed.

## Current architecture in plain English

Equilendooor is currently a compact single-pool lending desk:

- One debt asset: USDG.
- Many stock-token collateral markets.
- LPs supply USDG into one global pool and receive internal LP receipt shares.
- Borrowers deposit one selected stock token as collateral and borrow USDG.
- Interest accrues globally through a `borrowIndex` and utilization-based APR.
- The protocol takes origination fees, reserve factor, and liquidation fee revenue.
- Risk is static per market: collateral factor, liquidation threshold, liquidation bonus, max oracle staleness, borrow cap, supply cap.
- Oracle checks include Chainlink/SVR latestRoundData, stale-answer checks, stock-token `oraclePaused()`, and optional sequencer uptime.
- Frontend treats one selected market at a time and shows borrow/lend/dashboard/swap flows.

This is a solid MVP shape. It is intentionally much simpler than Aave v4.

## What is already good and should stay

1. Single USDG liquidity pool is the right first scope.
   - Do not jump straight to full Aave Hub/Spoke complexity.
   - For a tokenized-stock credit desk, one borrow asset and many collateral assets is easier to reason about.

2. Oracle hardening is already better than many MVPs.
   - Rejects zero/negative answers.
   - Rejects stale answers.
   - Checks `answeredInRound`.
   - Supports sequencer uptime and grace period.
   - Supports token-level `oraclePaused()`.

3. Basic LP shares and borrow index are the right accounting primitives.
   - This borrows the correct Aave idea: use shares/indexes instead of per-user loops.

4. Tests cover happy paths and several key bad states.
   - supply/withdraw
   - deposit/borrow
   - over-borrow rejection
   - repay/withdraw
   - liquidation
   - oracle stale/invalid/paused/sequencer-down
   - interest/reserves
   - caps/close factor

## Highest priority Aave ideas to borrow next

### 1. Move from one-token health checks to portfolio account data

Current issue:
- User debt is global: `debtPrincipal[user]`.
- But health checks are per selected stock token: `healthFactor(user, stockToken)` and `borrowLimit(user, stockToken)` only use that one token's collateral.
- If users deposit multiple stock tokens, the contract does not compute aggregate collateral or aggregate liquidation threshold across the portfolio.
- Borrowing against different tokens can make the UI/model confusing because debt has no per-market identity, but health is queried per-market.

Aave v4 idea to borrow:
- Add a user account-data function that walks all enabled collateral reserves and computes:
  - total collateral value
  - total debt value
  - weighted borrow limit / weighted liquidation limit
  - health factor
  - active collateral count

Equilendooor version:
- Maintain a bounded list/bitmap of user collateral markets.
- Add `getUserAccountData(address user)`.
- Keep global USDG debt, but make health factor portfolio-wide.
- Frontend dashboard should use portfolio-wide account data, not selected-token account data.

Why it matters:
- This unlocks real portfolio lending across AAPL/NVDA/SPY/etc.
- Prevents selected-token blind spots.
- Makes the dashboard match user reality.

### 2. Fix per-market borrow accounting or remove it

Current issue:
- `Market.totalBorrowed` increments in `borrow(stockToken, amount)`.
- `repay(amount)` does not know which stockToken to decrement.
- `debtPrincipal[user]` is global, not per stock market.
- `liquidate(user, stockToken, repayAmount)` decrements `market.totalBorrowed` for the collateral token selected, which may not correspond to the original borrow context.

Aave v4 idea to borrow:
- Keep debt accounting in the liquidity core and reserve/account data in the position module with a coherent reserve status map.

Equilendooor options:
- Option A, simplest: make borrow cap global only and remove `market.totalBorrowed` until per-market debt is modeled.
- Option B: track `userDebtByMarket[user][stockToken]` and require repay/liquidation to specify market debt bucket.
- Option C: keep debt global but make caps based on total USDG debt and per-collateral exposure caps from collateral deposited, not borrowed amount.

Recommendation:
- For the current product, choose Option A or C. Per-market debt does not make sense if the debt asset is one fungible USDG liability.

### 3. Adopt target-health-factor liquidation instead of fixed close factor

Current issue:
- Liquidation uses a fixed close factor: default max 50% of debt.
- This can over-liquidate or under-liquidate depending on collateral/price move.
- It does not calculate how much repayment is needed to restore the borrower to a target health factor.

Aave v4 idea to borrow:
- Liquidate just enough to restore to `targetHealthFactor`.
- Keep close-factor as a safety cap if desired, but target HF should drive the repay amount.

Equilendooor version:
- Add `targetHealthFactor`, e.g. 1.10e18 or 1.15e18.
- Add `maxLiquidatableDebt(user, collateralToken)` based on current collateral value, debt, liquidation threshold, and liquidation bonus.
- Let liquidators repay up to the target amount.

Why it matters:
- Better borrower UX.
- Better solvency behavior during sharp equity moves.
- Cleaner liquidation bot logic.

### 4. Fix liquidation fee design

Current issue:
- Liquidator transfers `repayAmount` to the pool.
- Then also transfers `protocolFee` in USDG directly to treasury.
- The user also loses extra collateral value for `protocolFee` via `seizeAmount = (liquidatorSeizeValue + protocolFee) * WAD / price`.
- This effectively charges fee in two places: liquidator's USDG and user's collateral.

Aave v4 idea to borrow:
- Protocol liquidation fee should normally come out of the liquidation bonus/collateral seized, not as a second extra payment by the liquidator.

Equilendooor version:
- Liquidator pays only `repayAmount` USDG.
- Collateral seized = repaid value + liquidation bonus.
- Protocol fee = percentage of bonus collateral, not percentage of total repaid value as extra USDG.
- Treasury receives collateral or protocol accounting credit from the bonus slice.

Why it matters:
- Liquidation incentives become predictable.
- Avoids overcharging liquidators and borrowers.
- Matches mature lending protocol design.

### 5. Add dust and bad-debt handling

Current issue:
- Liquidation has no dust rules.
- If collateral is insufficient, `seizeAmount` is capped to available collateral, but the debt reduction still uses the full `repayAmount`.
- There is no explicit deficit/bad-debt bucket.
- The protocol does not clearly report when a user has no collateral left but debt remains.

Aave v4 idea to borrow:
- Explicit dust thresholds.
- Explicit deficit reporting and elimination.

Equilendooor version:
- Add `DUST_THRESHOLD_USDG`, e.g. $1 or $10 for MVP, higher for production if gas/liquidity requires.
- If post-liquidation debt would be dust, require full close or adjust repay amount.
- Add `badDebt[user]` or aggregate `protocolDeficit` when collateral is exhausted and debt remains.
- Emit `DeficitReported(user, amount)`.

Why it matters:
- Avoids zombie positions.
- Makes insolvency visible to UI and monitoring.

### 6. Add granular reserve flags instead of one global pause

Current issue:
- Global pause blocks supply, depositCollateral, borrow, repay, and liquidate due to `whenNotPaused` on those methods.
- In a crisis, blocking repay and liquidation can make risk worse.
- There is no per-market pause/freeze/borrowable flag.

Aave v4 idea to borrow:
- Separate flags:
  - paused
  - frozen
  - borrowable
  - receiveSharesEnabled, if share-based liquidation exists later
  - active/halted style module flag

Equilendooor version:
- Add to `Market`:
  - `paused`
  - `frozen`
  - `borrowable`
- Rules:
  - paused: blocks new risky actions for that market
  - frozen: blocks deposit/borrow, allows withdraw/repay/liquidate
  - borrowable: toggles borrowing only
- Keep a global emergency pause only for extreme cases, but preferably allow repay/liquidate.

Why it matters:
- Gives you operational controls without trapping users.
- Lets you freeze CRWV or SPCX without freezing SGOV/SPY.

### 7. Fix LP share withdrawal rounding

Current issue:
- `supplyLiquidity` mints shares with floor rounding. That is okay.
- `withdrawLiquidity` calculates shares with floor rounding and then only forces min 1:
  `shares = amount * totalLiquidityShares / totalSuppliedLiquidity`.
- Withdrawals should round shares up. Otherwise repeated withdrawals can burn too few shares for the amount withdrawn in some ratios.

Aave v4 idea to borrow:
- Use explicit solvency-favorable rounding directions.

Equilendooor version:
- Add `ceilDiv` helper.
- `shares = ceilDiv(amount * totalLiquidityShares, totalSuppliedLiquidity)`.
- Add fuzz or unit test where share price is not 1:1 and repeated withdrawals cannot drain value.

Why it matters:
- Prevents LP share accounting leakage.

### 8. Add dynamic risk config versioning later, not immediately

Current issue:
- Owner can update/list market risk params directly; user positions immediately use new values.
- This can surprise-liquidate passive users if collateral factors/thresholds are reduced.

Aave v4 idea to borrow:
- Dynamic risk config snapshots attached to user positions.

Equilendooor version:
- Not needed for MVP, but important before larger TVL.
- Easier first step: add timelocked parameter updates and UI warnings.
- Later: add versioned risk configs and bind user positions to versions, refreshing on risk-increasing actions.

Why it matters:
- Protects users from sudden governance/admin risk changes.

### 9. Add risk-premium pricing by collateral type later

Current issue:
- All borrowers pay the same utilization APR regardless of whether they borrow against SGOV or SPCX.
- Collateral factors partially compensate, but pricing risk only through LTV is blunt.

Aave v4 idea to borrow:
- Collateral-quality risk premium.

Equilendooor version:
- Simple MVP version: add per-market borrow spread bps.
  - SGOV/SPY: low spread.
  - Mega-cap stocks: medium spread.
  - volatile/pre-IPO/crypto-adjacent stocks: high spread.
- Do not implement Aave's premium shares/offset model yet.

Why it matters:
- Riskier collateral pays more even if borrow amount is below its LTV.
- Better aligns revenue with insolvency risk.

### 10. Improve frontend around portfolio, liquidation, and monitoring

Current issue:
- Dashboard is visually good, but model is selected-market-first.
- It does not show aggregate account data across all collateral.
- It does not expose liquidations or bad-debt/deficit state.
- Swap panel is Uniswap-style but chain support is not verified for automatic routing.

Aave v4 idea to borrow:
- Build UI around account data and reserve data, not isolated action widgets.

Equilendooor version:
- Dashboard should show:
  - total collateral value
  - total debt
  - borrow limit
  - liquidation limit
  - health factor
  - collateral breakdown by stock
  - oracle status per asset
  - pool utilization
  - protocol reserves
  - liquidatable positions, eventually
- Market cards should show reserve flags and risk params.
- Add a liquidation explorer/bot view before mainnet liquidity grows.

## Proposed implementation phases

### Phase 1: Critical correctness hardening

1. LP share withdrawal rounding up.
2. Fix/remove `market.totalBorrowed` incoherence.
3. Fix liquidation fee mechanics.
4. Add tests for the above.

### Phase 2: Portfolio-level account model

1. Track user's active collateral markets.
2. Add aggregate `getUserAccountData(user)`.
3. Use aggregate account data for borrow, withdraw, health factor, dashboard.
4. Add tests for multi-collateral positions.

### Phase 3: Better liquidation engine

1. Add target health factor.
2. Add max liquidatable debt calculation.
3. Add dust rules.
4. Add deficit/bad debt event/accounting.
5. Add liquidation tests for partial/full/dust/insufficient-collateral cases.

### Phase 4: Operational controls

1. Add per-market paused/frozen/borrowable flags.
2. Keep repay/liquidation available during most emergency states.
3. Add admin events and frontend display.

### Phase 5: Risk sophistication

1. Add per-market borrow spread / risk premium.
2. Add timelocked risk parameter updates.
3. Later: dynamic risk config snapshots.

## Discussion recommendation

The biggest design decision is whether Equilendooor should remain:

A. A simple single-pool, portfolio-collateral USDG lender.

or

B. A mini Aave-style modular system with separate Hub and Spoke contracts.

Recommendation: stay with A for now, but borrow Aave's account-data, liquidation, rounding, emergency-control, and testing ideas. Do not jump to full Hub/Spoke until the product has multiple debt assets, multiple product modules, or enough TVL to justify the operational complexity.
