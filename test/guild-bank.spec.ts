import { expect } from "chai";
import { ethers } from "hardhat";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const e6 = (v: string) => ethers.parseUnits(v, 6);
const price8 = (v: string) => ethers.parseUnits(v, 8);

describe("GuildBank", function () {
  async function fixture() {
    const [owner, lender, borrower, liquidator, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdg = await MockERC20.deploy("USDG", "USDG", 18);
    const nvda = await MockERC20.deploy("Robinhood NVDA Stock Token", "NVDA", 18);
    const msft = await MockERC20.deploy("Robinhood MSFT Stock Token", "MSFT", 18);
    const MockOracle = await ethers.getContractFactory("MockOracle");
    const nvdaFeed = await MockOracle.deploy(8, price8("100"));
    const msftFeed = await MockOracle.deploy(8, price8("50"));
    const MockSequencer = await ethers.getContractFactory("MockSequencerUptimeFeed");
    const sequencer = await MockSequencer.deploy();
    await ethers.provider.send("evm_increaseTime", [60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    const Pool = await ethers.getContractFactory("GuildBank");
    const pool = await Pool.deploy(await usdg.getAddress(), owner.address, treasury.address, await sequencer.getAddress());

    await pool.listMarket(await nvda.getAddress(), await nvdaFeed.getAddress(), 5000, 6500, 500, 60 * 60 * 24 * 4, e18("1000"), e18("25000"));
    await pool.listMarket(await msft.getAddress(), await msftFeed.getAddress(), 5000, 6500, 500, 60 * 60 * 24 * 4, e18("1000"), e18("25000"));
    await pool.setGlobalSupplyCap(e18("25000"));

    await usdg.mint(lender.address, e18("100000"));
    await usdg.mint(liquidator.address, e18("100000"));
    await usdg.mint(borrower.address, e18("100000"));
    await nvda.mint(borrower.address, e18("100"));
    await msft.mint(borrower.address, e18("100"));

    await usdg.connect(lender).approve(await pool.getAddress(), ethers.MaxUint256);
    await usdg.connect(liquidator).approve(await pool.getAddress(), ethers.MaxUint256);
    await usdg.connect(borrower).approve(await pool.getAddress(), ethers.MaxUint256);
    await nvda.connect(borrower).approve(await pool.getAddress(), ethers.MaxUint256);
    await msft.connect(borrower).approve(await pool.getAddress(), ethers.MaxUint256);

    return { owner, lender, borrower, liquidator, treasury, usdg, nvda, msft, nvdaFeed, msftFeed, sequencer, pool };
  }

  it("lets a lender supply and withdraw idle USDG liquidity", async function () {
    const { lender, pool, usdg } = await fixture();
    await expect(pool.connect(lender).supplyLiquidity(e18("1000"))).to.emit(pool, "Supplied");
    expect(await pool.suppliedLiquidity(lender.address)).to.equal(e18("1000"));
    await expect(pool.connect(lender).withdrawLiquidity(e18("400"))).to.emit(pool, "LiquidityWithdrawn");
    expect(await usdg.balanceOf(lender.address)).to.equal(e18("99400"));
  });

  it("enforces optional per-market oracle price bounds (hardening #5)", async function () {
    const { owner, borrower, pool, nvda } = await fixture();
    const token = await nvda.getAddress();
    // NVDA reads at $100 (=> 100e18 wad). A floor above it must make reads revert.
    await expect(pool.connect(owner).setMarketPriceBounds(token, e18("200"), 0)).to.emit(pool, "MarketPriceBoundsUpdated");
    await expect(pool.connect(borrower).depositCollateral(token, e18("1"))).to.be.revertedWithCustomError(pool, "OraclePriceOutOfBounds");
    // Widen bounds around $100 and the deposit works again.
    await pool.connect(owner).setMarketPriceBounds(token, e18("50"), e18("150"));
    await expect(pool.connect(borrower).depositCollateral(token, e18("1"))).to.emit(pool, "CollateralDeposited");
  });

  it("prunes collateral and borrow token lists when balances hit zero (hardening #4)", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    const token = await nvda.getAddress();
    await pool.connect(lender).supplyLiquidity(e18("5000"));
    await pool.connect(borrower).depositCollateral(token, e18("10"));
    expect((await pool.getUserCollateralTokens(borrower.address)).length).to.equal(1);
    await pool.connect(borrower).borrow(token, e18("100"));
    expect((await pool.getUserBorrowTokens(borrower.address)).length).to.equal(1);
    await pool.connect(borrower).repay(ethers.MaxUint256);
    expect((await pool.getUserBorrowTokens(borrower.address)).length).to.equal(0);
    await pool.connect(borrower).withdrawCollateral(token, e18("10"));
    expect((await pool.getUserCollateralTokens(borrower.address)).length).to.equal(0);
  });

  it("lets a lender supply and withdraw native ETH liquidity", async function () {
    const { lender, pool } = await fixture();
    await expect(pool.connect(lender).supplyEthLiquidity({ value: e18("2") })).to.emit(pool, "EthSupplied");
    expect(await pool.suppliedEthLiquidity(lender.address)).to.equal(e18("2"));
    expect(await pool.ethWithdrawableLiquidity(lender.address)).to.equal(e18("2"));
    expect(await pool.totalSuppliedEthLiquidity()).to.equal(e18("2"));
    expect(await pool.ethLiquidityAvailable()).to.equal(e18("2"));

    await expect(() => pool.connect(lender).withdrawEthLiquidity(e18("0.75"))).to.changeEtherBalances(
      [lender, pool],
      [e18("0.75"), -e18("0.75")],
    );
    expect(await pool.ethWithdrawableLiquidity(lender.address)).to.equal(e18("1.25"));
  });

  it("treats direct ETH transfers as ETH liquidity deposits and enforces the ETH cap", async function () {
    const { owner, lender, borrower, pool } = await fixture();
    await pool.connect(owner).setEthSupplyCap(e18("1.5"));
    await expect(lender.sendTransaction({ to: await pool.getAddress(), value: e18("1") })).to.emit(pool, "EthSupplied");
    expect(await pool.suppliedEthLiquidity(lender.address)).to.equal(e18("1"));
    await expect(pool.connect(borrower).supplyEthLiquidity({ value: e18("0.6") })).to.be.revertedWithCustomError(pool, "SupplyCapExceeded");
  });

  it("allows stock-token collateral deposit and safe USDG borrowing with an origination fee", async function () {
    const { lender, borrower, treasury, pool, nvda, usdg } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await expect(pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"))).to.emit(pool, "CollateralDeposited");
    expect(await pool.borrowLimit(borrower.address, await nvda.getAddress())).to.equal(e18("500"));
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("400"))).to.emit(pool, "Borrowed");
    expect(await usdg.balanceOf(borrower.address)).to.equal(e18("100399"));
    expect(await usdg.balanceOf(treasury.address)).to.equal(e18("1"));
    expect(await pool.debtBalance(borrower.address)).to.equal(e18("400"));
    expect(await pool.healthFactor(borrower.address, await nvda.getAddress())).to.equal(ethers.parseUnits("1.625", 18));
  });

  it("computes portfolio account data across multiple collateral stocks", async function () {
    const { lender, borrower, pool, nvda, msft } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("5"));
    await pool.connect(borrower).depositCollateral(await msft.getAddress(), e18("10"));
    const data = await pool.getUserAccountData(borrower.address);
    expect(data.totalCollateralValue).to.equal(e18("1000"));
    expect(data.borrowLimitValue).to.equal(e18("500"));
    expect(data.liquidationLimitValue).to.equal(e18("650"));
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"))).to.emit(pool, "Borrowed");
    expect(await pool.healthFactor(borrower.address, await nvda.getAddress())).to.equal(ethers.parseUnits("1.3", 18));
  });

  it("keeps per-collateral borrow buckets coherent when repaying global debt", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("20"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("600"));
    expect((await pool.markets(await nvda.getAddress())).totalBorrowed).to.equal(e18("600"));
    await pool.connect(borrower).repay(e18("250"));
    expect((await pool.markets(await nvda.getAddress())).totalBorrowed).to.be.closeTo(e18("350"), e18("0.01"));
  });

  it("blocks over-borrowing and collateral withdrawals that would break portfolio health", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("501"))).to.be.revertedWithCustomError(pool, "UnsafePosition");
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("400"));
    await expect(pool.connect(borrower).withdrawCollateral(await nvda.getAddress(), e18("3"))).to.be.revertedWithCustomError(pool, "UnsafePosition");
  });

  it("allows repay then collateral withdrawal", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("400"));
    await expect(pool.connect(borrower).repay(ethers.MaxUint256)).to.emit(pool, "Repaid");
    await expect(pool.connect(borrower).withdrawCollateral(await nvda.getAddress(), e18("10"))).to.emit(pool, "CollateralWithdrawn");
    expect(await nvda.balanceOf(borrower.address)).to.equal(e18("100"));
  });

  it("liquidates toward a target health factor and takes protocol fee from bonus collateral only", async function () {
    const { lender, borrower, liquidator, treasury, pool, nvda, nvdaFeed, usdg } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"));
    await nvdaFeed.setAnswer(price8("60"));
    expect(await pool.healthFactor(borrower.address, await nvda.getAddress())).to.equal(ethers.parseUnits("0.78", 18));
    const maxRepay = await pool.maxLiquidatableDebt(borrower.address, await nvda.getAddress());
    expect(maxRepay).to.be.gt(e18("100"));
    const treasuryUsdBefore = await usdg.balanceOf(treasury.address);
    await expect(pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), maxRepay)).to.emit(pool, "Liquidated");
    expect(await usdg.balanceOf(treasury.address)).to.equal(treasuryUsdBefore);
    expect(await nvda.balanceOf(treasury.address)).to.be.gt(0);
    const hf = await pool.healthFactor(borrower.address, await nvda.getAddress());
    expect(hf).to.be.closeTo(await pool.targetHealthFactor(), e18("0.000001"));
  });

  it("rejects stale, invalid, paused, and down-sequencer oracle states", async function () {
    const { lender, borrower, pool, nvda, nvdaFeed, sequencer } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await nvdaFeed.setUpdatedAt(1);
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("100"))).to.be.revertedWithCustomError(pool, "OracleStale");
    await nvdaFeed.setAnswer(0);
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("100"))).to.be.revertedWithCustomError(pool, "InvalidOracle");
    await nvdaFeed.setAnswer(price8("100"));
    await nvda.setOraclePaused(true);
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("100"))).to.be.revertedWithCustomError(pool, "OraclePaused");
    await nvda.setOraclePaused(false);
    await sequencer.setStatus(1, 1);
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("100"))).to.be.revertedWith("Sequencer down");
    await sequencer.setStatus(0, 0);
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("100"))).to.be.revertedWithCustomError(pool, "InvalidOracle");
  });

  it("accrues utilization-based interest, pays suppliers, and keeps protocol reserves", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"));
    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await pool.accrueInterest();
    expect(await pool.debtBalance(borrower.address)).to.be.gt(e18("500"));
    expect(await pool.withdrawableLiquidity(lender.address)).to.be.gt(e18("10000"));
    expect(await pool.protocolReserves()).to.be.gt(0);
  });

  it("enforces borrow caps, supply caps, and target-HF max liquidation", async function () {
    const { lender, borrower, liquidator, pool, nvda, nvdaFeed } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await expect(pool.connect(lender).supplyLiquidity(e18("16000"))).to.be.revertedWithCustomError(pool, "SupplyCapExceeded");
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("30"));
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("1001"))).to.be.revertedWithCustomError(pool, "BorrowCapExceeded");
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("900"));
    await nvdaFeed.setAnswer(price8("40"));
    const maxRepay = await pool.maxLiquidatableDebt(borrower.address, await nvda.getAddress());
    await expect(pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), maxRepay + e18("1"))).to.be.revertedWithCustomError(pool, "LiquidationAmountTooHigh");
    await pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), maxRepay);
  });

  it("supports dust-aware full close and explicit deficit reporting", async function () {
    const { lender, borrower, liquidator, pool, nvda, nvdaFeed } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"));
    await nvdaFeed.setAnswer(price8("1"));
    await expect(pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), e18("500"))).to.emit(pool, "DeficitReported");
    expect(await pool.protocolDeficit()).to.be.gt(0);
  });

  it("uses granular market flags so frozen markets block new risk but allow repay and liquidation", async function () {
    const { owner, lender, borrower, liquidator, pool, nvda, nvdaFeed } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("400"));
    await pool.connect(owner).setMarketFlags(await nvda.getAddress(), false, true, true);
    await expect(pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("1"))).to.be.revertedWithCustomError(pool, "MarketFrozen");
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e18("1"))).to.be.revertedWithCustomError(pool, "MarketFrozen");
    await expect(pool.connect(borrower).repay(e18("25"))).to.emit(pool, "Repaid");
    await nvdaFeed.setAnswer(price8("20"));
    await expect(pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), e18("25"))).to.emit(pool, "Liquidated");
  });

  it("rounds LP withdrawal shares up so share accounting stays solvent", async function () {
    const { lender, borrower, pool, nvda } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("20"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"));
    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await pool.accrueInterest();
    const beforeShares = await pool.suppliedLiquidity(lender.address);
    await pool.connect(lender).withdrawLiquidity(e18("1"));
    expect(beforeShares - await pool.suppliedLiquidity(lender.address)).to.be.gt(e18("1") / 2n);
  });

  it("normalizes real 6-decimal USDG debt against 18-decimal USD collateral value", async function () {
    const [owner, lender, borrower, , treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdg6 = await MockERC20.deploy("USDG", "USDG", 6);
    const nvda = await MockERC20.deploy("Robinhood NVDA Stock Token", "NVDA", 18);
    const MockOracle = await ethers.getContractFactory("MockOracle");
    const nvdaFeed = await MockOracle.deploy(8, price8("100"));
    const MockSequencer = await ethers.getContractFactory("MockSequencerUptimeFeed");
    const sequencer = await MockSequencer.deploy();
    await ethers.provider.send("evm_increaseTime", [60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    const Pool = await ethers.getContractFactory("GuildBank");
    const pool = await Pool.deploy(await usdg6.getAddress(), owner.address, treasury.address, await sequencer.getAddress());
    await pool.listMarket(await nvda.getAddress(), await nvdaFeed.getAddress(), 5000, 6500, 500, 60 * 60 * 24 * 4, e6("1000"), e18("25000"));

    await usdg6.mint(lender.address, e6("10000"));
    await nvda.mint(borrower.address, e18("10"));
    await usdg6.connect(lender).approve(await pool.getAddress(), ethers.MaxUint256);
    await nvda.connect(borrower).approve(await pool.getAddress(), ethers.MaxUint256);

    await pool.connect(lender).supplyLiquidity(e6("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    expect(await pool.borrowLimit(borrower.address, await nvda.getAddress())).to.equal(e18("500"));
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e6("501"))).to.be.revertedWithCustomError(pool, "UnsafePosition");
    await expect(pool.connect(borrower).borrow(await nvda.getAddress(), e6("400"))).to.emit(pool, "Borrowed");
    expect(await pool.debtBalance(borrower.address)).to.equal(e6("400"));
    expect((await pool.getUserAccountData(borrower.address)).totalDebtValue).to.equal(e18("400"));
    expect(await pool.healthFactor(borrower.address, await nvda.getAddress())).to.equal(ethers.parseUnits("1.625", 18));
  });

  it("enforces per-market collateral supply caps independently from USDG liquidity cap", async function () {
    const { borrower, lender, pool, nvda, msft } = await fixture();
    await expect(pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("25001"))).to.be.revertedWithCustomError(pool, "SupplyCapExceeded");
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("100"));
    await pool.connect(borrower).depositCollateral(await msft.getAddress(), e18("100"));
    await expect(pool.connect(lender).supplyLiquidity(e18("26000"))).to.be.revertedWithCustomError(pool, "SupplyCapExceeded");
  });

  it("socializes bad debt to supplier share value instead of leaving protocolDeficit write-only", async function () {
    const { lender, borrower, liquidator, pool, nvda, nvdaFeed } = await fixture();
    await pool.connect(lender).supplyLiquidity(e18("10000"));
    await pool.connect(borrower).depositCollateral(await nvda.getAddress(), e18("10"));
    await pool.connect(borrower).borrow(await nvda.getAddress(), e18("500"));
    await nvdaFeed.setAnswer(price8("1"));
    await expect(pool.connect(liquidator).liquidate(borrower.address, await nvda.getAddress(), e18("500"))).to.emit(pool, "DeficitReported");
    expect(await pool.protocolDeficit()).to.be.gt(0);
    expect(await pool.withdrawableLiquidity(lender.address)).to.be.lt(e18("10000"));
  });

});

