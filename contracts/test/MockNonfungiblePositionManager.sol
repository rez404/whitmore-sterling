// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Position-manager stub for exercising StockLpVault's accounting.
 *
 * The AMM maths are deliberately simplified — liquidity added is `min(amount0, amount1)`
 * and consumes that much of each side. That reproduces the two behaviours the vault
 * actually has to handle: a fixed deposit ratio, and leftover dust when the caller
 * supplies the sides unevenly. `accrueFees` stands in for trading activity.
 */
contract MockNonfungiblePositionManager {
    using SafeERC20 for IERC20;

    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        address owner;
    }

    mapping(uint256 => Position) public pos;
    uint256 public nextId = 1;

    /// @dev Set to make the next mint/increase revert, for failure-path tests.
    bool public failNext;

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function setFailNext(bool v) external {
        failNext = v;
    }

    function mint(MintParams calldata p)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(!failNext, "mint failed");
        uint256 used = p.amount0Desired < p.amount1Desired ? p.amount0Desired : p.amount1Desired;
        require(used >= p.amount0Min && used >= p.amount1Min, "Price slippage check");

        tokenId = nextId++;
        pos[tokenId] = Position({
            token0: p.token0,
            token1: p.token1,
            fee: p.fee,
            tickLower: p.tickLower,
            tickUpper: p.tickUpper,
            liquidity: uint128(used),
            tokensOwed0: 0,
            tokensOwed1: 0,
            owner: p.recipient
        });

        if (used > 0) {
            IERC20(p.token0).safeTransferFrom(msg.sender, address(this), used);
            IERC20(p.token1).safeTransferFrom(msg.sender, address(this), used);
        }
        return (tokenId, uint128(used), used, used);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata p)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(!failNext, "increase failed");
        Position storage position = pos[p.tokenId];
        require(position.token0 != address(0), "no position");

        uint256 used = p.amount0Desired < p.amount1Desired ? p.amount0Desired : p.amount1Desired;
        require(used >= p.amount0Min && used >= p.amount1Min, "Price slippage check");

        position.liquidity += uint128(used);
        if (used > 0) {
            IERC20(position.token0).safeTransferFrom(msg.sender, address(this), used);
            IERC20(position.token1).safeTransferFrom(msg.sender, address(this), used);
        }
        return (uint128(used), used, used);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata p)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage position = pos[p.tokenId];
        require(position.liquidity >= p.liquidity, "not enough liquidity");
        require(uint256(p.liquidity) >= p.amount0Min && uint256(p.liquidity) >= p.amount1Min, "Price slippage check");

        position.liquidity -= p.liquidity;
        // Uniswap credits removed principal to tokensOwed; it is only moved by collect().
        position.tokensOwed0 += p.liquidity;
        position.tokensOwed1 += p.liquidity;
        return (p.liquidity, p.liquidity);
    }

    function collect(CollectParams calldata p) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage position = pos[p.tokenId];
        amount0 = position.tokensOwed0 < p.amount0Max ? position.tokensOwed0 : p.amount0Max;
        amount1 = position.tokensOwed1 < p.amount1Max ? position.tokensOwed1 : p.amount1Max;
        position.tokensOwed0 -= uint128(amount0);
        position.tokensOwed1 -= uint128(amount1);
        if (amount0 > 0) IERC20(position.token0).safeTransfer(p.recipient, amount0);
        if (amount1 > 0) IERC20(position.token1).safeTransfer(p.recipient, amount1);
    }

    /// @notice Simulate trading fees accruing to the position.
    function accrueFees(uint256 tokenId, uint128 amount0, uint128 amount1) external {
        Position storage position = pos[tokenId];
        require(position.token0 != address(0), "no position");
        position.tokensOwed0 += amount0;
        position.tokensOwed1 += amount1;
        // The pool would already hold these; mint them in so collect() can pay out.
        if (amount0 > 0) MintableLike(position.token0).mint(address(this), amount0);
        if (amount1 > 0) MintableLike(position.token1).mint(address(this), amount1);
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position storage p = pos[tokenId];
        return (0, address(0), p.token0, p.token1, p.fee, p.tickLower, p.tickUpper, p.liquidity, 0, 0, p.tokensOwed0, p.tokensOwed1);
    }
}

interface MintableLike {
    function mint(address to, uint256 amount) external;
}
