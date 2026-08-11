// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockSequencerUptimeFeed {
    uint8 public constant decimals = 0;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public roundId = 1;

    constructor() {
        answer = 0;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function setStatus(int256 answer_, uint256 startedAt_) external {
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = block.timestamp;
        roundId++;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, startedAt, updatedAt, roundId);
    }
}
