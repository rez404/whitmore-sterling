// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Router stub with a fixed price per pair, so zap tests assert routing and
///         accounting rather than AMM maths.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

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

    // rate is out-per-in scaled by 1e18
    mapping(address => mapping(address => uint256)) public rate;

    function setRate(address tokenIn, address tokenOut, uint256 r) external {
        rate[tokenIn][tokenOut] = r;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external returns (uint256 amountOut) {
        uint256 r = rate[p.tokenIn][p.tokenOut];
        require(r > 0, "no rate");
        amountOut = (p.amountIn * r) / 1e18;
        require(amountOut >= p.amountOutMinimum, "Too little received");
        IERC20(p.tokenIn).safeTransferFrom(msg.sender, address(this), p.amountIn);
        MintableToken(p.tokenOut).mint(p.recipient, amountOut);
    }
}

contract MintableToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockWETH9 is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Vault stub that consumes both tokens at a fixed 1:1 ratio and mints shares
///         equal to the smaller side — enough to exercise deposits, dust and refunds.
contract MockLpVault is ERC20 {
    using SafeERC20 for IERC20;

    address public immutable token0;
    address public immutable token1;

    constructor(address _token0, address _token1) ERC20("Mock LP", "mLP") {
        token0 = _token0;
        token1 = _token1;
    }

    function deposit(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min)
        external
        returns (uint256 shares)
    {
        uint256 used = amount0Desired < amount1Desired ? amount0Desired : amount1Desired;
        require(used >= amount0Min && used >= amount1Min, "slippage");
        if (used > 0) {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), used);
            IERC20(token1).safeTransferFrom(msg.sender, address(this), used);
        }
        shares = used;
        _mint(msg.sender, shares);
    }
}
