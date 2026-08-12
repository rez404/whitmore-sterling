// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IClaimable {
    function getReward() external;
    function exit() external;
}

/// @notice Hostile reward token: every payout transfer tries to re-enter the vault
///         and claim again. Used to prove the reentrancy guard actually holds.
contract MockReentrantToken is ERC20 {
    address public target;
    bool public attacking;
    bool public attackAttempted;
    bool public attackReverted;

    constructor() ERC20("Reentrant", "REENT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTarget(address t) external {
        target = t;
    }

    function arm() external {
        attacking = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attacking && from == target && to != address(0)) {
            attacking = false; // one shot, so a failed attempt cannot loop forever
            attackAttempted = true;
            try IClaimable(target).getReward() {
                attackReverted = false;
            } catch {
                attackReverted = true;
            }
        }
    }
}
