import { expect } from "chai";
import { ethers } from "hardhat";

const e18 = (v: string) => ethers.parseUnits(v, 18);
const RATE = (v: string) => ethers.parseUnits(v, 18); // out per in, 1e18-scaled

describe("LpZap — one-transaction entry from a single asset", function () {
  async function fixture() {
    const [owner, user] = await ethers.getSigners();

    const Tok = await ethers.getContractFactory("MintableToken");
    const tsla = await Tok.deploy("Tesla", "TSLA");
    const usdg = await Tok.deploy("Global Dollar", "USDG");
    const foreign = await Tok.deploy("Foreign", "FRGN");

    const Weth = await ethers.getContractFactory("MockWETH9");
    const weth = await Weth.deploy();

    const Router = await ethers.getContractFactory("MockSwapRouter");
    const router = await Router.deploy();

    // token0 < token1 by address, as a real pool requires
    const [a, b] = [await tsla.getAddress(), await usdg.getAddress()];
    const [t0, t1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];

    const Vault = await ethers.getContractFactory("MockLpVault");
    const vault = await Vault.deploy(t0, t1);

    const Zap = await ethers.getContractFactory("LpZap");
    const zap = await Zap.deploy(await router.getAddress(), await weth.getAddress());

    // 1 WETH -> 1 of either side; 1 TSLA -> 1 USDG and back
    for (const [i, o] of [
      [await weth.getAddress(), a],
      [await weth.getAddress(), b],
      [a, b],
      [b, a],
      [await foreign.getAddress(), a],
      [await foreign.getAddress(), b],
    ] as const) {
      await router.setRate(i, o, RATE("1"));
    }

    return { owner, user, tsla, usdg, foreign, weth, router, vault, zap, t0, t1 };
  }

  it("zaps a foreign asset into both sides and returns the shares", async function () {
    const { user, foreign, vault, zap } = await fixture();
    const zapAddr = await zap.getAddress();

    await foreign.mint(user.address, e18("100"));
    await foreign.connect(user).approve(zapAddr, ethers.MaxUint256);

    const legs = [
      { tokenIn: await foreign.getAddress(), tokenOut: await vault.token0(), fee: 3000, amountIn: e18("50"), amountOutMinimum: e18("49") },
      { tokenIn: await foreign.getAddress(), tokenOut: await vault.token1(), fee: 3000, amountIn: e18("50"), amountOutMinimum: e18("49") },
    ];

    await expect(zap.connect(user).zapIn(await vault.getAddress(), await foreign.getAddress(), e18("100"), legs, 0, 0))
      .to.emit(zap, "Zapped");

    // 50 of each side deposited 1:1 -> 50 shares
    expect(await vault.balanceOf(user.address)).to.equal(e18("50"));
    expect(await foreign.balanceOf(user.address)).to.equal(0);
  });

  it("zaps native ETH by wrapping it first", async function () {
    const { user, weth, vault, zap } = await fixture();
    const legs = [
      { tokenIn: await weth.getAddress(), tokenOut: await vault.token0(), fee: 3000, amountIn: e18("0.05"), amountOutMinimum: 0 },
      { tokenIn: await weth.getAddress(), tokenOut: await vault.token1(), fee: 3000, amountIn: e18("0.05"), amountOutMinimum: 0 },
    ];
    await zap
      .connect(user)
      .zapIn(await vault.getAddress(), await weth.getAddress(), e18("0.1"), legs, 0, 0, { value: e18("0.1") });

    expect(await vault.balanceOf(user.address)).to.equal(e18("0.05"));
  });

  it("only swaps one side when the input is already half the pair", async function () {
    const { user, vault, zap, t0, t1 } = await fixture();
    const tokenIn = await ethers.getContractAt("MintableToken", t0);
    await tokenIn.mint(user.address, e18("100"));
    await tokenIn.connect(user).approve(await zap.getAddress(), ethers.MaxUint256);

    // swap half of token0 into token1, keep the rest
    const legs = [{ tokenIn: t0, tokenOut: t1, fee: 3000, amountIn: e18("50"), amountOutMinimum: e18("49") }];
    await zap.connect(user).zapIn(await vault.getAddress(), t0, e18("100"), legs, 0, 0);

    expect(await vault.balanceOf(user.address)).to.equal(e18("50"));
  });

  it("returns leftover tokens instead of keeping them", async function () {
    const { user, vault, zap, t0, t1 } = await fixture();
    const token0 = await ethers.getContractAt("MintableToken", t0);
    await token0.mint(user.address, e18("100"));
    await token0.connect(user).approve(await zap.getAddress(), ethers.MaxUint256);

    // deliberately lopsided: 70 stays as token0, 30 becomes token1, so 40 token0 is dust
    const legs = [{ tokenIn: t0, tokenOut: t1, fee: 3000, amountIn: e18("30"), amountOutMinimum: 0 }];
    await zap.connect(user).zapIn(await vault.getAddress(), t0, e18("100"), legs, 0, 0);

    expect(await vault.balanceOf(user.address)).to.equal(e18("30"));
    expect(await token0.balanceOf(user.address)).to.equal(e18("40"));
    // the zap holds nothing afterwards
    expect(await token0.balanceOf(await zap.getAddress())).to.equal(0);
    expect(await (await ethers.getContractAt("MintableToken", t1)).balanceOf(await zap.getAddress())).to.equal(0);
  });

  it("rejects a leg that would route into a token the vault does not hold", async function () {
    const { user, foreign, vault, zap } = await fixture();
    await foreign.mint(user.address, e18("10"));
    await foreign.connect(user).approve(await zap.getAddress(), ethers.MaxUint256);

    const legs = [
      { tokenIn: await foreign.getAddress(), tokenOut: await foreign.getAddress(), fee: 3000, amountIn: e18("5"), amountOutMinimum: 0 },
    ];
    await expect(
      zap.connect(user).zapIn(await vault.getAddress(), await foreign.getAddress(), e18("10"), legs, 0, 0),
    ).to.be.revertedWithCustomError(zap, "LegTokenNotInPair");
  });

  it("rejects legs that spend more than was supplied", async function () {
    const { user, foreign, vault, zap } = await fixture();
    await foreign.mint(user.address, e18("10"));
    await foreign.connect(user).approve(await zap.getAddress(), ethers.MaxUint256);

    const legs = [
      { tokenIn: await foreign.getAddress(), tokenOut: await vault.token0(), fee: 3000, amountIn: e18("8"), amountOutMinimum: 0 },
      { tokenIn: await foreign.getAddress(), tokenOut: await vault.token1(), fee: 3000, amountIn: e18("8"), amountOutMinimum: 0 },
    ];
    await expect(
      zap.connect(user).zapIn(await vault.getAddress(), await foreign.getAddress(), e18("10"), legs, 0, 0),
    ).to.be.revertedWithCustomError(zap, "LegsExceedInput");
  });

  it("passes the slippage floor through to the swap", async function () {
    const { user, foreign, vault, zap } = await fixture();
    await foreign.mint(user.address, e18("100"));
    await foreign.connect(user).approve(await zap.getAddress(), ethers.MaxUint256);

    const legs = [
      // demanding more out than the rate can give must revert, not silently under-deliver
      { tokenIn: await foreign.getAddress(), tokenOut: await vault.token0(), fee: 3000, amountIn: e18("50"), amountOutMinimum: e18("60") },
    ];
    await expect(
      zap.connect(user).zapIn(await vault.getAddress(), await foreign.getAddress(), e18("100"), legs, 0, 0),
    ).to.be.revertedWith("Too little received");
  });

  it("rejects a native zap whose value does not match the stated amount", async function () {
    const { user, weth, vault, zap } = await fixture();
    await expect(
      zap
        .connect(user)
        .zapIn(await vault.getAddress(), await weth.getAddress(), e18("0.1"), [], 0, 0, { value: e18("0.05") }),
    ).to.be.revertedWithCustomError(zap, "NativeMismatch");
  });
});
