export type MarketConfig = {
  symbol: string; name: string; token: `0x${string}`; feed: `0x${string}`; collateralFactorBps: number; liquidationThresholdBps: number; liquidationBonusBps: number; maxStaleness: number; borrowCap: string; supplyCap: string;
};

export const LENDING_POOL_ADDRESS = "0x3b8E15CC4Cb595B5097A26ff7F318038C50dc59d" as `0x${string}`;
export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`;
export const TREASURY_ADDRESS = "0x357606c8E2B273Fb4c51728013A19d66E9DC923B" as `0x${string}`;
export const PROJECT_NAME = "Tokenized Equity Credit Markets";
export const MARKETS: MarketConfig[] = [
  {
    "symbol": "AAPL",
    "name": "Apple Stock Token",
    "token": "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    "feed": "0x4bDbb3150014c6Ab2C6D9347B0779c49015a2f3f",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "AMD",
    "name": "AMD Stock Token",
    "token": "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
    "feed": "0xF6d57763DFa625F4A413485261Ab2E71Ff4304CF",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "AMZN",
    "name": "Amazon Stock Token",
    "token": "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    "feed": "0x9244830430bC7D9C9A48dd47603F24AD61f7c56e",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "BABA",
    "name": "Alibaba Stock Token",
    "token": "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4",
    "feed": "0xDB69948B26050818E8c9f43300F78b2582e67260",
    "collateralFactorBps": 4000,
    "liquidationThresholdBps": 5500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "COIN",
    "name": "Coinbase Stock Token",
    "token": "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
    "feed": "0xA7F7D79D578fb007384BaDF42c8E1D76a6a63bBD",
    "collateralFactorBps": 4000,
    "liquidationThresholdBps": 5500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "CRCL",
    "name": "Circle Stock Token",
    "token": "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
    "feed": "0x025Ba3B3569Ca7d15Da7BFC1648F13F06A072851",
    "collateralFactorBps": 3500,
    "liquidationThresholdBps": 5000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "CRWV",
    "name": "CoreWeave Stock Token",
    "token": "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3",
    "feed": "0x288b837A17fED1aa00c1df832ef79D0C77336c10",
    "collateralFactorBps": 3000,
    "liquidationThresholdBps": 4500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "GOOGL",
    "name": "Alphabet Stock Token",
    "token": "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    "feed": "0xA04EE5c4c8827F17e82f93bE9e19DeA221A749a8",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "INTC",
    "name": "Intel Stock Token",
    "token": "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681",
    "feed": "0x127B1DeDeE6269E962a59E6C1295b4002c56c403",
    "collateralFactorBps": 4000,
    "liquidationThresholdBps": 5500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "META",
    "name": "Meta Stock Token",
    "token": "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    "feed": "0x5cBC53D382E56cBb223f118CF8Eefb6c9c2759f5",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "MSFT",
    "name": "Microsoft Stock Token",
    "token": "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    "feed": "0xaD6D88eab22aa4867Efe807a5311Ed64962f740D",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "MU",
    "name": "Micron Stock Token",
    "token": "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
    "feed": "0x5b40F4E78FA58B60a4F59b8cc8cB8d2Fb0690467",
    "collateralFactorBps": 3500,
    "liquidationThresholdBps": 5000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "NVDA",
    "name": "NVIDIA Stock Token",
    "token": "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    "feed": "0xCF169363636D73dbBf77733629CB38919d14232d",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "ORCL",
    "name": "Oracle Stock Token",
    "token": "0xb0992820E760d836549ba69BC7598b4af75dEE03",
    "feed": "0x2a07f8d87d369Bd8Bc36472337ae02d512a7b5e5",
    "collateralFactorBps": 4000,
    "liquidationThresholdBps": 5500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "PLTR",
    "name": "Palantir Stock Token",
    "token": "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A",
    "feed": "0x8cd1DFC0fc61fcA55FA77b37e008A90f13364Fce",
    "collateralFactorBps": 3500,
    "liquidationThresholdBps": 5000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "QQQ",
    "name": "Invesco QQQ ETF Token",
    "token": "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68",
    "feed": "0x41ed2c58611790af0760e31e80Bb427e4e83D603",
    "collateralFactorBps": 5000,
    "liquidationThresholdBps": 6500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "SGOV",
    "name": "iShares 0-3 Month Treasury Bond ETF Token",
    "token": "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5",
    "feed": "0xa7a18Ca3F19E17FfA28F92302B817Ca8c1A94b06",
    "collateralFactorBps": 7500,
    "liquidationThresholdBps": 8500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "SLV",
    "name": "iShares Silver Trust ETF Token",
    "token": "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f",
    "feed": "0xdA81cD9c76F1D3Ea32655dfFc7408ef22BB0Ee2a",
    "collateralFactorBps": 4500,
    "liquidationThresholdBps": 6000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "SNDK",
    "name": "SanDisk Stock Token",
    "token": "0xB90A19fF0Af67f7779afF50A882A9CfF42446400",
    "feed": "0xd1016D9Da414B13D55abe02221A8A145eB89aA0D",
    "collateralFactorBps": 3500,
    "liquidationThresholdBps": 5000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "SPCX",
    "name": "SpaceX Stock Token",
    "token": "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    "feed": "0x42a95341ff361e81fd934F39943c5C98F6991844",
    "collateralFactorBps": 2500,
    "liquidationThresholdBps": 4000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "SPY",
    "name": "SPDR S&P 500 ETF Token",
    "token": "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    "feed": "0xa68CA83408bE3f78d1c58a82081c619e9d21486d",
    "collateralFactorBps": 5000,
    "liquidationThresholdBps": 6500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "TSLA",
    "name": "Tesla Stock Token",
    "token": "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    "feed": "0xE4479F01738B4e8C428CD8eB72D47AB9BC3c7de6",
    "collateralFactorBps": 3500,
    "liquidationThresholdBps": 5000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "USAR",
    "name": "USA Rare Earth Stock Token",
    "token": "0xd917B029C761D264c6A312BBbcDA868658eF86a6",
    "feed": "0x451B1295aA84FD6d6b58af1a5002eA1b1A1913A0",
    "collateralFactorBps": 2500,
    "liquidationThresholdBps": 4000,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  },
  {
    "symbol": "USO",
    "name": "United States Oil Fund ETF Token",
    "token": "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
    "feed": "0x6D054DECb74Cf8ef3675B0Abc100e02921176EdF",
    "collateralFactorBps": 4000,
    "liquidationThresholdBps": 5500,
    "liquidationBonusBps": 500,
    "maxStaleness": 345600,
    "borrowCap": "100000000000000000000000",
    "supplyCap": "1000000000000000000000000"
  }
] as MarketConfig[];
