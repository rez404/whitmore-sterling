# Chainlink Robinhood Chain SVR feed source

Source: user-provided extraction from `https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood` after filtering Robinhood SVR/tokenized equity feeds.

Engineering rule: use the SVR Proxy for lending-market oracle reads. SVR feeds expose the same `AggregatorV3Interface` as standard Chainlink Data Feeds; only the proxy address changes. Keep all freshness, invalid-answer, oracle-pause, and L2 sequencer checks.

| Symbol | Standard Proxy | SVR Proxy | Market hours | Deploy token source |
| --- | --- | --- | --- | --- |
| AAPL | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | `0x4bDbb3150014c6Ab2C6D9347B0779c49015a2f3f` | us_equities_24/5 | built-in canonical token |
| AMD | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | `0xF6d57763DFa625F4A413485261Ab2E71Ff4304CF` | us_equities_24/5 | built-in canonical token |
| AMZN | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | `0x9244830430bC7D9C9A48dd47603F24AD61f7c56e` | us_equities_24/5 | built-in canonical token |
| ASML | `0xB4106147E8cce40b7d46124090d373A71b70f87D` | `0x3eFBba343e2b1cF9ed4d4D5768e20B70307Aa8c9` | us_equities_24/5 | requires `ASML_TOKEN` env override |
| BABA | `0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984` | `0xDB69948B26050818E8c9f43300F78b2582e67260` | us_equities_24/5 | built-in canonical token |
| CLSK | `0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF` | `0x951C5E9a2a065053035D4B812b1f6cA7e64c5102` | us_equities_24/5 | requires `CLSK_TOKEN` env override |
| COIN | `0xA3a468A452940B7D6b69991207B508c609a98Ef2` | `0xA7F7D79D578fb007384BaDF42c8E1D76a6a63bBD` | us_equities_24/5 | built-in canonical token |
| CRCL | `0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a` | `0x025Ba3B3569Ca7d15Da7BFC1648F13F06A072851` | us_equities_24/5 | built-in canonical token |
| CRWV | `0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C` | `0x288b837A17fED1aa00c1df832ef79D0C77336c10` | us_equities_24/5 | built-in canonical token |
| EWY | `0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1` | `0x26bca2a89D2D23787ada8F91B849608c51A26977` | us_equities_24/5 | requires `EWY_TOKEN` env override |
| GME | `0x27C71df6A64fB476468EdF256CF72c038baB5B67` | `0x42A4652D447A5B0bccF3B265bE8530b85A33b3A2` | us_equities_24/5 | requires `GME_TOKEN` env override |
| GOOGL | `0xF6f373a037c30F0e5010d854385cA89185AE638b` | `0xA04EE5c4c8827F17e82f93bE9e19DeA221A749a8` | us_equities_24/5 | built-in canonical token |
| INTC | `0x3f390C5C24628Ac7C489515402235FeAD71D1913` | `0x127B1DeDeE6269E962a59E6C1295b4002c56c403` | us_equities_24/5 | built-in canonical token |
| IONQ | `0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb` | `0x926D7D95E554D1e671EB2C0d238fe37a2C23A64E` | us_equities_24/5 | requires `IONQ_TOKEN` env override |
| META | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | `0x5cBC53D382E56cBb223f118CF8Eefb6c9c2759f5` | us_equities_24/5 | built-in canonical token |
| MSFT | `0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E` | `0xaD6D88eab22aa4867Efe807a5311Ed64962f740D` | us_equities_24/5 | built-in canonical token |
| MSTR | `0x396118bdFB181e6240E74D243F266B061c0edc3D` | `0x2521a77F42098357e83bDea7fBb2A38745bf9280` | us_equities_24/5 | requires `MSTR_TOKEN` env override |
| MU | `0x425EEFdCf05ed6526C3cE61Af99429A228a6d596` | `0x5b40F4E78FA58B60a4F59b8cc8cB8d2Fb0690467` | us_equities_24/5 | built-in canonical token |
| NBIS | `0xE1D87B116Ba0fe898998f1D140339D1fA1E09705` | `0xCa59A8F53bf4E0628CC0b1BD3a2216F2F8E04770` | us_equities_24/5 | requires `NBIS_TOKEN` env override |
| NVDA | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | `0xCF169363636D73dbBf77733629CB38919d14232d` | us_equities_24/5 | built-in canonical token |
| ORCL | `0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844` | `0x2a07f8d87d369Bd8Bc36472337ae02d512a7b5e5` | us_equities_24/5 | built-in canonical token |
| PLTR | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | `0x8cd1DFC0fc61fcA55FA77b37e008A90f13364Fce` | us_equities_24/5 | built-in canonical token |
| QQQ | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` | `0x41ed2c58611790af0760e31e80Bb427e4e83D603` | us_equities_24/5 | built-in canonical token |
| RGTI | `0x2A045cF1C49c61c166C036d2f06FA2D2d984f765` | `0xC9C477AEfF7eD1BB89B84F7907E2e11707491466` | us_equities_24/5 | requires `RGTI_TOKEN` env override |
| RKLB | `0x045477BF65Aef6f4F2386ad0164579e48381CC74` | `0x955c60932E517B36be137Eee78E65343cBFC9D29` | us_equities_24/5 | requires `RKLB_TOKEN` env override |
| SGOV | `0xa0DF4ee0fFf975306345875E3548Fcc519577A11` | `0xa7a18Ca3F19E17FfA28F92302B817Ca8c1A94b06` | us_equities_24/5 | built-in canonical token |
| SLV | `0x209b73908e92Ae021826eD79609845451Ecba2ce` | `0xdA81cD9c76F1D3Ea32655dfFc7408ef22BB0Ee2a` | us_equities_24/5 | built-in canonical token |
| SNDK | `0xfb133Fa4B7b385802B693a293606682Df47109A3` | `0xd1016D9Da414B13D55abe02221A8A145eB89aA0D` | us_equities_24/5 | built-in canonical token |
| SPCX | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb` | `0x42a95341ff361e81fd934F39943c5C98F6991844` | us_equities_24/5 | built-in canonical token |
| SPY | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | `0xa68CA83408bE3f78d1c58a82081c619e9d21486d` | us_equities_24/5 | built-in canonical token |
| TSLA | `0x4A1166a659A55625345e9515b32adECea5547C38` | `0xE4479F01738B4e8C428CD8eB72D47AB9BC3c7de6` | us_equities_24/5 | built-in canonical token |
| TSM | `0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F` | `0xB48D6D5729Ca032ca43729F4b605bBf9f257A84d` | us_equities_24/5 | requires `TSM_TOKEN` env override |
| USAR | `0xA994d3684e8400A6c8078226925779FdeE682DD9` | `0x451B1295aA84FD6d6b58af1a5002eA1b1A1913A0` | us_equities_24/5 | built-in canonical token |
| USO | `0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c` | `0x6D054DECb74Cf8ef3675B0Abc100e02921176EdF` | us_equities_24/5 | built-in CUSO token address from Robinhood docs; override with `USO_TOKEN` if docs now use USO ticker |

## Deployment behavior

`scripts/deploy.ts` iterates every market in `scripts/stock-markets.ts`. It lists a market only when both token and feed addresses are valid. Feed addresses default to the SVR proxy above and can be overridden with `<SYMBOL>_USD_FEED`. Markets whose canonical token addresses were not in the extracted Robinhood token-contract docs are skipped until their `<SYMBOL>_TOKEN` env var is provided.
