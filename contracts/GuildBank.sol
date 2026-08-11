// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IOraclePauseFlag {
    function oraclePaused() external view returns (bool);
}

/// @notice Guild Bank collateralized credit desk for Robinhood Chain stock tokens.
/// @dev Single-USDG pool with Aave-inspired portfolio account data, target-HF liquidations, dust/deficit accounting, granular flags, and solvency-favorable rounding.
contract GuildBank is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public constant SEQUENCER_GRACE_PERIOD = 1 hours;
    uint256 public constant DUST_THRESHOLD_USDG_WAD = 1e18;

    IERC20 public immutable debtAsset;
    uint8 public immutable debtAssetDecimals;
    uint256 public immutable debtAssetUnit;
    uint256 public immutable debtToWadScale;
    AggregatorV3Interface public sequencerUptimeFeed;
    address public treasury;

    uint16 public reserveFactorBps = 2_000;
    uint16 public originationFeeBps = 25;
    uint16 public closeFactorBps = 5_000; // hard fallback cap for non-target full-close cases
    uint16 public protocolLiquidationFeeBps = 2_000; // 20% of liquidation bonus collateral, not extra USDG.
    uint256 public targetHealthFactor = 1.1e18;
    uint256 public baseBorrowRatePerSecond = uint256(2e16) / YEAR;
    uint256 public slopeBorrowRatePerSecond = uint256(30e16) / YEAR;

    uint256 public borrowIndex = WAD;
    uint256 public lastAccrualTimestamp;
    uint256 public totalDebt;
    uint256 public totalSuppliedLiquidity;
    uint256 public protocolReserves;
    uint256 public totalLiquidityShares;
    uint256 public globalSupplyCap;
    uint256 public protocolDeficit;
    uint256 public totalSuppliedEthLiquidity;
    uint256 public totalEthLiquidityShares;
    uint256 public ethSupplyCap;

    struct Market {
        bool listed;
        uint16 collateralFactorBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint64 maxStaleness;
        AggregatorV3Interface priceFeed;
        uint256 borrowCap;
        uint256 supplyCap;
        uint256 totalBorrowed;
        uint256 totalCollateral;
        bool paused;
        bool frozen;
        bool borrowable;
    }

    struct AccountData {
        uint256 totalCollateralValue;
        uint256 borrowLimitValue;
        uint256 liquidationLimitValue;
        uint256 totalDebtValue;
        uint256 healthFactor;
        uint256 activeCollateralCount;
    }

    mapping(address => Market) public markets;
    mapping(address => mapping(address => uint256)) public collateralBalance;
    mapping(address => uint256) private debtPrincipal;
    mapping(address => uint256) public userBorrowIndex;
    mapping(address => uint256) public suppliedLiquidity;
    mapping(address => uint256) public suppliedEthLiquidity;
    mapping(address => mapping(address => uint256)) public userDebtByMarket;

    mapping(address => address[]) private userCollateralTokens;
    mapping(address => mapping(address => bool)) private userCollateralTokenAdded;
    mapping(address => address[]) private userBorrowTokens;
    mapping(address => mapping(address => bool)) private userBorrowTokenAdded;

    // Optional oracle sanity bounds per market (in USD wad). 0 disables the bound.
    mapping(address => uint256) public marketMinPriceWad;
    mapping(address => uint256) public marketMaxPriceWad;

    event MarketListed(address indexed token, address indexed priceFeed, uint16 collateralFactorBps, uint16 liquidationThresholdBps, uint16 liquidationBonusBps, uint64 maxStaleness, uint256 borrowCap, uint256 supplyCap);
    event MarketFlagsUpdated(address indexed token, bool paused, bool frozen, bool borrowable);
    event Supplied(address indexed lender, uint256 amount, uint256 shares);
    event LiquidityWithdrawn(address indexed lender, uint256 amount, uint256 shares);
    event EthSupplied(address indexed lender, uint256 amount, uint256 shares);
    event EthLiquidityWithdrawn(address indexed lender, uint256 amount, uint256 shares);
    event EthSupplyCapUpdated(uint256 cap);
    event GlobalSupplyCapUpdated(uint256 cap);
    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event Borrowed(address indexed user, address indexed collateralToken, uint256 amount, uint256 fee);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, address indexed collateralToken, uint256 repaid, uint256 seized, uint256 protocolFeeCollateral);
    event DeficitReported(address indexed user, address indexed collateralToken, uint256 amount);
    event InterestAccrued(uint256 interest, uint256 supplierInterest, uint256 reserves, uint256 newBorrowIndex);
    event RiskParamsUpdated(uint16 reserveFactorBps, uint16 originationFeeBps, uint16 closeFactorBps, uint16 protocolLiquidationFeeBps);
    event TargetHealthFactorUpdated(uint256 targetHealthFactor);
    event TreasuryUpdated(address indexed treasury);
    event MarketPriceBoundsUpdated(address indexed token, uint256 minPriceWad, uint256 maxPriceWad);

    error AmountZero();
    error MarketNotListed();
    error MarketPaused();
    error MarketFrozen();
    error MarketNotBorrowable();
    error UnsafePosition();
    error InsufficientLiquidity();
    error InvalidOracle();
    error OracleStale();
    error OraclePaused();
    error HealthyPosition();
    error RepayTooLarge();
    error BorrowCapExceeded();
    error SupplyCapExceeded();
    error CloseFactorExceeded();
    error LiquidationAmountTooHigh();
    error DustyRemainingDebt();
    error OraclePriceOutOfBounds();

    constructor(IERC20 _debtAsset, address initialOwner, address _treasury, address _sequencerUptimeFeed) Ownable(initialOwner) {
        require(address(_debtAsset) != address(0) && initialOwner != address(0) && _treasury != address(0), "zero address");
        uint8 decimals_ = IERC20Metadata(address(_debtAsset)).decimals();
        require(decimals_ <= 18, "unsupported debt decimals");
        debtAsset = _debtAsset;
        debtAssetDecimals = decimals_;
        debtAssetUnit = 10 ** decimals_;
        debtToWadScale = 10 ** (18 - decimals_);
        treasury = _treasury;
        sequencerUptimeFeed = AggregatorV3Interface(_sequencerUptimeFeed);
        lastAccrualTimestamp = block.timestamp;
    }

    function listMarket(
        address stockToken,
        AggregatorV3Interface priceFeed,
        uint16 collateralFactorBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint64 maxStaleness,
        uint256 borrowCap,
        uint256 supplyCap
    ) external onlyOwner {
        require(stockToken != address(0) && address(priceFeed) != address(0), "zero address");
        require(collateralFactorBps < liquidationThresholdBps && liquidationThresholdBps <= BPS, "bad risk params");
        require(liquidationBonusBps <= 2_000, "bonus too high");
        require(maxStaleness > 0, "staleness required");
        Market storage existing = markets[stockToken];
        existing.listed = true;
        existing.collateralFactorBps = collateralFactorBps;
        existing.liquidationThresholdBps = liquidationThresholdBps;
        existing.liquidationBonusBps = liquidationBonusBps;
        existing.maxStaleness = maxStaleness;
        existing.priceFeed = priceFeed;
        existing.borrowCap = borrowCap;
        existing.supplyCap = supplyCap;
        existing.borrowable = true;
        emit MarketListed(stockToken, address(priceFeed), collateralFactorBps, liquidationThresholdBps, liquidationBonusBps, maxStaleness, borrowCap, supplyCap);
    }

    function setMarketFlags(address stockToken, bool marketPaused, bool frozen, bool borrowable) external onlyOwner {
        Market storage market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        market.paused = marketPaused;
        market.frozen = frozen;
        market.borrowable = borrowable;
        emit MarketFlagsUpdated(stockToken, marketPaused, frozen, borrowable);
    }

    function setMarketPriceBounds(address stockToken, uint256 minPriceWad, uint256 maxPriceWad) external onlyOwner {
        if (!markets[stockToken].listed) revert MarketNotListed();
        require(maxPriceWad == 0 || minPriceWad <= maxPriceWad, "bad bounds");
        marketMinPriceWad[stockToken] = minPriceWad;
        marketMaxPriceWad[stockToken] = maxPriceWad;
        emit MarketPriceBoundsUpdated(stockToken, minPriceWad, maxPriceWad);
    }

    function setRiskParams(uint16 _reserveFactorBps, uint16 _originationFeeBps, uint16 _closeFactorBps, uint16 _protocolLiquidationFeeBps) external onlyOwner {
        require(_reserveFactorBps <= 5_000 && _originationFeeBps <= 1_000 && _closeFactorBps > 0 && _closeFactorBps <= BPS && _protocolLiquidationFeeBps <= BPS, "bad risk params");
        reserveFactorBps = _reserveFactorBps;
        originationFeeBps = _originationFeeBps;
        closeFactorBps = _closeFactorBps;
        protocolLiquidationFeeBps = _protocolLiquidationFeeBps;
        emit RiskParamsUpdated(_reserveFactorBps, _originationFeeBps, _closeFactorBps, _protocolLiquidationFeeBps);
    }

    function setTargetHealthFactor(uint256 _targetHealthFactor) external onlyOwner {
        require(_targetHealthFactor >= MIN_HEALTH_FACTOR, "bad target");
        targetHealthFactor = _targetHealthFactor;
        emit TargetHealthFactorUpdated(_targetHealthFactor);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setEthSupplyCap(uint256 cap) external onlyOwner {
        ethSupplyCap = cap;
        emit EthSupplyCapUpdated(cap);
    }

    function setGlobalSupplyCap(uint256 cap) external onlyOwner {
        globalSupplyCap = cap;
        emit GlobalSupplyCapUpdated(cap);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    receive() external payable {
        _supplyEthLiquidity(msg.sender, msg.value);
    }

    function accrueInterest() public {
        uint256 dt = block.timestamp - lastAccrualTimestamp;
        if (dt == 0) return;
        lastAccrualTimestamp = block.timestamp;
        if (totalDebt == 0) return;

        uint256 cash = _cashPriorReserves();
        uint256 util = totalDebt * WAD / (cash + totalDebt);
        uint256 rate = baseBorrowRatePerSecond + (slopeBorrowRatePerSecond * util / WAD);
        uint256 interest = totalDebt * rate * dt / WAD;
        if (interest == 0) return;

        uint256 reserves = interest * reserveFactorBps / BPS;
        uint256 supplierInterest = interest - reserves;
        totalDebt += interest;
        totalSuppliedLiquidity += supplierInterest;
        protocolReserves += reserves;
        borrowIndex += borrowIndex * interest / (totalDebt - interest);
        emit InterestAccrued(interest, supplierInterest, reserves, borrowIndex);
    }

    function supplyLiquidity(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        accrueInterest();
        if (globalSupplyCap > 0 && totalSuppliedLiquidity + amount > globalSupplyCap) revert SupplyCapExceeded();
        uint256 shares = totalLiquidityShares == 0 || totalSuppliedLiquidity == 0 ? amount : amount * totalLiquidityShares / totalSuppliedLiquidity;
        if (shares == 0) revert AmountZero();
        suppliedLiquidity[msg.sender] += shares;
        totalLiquidityShares += shares;
        totalSuppliedLiquidity += amount;
        debtAsset.safeTransferFrom(msg.sender, address(this), amount);
        emit Supplied(msg.sender, amount, shares);
    }

    function withdrawableLiquidity(address lender) public view returns (uint256) {
        if (totalLiquidityShares == 0) return 0;
        return suppliedLiquidity[lender] * totalSuppliedLiquidity / totalLiquidityShares;
    }

    function withdrawLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        accrueInterest();
        uint256 owed = withdrawableLiquidity(msg.sender);
        if (amount > owed) revert InsufficientLiquidity();
        if (liquidityAvailable() < amount) revert InsufficientLiquidity();
        uint256 shares = _ceilDiv(amount * totalLiquidityShares, totalSuppliedLiquidity);
        suppliedLiquidity[msg.sender] -= shares;
        totalLiquidityShares -= shares;
        totalSuppliedLiquidity -= amount;
        debtAsset.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount, shares);
    }

    function supplyEthLiquidity() external payable nonReentrant whenNotPaused {
        _supplyEthLiquidity(msg.sender, msg.value);
    }

    function ethWithdrawableLiquidity(address lender) public view returns (uint256) {
        if (totalEthLiquidityShares == 0) return 0;
        return suppliedEthLiquidity[lender] * totalSuppliedEthLiquidity / totalEthLiquidityShares;
    }

    function ethLiquidityAvailable() public view returns (uint256) {
        return address(this).balance;
    }

    function withdrawEthLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        uint256 owed = ethWithdrawableLiquidity(msg.sender);
        if (amount > owed) revert InsufficientLiquidity();
        if (address(this).balance < amount) revert InsufficientLiquidity();
        uint256 shares = _ceilDiv(amount * totalEthLiquidityShares, totalSuppliedEthLiquidity);
        suppliedEthLiquidity[msg.sender] -= shares;
        totalEthLiquidityShares -= shares;
        totalSuppliedEthLiquidity -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit EthLiquidityWithdrawn(msg.sender, amount, shares);
    }

    function withdrawProtocolReserves(uint256 amount) external onlyOwner {
        if (amount == 0) revert AmountZero();
        protocolReserves -= amount;
        if (debtAsset.balanceOf(address(this)) < amount) revert InsufficientLiquidity();
        debtAsset.safeTransfer(treasury, amount);
    }

    function depositCollateral(address stockToken, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        if (market.paused) revert MarketPaused();
        if (market.frozen) revert MarketFrozen();
        _priceUsdWad(stockToken, market);
        if (market.supplyCap > 0 && markets[stockToken].totalCollateral + amount > market.supplyCap) revert SupplyCapExceeded();
        collateralBalance[msg.sender][stockToken] += amount;
        markets[stockToken].totalCollateral += amount;
        _addCollateralToken(msg.sender, stockToken);
        IERC20(stockToken).safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, stockToken, amount);
    }

    function withdrawCollateral(address stockToken, uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        accrueInterest();
        _syncBorrower(msg.sender);
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        if (market.paused) revert MarketPaused();
        collateralBalance[msg.sender][stockToken] -= amount;
        markets[stockToken].totalCollateral -= amount;
        if (collateralBalance[msg.sender][stockToken] == 0) _removeCollateralToken(msg.sender, stockToken);
        if (!_isHealthy(msg.sender)) revert UnsafePosition();
        IERC20(stockToken).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, stockToken, amount);
    }

    function borrow(address stockToken, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert AmountZero();
        accrueInterest();
        _syncBorrower(msg.sender);
        Market storage market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        if (market.paused) revert MarketPaused();
        if (market.frozen) revert MarketFrozen();
        if (!market.borrowable) revert MarketNotBorrowable();
        if (market.borrowCap > 0 && market.totalBorrowed + amount > market.borrowCap) revert BorrowCapExceeded();
        uint256 fee = amount * originationFeeBps / BPS;
        if (liquidityAvailable() < amount) revert InsufficientLiquidity();
        debtPrincipal[msg.sender] += amount;
        userDebtByMarket[msg.sender][stockToken] += amount;
        _addBorrowToken(msg.sender, stockToken);
        totalDebt += amount;
        market.totalBorrowed += amount;
        if (!_isHealthy(msg.sender)) revert UnsafePosition();
        if (fee > 0) debtAsset.safeTransfer(treasury, fee);
        debtAsset.safeTransfer(msg.sender, amount - fee);
        emit Borrowed(msg.sender, stockToken, amount, fee);
    }

    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        accrueInterest();
        _syncBorrower(msg.sender);
        uint256 debt = debtPrincipal[msg.sender];
        if (amount > debt) amount = debt;
        debtPrincipal[msg.sender] = debt - amount;
        totalDebt -= amount;
        _decreaseBorrowBuckets(msg.sender, amount);
        debtAsset.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(msg.sender, amount);
    }

    function liquidate(address user, address stockToken, uint256 requestedRepayAmount) external nonReentrant {
        if (requestedRepayAmount == 0) revert AmountZero();
        accrueInterest();
        _syncBorrower(user);
        Market storage market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        if (healthFactor(user, stockToken) >= MIN_HEALTH_FACTOR) revert HealthyPosition();

        uint256 userDebt = debtPrincipal[user];
        uint256 maxRepay = maxLiquidatableDebt(user, stockToken);
        if (requestedRepayAmount > maxRepay && requestedRepayAmount < userDebt) {
            uint256 collateralCoveredDebt = _usdWadToDebtDown(collateralValueUsd(user, stockToken) * BPS / (BPS + market.liquidationBonusBps));
            if (requestedRepayAmount <= collateralCoveredDebt) revert LiquidationAmountTooHigh();
        }
        uint256 repayAmount = requestedRepayAmount > userDebt ? userDebt : requestedRepayAmount;

        uint256 price = _priceUsdWad(stockToken, market);
        uint256 availableCollateral = collateralBalance[user][stockToken];
        uint256 availableValue = availableCollateral * price / WAD;
        uint256 seizeFactorBps = BPS + market.liquidationBonusBps;
        uint256 requiredSeizeValue = _debtToUsdWad(repayAmount) * seizeFactorBps / BPS;

        bool collateralExhausted;
        if (requiredSeizeValue > availableValue) {
            repayAmount = _usdWadToDebtDown(availableValue * BPS / seizeFactorBps);
            requiredSeizeValue = _debtToUsdWad(repayAmount) * seizeFactorBps / BPS;
            collateralExhausted = true;
        }
        if (repayAmount == 0) revert AmountZero();

        uint256 remainingDebt = userDebt - repayAmount;
        if (remainingDebt > 0 && remainingDebt < debtAssetUnit && !collateralExhausted) revert DustyRemainingDebt();

        uint256 repayValue = _debtToUsdWad(repayAmount);
        uint256 grossBonusValue = repayValue * market.liquidationBonusBps / BPS;
        uint256 protocolFeeValue = grossBonusValue * protocolLiquidationFeeBps / BPS;
        uint256 liquidatorSeizeValue = repayAmount + grossBonusValue - protocolFeeValue;
        uint256 protocolSeizeValue = protocolFeeValue;
        if (liquidatorSeizeValue + protocolSeizeValue > requiredSeizeValue) {
            protocolSeizeValue = requiredSeizeValue > liquidatorSeizeValue ? requiredSeizeValue - liquidatorSeizeValue : 0;
        }

        uint256 liquidatorSeize = liquidatorSeizeValue * WAD / price;
        uint256 protocolSeize = protocolSeizeValue * WAD / price;
        uint256 totalSeize = liquidatorSeize + protocolSeize;
        if (totalSeize > availableCollateral) {
            totalSeize = availableCollateral;
            if (protocolSeize > totalSeize) protocolSeize = 0;
            liquidatorSeize = totalSeize - protocolSeize;
        }

        debtPrincipal[user] = remainingDebt;
        totalDebt -= repayAmount;
        _decreaseBorrowBuckets(user, repayAmount);
        collateralBalance[user][stockToken] = availableCollateral - totalSeize;
        market.totalCollateral -= totalSeize;
        if (collateralBalance[user][stockToken] == 0) _removeCollateralToken(user, stockToken);

        if (collateralExhausted && remainingDebt > 0) {
            protocolDeficit += remainingDebt;
            totalDebt -= remainingDebt;
            _socializeDeficit(remainingDebt);
            debtPrincipal[user] = 0;
            _decreaseBorrowBuckets(user, remainingDebt);
            emit DeficitReported(user, stockToken, remainingDebt);
        }

        debtAsset.safeTransferFrom(msg.sender, address(this), repayAmount);
        if (liquidatorSeize > 0) IERC20(stockToken).safeTransfer(msg.sender, liquidatorSeize);
        if (protocolSeize > 0) IERC20(stockToken).safeTransfer(treasury, protocolSeize);
        emit Liquidated(user, msg.sender, stockToken, repayAmount, totalSeize, protocolSeize);
    }

    function debtBalance(address user) public view returns (uint256) {
        uint256 index = userBorrowIndex[user];
        if (index == 0) return 0;
        return debtPrincipal[user] * borrowIndex / index;
    }

    function DUST_THRESHOLD_USDG() external view returns (uint256) {
        return debtAssetUnit;
    }

    function getUserCollateralTokens(address user) external view returns (address[] memory) {
        return userCollateralTokens[user];
    }

    function getUserBorrowTokens(address user) external view returns (address[] memory) {
        return userBorrowTokens[user];
    }

    function getUserAccountData(address user) public view returns (AccountData memory data) {
        address[] storage tokens = userCollateralTokens[user];
        for (uint256 i = 0; i < tokens.length; ++i) {
            address token = tokens[i];
            uint256 amount = collateralBalance[user][token];
            if (amount == 0) continue;
            Market memory market = markets[token];
            if (!market.listed) continue;
            uint256 value = amount * _priceUsdWad(token, market) / WAD;
            data.totalCollateralValue += value;
            data.borrowLimitValue += value * market.collateralFactorBps / BPS;
            data.liquidationLimitValue += value * market.liquidationThresholdBps / BPS;
            data.activeCollateralCount += 1;
        }
        data.totalDebtValue = _debtToUsdWad(debtBalance(user));
        data.healthFactor = data.totalDebtValue == 0 ? type(uint256).max : data.liquidationLimitValue * WAD / data.totalDebtValue;
    }

    function collateralValueUsd(address user, address stockToken) public view returns (uint256) {
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        return collateralBalance[user][stockToken] * _priceUsdWad(stockToken, market) / WAD;
    }

    function borrowLimit(address user, address stockToken) public view returns (uint256) {
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        return collateralValueUsd(user, stockToken) * market.collateralFactorBps / BPS;
    }

    function liquidationLimit(address user, address stockToken) public view returns (uint256) {
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        return collateralValueUsd(user, stockToken) * market.liquidationThresholdBps / BPS;
    }

    function healthFactor(address user, address stockToken) public view returns (uint256) {
        if (!markets[stockToken].listed) revert MarketNotListed();
        return getUserAccountData(user).healthFactor;
    }

    function maxLiquidatableDebt(address user, address stockToken) public view returns (uint256) {
        Market memory market = markets[stockToken];
        if (!market.listed) revert MarketNotListed();
        AccountData memory data = getUserAccountData(user);
        if (data.totalDebtValue == 0 || data.healthFactor >= MIN_HEALTH_FACTOR) return 0;
        uint256 seizeFactorWad = WAD + (uint256(market.liquidationBonusBps) * WAD / BPS);
        uint256 thresholdFactorWad = seizeFactorWad * market.liquidationThresholdBps / BPS;
        uint256 byTarget;
        if (targetHealthFactor > thresholdFactorWad) {
            uint256 numerator = targetHealthFactor * data.totalDebtValue / WAD;
            if (numerator > data.liquidationLimitValue) {
                byTarget = _ceilDiv((numerator - data.liquidationLimitValue) * WAD, targetHealthFactor - thresholdFactorWad);
            }
        }
        if (byTarget == 0) byTarget = data.totalDebtValue * closeFactorBps / BPS;
        uint256 availableValue = collateralValueUsd(user, stockToken);
        uint256 byCollateral = availableValue * WAD / seizeFactorWad;
        uint256 resultWad = byTarget < byCollateral ? byTarget : byCollateral;
        if (resultWad > data.totalDebtValue) resultWad = data.totalDebtValue;
        uint256 result = _usdWadToDebtUp(resultWad);
        uint256 userDebt = debtBalance(user);
        if (result > userDebt) result = userDebt;
        return result;
    }

    function liquidityAvailable() public view returns (uint256) {
        uint256 bal = debtAsset.balanceOf(address(this));
        return bal > protocolReserves ? bal - protocolReserves : 0;
    }

    function currentBorrowAprBps() external view returns (uint256) {
        uint256 cash = _cashPriorReserves();
        if (totalDebt == 0) return baseBorrowRatePerSecond * YEAR * BPS / WAD;
        uint256 util = totalDebt * WAD / (cash + totalDebt);
        return (baseBorrowRatePerSecond + (slopeBorrowRatePerSecond * util / WAD)) * YEAR * BPS / WAD;
    }

    function _syncBorrower(address user) internal {
        uint256 index = userBorrowIndex[user];
        if (index == 0) {
            userBorrowIndex[user] = borrowIndex;
            return;
        }
        if (index == borrowIndex) return;
        uint256 oldDebt = debtPrincipal[user];
        uint256 newDebt = oldDebt * borrowIndex / index;
        if (newDebt > oldDebt) {
            uint256 delta = newDebt - oldDebt;
            uint256 remaining = delta;
            address[] storage tokens = userBorrowTokens[user];
            for (uint256 i = 0; i < tokens.length && remaining > 0; ++i) {
                address token = tokens[i];
                uint256 bucket = userDebtByMarket[user][token];
                if (bucket == 0) continue;
                uint256 add = i == tokens.length - 1 ? remaining : delta * bucket / oldDebt;
                userDebtByMarket[user][token] += add;
                markets[token].totalBorrowed += add;
                remaining -= add;
            }
        }
        debtPrincipal[user] = newDebt;
        userBorrowIndex[user] = borrowIndex;
    }

    function _isHealthy(address user) internal view returns (bool) {
        AccountData memory data = getUserAccountData(user);
        return data.totalDebtValue <= data.borrowLimitValue;
    }

    function _addCollateralToken(address user, address token) internal {
        if (!userCollateralTokenAdded[user][token]) {
            userCollateralTokenAdded[user][token] = true;
            userCollateralTokens[user].push(token);
        }
    }

    function _addBorrowToken(address user, address token) internal {
        if (!userBorrowTokenAdded[user][token]) {
            userBorrowTokenAdded[user][token] = true;
            userBorrowTokens[user].push(token);
        }
    }

    function _removeCollateralToken(address user, address token) internal {
        if (!userCollateralTokenAdded[user][token]) return;
        address[] storage arr = userCollateralTokens[user];
        for (uint256 i = 0; i < arr.length; ++i) {
            if (arr[i] == token) { arr[i] = arr[arr.length - 1]; arr.pop(); break; }
        }
        userCollateralTokenAdded[user][token] = false;
    }

    function _decreaseBorrowBuckets(address user, uint256 amount) internal {
        uint256 remaining = amount;
        address[] storage tokens = userBorrowTokens[user];
        uint256 i = 0;
        while (i < tokens.length && remaining > 0) {
            address token = tokens[i];
            uint256 bucket = userDebtByMarket[user][token];
            if (bucket == 0) {
                userBorrowTokenAdded[user][token] = false;
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                continue;
            }
            uint256 take = bucket < remaining ? bucket : remaining;
            uint256 newBucket = bucket - take;
            userDebtByMarket[user][token] = newBucket;
            Market storage market = markets[token];
            market.totalBorrowed = market.totalBorrowed > take ? market.totalBorrowed - take : 0;
            remaining -= take;
            if (newBucket == 0) {
                userBorrowTokenAdded[user][token] = false;
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
            } else {
                i++;
            }
        }
    }

    function _supplyEthLiquidity(address lender, uint256 amount) internal {
        if (amount == 0) revert AmountZero();
        if (paused()) revert EnforcedPause();
        if (ethSupplyCap > 0 && totalSuppliedEthLiquidity + amount > ethSupplyCap) revert SupplyCapExceeded();
        uint256 shares = totalEthLiquidityShares == 0 || totalSuppliedEthLiquidity == 0 ? amount : amount * totalEthLiquidityShares / totalSuppliedEthLiquidity;
        if (shares == 0) revert AmountZero();
        suppliedEthLiquidity[lender] += shares;
        totalEthLiquidityShares += shares;
        totalSuppliedEthLiquidity += amount;
        emit EthSupplied(lender, amount, shares);
    }

    function _priceUsdWad(address stockToken, Market memory market) internal view returns (uint256) {
        _checkSequencer();
        try IOraclePauseFlag(stockToken).oraclePaused() returns (bool paused) {
            if (paused) revert OraclePaused();
        } catch {}
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = market.priceFeed.latestRoundData();
        if (answer <= 0 || updatedAt == 0 || answeredInRound < roundId) revert InvalidOracle();
        if (block.timestamp - updatedAt > market.maxStaleness) revert OracleStale();
        uint8 feedDecimals = market.priceFeed.decimals();
        uint256 priceWad = feedDecimals > 18 ? uint256(answer) / (10 ** (feedDecimals - 18)) : uint256(answer) * (10 ** (18 - feedDecimals));
        uint256 minP = marketMinPriceWad[stockToken];
        uint256 maxP = marketMaxPriceWad[stockToken];
        if ((minP != 0 && priceWad < minP) || (maxP != 0 && priceWad > maxP)) revert OraclePriceOutOfBounds();
        return priceWad;
    }

    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return;
        (, int256 sequencerStatus, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        require(sequencerStatus == 0, "Sequencer down");
        if (startedAt == 0) revert InvalidOracle();
        require(block.timestamp - startedAt > SEQUENCER_GRACE_PERIOD, "Grace period not over");
    }

    function _cashPriorReserves() internal view returns (uint256) {
        uint256 bal = debtAsset.balanceOf(address(this));
        return bal > protocolReserves ? bal - protocolReserves : 0;
    }

    function _debtToUsdWad(uint256 amount) internal view returns (uint256) {
        return amount * debtToWadScale;
    }

    function _usdWadToDebtDown(uint256 valueWad) internal view returns (uint256) {
        return valueWad / debtToWadScale;
    }

    function _usdWadToDebtUp(uint256 valueWad) internal view returns (uint256) {
        return _ceilDiv(valueWad, debtToWadScale);
    }

    function _socializeDeficit(uint256 deficit) internal {
        if (deficit >= totalSuppliedLiquidity) {
            totalSuppliedLiquidity = 0;
        } else {
            totalSuppliedLiquidity -= deficit;
        }
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : ((a - 1) / b) + 1;
    }
}


