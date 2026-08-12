// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Whitmore Sterling platform token ($STERLING) — staked to earn partner reward tokens.
/// @dev Owner can mint for future incentives; point ownership at the multisig before launch.
contract WhitmoreToken is ERC20, ERC20Burnable, Ownable {
    constructor(address initialOwner, uint256 initialSupply)
        ERC20("Whitmore Sterling", "STERLING")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "zero owner");
        _mint(initialOwner, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
