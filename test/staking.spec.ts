import { expect } from "chai";
import { ethers } from "hardhat";

const e18 = (v: string) => ethers.parseUnits(v, 18);

describe("StakingRewards (single-stake platform token -> partner token)", function () {
  async function fixture() {
    const [owner, alice, bob, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("WhitmoreToken");
    const platform = await Token.deploy(owner.address, e18("1000000"));
    const Mock = await ethers.getContractFactory("MockERC20");
    const partner = await Mock.deploy("Partner", "PTR", 18);
    const Staking = await ethers.getContractFactory("StakingRewards");
    const staking = await Staking.deploy(owner.address, await partner.getAddress(), await platform.getAddress(), treasury.address);
    await platform.transfer(alice.address, e18("1000"));
    await platform.transfer(bob.address, e18("1000"));
    await platform.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
    await platform.connect(bob).approve(await staking.getAddress(), ethers.MaxUint256);
    return { owner, alice, bob, treasury, platform, partner, staking };
  }

  it("lets users stake and withdraw the platform token", async function () {
    const { alice, staking } = await fixture();
    await expect(staking.connect(alice).stake(e18("100"))).to.emit(staking, "Staked");
    expect(await staking.balanceOf(alice.address)).to.equal(e18("100"));
    expect(await staking.totalSupply()).to.equal(e18("100"));
    await staking.connect(alice).withdraw(e18("40"));
    expect(await staking.balanceOf(alice.address)).to.equal(e18("60"));
  });

  it("earns nothing until a partner funds rewards (infrastructure-ready, no emissions)", async function () {
    const { alice, staking } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    expect(await staking.earned(alice.address)).to.equal(0n);
    expect(await staking.rewardRate()).to.equal(0n);
  });

  it("streams funded partner rewards pro-rata and pays out", async function () {
    const { owner, alice, bob, staking, partner } = await fixture();
    await staking.connect(alice).stake(e18("100"));
    await staking.connect(bob).stake(e18("300")); // alice 25%, bob 75%
    const reward = e18("700");
    await partner.mint(owner.address, reward);
    await partner.transfer(await staking.getAddress(), reward);
    await staking.notifyRewardAmount(reward);
    await ethers.provider.send("evm_increaseTime", [24 * 3600]);
    await ethers.provider.send("evm_mine", []);
    const aEarned = await staking.earned(alice.address);
    const bEarned = await staking.earned(bob.address);
    expect(aEarned).to.be.gt(0n);
    expect(bEarned).to.be.gt(aEarned * 2n);
    expect(bEarned).to.be.lt(aEarned * 4n);
    await expect(staking.connect(alice).getReward()).to.emit(staking, "RewardPaid");
    expect(await partner.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("takes a 10% platform fee on rewards claimed, to the fee recipient", async function () {
    const { owner, alice, staking, partner, treasury } = await fixture();
    expect(await staking.performanceFeeBps()).to.equal(1000n);
    await staking.connect(alice).stake(e18("100"));
    const reward = e18("700");
    await partner.mint(owner.address, reward);
    await partner.transfer(await staking.getAddress(), reward);
    await staking.notifyRewardAmount(reward);
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600 + 10]);
    await ethers.provider.send("evm_mine", []);
    const earned = await staking.earned(alice.address);
    await staking.connect(alice).getReward();
    const aliceBal = await partner.balanceOf(alice.address);
    const treasuryBal = await partner.balanceOf(treasury.address);
    const fee = earned / 10n; // 10%
    expect(treasuryBal).to.equal(fee);
    expect(aliceBal).to.equal(earned - fee);
    expect(aliceBal + treasuryBal).to.equal(earned);
  });

  it("refuses to recover the staking token", async function () {
    const { staking, platform } = await fixture();
    await expect(staking.recoverERC20(await platform.getAddress(), 1n)).to.be.revertedWith("cannot recover staking token");
  });
});
