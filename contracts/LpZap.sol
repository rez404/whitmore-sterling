// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH9 is IERC20 {
    function deposit() external payable;
}

interface ILpVault {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function deposit(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min)
        external
        returns (uint256 shares);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice One-transaction entry into an LP vault from a single asset.
///
/// The caller sends one token (or native ETH); this contract performs the swaps
/// needed to obtain both sides of the pair, deposits them, and forwards the vault
/// shares. Anything left over comes straight back — the contract is designed to
/// hold no balance between transactions.
///
/// @dev Swap sizing lives off-chain: the caller computes how much to swap and the
///      minimums that protect it. On-chain we enforce the invariants that keep a
///      badly-formed or malicious call from doing damage. AUDIT REQUIRED.
contract LpZap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable router;
    IWETH9 public immutable weth9;

    /// @param tokenOut must be one of the vault's two tokens — see `_validate`.
    struct SwapLeg {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    event Zapped(
        address indexed user,
        address indexed vault,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 shares
    );

    error ZeroAmount();
    error ZeroAddress();
    error LegTokenNotInPair();
    error LegsExceedInput();
    error NothingToDeposit();
    error NativeMismatch();

    constructor(address _router, address _weth9) {
        if (_router == address(0) || _weth9 == address(0)) revert ZeroAddress();
        router = ISwapRouter(_router);
        weth9 = IWETH9(_weth9);
    }

    /**
     * @notice Swap into both sides of `vault`'s pair and deposit in one call.
     * @param tokenIn  Asset supplied. Pass `address(weth9)` and send value to use native ETH.
     * @param legs     Swaps to perform first. Each must output one of the pair's tokens.
     * @dev Shares are minted to this contract by the vault, then forwarded, so a vault
     *      that mints to `msg.sender` internally would still work.
     */
    function zapIn(
        address vault,
        address tokenIn,
        uint256 amountIn,
        SwapLeg[] calldata legs,
        uint256 amount0Min,
        uint256 amount1Min
    ) external payable nonReentrant returns (uint256 shares) {
        if (vault == address(0) || tokenIn == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        address token0 = ILpVault(vault).token0();
        address token1 = ILpVault(vault).token1();
        _validate(legs, tokenIn, amountIn, token0, token1);

        // Take custody of the input.
        if (msg.value > 0) {
            if (tokenIn != address(weth9) || msg.value != amountIn) revert NativeMismatch();
            weth9.deposit{value: msg.value}();
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        for (uint256 i; i < legs.length; ++i) {
            _swap(legs[i]);
        }

        uint256 amount0 = IERC20(token0).balanceOf(address(this));
        uint256 amount1 = IERC20(token1).balanceOf(address(this));
        if (amount0 == 0 && amount1 == 0) revert NothingToDeposit();

        _approveExact(token0, vault, amount0);
        _approveExact(token1, vault, amount1);

        uint256 before = ILpVault(vault).balanceOf(address(this));
        ILpVault(vault).deposit(amount0, amount1, amount0Min, amount1Min);
        shares = ILpVault(vault).balanceOf(address(this)) - before;

        if (shares > 0) ILpVault(vault).transfer(msg.sender, shares);

        // Sweep everything back: leftover pair tokens from the deposit ratio, and any
        // unswapped input. Holding a balance here would make the contract a target.
        _sweep(token0);
        _sweep(token1);
        if (tokenIn != token0 && tokenIn != token1) _sweep(tokenIn);

        emit Zapped(msg.sender, vault, tokenIn, amountIn, shares);
    }

    /* -------------------------------- internals ------------------------------- */

    /// @dev Every leg must end in a token the vault actually wants, and the legs
    ///      together may not spend more than was supplied. Without the first check a
    ///      caller could route funds into an unrelated token and strand them here.
    function _validate(
        SwapLeg[] calldata legs,
        address tokenIn,
        uint256 amountIn,
        address token0,
        address token1
    ) private pure {
        uint256 spent;
        for (uint256 i; i < legs.length; ++i) {
            if (legs[i].tokenOut != token0 && legs[i].tokenOut != token1) revert LegTokenNotInPair();
            if (legs[i].tokenIn == tokenIn) spent += legs[i].amountIn;
        }
        if (spent > amountIn) revert LegsExceedInput();
    }

    function _swap(SwapLeg calldata leg) private {
        if (leg.amountIn == 0) return;
        _approveExact(leg.tokenIn, address(router), leg.amountIn);
        router.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: leg.tokenIn,
                tokenOut: leg.tokenOut,
                fee: leg.fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: leg.amountIn,
                amountOutMinimum: leg.amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
    }

    /// @dev forceApprove resets first, so tokens that reject a non-zero-to-non-zero
    ///      allowance change still work.
    function _approveExact(address token, address spender, uint256 amount) private {
        if (amount == 0) return;
        IERC20(token).forceApprove(spender, amount);
    }

    function _sweep(address token) private {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).safeTransfer(msg.sender, bal);
    }
}
