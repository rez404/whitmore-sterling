// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockOracle {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId = 1;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 answer_) external { answer = answer_; roundId++; updatedAt = block.timestamp; }
    function setUpdatedAt(uint256 updatedAt_) external { updatedAt = updatedAt_; roundId++; }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}
