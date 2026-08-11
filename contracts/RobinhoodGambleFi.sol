// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Factory for Robinhood Chain Gamba-style token wager pools.
/// @dev Structural EVM equivalent of Gamba pools: ERC20 LP shares, configurable games,
///      wager requests, committed entropy epochs, and creator/protocol fees.
contract RobinhoodGambleFiFactory is Ownable {
    event PoolCreated(address indexed asset, address indexed pool, address indexed treasury, address entropyAdmin);

    mapping(address asset => address pool) public poolForAsset;
    address[] public allPools;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createPool(
        IERC20 asset,
        string calldata lpName,
        string calldata lpSymbol,
        address treasury,
        address entropyAdmin,
        bytes32 firstEntropyCommitment
    ) external onlyOwner returns (RobinhoodGambleFiPool pool) {
        require(address(asset) != address(0), "asset=0");
        require(poolForAsset[address(asset)] == address(0), "pool exists");
        require(treasury != address(0), "treasury=0");
        require(entropyAdmin != address(0), "entropy=0");
        require(firstEntropyCommitment != bytes32(0), "commitment=0");

        pool = new RobinhoodGambleFiPool(
            asset,
            lpName,
            lpSymbol,
            msg.sender,
            treasury,
            entropyAdmin,
            firstEntropyCommitment
        );
        poolForAsset[address(asset)] = address(pool);
        allPools.push(address(pool));
        emit PoolCreated(address(asset), address(pool), treasury, entropyAdmin);
    }

    function poolsLength() external view returns (uint256) {
        return allPools.length;
    }
}

contract RobinhoodGambleFiPool is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_OUTCOMES = 256;
    uint256 public constant MAX_TOTAL_FEE_BPS = 2_000; // 20%; hard cap so creators cannot hide abusive fees.

    IERC20 public immutable asset;
    address public treasury;
    address public entropyAdmin;
    uint256 public lockedLiability;
    uint256 public nextGameId = 1;
    uint256 public nextRequestId = 1;
    uint256 public currentEntropyEpoch = 1;

    struct Game {
        address creator;
        bool active;
        string name;
        uint256 minWager;
        uint256 maxWager;
        uint16 creatorFeeBps;
        uint16 protocolFeeBps;
        uint32 maxMultiplierBps;
        uint16[] multipliersBps;
    }

    struct GameConfig {
        string name;
        address creator;
        uint256 minWager;
        uint256 maxWager;
        uint16 creatorFeeBps;
        uint16 protocolFeeBps;
        uint16[] multipliersBps;
    }

    struct WagerRequest {
        address player;
        uint256 gameId;
        uint256 wager;
        uint256 maxLiability;
        uint256 entropyEpoch;
        bool settled;
    }

    struct EntropyEpoch {
        bytes32 commitment;
        bytes32 seed;
        bool revealed;
    }

    mapping(uint256 gameId => Game game) private games;
    mapping(uint256 requestId => WagerRequest request) public requests;
    mapping(uint256 epoch => EntropyEpoch entropy) public entropyEpochs;

    event TreasuryUpdated(address indexed treasury);
    event EntropyAdminUpdated(address indexed entropyAdmin);
    event EntropyCommitted(uint256 indexed epoch, bytes32 indexed commitment);
    event EntropyRevealed(uint256 indexed epoch, bytes32 seed, uint256 indexed nextEpoch, bytes32 nextCommitment);
    event GameCreated(uint256 indexed gameId, address indexed creator, string name, uint256 minWager, uint256 maxWager);
    event GameStatusUpdated(uint256 indexed gameId, bool active);
    event LiquidityDeposited(address indexed provider, uint256 assets, uint256 shares);
    event LiquidityWithdrawn(address indexed provider, uint256 assets, uint256 shares);
    event WagerPlaced(uint256 indexed requestId, uint256 indexed gameId, address indexed player, uint256 wager, uint256 maxLiability, uint256 entropyEpoch);
    event WagerSettled(
        uint256 indexed requestId,
        uint256 indexed gameId,
        address indexed player,
        uint256 outcomeIndex,
        uint256 multiplierBps,
        uint256 payout,
        uint256 creatorFee,
        uint256 protocolFee
    );

    error InvalidGame();
    error InvalidOdds();
    error InvalidWager();
    error InsufficientUnlockedLiquidity();
    error EntropyNotRevealed();
    error BadEntropySeed();
    error AlreadySettled();
    error NotEntropyAdmin();

    modifier onlyEntropyAdmin() {
        if (msg.sender != entropyAdmin) revert NotEntropyAdmin();
        _;
    }

    constructor(
        IERC20 asset_,
        string memory lpName,
        string memory lpSymbol,
        address initialOwner,
        address treasury_,
        address entropyAdmin_,
        bytes32 firstEntropyCommitment
    ) ERC20(lpName, lpSymbol) Ownable(initialOwner) {
        require(address(asset_) != address(0), "asset=0");
        require(treasury_ != address(0), "treasury=0");
        require(entropyAdmin_ != address(0), "entropy=0");
        require(firstEntropyCommitment != bytes32(0), "commitment=0");
        asset = asset_;
        treasury = treasury_;
        entropyAdmin = entropyAdmin_;
        entropyEpochs[currentEntropyEpoch].commitment = firstEntropyCommitment;
        emit EntropyCommitted(currentEntropyEpoch, firstEntropyCommitment);
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function unlockedAssets() public view returns (uint256) {
        uint256 balance = totalAssets();
        return balance > lockedLiability ? balance - lockedLiability : 0;
    }

    function gameInfo(uint256 gameId)
        external
        view
        returns (
            address creator,
            bool active,
            string memory name,
            uint256 minWager,
            uint256 maxWager,
            uint16 creatorFeeBps,
            uint16 protocolFeeBps,
            uint32 maxMultiplierBps,
            uint16[] memory multipliersBps
        )
    {
        Game storage g = games[gameId];
        if (g.creator == address(0)) revert InvalidGame();
        return (g.creator, g.active, g.name, g.minWager, g.maxWager, g.creatorFeeBps, g.protocolFeeBps, g.maxMultiplierBps, g.multipliersBps);
    }

    function depositLiquidity(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        require(receiver != address(0), "receiver=0");
        require(assets > 0, "assets=0");
        uint256 supply = totalSupply();
        uint256 assetsBefore = totalAssets();
        uint256 unlockedBefore = assetsBefore > lockedLiability ? assetsBefore - lockedLiability : 0;
        shares = supply == 0 || unlockedBefore == 0 ? assets : (assets * supply) / unlockedBefore;
        require(shares > 0, "shares=0");
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        emit LiquidityDeposited(receiver, assets, shares);
    }

    function withdrawLiquidity(uint256 shares, address receiver) external nonReentrant returns (uint256 assetsOut) {
        require(receiver != address(0), "receiver=0");
        require(shares > 0, "shares=0");
        uint256 supply = totalSupply();
        assetsOut = (shares * unlockedAssets()) / supply;
        require(assetsOut > 0, "assets=0");
        _burn(msg.sender, shares);
        asset.safeTransfer(receiver, assetsOut);
        emit LiquidityWithdrawn(receiver, assetsOut, shares);
    }

    function createGame(GameConfig calldata cfg) external onlyOwner returns (uint256 gameId) {
        uint32 maxMultiplier = _validateGameConfig(cfg);

        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.creator = cfg.creator;
        g.active = true;
        g.name = cfg.name;
        g.minWager = cfg.minWager;
        g.maxWager = cfg.maxWager;
        g.creatorFeeBps = cfg.creatorFeeBps;
        g.protocolFeeBps = cfg.protocolFeeBps;
        g.maxMultiplierBps = maxMultiplier;
        for (uint256 i = 0; i < cfg.multipliersBps.length; i++) {
            g.multipliersBps.push(cfg.multipliersBps[i]);
        }
        emit GameCreated(gameId, cfg.creator, cfg.name, cfg.minWager, cfg.maxWager);
    }

    function _validateGameConfig(GameConfig calldata cfg) internal pure returns (uint32 maxMultiplier) {
        require(cfg.creator != address(0), "creator=0");
        require(bytes(cfg.name).length > 0, "name empty");
        require(cfg.minWager > 0 && cfg.maxWager >= cfg.minWager, "wager bounds");
        require(cfg.multipliersBps.length > 0 && cfg.multipliersBps.length <= MAX_OUTCOMES, "outcomes");
        require(uint256(cfg.creatorFeeBps) + uint256(cfg.protocolFeeBps) <= MAX_TOTAL_FEE_BPS, "fee high");

        uint256 sum;
        for (uint256 i = 0; i < cfg.multipliersBps.length; i++) {
            uint16 m = cfg.multipliersBps[i];
            sum += m;
            if (m > maxMultiplier) maxMultiplier = uint32(m);
        }
        if ((sum / cfg.multipliersBps.length) + cfg.creatorFeeBps + cfg.protocolFeeBps > BPS) revert InvalidOdds();
    }

    function setGameActive(uint256 gameId, bool active) external onlyOwner {
        if (games[gameId].creator == address(0)) revert InvalidGame();
        games[gameId].active = active;
        emit GameStatusUpdated(gameId, active);
    }

    function placeWager(uint256 gameId, uint256 wager) external whenNotPaused nonReentrant returns (uint256 requestId) {
        Game storage g = games[gameId];
        if (g.creator == address(0) || !g.active) revert InvalidGame();
        if (wager < g.minWager || wager > g.maxWager) revert InvalidWager();
        if (entropyEpochs[currentEntropyEpoch].revealed) revert EntropyNotRevealed();

        uint256 maxPayout = (wager * g.maxMultiplierBps) / BPS;
        uint256 maxFees = (wager * (uint256(g.creatorFeeBps) + uint256(g.protocolFeeBps))) / BPS;
        uint256 maxLiability = maxPayout + maxFees;
        if (unlockedAssets() + wager < maxLiability) revert InsufficientUnlockedLiquidity();

        requestId = nextRequestId++;
        requests[requestId] = WagerRequest({
            player: msg.sender,
            gameId: gameId,
            wager: wager,
            maxLiability: maxLiability,
            entropyEpoch: currentEntropyEpoch,
            settled: false
        });
        lockedLiability += maxLiability;
        asset.safeTransferFrom(msg.sender, address(this), wager);
        emit WagerPlaced(requestId, gameId, msg.sender, wager, maxLiability, currentEntropyEpoch);
    }

    function revealEntropyAndCommitNext(bytes32 seed, bytes32 nextCommitment) external onlyEntropyAdmin {
        require(seed != bytes32(0), "seed=0");
        require(nextCommitment != bytes32(0), "next=0");
        EntropyEpoch storage epoch = entropyEpochs[currentEntropyEpoch];
        if (epoch.commitment != keccak256(abi.encodePacked(seed))) revert BadEntropySeed();
        epoch.seed = seed;
        epoch.revealed = true;

        uint256 oldEpoch = currentEntropyEpoch;
        currentEntropyEpoch++;
        entropyEpochs[currentEntropyEpoch].commitment = nextCommitment;
        emit EntropyRevealed(oldEpoch, seed, currentEntropyEpoch, nextCommitment);
        emit EntropyCommitted(currentEntropyEpoch, nextCommitment);
    }

    function settleWager(uint256 requestId) external nonReentrant {
        WagerRequest storage request = requests[requestId];
        if (request.player == address(0)) revert InvalidWager();
        if (request.settled) revert AlreadySettled();
        EntropyEpoch storage epoch = entropyEpochs[request.entropyEpoch];
        if (!epoch.revealed) revert EntropyNotRevealed();

        Game storage g = games[request.gameId];
        uint256 outcomeIndex = uint256(keccak256(abi.encodePacked(epoch.seed, requestId, request.player, request.gameId, address(this)))) % g.multipliersBps.length;
        uint256 multiplierBps = g.multipliersBps[outcomeIndex];
        uint256 payout = (request.wager * multiplierBps) / BPS;
        uint256 creatorFee = (request.wager * g.creatorFeeBps) / BPS;
        uint256 protocolFee = (request.wager * g.protocolFeeBps) / BPS;

        request.settled = true;
        lockedLiability -= request.maxLiability;

        if (payout > 0) asset.safeTransfer(request.player, payout);
        if (creatorFee > 0) asset.safeTransfer(g.creator, creatorFee);
        if (protocolFee > 0) asset.safeTransfer(treasury, protocolFee);

        emit WagerSettled(requestId, request.gameId, request.player, outcomeIndex, multiplierBps, payout, creatorFee, protocolFee);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setEntropyAdmin(address entropyAdmin_) external onlyOwner {
        require(entropyAdmin_ != address(0), "entropy=0");
        entropyAdmin = entropyAdmin_;
        emit EntropyAdminUpdated(entropyAdmin_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
