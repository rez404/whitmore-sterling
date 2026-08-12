// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Stake one token, earn many. Stakers deposit the platform token once and
///         accrue every partner reward stream in parallel; a new partner is added
///         without redeploying or asking anyone to unstake. Unstaking pays a small
///         fee to the stakers who stayed, so the platform token is itself claimable.
/// @dev    Synthetix MultiRewards accounting, one index per reward token. Each stream
///         has its own distributor, so a partner funds its own rewards without ever
///         holding owner rights here. AUDIT REQUIRED before mainnet.
contract MultiRewardStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // hard cap: 20%
    uint256 public constant MAX_UNSTAKE_FEE_BPS = 1_000; // hard cap: 10%
    /// @dev Every stake/withdraw/claim loops this list, so it is bounded to keep gas finite.
    uint256 public constant MAX_REWARD_TOKENS = 8;

    IERC20 public immutable stakingToken;

    uint256 public performanceFeeBps = 1_000; // 10% platform fee on rewards claimed
    /// @notice Penalty taken when unstaking and handed to whoever is still staked.
    /// @dev Starts at the hard cap, so the owner can only ever lower it — stakers get
    ///      a permanent guarantee that the exit penalty will never exceed 10%.
    uint256 public unstakeFeeBps = 1_000; // 10%
    address public feeRecipient;

    struct Reward {
        address distributor;
        uint256 duration;
        uint256 periodFinish;
        uint256 rate;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    mapping(address token => Reward) public rewardData;
    address[] public rewardTokens;
    mapping(address token => bool) public isRewardToken;

    mapping(address account => mapping(address token => uint256)) public userRewardPerTokenPaid;
    mapping(address account => mapping(address token => uint256)) public rewards;

    // The staking token is also paid out to stakers, funded purely by unstake fees.
    // It gets its own index rather than joining `rewardTokens`, because the vault's
    // own balance of it is principal + pending rewards and must never be conflated.
    uint256 public stakingRewardPerTokenStored;
    mapping(address account => uint256) public userStakingRewardPerTokenPaid;
    mapping(address account => uint256) public stakingRewards;

    uint256 private _totalSupply;
    mapping(address account => uint256) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 fee);
    event UnstakeFeeShared(address indexed from, uint256 amount);
    event UnstakeFeeSwept(uint256 amount);
    event UnstakeFeeUpdated(uint256 bps);
    event RewardPaid(address indexed user, address indexed token, uint256 reward);
    event PerformanceFeePaid(address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token, address indexed distributor, uint256 duration);
    event RewardAdded(address indexed token, uint256 reward);
    event DistributorUpdated(address indexed token, address indexed distributor);
    event RewardsDurationUpdated(address indexed token, uint256 duration);
    event PerformanceFeeUpdated(uint256 bps);
    event FeeRecipientUpdated(address indexed recipient);
    event Recovered(address indexed token, uint256 amount);

    error NotDistributor();
    error AlreadyRewardToken();
    error UnknownRewardToken();
    error TooManyRewardTokens();
    error PeriodStillActive();
    error CannotUseStakingToken();
    error ZeroAmount();
    error ZeroAddress();
    error FeeTooHigh();

    constructor(address initialOwner, address _stakingToken, address _feeRecipient) Ownable(initialOwner) {
        if (_stakingToken == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        stakingToken = IERC20(_stakingToken);
        feeRecipient = _feeRecipient;
    }

    modifier updateReward(address account) {
        uint256 len = rewardTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = rewardTokens[i];
            Reward storage r = rewardData[token];
            r.rewardPerTokenStored = rewardPerToken(token);
            r.lastUpdateTime = lastTimeRewardApplicable(token);
            if (account != address(0)) {
                rewards[account][token] = earned(account, token);
                userRewardPerTokenPaid[account][token] = r.rewardPerTokenStored;
            }
        }
        if (account != address(0)) {
            stakingRewards[account] = earnedStaking(account);
            userStakingRewardPerTokenPaid[account] = stakingRewardPerTokenStored;
        }
        _;
    }

    /* ---------------------------------- views --------------------------------- */

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function rewardTokensLength() external view returns (uint256) {
        return rewardTokens.length;
    }

    function getRewardTokens() external view returns (address[] memory) {
        return rewardTokens;
    }

    function lastTimeRewardApplicable(address token) public view returns (uint256) {
        uint256 finish = rewardData[token].periodFinish;
        return block.timestamp < finish ? block.timestamp : finish;
    }

    function rewardPerToken(address token) public view returns (uint256) {
        Reward storage r = rewardData[token];
        if (_totalSupply == 0) return r.rewardPerTokenStored;
        return
            r.rewardPerTokenStored +
            (((lastTimeRewardApplicable(token) - r.lastUpdateTime) * r.rate * 1e18) / _totalSupply);
    }

    function earned(address account, address token) public view returns (uint256) {
        return
            (_balances[account] * (rewardPerToken(token) - userRewardPerTokenPaid[account][token])) /
            1e18 +
            rewards[account][token];
    }

    /// @notice Staking-token rewards accrued from other people's unstake fees.
    function earnedStaking(address account) public view returns (uint256) {
        return
            (_balances[account] * (stakingRewardPerTokenStored - userStakingRewardPerTokenPaid[account])) /
            1e18 +
            stakingRewards[account];
    }

    /// @notice Everything `account` could claim right now, in reward-token order.
    function earnedAll(address account) external view returns (address[] memory tokens, uint256[] memory amounts) {
        tokens = rewardTokens;
        amounts = new uint256[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) amounts[i] = earned(account, tokens[i]);
    }

    function getRewardForDuration(address token) external view returns (uint256) {
        return rewardData[token].rate * rewardData[token].duration;
    }

    /* --------------------------------- staking -------------------------------- */

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalSupply += amount;
        _balances[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake. A slice of the withdrawal is handed to the stakers who stayed.
    /// @dev The leaver is re-snapshotted after the index moves, so they never earn a
    ///      share of their own fee — otherwise a whale holding most of the vault could
    ///      unstake almost for free.
    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        _totalSupply -= amount;
        _balances[msg.sender] -= amount;

        uint256 fee = (amount * unstakeFeeBps) / BPS;
        if (fee > 0) {
            if (_totalSupply > 0) {
                stakingRewardPerTokenStored += (fee * 1e18) / _totalSupply;
                userStakingRewardPerTokenPaid[msg.sender] = stakingRewardPerTokenStored;
                emit UnstakeFeeShared(msg.sender, fee);
            } else {
                // last staker out: there is nobody to share with
                stakingToken.safeTransfer(feeRecipient, fee);
                emit UnstakeFeeSwept(fee);
            }
        }

        stakingToken.safeTransfer(msg.sender, amount - fee);
        emit Withdrawn(msg.sender, amount - fee, fee);
    }

    /// @notice Claim every reward token in one transaction.
    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 own = stakingRewards[msg.sender];
        if (own > 0) {
            stakingRewards[msg.sender] = 0;
            uint256 ownFee = (own * performanceFeeBps) / BPS;
            if (ownFee > 0) {
                stakingToken.safeTransfer(feeRecipient, ownFee);
                emit PerformanceFeePaid(address(stakingToken), ownFee);
            }
            stakingToken.safeTransfer(msg.sender, own - ownFee);
            emit RewardPaid(msg.sender, address(stakingToken), own - ownFee);
        }

        uint256 len = rewardTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = rewardTokens[i];
            uint256 reward = rewards[msg.sender][token];
            if (reward == 0) continue;
            rewards[msg.sender][token] = 0;

            uint256 fee = (reward * performanceFeeBps) / BPS;
            if (fee > 0) {
                IERC20(token).safeTransfer(feeRecipient, fee);
                emit PerformanceFeePaid(token, fee);
            }
            uint256 net = reward - fee;
            IERC20(token).safeTransfer(msg.sender, net);
            emit RewardPaid(msg.sender, token, net);
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    /* ------------------------------- reward admin ------------------------------ */

    /// @notice Register a partner reward stream. The distributor funds it and never gains owner rights.
    function addRewardToken(address token, address distributor, uint256 duration) external onlyOwner {
        if (token == address(0) || distributor == address(0)) revert ZeroAddress();
        if (token == address(stakingToken)) revert CannotUseStakingToken();
        if (isRewardToken[token]) revert AlreadyRewardToken();
        if (rewardTokens.length >= MAX_REWARD_TOKENS) revert TooManyRewardTokens();
        if (duration == 0) revert ZeroAmount();

        isRewardToken[token] = true;
        rewardTokens.push(token);
        rewardData[token].distributor = distributor;
        rewardData[token].duration = duration;
        emit RewardTokenAdded(token, distributor, duration);
    }

    function setDistributor(address token, address distributor) external onlyOwner {
        if (!isRewardToken[token]) revert UnknownRewardToken();
        if (distributor == address(0)) revert ZeroAddress();
        rewardData[token].distributor = distributor;
        emit DistributorUpdated(token, distributor);
    }

    function setRewardsDuration(address token, uint256 duration) external onlyOwner {
        if (!isRewardToken[token]) revert UnknownRewardToken();
        if (block.timestamp <= rewardData[token].periodFinish) revert PeriodStillActive();
        if (duration == 0) revert ZeroAmount();
        rewardData[token].duration = duration;
        emit RewardsDurationUpdated(token, duration);
    }

    /// @notice Fund a stream. Tokens are pulled from the caller, so there is no
    ///         "transfer first, then notify" window where the two can disagree.
    /// @dev    The credited amount is measured from the balance delta: several partner
    ///         tokens take a transfer fee, and crediting the requested amount instead of
    ///         the received amount would promise rewards the contract cannot pay.
    function notifyRewardAmount(address token, uint256 amount) external nonReentrant updateReward(address(0)) {
        if (!isRewardToken[token]) revert UnknownRewardToken();
        Reward storage r = rewardData[token];
        if (msg.sender != r.distributor && msg.sender != owner()) revert NotDistributor();
        if (amount == 0) revert ZeroAmount();

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        if (block.timestamp >= r.periodFinish) {
            r.rate = received / r.duration;
        } else {
            uint256 leftover = (r.periodFinish - block.timestamp) * r.rate;
            r.rate = (received + leftover) / r.duration;
        }

        r.lastUpdateTime = block.timestamp;
        r.periodFinish = block.timestamp + r.duration;
        emit RewardAdded(token, received);
    }

    /* ---------------------------------- admin --------------------------------- */

    function setUnstakeFee(uint256 bps) external onlyOwner {
        if (bps > MAX_UNSTAKE_FEE_BPS) revert FeeTooHigh();
        unstakeFeeBps = bps;
        emit UnstakeFeeUpdated(bps);
    }

    function setPerformanceFee(uint256 bps) external onlyOwner {
        if (bps > MAX_PERFORMANCE_FEE_BPS) revert FeeTooHigh();
        performanceFeeBps = bps;
        emit PerformanceFeeUpdated(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    /// @notice Rescue tokens sent here by mistake. Never the staking token, and never
    ///         a registered reward token — both belong to users, not the owner.
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        if (token == address(stakingToken)) revert CannotUseStakingToken();
        if (isRewardToken[token]) revert AlreadyRewardToken();
        IERC20(token).safeTransfer(owner(), amount);
        emit Recovered(token, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
