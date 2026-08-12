import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

/**
 * End-to-end and adversarial coverage for the staking vault.
 *
 * The unit spec proves each function behaves; this one runs whole timelines and
 * then asserts the property that actually matters: the vault can always pay what
 * it has promised, and no participant can take more than their share.
 */
describe("MultiRewardStaking — end to end", function () {
  async function deploy() {
    const [owner, alice, bob, carol, treasury, partnerA, partnerB] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("WhitmoreToken");
    const whit = await Token.deploy(owner.address, e18("1000000"));

    const Mock = await ethers.getContractFactory("MockERC20");
    const cash = await Mock.deploy("Cash Cat", "CASHCAT", 18);
    const pons = await Mock.deploy("Pons", "PONS", 18);

    const Staking = await ethers.getContractFactory("MultiRewardStaking");
    const vault = await Staking.deploy(owner.address, await whit.getAddress(), treasury.address);

    for (const u of [alice, bob, carol]) {
      await whit.transfer(u.address, e18("10000"));
      await whit.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
    }

    await vault.addRewardToken(await cash.getAddress(), partnerA.address, WEEK);
    await vault.addRewardToken(await pons.getAddress(), partnerB.address, WEEK);
    await cash.mint(partnerA.address, e18("1000000"));
    await pons.mint(partnerB.address, e18("1000000"));
    await cash.connect(partnerA).approve(await vault.getAddress(), ethers.MaxUint256);
    await pons.connect(partnerB).approve(await vault.getAddress(), ethers.MaxUint256);

    return { owner, alice, bob, carol, treasury, partnerA, partnerB, whit, cash, pons, vault };
  }

  /** The vault must always hold at least what every staker could claim right now. */
  async function assertSolvent(vault: any, token: any, users: any[]) {
    let owed = 0n;
    for (const u of users) owed += await vault.earned(u.address, await token.getAddress());
    const held = await token.balanceOf(await vault.getAddress());
    expect(held, `vault holds ${held} but owes ${owed}`).to.be.gte(owed);
  }

  it("runs a full multi-partner timeline and stays solvent at every step", async function () {
    const { alice, bob, carol, treasury, partnerA, partnerB, whit, cash, pons, vault } = await deploy();
    const users = [alice, bob, carol];

    // day 0 — alice stakes, partner A opens a stream
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await assertSolvent(vault, cash, users);

    // day 2 — bob joins at 3x alice's size
    await time.increase(2 * DAY);
    await vault.connect(bob).stake(e18("3000"));
    await assertSolvent(vault, cash, users);

    // day 3 — partner B opens a second stream; nobody has to re-stake
    await time.increase(DAY);
    await vault.connect(partnerB).notifyRewardAmount(await pons.getAddress(), e18("14000"));
    await assertSolvent(vault, pons, users);

    // day 4 — carol joins late, alice takes half her stake back
    await time.increase(DAY);
    await vault.connect(carol).stake(e18("2000"));
    await vault.connect(alice).withdraw(e18("500"));
    await assertSolvent(vault, cash, users);
    await assertSolvent(vault, pons, users);

    // day 5 — alice claims everything
    await time.increase(DAY);
    await vault.connect(alice).getReward();
    expect(await cash.balanceOf(alice.address)).to.be.gt(0);
    expect(await pons.balanceOf(alice.address)).to.be.gt(0);
    await assertSolvent(vault, cash, users);
    await assertSolvent(vault, pons, users);

    // day 10 — both streams have ended; everyone exits
    await time.increase(5 * DAY);
    for (const u of users) await vault.connect(u).exit();

    expect(await vault.totalSupply()).to.equal(0);

    // Principal comes back net of the 2% unstake fee. That fee is not burned — it
    // moves to the stakers who stayed, and to the treasury for the last one out.
    // So the invariant is conservation, not "everyone gets exactly what they put in".
    const aliceWhit = await whit.balanceOf(alice.address);
    const bobWhit = await whit.balanceOf(bob.address);
    const carolWhit = await whit.balanceOf(carol.address);
    const treasuryWhit = await whit.balanceOf(treasury.address);
    const vaultWhit = await whit.balanceOf(await vault.getAddress());

    // Nothing is burned or created — the fee only changes hands.
    expect(aliceWhit + bobWhit + carolWhit + treasuryWhit + vaultWhit).to.equal(e18("30000"));

    // They exit in order, so the mechanic should be visible in the outcome: alice
    // leaves first and pays into the pot, carol stays longest and collects from it.
    expect(aliceWhit, "first to leave should end below their deposit").to.be.lt(e18("10000"));
    expect(carolWhit, "last to leave should end above their deposit").to.be.gt(e18("10000"));
    // and the very last withdrawal has nobody left to share with, so it sweeps
    expect(treasuryWhit).to.be.gt(0);

    // and the vault never paid out more cash than was funded
    const paidOut =
      (await cash.balanceOf(alice.address)) +
      (await cash.balanceOf(bob.address)) +
      (await cash.balanceOf(carol.address)) +
      (await cash.balanceOf(treasury.address));
    expect(paidOut).to.be.lte(e18("70000"));
    // ...and distributed essentially all of it (only truncation dust left behind)
    expect(paidOut).to.be.gt(e18("69999"));
  });

  it("gives no retroactive rewards to a staker who arrives after a stream starts", async function () {
    const { alice, bob, partnerA, cash, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));

    await time.increase(WEEK / 2);
    await vault.connect(bob).stake(e18("1000")); // same size, half the window gone

    await time.increase(WEEK / 2);
    const aliceEarned = await vault.earned(alice.address, await cash.getAddress());
    const bobEarned = await vault.earned(bob.address, await cash.getAddress());

    // alice: full first half alone + half of the second half. bob: half of the second half.
    expect(aliceEarned).to.be.closeTo(bobEarned * 3n, e18("50"));
  });

  it("stops accruing the moment a staker withdraws, and keeps what was already earned", async function () {
    const { alice, bob, partnerA, cash, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));

    await time.increase(WEEK / 2);
    await vault.connect(alice).withdraw(e18("1000"));
    const frozen = await vault.earned(alice.address, await cash.getAddress());

    await time.increase(WEEK / 2);
    expect(await vault.earned(alice.address, await cash.getAddress())).to.equal(frozen);
    expect(await vault.earned(bob.address, await cash.getAddress())).to.be.gt(frozen);
  });

  it("re-funding a live stream folds the leftover in instead of dropping it", async function () {
    const { alice, partnerA, cash, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));

    await time.increase(WEEK / 2); // ~35k still unstreamed
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));

    // new rate covers leftover + top-up over a fresh week
    const forDuration = await vault.getRewardForDuration(await cash.getAddress());
    expect(forDuration).to.be.gt(e18("104000"));
    expect(forDuration).to.be.lte(e18("105000"));

    await time.increase(WEEK + 1);
    await vault.connect(alice).getReward();
    await assertSolvent(vault, cash, [alice]);
  });

  it("survives a reward token that re-enters on payout", async function () {
    const { owner, alice, vault } = await deploy();
    const Evil = await ethers.getContractFactory("MockReentrantToken");
    const evil = await Evil.deploy();
    await vault.addRewardToken(await evil.getAddress(), owner.address, WEEK);
    await evil.mint(owner.address, e18("10000"));
    await evil.approve(await vault.getAddress(), ethers.MaxUint256);

    await vault.connect(alice).stake(e18("1000"));
    await vault.notifyRewardAmount(await evil.getAddress(), e18("10000"));
    await time.increase(WEEK + 1);

    await evil.setTarget(await vault.getAddress());
    await evil.arm();
    await vault.connect(alice).getReward();

    expect(await evil.attackAttempted()).to.equal(true);
    expect(await evil.attackReverted(), "reentrant getReward must revert").to.equal(true);

    // the staker was paid exactly once
    const bal = await evil.balanceOf(alice.address);
    expect(bal).to.be.gt(0);
    expect(bal).to.be.lte(e18("9000")); // 10k minus the 10% fee, at most
  });

  it("keeps risk-reducing actions open while paused", async function () {
    const { alice, partnerA, cash, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK / 2);

    await vault.pause();
    await expect(vault.connect(alice).stake(e18("1"))).to.be.revertedWithCustomError(vault, "EnforcedPause");
    // withdrawing and claiming must never be blocked by a pause
    await expect(vault.connect(alice).getReward()).to.not.be.reverted;
    await expect(vault.connect(alice).withdraw(e18("1000"))).to.not.be.reverted;
  });

  it("strands rewards streamed while nobody is staked, rather than mis-crediting them", async function () {
    const { alice, partnerA, cash, vault } = await deploy();
    // stream opens with an empty vault
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK / 2);

    // alice arrives halfway; she must not receive the unstaked half
    await vault.connect(alice).stake(e18("1000"));
    await time.increase(WEEK);
    const earned = await vault.earned(alice.address, await cash.getAddress());
    expect(earned).to.be.lt(e18("36000"));
    expect(earned).to.be.gt(e18("34000"));

    await vault.connect(alice).getReward();
    await assertSolvent(vault, cash, [alice]);
    // the unclaimed half stays in the contract — recoverERC20 cannot touch it either
    expect(await cash.balanceOf(await vault.getAddress())).to.be.gt(e18("30000"));
    await expect(vault.recoverERC20(await cash.getAddress(), 1)).to.be.revertedWithCustomError(
      vault,
      "AlreadyRewardToken",
    );
  });

  it("applies a fee change only to claims made after it", async function () {
    const { alice, bob, treasury, partnerA, cash, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000"));
    await time.increase(WEEK + 1);

    await vault.connect(alice).getReward(); // at 10%
    const feeAfterAlice = await cash.balanceOf(treasury.address);

    await vault.setPerformanceFee(0); // waive it
    await vault.connect(bob).getReward();
    expect(await cash.balanceOf(treasury.address)).to.equal(feeAfterAlice);
    // bob keeps the whole amount, alice did not
    expect(await cash.balanceOf(bob.address)).to.be.gt(await cash.balanceOf(alice.address));
  });

  it("rejects a fee above the hard cap", async function () {
    const { vault } = await deploy();
    await expect(vault.setPerformanceFee(2001)).to.be.reverted;
    await expect(vault.setPerformanceFee(2000)).to.emit(vault, "PerformanceFeeUpdated");
  });

  it("handles streams of different lengths running side by side", async function () {
    const { alice, partnerA, partnerB, cash, pons, vault } = await deploy();
    await vault.setRewardsDuration(await pons.getAddress(), 30 * DAY);
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("70000")); // 7d
    await vault.connect(partnerB).notifyRewardAmount(await pons.getAddress(), e18("30000")); // 30d

    await time.increase(WEEK + 1);
    // the short stream is finished, the long one is roughly a quarter through
    const cashEarned = await vault.earned(alice.address, await cash.getAddress());
    const ponsEarned = await vault.earned(alice.address, await pons.getAddress());
    expect(cashEarned).to.be.closeTo(e18("70000"), e18("50"));
    expect(ponsEarned).to.be.closeTo(e18("7000"), e18("50"));

    await time.increase(30 * DAY);
    expect(await vault.earned(alice.address, await cash.getAddress())).to.be.closeTo(cashEarned, e18("1"));
    expect(await vault.earned(alice.address, await pons.getAddress())).to.be.closeTo(e18("30000"), e18("50"));
  });

  it("lets a partner rotate its distributor without owner rights leaking", async function () {
    const { owner, partnerA, partnerB, cash, vault } = await deploy();
    await vault.setDistributor(await cash.getAddress(), partnerB.address);
    await expect(
      vault.connect(partnerA).notifyRewardAmount(await cash.getAddress(), e18("1")),
    ).to.be.revertedWithCustomError(vault, "NotDistributor");

    // the new distributor still cannot touch anything else
    await expect(vault.connect(partnerB).setPerformanceFee(0)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount",
    );
    await expect(vault.connect(partnerB).pause()).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount",
    );
    expect(await vault.owner()).to.equal(owner.address);
  });
});

describe("MultiRewardStaking — unstake fee shared with remaining stakers", function () {
  async function deploy() {
    const [owner, alice, bob, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("WhitmoreToken");
    const whit = await Token.deploy(owner.address, e18("1000000"));
    const Staking = await ethers.getContractFactory("MultiRewardStaking");
    const vault = await Staking.deploy(owner.address, await whit.getAddress(), treasury.address);
    for (const u of [alice, bob]) {
      await whit.transfer(u.address, e18("10000"));
      await whit.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
    }
    return { owner, alice, bob, treasury, whit, vault };
  }

  it("hands the unstake fee to whoever is still staked, as claimable STERLING", async function () {
    const { alice, bob, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));

    // alice leaves: 10% of 1,000 = 100 STERLING, and bob is the only staker left
    await expect(vault.connect(alice).withdraw(e18("1000"))).to.emit(vault, "UnstakeFeeShared");
    expect(await vault.earnedStaking(bob.address)).to.be.closeTo(e18("100"), e18("0.001"));
  });

  it("returns the withdrawal net of the fee", async function () {
    const { alice, bob, whit, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));

    const before = await whit.balanceOf(alice.address);
    await vault.connect(alice).withdraw(e18("1000"));
    expect((await whit.balanceOf(alice.address)) - before).to.equal(e18("900"));
  });

  it("never lets the leaver earn a share of their own fee", async function () {
    const { alice, bob, vault } = await deploy();
    // alice holds 90% of the vault — if she shared in her own fee, leaving would be nearly free
    await vault.connect(alice).stake(e18("9000"));
    await vault.connect(bob).stake(e18("1000"));

    await vault.connect(alice).withdraw(e18("1000")); // penalty 100 STERLING
    expect(await vault.earnedStaking(alice.address)).to.equal(0);
    expect(await vault.earnedStaking(bob.address)).to.be.gt(0);
  });

  it("sweeps the fee to the treasury when the last staker leaves", async function () {
    const { alice, treasury, whit, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await expect(vault.connect(alice).withdraw(e18("1000"))).to.emit(vault, "UnstakeFeeSwept");
    expect(await whit.balanceOf(treasury.address)).to.equal(e18("100"));
  });

  it("charges the platform fee when the shared STERLING is claimed", async function () {
    const { alice, bob, treasury, whit, vault } = await deploy();
    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));
    await vault.connect(alice).withdraw(e18("1000")); // 100 STERLING to bob

    const before = await whit.balanceOf(bob.address);
    await vault.connect(bob).getReward();
    // bob nets 90% of 100, treasury takes 10%
    expect((await whit.balanceOf(bob.address)) - before).to.be.closeTo(e18("90"), e18("0.001"));
    expect(await whit.balanceOf(treasury.address)).to.be.closeTo(e18("10"), e18("0.001"));
  });

  it("keeps principal fully backed after fees move around", async function () {
    const { alice, bob, whit, vault } = await deploy();
    await vault.connect(alice).stake(e18("5000"));
    await vault.connect(bob).stake(e18("5000"));
    await vault.connect(alice).withdraw(e18("2000"));
    await vault.connect(bob).withdraw(e18("1000"));

    // the vault must still hold every staked token plus everything it owes as rewards
    const held = await whit.balanceOf(await vault.getAddress());
    const owed =
      (await vault.totalSupply()) +
      (await vault.earnedStaking(alice.address)) +
      (await vault.earnedStaking(bob.address));
    expect(held).to.be.gte(owed);
  });

  it("starts at the 10% cap, cannot be raised, and can be waived", async function () {
    const { alice, bob, whit, vault } = await deploy();
    expect(await vault.unstakeFeeBps()).to.equal(1000);
    await expect(vault.setUnstakeFee(1001)).to.be.revertedWithCustomError(vault, "FeeTooHigh");
    await vault.setUnstakeFee(0);

    await vault.connect(alice).stake(e18("1000"));
    await vault.connect(bob).stake(e18("1000"));
    const before = await whit.balanceOf(alice.address);
    await vault.connect(alice).withdraw(e18("1000"));
    expect((await whit.balanceOf(alice.address)) - before).to.equal(e18("1000"));
  });
});
