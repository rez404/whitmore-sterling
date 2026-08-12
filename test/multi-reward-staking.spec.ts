import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const WEEK = 7 * 24 * 60 * 60;

describe("MultiRewardStaking (stake one token, earn many partner tokens)", function () {
  async function fixture() {
    const [owner, alice, bob, treasury, partnerA, partnerB] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("WhitmoreToken");
    const platform = await Token.deploy(owner.address, e18("1000000"));

    const Mock = await ethers.getContractFactory("MockERC20");
    const cash = await Mock.deploy("Cash Cat", "CASHCAT", 18);
    const pons = await Mock.deploy("Pons", "PONS", 18);

    const Staking = await ethers.getContractFactory("MultiRewardStaking");
    const staking = await Staking.deploy(owner.address, await platform.getAddress(), treasury.address);

    for (const user of [alice, bob]) {
      await platform.transfer(user.address, e18("1000"));
      await platform.connect(user).approve(await staking.getAddress(), ethers.MaxUint256);
    }

    // Each partner funds its own stream and never holds owner rights.
    await staking.addRewardToken(await cash.getAddress(), partnerA.address, WEEK);
    await staking.addRewardToken(await pons.getAddress(), partnerB.address, WEEK);
    await cash.mint(partnerA.address, e18("70000"));
    await pons.mint(partnerB.address, e18("7000"));
    await cash.connect(partnerA).approve(await staking.getAddress(), ethers.MaxUint256);
    await pons.connect(partnerB).approve(await staking.getAddress(), ethers.MaxUint256);

    return { owner, alice, bob, treasury, partnerA, partnerB, platform, cash, pons, staking };
  }

  it("accrues every registered reward stream in parallel from a single stake", async function () {
    const { alice, partnerA, partnerB, cash, pons, staking } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await staking.connect(partnerB).notifyRewardAmount(await pons.getAddress(), e18("7000"));

    await time.increase(WEEK / 2);

    const [tokens, amounts] = await staking.earnedAll(alice.address);
    expect(tokens.length).to.equal(2);
    expect(amounts[0]).to.be.gt(e18("34000")); // ~half of 70k
    expect(amounts[1]).to.be.gt(e18("3400")); // ~half of 7k
  });

  it("pays out every reward token in one claim and takes the 10% platform fee on each", async function () {
    const { alice, treasury, partnerA, partnerB, cash, pons, staking } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await staking.connect(partnerB).notifyRewardAmount(await pons.getAddress(), e18("7000"));
    await time.increase(WEEK + 1);

    await staking.connect(alice).getReward();

    const aliceCash = await cash.balanceOf(alice.address);
    const treasuryCash = await cash.balanceOf(treasury.address);
    const alicePons = await pons.balanceOf(alice.address);
    const treasuryPons = await pons.balanceOf(treasury.address);

    expect(aliceCash).to.be.gt(0);
    expect(alicePons).to.be.gt(0);
    // treasury takes exactly a ninth of what the user nets (10% fee => 90/10 split)
    expect(treasuryCash * 9n).to.be.closeTo(aliceCash, e18("1"));
    expect(treasuryPons * 9n).to.be.closeTo(alicePons, e18("1"));
  });

  it("splits a stream pro-rata between stakers", async function () {
    const { alice, bob, partnerA, cash, staking } = await fixture();
    await staking.connect(alice).stake(e18("300"));
    await staking.connect(bob).stake(e18("100"));
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK + 1);

    const aliceEarned = await staking.earned(alice.address, await cash.getAddress());
    const bobEarned = await staking.earned(bob.address, await cash.getAddress());
    expect(aliceEarned).to.be.closeTo(bobEarned * 3n, e18("1"));
  });

  it("adds a new partner mid-stream without anyone unstaking", async function () {
    const { owner, alice, partnerA, cash, staking } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK / 2);

    const Mock = await ethers.getContractFactory("MockERC20");
    const stonk = await Mock.deploy("StonkBroker", "STONKBROKER", 18);
    await staking.addRewardToken(await stonk.getAddress(), owner.address, WEEK);
    await stonk.mint(owner.address, e18("5000"));
    await stonk.approve(await staking.getAddress(), ethers.MaxUint256);
    await staking.notifyRewardAmount(await stonk.getAddress(), e18("5000"));
    await time.increase(WEEK / 2);

    // The existing position starts earning the new token with no action from the staker.
    expect(await staking.earned(alice.address, await stonk.getAddress())).to.be.gt(0);
    expect(await staking.balanceOf(alice.address)).to.equal(e18("100"));
  });

  it("credits only what was received when a partner token taxes transfers", async function () {
    const { owner, alice, staking } = await fixture();
    const Fee = await ethers.getContractFactory("MockFeeToken");
    const taxed = await Fee.deploy("Taxed", "TAX", 500); // 5% burn on transfer
    await staking.addRewardToken(await taxed.getAddress(), owner.address, WEEK);
    await taxed.mint(owner.address, e18("10000"));
    await taxed.approve(await staking.getAddress(), ethers.MaxUint256);

    await staking.connect(alice).stake(e18("100"));
    await staking.notifyRewardAmount(await taxed.getAddress(), e18("10000"));

    // 5% was burned in flight, so the stream must be sized on 9,500 — not 10,000.
    const forDuration = await staking.getRewardForDuration(await taxed.getAddress());
    expect(forDuration).to.be.lte(e18("9500"));
    expect(forDuration).to.be.gt(e18("9400"));

    // And the contract can actually pay what it promised.
    await time.increase(WEEK + 1);
    await expect(staking.connect(alice).getReward()).to.not.be.reverted;
  });

  it("only lets the stream's distributor (or the owner) fund it", async function () {
    const { alice, partnerB, cash, staking } = await fixture();
    await expect(
      staking.connect(partnerB).notifyRewardAmount(await cash.getAddress(), e18("1")),
    ).to.be.revertedWithCustomError(staking, "NotDistributor");
    await expect(
      staking.connect(alice).notifyRewardAmount(await cash.getAddress(), e18("1")),
    ).to.be.revertedWithCustomError(staking, "NotDistributor");
  });

  it("refuses to make the staking token a reward, and caps the reward list", async function () {
    const { owner, platform, staking } = await fixture();
    await expect(
      staking.addRewardToken(await platform.getAddress(), owner.address, WEEK),
    ).to.be.revertedWithCustomError(staking, "CannotUseStakingToken");

    const Mock = await ethers.getContractFactory("MockERC20");
    // two are already registered; fill to the cap of 8
    for (let i = 0; i < 6; i++) {
      const t = await Mock.deploy(`T${i}`, `T${i}`, 18);
      await staking.addRewardToken(await t.getAddress(), owner.address, WEEK);
    }
    const extra = await Mock.deploy("Extra", "EXTRA", 18);
    await expect(
      staking.addRewardToken(await extra.getAddress(), owner.address, WEEK),
    ).to.be.revertedWithCustomError(staking, "TooManyRewardTokens");
  });

  it("protects staked principal and live reward tokens from recoverERC20", async function () {
    const { platform, cash, staking } = await fixture();
    await expect(staking.recoverERC20(await platform.getAddress(), 1)).to.be.revertedWithCustomError(
      staking,
      "CannotUseStakingToken",
    );
    await expect(staking.recoverERC20(await cash.getAddress(), 1)).to.be.revertedWithCustomError(
      staking,
      "AlreadyRewardToken",
    );
  });

  it("blocks a duration change while a stream is running", async function () {
    const { partnerA, cash, staking } = await fixture();
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await expect(staking.setRewardsDuration(await cash.getAddress(), WEEK * 2)).to.be.revertedWithCustomError(
      staking,
      "PeriodStillActive",
    );
    await time.increase(WEEK + 2);
    await expect(staking.setRewardsDuration(await cash.getAddress(), WEEK * 2)).to.emit(
      staking,
      "RewardsDurationUpdated",
    );
  });

  it("lets a staker exit with principal and every reward in one call", async function () {
    const { alice, partnerA, cash, staking } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await staking.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK + 1);

    await staking.connect(alice).exit();
    expect(await staking.balanceOf(alice.address)).to.equal(0);
    expect(await cash.balanceOf(alice.address)).to.be.gt(0);
  });
});
