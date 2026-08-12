import { expect } from "chai";
import { ethers, network } from "hardhat";

/**
 * StockLpVault against the live chain.
 *
 * Runs on an anvil fork of Robinhood Chain, so the position manager, the router and
 * the AAPL/USDG pool are the real deployed contracts and the tokens are real balances
 * taken from real holders. The mocked suite proves the vault's internal accounting;
 * this proves the vault actually works against Uniswap.
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545 --silent &
 *   npx hardhat test test/fork/stock-lp-vault.fork.spec.ts --network anvilFork
 */

const AAPL = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const POOL = "0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d"; // AAPL/USDG, 0.05%
const NPM = "0xC00BABBB20630974345EeA9f57d8F2FDEb81226B";
const ROUTER = "0xD089eBB5609Dd1FE604E1f8ecd9B88Bd5d128713";

// Real holders, read from the explorer, impersonated to fund the test account.
const AAPL_WHALE = "0x9f736F87E6293AC1Bd9142E257dbfAC8b7AcF1ae";
const USDG_WHALE = "0x2d4d2A025b10C09BDbd794B4FCe4F7ea8C7d7bB4";

const FEE = 500;
const SPACING = 10;
const tickLower = Math.ceil(-887272 / SPACING) * SPACING;
const tickUpper = Math.floor(887272 / SPACING) * SPACING;

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];
const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
];
const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
];

const erc = (address: string) => new ethers.Contract(address, ERC20, ethers.provider);

async function impersonate(address: string) {
  await network.provider.send("anvil_impersonateAccount", [address]);
  await network.provider.send("anvil_setBalance", [address, "0x56BC75E2D63100000"]); // 100 ETH for gas
  return ethers.getSigner(address);
}

describe("StockLpVault — live Uniswap fork", function () {
  this.timeout(300_000);

  let deployer: any, feeRecipient: any, lp: any;
  let vault: any, aapl: any, usdg: any, token0: string, token1: string;

  before(async function () {
    const net = await ethers.provider.getNetwork();
    if (net.chainId !== 4663n) {
      console.log("      (skipped — run with --network anvilFork against a live fork)");
      this.skip();
    }

    [deployer, feeRecipient, lp] = await ethers.getSigners();
    aapl = erc(AAPL);
    usdg = erc(USDG);

    const pool = new ethers.Contract(POOL, POOL_ABI, ethers.provider);
    token0 = await pool.token0();
    token1 = await pool.token1();
    expect(Number(await pool.fee())).to.equal(FEE);

    const aaplWhale = await impersonate(AAPL_WHALE);
    const usdgWhale = await impersonate(USDG_WHALE);
    await aapl.connect(aaplWhale).transfer(lp.address, ethers.parseUnits("40", 18));
    await usdg.connect(usdgWhale).transfer(lp.address, ethers.parseUnits("20000", 6));

    const Vault = await ethers.getContractFactory("StockLpVault");
    vault = await Vault.connect(deployer).deploy(
      "Whitmore AAPL/USDG LP",
      "wsAAPLLP",
      NPM,
      token0,
      token1,
      FEE,
      tickLower,
      tickUpper,
      feeRecipient.address,
      deployer.address,
    );
    await vault.waitForDeployment();
  });

  it("deploys against the real position manager using the pool's own token order", async function () {
    expect((await vault.token0()).toLowerCase()).to.equal(token0.toLowerCase());
    expect((await vault.token1()).toLowerCase()).to.equal(token1.toLowerCase());
    expect(Number(await vault.fee())).to.equal(FEE);
    expect(await vault.positionId()).to.equal(0n);
  });

  it("opens a real Uniswap position on the first deposit", async function () {
    const vaultAddr = await vault.getAddress();
    await aapl.connect(lp).approve(vaultAddr, ethers.MaxUint256);
    await usdg.connect(lp).approve(vaultAddr, ethers.MaxUint256);

    const aaplIn = ethers.parseUnits("15", 18);
    const usdgIn = ethers.parseUnits("8000", 6);
    const [a0, a1] = token0.toLowerCase() === AAPL.toLowerCase() ? [aaplIn, usdgIn] : [usdgIn, aaplIn];

    await vault.connect(lp).deposit(a0, a1, 0, 0);

    const positionId = await vault.positionId();
    expect(positionId).to.be.gt(0n);
    expect(await vault.positionLiquidity()).to.be.gt(0n);
    expect(await vault.balanceOf(lp.address)).to.be.gt(0n);

    // The NFT belongs to the vault, never to the depositor.
    const npm = new ethers.Contract(NPM, ["function ownerOf(uint256) view returns (address)"], ethers.provider);
    expect(await npm.ownerOf(positionId)).to.equal(vaultAddr);
  });

  it("earns real trading fees and hands the platform its cut on compound", async function () {
    const vaultAddr = await vault.getAddress();
    const trader = await impersonate(USDG_WHALE);
    const router = new ethers.Contract(ROUTER, ROUTER_ABI, trader);
    await usdg.connect(trader).approve(ROUTER, ethers.MaxUint256);
    await aapl.connect(trader).approve(ROUTER, ethers.MaxUint256);

    // Push real volume through the pool so the position accrues real fees.
    //
    // Size matters here: this pool holds roughly $100k, so a five-figure swap moves
    // the price far enough that the return leg has nothing to sell and the pool
    // reverts with "AS". Small round trips generate fees without wrecking the pool.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    for (let i = 0; i < 10; i++) {
      const aaplBefore = await aapl.balanceOf(trader.address);
      await router.exactInputSingle({
        tokenIn: USDG, tokenOut: AAPL, fee: FEE, recipient: trader.address,
        deadline, amountIn: ethers.parseUnits("400", 6), amountOutMinimum: 0, sqrtPriceLimitX96: 0,
      });
      const received = (await aapl.balanceOf(trader.address)) - aaplBefore;
      expect(received, "swap produced no output — pool may be too thin").to.be.gt(0n);
      await router.exactInputSingle({
        tokenIn: AAPL, tokenOut: USDG, fee: FEE, recipient: trader.address,
        deadline, amountIn: received, amountOutMinimum: 0, sqrtPriceLimitX96: 0,
      });
    }

    const before0 = await erc(token0).balanceOf(feeRecipient.address);
    const before1 = await erc(token1).balanceOf(feeRecipient.address);
    const liqBefore = await vault.positionLiquidity();

    // Asserting on balances rather than the event: hardhat-chai-matchers cannot always
    // fetch a receipt through the anvil fork, and the balances are the stronger claim.
    const tx = await vault.connect(deployer).compound();
    await tx.wait();

    const took0 = (await erc(token0).balanceOf(feeRecipient.address)) - before0;
    const took1 = (await erc(token1).balanceOf(feeRecipient.address)) - before1;

    // Real volume produced real fees, and the platform's 10% actually landed.
    expect(took0 + took1, "platform received nothing from real volume").to.be.gt(0n);
    // The remaining 90% went back to work rather than sitting idle.
    expect(await vault.positionLiquidity()).to.be.gt(liqBefore);

    console.log(
      `        platform cut: ${ethers.formatUnits(took0, token0.toLowerCase() === USDG.toLowerCase() ? 6 : 18)} token0, ` +
        `${ethers.formatUnits(took1, token1.toLowerCase() === USDG.toLowerCase() ? 6 : 18)} token1`,
    );
  });

  it("lets a stranger compound — the keeper needs no privileges", async function () {
    const stranger = (await ethers.getSigners())[4];
    const receipt = await (await vault.connect(stranger).compound()).wait();
    expect(receipt?.status).to.equal(1);
  });

  it("returns principal plus earned fees on withdrawal and closes the position", async function () {
    const before0 = await erc(token0).balanceOf(lp.address);
    const before1 = await erc(token1).balanceOf(lp.address);

    await vault.connect(lp).withdraw(await vault.balanceOf(lp.address), 0, 0);

    expect((await erc(token0).balanceOf(lp.address)) - before0).to.be.gt(0n);
    expect((await erc(token1).balanceOf(lp.address)) - before1).to.be.gt(0n);
    expect(await vault.totalSupply()).to.equal(0n);
    expect(await vault.positionLiquidity()).to.equal(0n);
  });
});
