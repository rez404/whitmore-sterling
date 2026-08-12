// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev Minimal Sushi/Uniswap V3 NonfungiblePositionManager surface used by the vault.
interface INonfungiblePositionManager {
    struct MintParams {
        address token0; address token1; uint24 fee;
        int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired;
        uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    struct IncreaseLiquidityParams {
        uint256 tokenId; uint256 amount0Desired; uint256 amount1Desired;
        uint256 amount0Min; uint256 amount1Min; uint256 deadline;
    }
    function increaseLiquidity(IncreaseLiquidityParams calldata params) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    struct DecreaseLiquidityParams {
        uint256 tokenId; uint128 liquidity;
        uint256 amount0Min; uint256 amount1Min; uint256 deadline;
    }
    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1);

    struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId) external view returns (
        uint96 nonce, address operator, address token0, address token1, uint24 fee,
        int24 tickLower, int24 tickUpper, uint128 liquidity,
        uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0, uint128 tokensOwed1
    );
}

/// @notice Custodial auto-compounding LP vault around ONE full-range Sushi V3 position for a token pair
///         (e.g. a Robinhood RWA stock token / USDG pool). Depositors provide both tokens and receive
///         ERC-20 vault shares. Trading fees earned by the position are periodically collected; the vault
///         keeps `performanceFeeBps` (default 10%) for the platform and compounds the rest back into the
///         position, so share value grows with volume.
/// @dev    AUDIT REQUIRED before mainnet. Full-range only; no active rebalancing. token0 < token1.
contract StockLpVault is ERC20, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable npm;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;

    uint256 public positionId; // 0 until the first deposit mints the position

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // hard cap 20%
    uint256 public performanceFeeBps = 1_000;                // 10% platform fee on LP fees
    address public feeRecipient;

    event Deposited(address indexed user, uint256 shares, uint256 amount0, uint256 amount1);
    event Withdrawn(address indexed user, uint256 shares, uint256 amount0, uint256 amount1);
    event Compounded(uint256 fee0, uint256 fee1, uint256 reinvested0, uint256 reinvested1);
    event PerformanceFeeUpdated(uint256 bps);
    event FeeRecipientUpdated(address indexed recipient);

    constructor(
        string memory name_, string memory symbol_,
        address _npm, address _token0, address _token1, uint24 _fee,
        int24 _tickLower, int24 _tickUpper, address _feeRecipient, address _owner
    ) ERC20(name_, symbol_) Ownable(_owner) {
        require(_token0 != address(0) && _token1 != address(0), "zero token");
        require(_token0 < _token1, "token order");
        require(_npm != address(0) && _feeRecipient != address(0), "zero address");
        require(_tickLower < _tickUpper, "tick order");
        npm = INonfungiblePositionManager(_npm);
        token0 = _token0; token1 = _token1; fee = _fee;
        tickLower = _tickLower; tickUpper = _tickUpper;
        feeRecipient = _feeRecipient;
        IERC20(_token0).forceApprove(_npm, type(uint256).max);
        IERC20(_token1).forceApprove(_npm, type(uint256).max);
    }

    function positionLiquidity() public view returns (uint128 liquidity) {
        if (positionId == 0) return 0;
        (,,,,,,, liquidity,,,,) = npm.positions(positionId);
    }

    /// @notice Deposit both tokens, mint vault shares proportional to the liquidity added. Unused dust is refunded.
    function deposit(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min)
        external nonReentrant whenNotPaused returns (uint256 shares)
    {
        require(amount0Desired > 0 || amount1Desired > 0, "zero deposit");
        _compound(); // realise pending fees first so a new depositor cannot skim existing accrued fees

        if (amount0Desired > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0Desired);
        if (amount1Desired > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1Desired);

        uint128 addedLiquidity; uint256 used0; uint256 used1;
        if (positionId == 0) {
            (uint256 tokenId, uint128 liq, uint256 a0, uint256 a1) = npm.mint(INonfungiblePositionManager.MintParams({
                token0: token0, token1: token1, fee: fee, tickLower: tickLower, tickUpper: tickUpper,
                amount0Desired: amount0Desired, amount1Desired: amount1Desired,
                amount0Min: amount0Min, amount1Min: amount1Min, recipient: address(this), deadline: block.timestamp
            }));
            positionId = tokenId; addedLiquidity = liq; used0 = a0; used1 = a1;
            shares = liq; // bootstrap: 1 share == 1 unit of liquidity
        } else {
            uint256 liqBefore = positionLiquidity();
            (uint128 liq, uint256 a0, uint256 a1) = npm.increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionId, amount0Desired: amount0Desired, amount1Desired: amount1Desired,
                amount0Min: amount0Min, amount1Min: amount1Min, deadline: block.timestamp
            }));
            addedLiquidity = liq; used0 = a0; used1 = a1;
            require(liqBefore > 0, "no liquidity");
            shares = uint256(liq) * totalSupply() / liqBefore;
        }
        require(shares > 0, "zero shares");
        _mint(msg.sender, shares);

        // Refund tokens the position did not consume.
        if (amount0Desired > used0) IERC20(token0).safeTransfer(msg.sender, amount0Desired - used0);
        if (amount1Desired > used1) IERC20(token1).safeTransfer(msg.sender, amount1Desired - used1);
        emit Deposited(msg.sender, shares, used0, used1);
    }

    /// @notice Burn shares, remove the proportional slice of liquidity (plus its share of compounded fees), return tokens.
    function withdraw(uint256 shares, uint256 amount0Min, uint256 amount1Min)
        external nonReentrant returns (uint256 amount0, uint256 amount1)
    {
        require(shares > 0 && balanceOf(msg.sender) >= shares, "bad shares");
        _compound(); // fold accrued fees into the position so the withdrawer gets their share

        uint256 supply = totalSupply();
        uint128 liq = uint128(uint256(positionLiquidity()) * shares / supply);
        _burn(msg.sender, shares);

        if (liq > 0) {
            npm.decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: positionId, liquidity: liq, amount0Min: amount0Min, amount1Min: amount1Min, deadline: block.timestamp
            }));
        }
        (amount0, amount1) = npm.collect(INonfungiblePositionManager.CollectParams({
            tokenId: positionId, recipient: address(this), amount0Max: type(uint128).max, amount1Max: type(uint128).max
        }));
        if (amount0 > 0) IERC20(token0).safeTransfer(msg.sender, amount0);
        if (amount1 > 0) IERC20(token1).safeTransfer(msg.sender, amount1);
        emit Withdrawn(msg.sender, shares, amount0, amount1);
    }

    /// @notice Collect trading fees, keep the platform cut, reinvest the rest. Permissionless.
    function compound() external nonReentrant { _compound(); }

    function _compound() internal {
        if (positionId == 0) return;
        (uint256 c0, uint256 c1) = npm.collect(INonfungiblePositionManager.CollectParams({
            tokenId: positionId, recipient: address(this), amount0Max: type(uint128).max, amount1Max: type(uint128).max
        }));
        if (c0 == 0 && c1 == 0) return;

        uint256 f0 = c0 * performanceFeeBps / BPS;
        uint256 f1 = c1 * performanceFeeBps / BPS;
        if (f0 > 0) IERC20(token0).safeTransfer(feeRecipient, f0);
        if (f1 > 0) IERC20(token1).safeTransfer(feeRecipient, f1);

        uint256 add0 = c0 - f0;
        uint256 add1 = c1 - f1;
        uint256 r0; uint256 r1;
        if (add0 > 0 || add1 > 0) {
            (, r0, r1) = npm.increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionId, amount0Desired: add0, amount1Desired: add1,
                amount0Min: 0, amount1Min: 0, deadline: block.timestamp
            }));
            // Any un-reinvested remainder (ratio dust) stays in the vault and is folded into the next compound.
        }
        emit Compounded(f0, f1, r0, r1);
    }

    function setPerformanceFee(uint256 _bps) external onlyOwner {
        require(_bps <= MAX_PERFORMANCE_FEE_BPS, "fee too high");
        performanceFeeBps = _bps;
        emit PerformanceFeeUpdated(_bps);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "zero address");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
