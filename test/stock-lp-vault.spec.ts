import { expect } from "chai";
import { ethers } from "hardhat";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const FULL_LOWER = -887220; // MIN_TICK aligned to the 60 spacing of a 0.30% pool
const FULL_UPPER = 887220;

/**
 * StockLpVault — the contract we are actually shipping first.
 *
 * The vault holds user funds, so these tests care less about "does the happy path
 * work" and more about the invariants that decide whether a depositor can be
 * cheated: share value must never be diluted by a late arrival, fees must be split
 * in proportion to time-weighted ownership, and principal must always come back.
 */
describe("StockLpVault (full-range Uniswap V3 vault)", function () {
  async function fixture() {
    const [owner, alice, bob, feeRecipient] = await ethers.getSigners();

    const Tok = await ethers.getContractFactory("MintableToken");
    const a = await Tok.deploy("Apple Stock Token", "AAPL");
    const b = await Tok.deploy("Global Dollar", "USDG");
    const [addrA, addrB] = [await a.getAddress(), await b.getAddress()];
    // The vault requires token0 < token1, exactly as the pool does.
    const [token0, token1] =
      addrA.toLowerCase() < addrB.toLowerCase() ? [a, b] : [b, a];

    const Npm = await ethers.getContractFactory("MockNonfungiblePositionManager");
    const npm = await Npm.deploy();

    const Vault = await ethers.getContractFactory("StockLpVault");
    const vault = await Vault.deploy(
      "Whitmore AAPL/USDG LP",
      "wsAAPLLP",
      await npm.getAddress(),
      await token0.getAddress(),
      await token1.getAddress(),
      3000,
      FULL_LOWER,
      FULL_UPPER,
      feeRecipient.address,
      owner.address,
    );

    for (const user of [alice, bob]) {
      for (const t of [token0, token1]) {
        await t.mint(user.address, e18("1000000"));
        await t.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
      }
    }

    return { owner, alice, bob, feeRecipient, token0, token1, npm, vault };
  }

  /* ------------------------------- deposits -------------------------------- */

  it("mints the position on the first deposit and bootstraps shares 1:1 with liquidity", async function () {
    const { alice, vault, npm } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);

    expect(await vault.positionId()).to.equal(1n);
    expect(await vault.positionLiquidity()).to.equal(e18("100"));
    expect(await vault.balanceOf(alice.address)).to.equal(e18("100"));
    expect(await vault.totalSupply()).to.equal(e18("100"));
    expect(await npm.nextId()).to.equal(2n);
  });

  it("issues later depositors shares in proportion to the liquidity they add", async function () {
    const { alice, bob, vault } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await vault.connect(bob).deposit(e18("300"), e18("300"), 0, 0);

    expect(await vault.balanceOf(bob.address)).to.equal(e18("300"));
    expect(await vault.totalSupply()).to.equal(e18("400"));
    // bob owns three quarters of the vault
    expect((await vault.balanceOf(bob.address)) * 4n).to.equal((await vault.totalSupply()) * 3n);
  });

  it("refunds the side the position could not use", async function () {
    const { alice, vault, token0, token1 } = await fixture();
    const before0 = await token0.balanceOf(alice.address);
    const before1 = await token1.balanceOf(alice.address);

    // lopsided: only 100 of each can be used, so 400 of token1 must come back
    await vault.connect(alice).deposit(e18("100"), e18("500"), 0, 0);

    expect(before0 - (await token0.balanceOf(alice.address))).to.equal(e18("100"));
    expect(before1 - (await token1.balanceOf(alice.address))).to.equal(e18("100"));
    // and the vault keeps nothing
    expect(await token0.balanceOf(await vault.getAddress())).to.equal(0);
    expect(await token1.balanceOf(await vault.getAddress())).to.equal(0);
  });

  it("rejects a deposit of nothing", async function () {
    const { alice, vault } = await fixture();
    await expect(vault.connect(alice).deposit(0, 0, 0, 0)).to.be.revertedWith("zero deposit");
  });

  it("honours the slippage floor passed to the position manager", async function () {
    const { alice, vault } = await fixture();
    await expect(vault.connect(alice).deposit(e18("100"), e18("100"), e18("200"), 0)).to.be.revertedWith(
      "Price slippage check",
    );
  });

  /* ------------------------------- compounding ------------------------------ */

  it("takes exactly the platform fee on collected fees and reinvests the rest", async function () {
    const { alice, feeRecipient, vault, npm, token0, token1 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    const liquidityBefore = await vault.positionLiquidity();

    await npm.accrueFees(1, e18("10"), e18("10"));
    await expect(vault.compound()).to.emit(vault, "Compounded");

    // 10% of each side to the platform
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(e18("1"));
    expect(await token1.balanceOf(feeRecipient.address)).to.equal(e18("1"));
    // the other 9 of each went back into the position
    expect(await vault.positionLiquidity()).to.equal(liquidityBefore + e18("9"));
  });

  it("is a no-op before a position exists and when there is nothing to collect", async function () {
    const { alice, vault, npm, feeRecipient, token0 } = await fixture();
    await expect(vault.compound()).to.not.be.reverted; // positionId == 0

    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    const liq = await vault.positionLiquidity();
    await vault.compound();
    expect(await vault.positionLiquidity()).to.equal(liq);
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(0);
    expect(await npm.nextId()).to.equal(2n); // no second position was minted
  });

  // Found on mainnet, not here: the SPCX vault collected 3 wei of USDG in fees and
  // nothing on the other side, so `_compound` asked Uniswap to add one-sided
  // liquidity. `pool.mint` reverts on zero liquidity, and because compounding runs
  // first in both entry points, every deposit and every withdrawal on that vault
  // reverted. Fees arrive one side at a time all the time — a run of buys pays only
  // the quote token — so this locks a live vault holding real money.
  it("survives fees that land on only one side of the pair", async function () {
    const { alice, bob, vault, npm, feeRecipient, token0, token1 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    const liquidityBefore = await vault.positionLiquidity();

    await npm.accrueFees(1, 0, 3n); // dust, one side only

    await expect(vault.compound()).to.not.be.reverted;
    // The dust waits in the vault for a compound that has both sides, instead of
    // blocking anyone: the position is untouched and both entry points still work.
    expect(await vault.positionLiquidity()).to.equal(liquidityBefore);
    expect(await token1.balanceOf(await vault.getAddress())).to.be.gt(0);

    await expect(vault.connect(bob).deposit(e18("50"), e18("50"), 0, 0)).to.not.be.reverted;
    await expect(vault.connect(alice).withdraw(await vault.balanceOf(alice.address), 0, 0)).to.not.be.reverted;
    expect(await token0.balanceOf(alice.address)).to.be.gt(0);
  });

  // Also found on mainnet: after the only depositor withdrew in full, the SPCX vault
  // sat at positionId=2, totalSupply=0, liquidity=0 — and every further deposit
  // reverted with "no liquidity". A vault that dies the first time it empties is not
  // a vault; the emptied state has to be indistinguishable from a fresh one.
  it("still accepts deposits after every holder has withdrawn", async function () {
    const { alice, bob, vault } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await vault.connect(alice).withdraw(await vault.balanceOf(alice.address), 0, 0);
    expect(await vault.totalSupply()).to.equal(0);

    await expect(vault.connect(bob).deposit(e18("60"), e18("60"), 0, 0)).to.not.be.reverted;
    // Re-bootstrapped on the same rule as the first ever deposit: 1 share = 1 unit.
    expect(await vault.balanceOf(bob.address)).to.equal(await vault.positionLiquidity());
    await expect(vault.connect(bob).withdraw(await vault.balanceOf(bob.address), 0, 0)).to.not.be.reverted;
  });

  it("reinvests again as soon as both sides have fees", async function () {
    const { alice, vault, npm } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, 0, e18("5")); // one-sided: skipped
    await vault.compound();
    const stalled = await vault.positionLiquidity();

    await npm.accrueFees(1, e18("5"), 0); // now the other side arrives
    await vault.compound();
    expect(await vault.positionLiquidity()).to.be.gt(stalled);
  });

  it("lets anyone compound — the keeper needs no privileges", async function () {
    const { alice, bob, vault, npm } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("4"), e18("4"));
    await expect(vault.connect(bob).compound()).to.emit(vault, "Compounded");
  });

  /* ---------------------- the invariant that matters most ------------------- */

  it("does not let a late depositor skim fees earned before they arrived", async function () {
    const { alice, bob, vault, npm } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);

    // fees accrue while alice is the only holder
    await npm.accrueFees(1, e18("50"), e18("50"));

    // bob deposits the same size. deposit() compounds first, so those fees are already
    // folded into share value and bob buys in at the higher price.
    await vault.connect(bob).deposit(e18("100"), e18("100"), 0, 0);

    const aliceShares = await vault.balanceOf(alice.address);
    const bobShares = await vault.balanceOf(bob.address);
    // alice's 100 of liquidity is now worth more than bob's, so she must hold more shares
    expect(aliceShares).to.be.gt(bobShares);
    // concretely: liquidity was 145 when bob added 100 -> 100 * 100/145 shares
    expect(bobShares).to.be.closeTo((e18("100") * e18("100")) / e18("145"), e18("0.01"));
  });

  it("splits fees earned after both are in proportionally", async function () {
    const { alice, bob, vault, npm, token0 } = await fixture();
    await vault.connect(alice).deposit(e18("300"), e18("300"), 0, 0);
    await vault.connect(bob).deposit(e18("100"), e18("100"), 0, 0);

    await npm.accrueFees(1, e18("40"), e18("40"));
    await vault.compound();

    const aliceOut = await vault
      .connect(alice)
      .withdraw.staticCall(await vault.balanceOf(alice.address), 0, 0);
    const bobOut = await vault.connect(bob).withdraw.staticCall(await vault.balanceOf(bob.address), 0, 0);
    // alice holds 3x the shares, so she withdraws ~3x
    expect(aliceOut[0]).to.be.closeTo(bobOut[0] * 3n, e18("0.01"));
  });

  /* ------------------------------- withdrawals ------------------------------ */

  it("returns principal proportionally and burns the shares", async function () {
    const { alice, vault, token0, token1 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    const before0 = await token0.balanceOf(alice.address);
    const before1 = await token1.balanceOf(alice.address);

    await vault.connect(alice).withdraw(e18("50"), 0, 0);

    expect(await vault.balanceOf(alice.address)).to.equal(e18("50"));
    expect((await token0.balanceOf(alice.address)) - before0).to.equal(e18("50"));
    expect((await token1.balanceOf(alice.address)) - before1).to.equal(e18("50"));
  });

  it("pays out accrued fees on the way out", async function () {
    const { alice, vault, npm, token0 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("20"), e18("20"));

    const before = await token0.balanceOf(alice.address);
    await vault.connect(alice).withdraw(await vault.balanceOf(alice.address), 0, 0);

    // 100 principal + 18 of reinvested fees (20 less the 10% platform cut)
    expect((await token0.balanceOf(alice.address)) - before).to.be.closeTo(e18("118"), e18("0.01"));
    expect(await vault.totalSupply()).to.equal(0);
  });

  it("rejects withdrawing more than the caller holds", async function () {
    const { alice, bob, vault } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await expect(vault.connect(bob).withdraw(e18("1"), 0, 0)).to.be.revertedWith("bad shares");
    await expect(vault.connect(alice).withdraw(e18("101"), 0, 0)).to.be.revertedWith("bad shares");
    await expect(vault.connect(alice).withdraw(0, 0, 0)).to.be.revertedWith("bad shares");
  });

  it("lets every depositor exit fully without stranding value", async function () {
    const { alice, bob, vault, npm, token0, token1 } = await fixture();
    await vault.connect(alice).deposit(e18("250"), e18("250"), 0, 0);
    await vault.connect(bob).deposit(e18("750"), e18("750"), 0, 0);
    await npm.accrueFees(1, e18("100"), e18("100"));

    await vault.connect(alice).withdraw(await vault.balanceOf(alice.address), 0, 0);
    await vault.connect(bob).withdraw(await vault.balanceOf(bob.address), 0, 0);

    expect(await vault.totalSupply()).to.equal(0);
    expect(await vault.positionLiquidity()).to.equal(0);
    // nothing is left sitting in the vault
    expect(await token0.balanceOf(await vault.getAddress())).to.be.lt(e18("0.0001"));
    expect(await token1.balanceOf(await vault.getAddress())).to.be.lt(e18("0.0001"));
  });

  /* ---------------------------------- admin --------------------------------- */

  it("caps the platform fee at 20% and lets the owner lower it", async function () {
    const { owner, alice, feeRecipient, vault, npm, token0 } = await fixture();
    await expect(vault.setPerformanceFee(2001)).to.be.revertedWith("fee too high");
    await vault.connect(owner).setPerformanceFee(0);

    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("10"), e18("10"));
    await vault.compound();
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(0);
  });

  it("keeps admin functions away from everyone else", async function () {
    const { alice, vault } = await fixture();
    await expect(vault.connect(alice).setPerformanceFee(0)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount",
    );
    await expect(vault.connect(alice).setFeeRecipient(alice.address)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount",
    );
    await expect(vault.connect(alice).pause()).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  it("routes the platform fee to a newly set recipient", async function () {
    const { owner, alice, bob, vault, npm, token0 } = await fixture();
    await vault.connect(owner).setFeeRecipient(bob.address);
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("10"), e18("10"));
    await vault.compound();
    expect(await token0.balanceOf(bob.address)).to.be.gt(e18("1000000")); // started at 1m, gained the fee
  });

  it("blocks new deposits while paused but never traps a withdrawal", async function () {
    const { owner, alice, vault } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await vault.connect(owner).pause();

    await expect(vault.connect(alice).deposit(e18("1"), e18("1"), 0, 0)).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause",
    );
    await expect(vault.connect(alice).withdraw(e18("50"), 0, 0)).to.not.be.reverted;
    await expect(vault.compound()).to.not.be.reverted;

    await vault.connect(owner).unpause();
    await expect(vault.connect(alice).deposit(e18("1"), e18("1"), 0, 0)).to.not.be.reverted;
  });

  /* ------------------------------ constructor ------------------------------- */

  it("refuses a mis-ordered or malformed configuration", async function () {
    const { owner, feeRecipient, npm, token0, token1 } = await fixture();
    const Vault = await ethers.getContractFactory("StockLpVault");
    const npmAddr = await npm.getAddress();
    const t0 = await token0.getAddress();
    const t1 = await token1.getAddress();

    // token1 < token0 is invalid — the pool would disagree with the vault
    await expect(
      Vault.deploy("x", "x", npmAddr, t1, t0, 3000, FULL_LOWER, FULL_UPPER, feeRecipient.address, owner.address),
    ).to.be.revertedWith("token order");

    await expect(
      Vault.deploy("x", "x", npmAddr, t0, t1, 3000, FULL_UPPER, FULL_LOWER, feeRecipient.address, owner.address),
    ).to.be.revertedWith("tick order");

    await expect(
      Vault.deploy("x", "x", ethers.ZeroAddress, t0, t1, 3000, FULL_LOWER, FULL_UPPER, feeRecipient.address, owner.address),
    ).to.be.revertedWith("zero address");
  });
});

/**
 * Is the keeper actually required?
 *
 * `deposit()` and `withdraw()` both compound before doing anything else, so an
 * active vault settles its own fees. These tests pin down what is really lost when
 * nobody calls `compound()` — the answer decides whether the keeper is infrastructure
 * or a nicety.
 */
describe("StockLpVault — what the keeper actually buys us", function () {
  async function fixture() {
    const [owner, alice, bob, feeRecipient] = await ethers.getSigners();
    const Tok = await ethers.getContractFactory("MintableToken");
    const a = await Tok.deploy("Apple Stock Token", "AAPL");
    const b = await Tok.deploy("Global Dollar", "USDG");
    const [addrA, addrB] = [await a.getAddress(), await b.getAddress()];
    const [token0, token1] = addrA.toLowerCase() < addrB.toLowerCase() ? [a, b] : [b, a];
    const Npm = await ethers.getContractFactory("MockNonfungiblePositionManager");
    const npm = await Npm.deploy();
    const Vault = await ethers.getContractFactory("StockLpVault");
    const vault = await Vault.deploy(
      "v", "v", await npm.getAddress(), await token0.getAddress(), await token1.getAddress(),
      3000, FULL_LOWER, FULL_UPPER, feeRecipient.address, owner.address,
    );
    for (const u of [alice, bob]) {
      for (const t of [token0, token1]) {
        await t.mint(u.address, e18("1000000"));
        await t.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
      }
    }
    return { owner, alice, bob, feeRecipient, token0, token1, npm, vault };
  }

  it("still collects the platform fee on the next deposit, even if nobody ever compounds", async function () {
    const { alice, bob, feeRecipient, vault, npm, token0 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);

    // A month of fees pile up with no keeper running.
    await npm.accrueFees(1, e18("30"), e18("30"));
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(0);

    // The next deposit settles them. Revenue was deferred, not lost.
    await vault.connect(bob).deposit(e18("10"), e18("10"), 0, 0);
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(e18("3"));
  });

  it("still collects the platform fee on a withdrawal", async function () {
    const { alice, feeRecipient, vault, npm, token0 } = await fixture();
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("30"), e18("30"));

    await vault.connect(alice).withdraw(e18("1"), 0, 0);
    expect(await token0.balanceOf(feeRecipient.address)).to.equal(e18("3"));
  });

  it("costs depositors only the compounding, which is what the keeper is for", async function () {
    const { alice, bob, vault, npm } = await fixture();
    // Two identical vaults would be ideal; instead compare one vault's liquidity
    // when fees are folded in early versus left sitting.
    await vault.connect(alice).deposit(e18("100"), e18("100"), 0, 0);
    await npm.accrueFees(1, e18("20"), e18("20"));

    const uncompounded = await vault.positionLiquidity();
    await vault.compound();
    const compounded = await vault.positionLiquidity();

    // Until someone compounds, the fees are not working — they sit as tokensOwed and
    // earn nothing. That gap is the entire value of running a keeper.
    expect(uncompounded).to.equal(e18("100"));
    expect(compounded).to.equal(e18("118"));
  });
});
