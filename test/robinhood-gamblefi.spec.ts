import { expect } from "chai";
import { ethers } from "hardhat";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const b = (v: string) => ethers.encodeBytes32String(v);
const commit = (seed: string) => ethers.keccak256(ethers.solidityPacked(["bytes32"], [b(seed)]));

const gameConfig = (
  name: string,
  creator: string,
  minWager: bigint,
  maxWager: bigint,
  creatorFeeBps: number,
  protocolFeeBps: number,
  multipliersBps: number[],
) => ({ name, creator, minWager, maxWager, creatorFeeBps, protocolFeeBps, multipliersBps });

async function outcomeFor(pool: string, seed: string, requestId: bigint, player: string, gameId: bigint, outcomeCount: bigint) {
  const digest = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "uint256", "address", "uint256", "address"], [b(seed), requestId, player, gameId, pool]),
  );
  return BigInt(digest) % outcomeCount;
}

describe("RobinhoodGambleFiPool", function () {
  async function fixture() {
    const [owner, treasury, entropyAdmin, lp, player, creator, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdg = await MockERC20.deploy("USDG", "USDG", 18);
    const Factory = await ethers.getContractFactory("RobinhoodGambleFiFactory");
    const factory = await Factory.deploy(owner.address);

    const firstCommitment = commit("epoch-1");
    await factory.createPool(await usdg.getAddress(), "Robinhood USDG Casino LP", "rhUSDG-LP", treasury.address, entropyAdmin.address, firstCommitment);
    const poolAddress = await factory.poolForAsset(await usdg.getAddress());
    const pool = await ethers.getContractAt("RobinhoodGambleFiPool", poolAddress);

    await usdg.mint(lp.address, e18("10000"));
    await usdg.mint(player.address, e18("1000"));
    await usdg.connect(lp).approve(poolAddress, ethers.MaxUint256);
    await usdg.connect(player).approve(poolAddress, ethers.MaxUint256);

    return { owner, treasury, entropyAdmin, lp, player, creator, other, usdg, factory, pool };
  }

  it("creates an ERC20 LP pool and lets providers deposit and withdraw unlocked liquidity", async function () {
    const { pool, lp, usdg } = await fixture();

    await expect(pool.connect(lp).depositLiquidity(e18("1000"), lp.address)).to.emit(pool, "LiquidityDeposited");
    expect(await pool.balanceOf(lp.address)).to.equal(e18("1000"));
    expect(await pool.unlockedAssets()).to.equal(e18("1000"));

    await expect(pool.connect(lp).withdrawLiquidity(e18("250"), lp.address)).to.emit(pool, "LiquidityWithdrawn");
    expect(await pool.balanceOf(lp.address)).to.equal(e18("750"));
    expect(await usdg.balanceOf(lp.address)).to.equal(e18("9250"));
  });

  it("lets the owner configure chance games with creator/protocol fees and fair EV bounds", async function () {
    const { pool, creator } = await fixture();

    await expect(pool.createGame(gameConfig("Double or Nothing", creator.address, e18("1"), e18("100"), 100, 50, [0, 18500])))
      .to.emit(pool, "GameCreated")
      .withArgs(1, creator.address, "Double or Nothing", e18("1"), e18("100"));

    const info = await pool.gameInfo(1);
    expect(info.creator).to.equal(creator.address);
    expect(info.active).to.equal(true);
    expect(info.maxMultiplierBps).to.equal(18500);
    expect(info.multipliersBps.map((x: bigint) => Number(x))).to.deep.equal([0, 18500]);

    await expect(pool.createGame(gameConfig("Bad EV", creator.address, e18("1"), e18("10"), 0, 0, [20_000, 20_000])))
      .to.be.revertedWithCustomError(pool, "InvalidOdds");
  });

  it("places wagers, locks max liability, reveals entropy, and settles payouts plus fees", async function () {
    const { pool, lp, player, creator, treasury, entropyAdmin, usdg } = await fixture();
    await pool.connect(lp).depositLiquidity(e18("1000"), lp.address);
    await pool.createGame(gameConfig("Coin", creator.address, e18("1"), e18("10"), 100, 50, [0, 18500]));

    await expect(pool.connect(player).placeWager(1, e18("10"))).to.emit(pool, "WagerPlaced");
    expect(await pool.lockedLiability()).to.equal(e18("18.65"));
    expect(await usdg.balanceOf(player.address)).to.equal(e18("990"));

    await expect(pool.connect(entropyAdmin).revealEntropyAndCommitNext(b("epoch-1"), commit("epoch-2"))).to.emit(pool, "EntropyRevealed");

    const outcome = await outcomeFor(await pool.getAddress(), "epoch-1", BigInt(1), player.address, BigInt(1), BigInt(2));
    const expectedPayout = outcome === BigInt(0) ? BigInt(0) : e18("18.5");

    await expect(pool.settleWager(1)).to.emit(pool, "WagerSettled");
    expect(await pool.lockedLiability()).to.equal(0);
    expect(await usdg.balanceOf(creator.address)).to.equal(e18("0.1"));
    expect(await usdg.balanceOf(treasury.address)).to.equal(e18("0.05"));
    expect(await usdg.balanceOf(player.address)).to.equal(e18("990") + expectedPayout);
  });

  it("blocks settlement before reveal and prevents double settlement", async function () {
    const { pool, lp, player, creator, entropyAdmin } = await fixture();
    await pool.connect(lp).depositLiquidity(e18("1000"), lp.address);
    await pool.createGame(gameConfig("Ladder", creator.address, e18("1"), e18("10"), 0, 0, [0, 5000, 15000]));
    await pool.connect(player).placeWager(1, e18("5"));

    await expect(pool.settleWager(1)).to.be.revertedWithCustomError(pool, "EntropyNotRevealed");
    await expect(pool.connect(entropyAdmin).revealEntropyAndCommitNext(b("wrong"), commit("epoch-2"))).to.be.revertedWithCustomError(pool, "BadEntropySeed");
    await pool.connect(entropyAdmin).revealEntropyAndCommitNext(b("epoch-1"), commit("epoch-2"));
    await pool.settleWager(1);
    await expect(pool.settleWager(1)).to.be.revertedWithCustomError(pool, "AlreadySettled");
  });

  it("rejects games/wagers that exceed unlocked LP capacity", async function () {
    const { pool, lp, player, creator } = await fixture();
    await pool.connect(lp).depositLiquidity(e18("5"), lp.address);
    await pool.createGame(gameConfig("Whale Wheel", creator.address, e18("1"), e18("10"), 0, 0, [0, 19000]));

    await expect(pool.connect(player).placeWager(1, e18("10"))).to.be.revertedWithCustomError(pool, "InsufficientUnlockedLiquidity");
    await expect(pool.connect(player).placeWager(1, e18("0.5"))).to.be.revertedWithCustomError(pool, "InvalidWager");
  });
});
