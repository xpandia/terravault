// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ============================================================================
//  PropertyMarketplace — LATAM Real Estate Tokenization Marketplace
//  Handles listings, fractional purchases, secondary trading, and rental yield.
// ============================================================================

interface ITerravaultToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function propertyValuation() external view returns (uint256);
    function depositDividends() external payable;
}

interface IPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract PropertyMarketplace is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant PROPERTY_MANAGER = keccak256("PROPERTY_MANAGER");
    bytes32 public constant ORACLE_ADMIN     = keccak256("ORACLE_ADMIN");
    bytes32 public constant YIELD_MANAGER    = keccak256("YIELD_MANAGER");

    // --- Structs ---
    struct Property {
        uint256 id;
        string  name;
        string  location;           // e.g. "Bogota, Colombia"
        uint16  countryCode;        // ISO 3166-1 numeric
        string  propertyType;       // "residential", "commercial", "mixed"
        string  documentURI;        // IPFS CID for legal docs
        string  imageURI;           // IPFS CID for photos
        uint256 valuationUSD;       // 18 decimals
        uint256 totalTokens;        // tokens representing 100% ownership
        uint256 tokensSold;
        uint256 pricePerTokenUSD;   // 18 decimals
        address tokenContract;      // TerravaultToken address
        address propertyOwner;      // original property owner receiving proceeds
        PropertyStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    enum PropertyStatus {
        Draft,
        Active,
        SoldOut,
        Suspended,
        Delisted
    }

    struct SellOrder {
        uint256 orderId;
        uint256 propertyId;
        address seller;
        uint256 tokenAmount;
        uint256 pricePerTokenUSD;   // 18 decimals
        uint256 createdAt;
        bool    active;
    }

    struct RentalPeriod {
        uint256 propertyId;
        uint256 totalYieldETH;
        uint256 periodStart;
        uint256 periodEnd;
        bool    distributed;
    }

    // --- State ---
    uint256 public nextPropertyId;
    uint256 public nextOrderId;
    uint256 public nextRentalPeriodId;

    mapping(uint256 => Property) public properties;
    mapping(uint256 => SellOrder) public sellOrders;
    mapping(uint256 => RentalPeriod) public rentalPeriods;

    // propertyId => list of rental period IDs
    mapping(uint256 => uint256[]) public propertyRentalPeriods;

    // Oracle price feed for ETH/USD (Chainlink-compatible)
    IPriceFeed public ethUsdPriceFeed;

    // Platform fee in basis points (e.g., 250 = 2.5%)
    uint256 public platformFeeBps;
    address public feeRecipient;

    // Stablecoin for purchases (e.g., USDC)
    IERC20 public stablecoin;
    uint8  public stablecoinDecimals;

    // --- Events ---
    event PropertyListed(uint256 indexed propertyId, string name, string location, uint256 valuationUSD, address tokenContract);
    event PropertyUpdated(uint256 indexed propertyId);
    event PropertyStatusChanged(uint256 indexed propertyId, PropertyStatus newStatus);
    event TokensPurchased(uint256 indexed propertyId, address indexed buyer, uint256 amount, uint256 costUSD);
    event SellOrderCreated(uint256 indexed orderId, uint256 indexed propertyId, address indexed seller, uint256 amount, uint256 pricePerToken);
    event SellOrderCancelled(uint256 indexed orderId);
    event SellOrderFilled(uint256 indexed orderId, address indexed buyer, uint256 amount, uint256 totalCostUSD);
    event RentalYieldDeposited(uint256 indexed periodId, uint256 indexed propertyId, uint256 amountETH);
    event RentalYieldDistributed(uint256 indexed periodId, uint256 indexed propertyId);
    event ValuationUpdated(uint256 indexed propertyId, uint256 oldValuation, uint256 newValuation);
    event PriceFeedUpdated(address indexed newFeed);

    constructor(
        address admin,
        address _stablecoin,
        uint8 _stablecoinDecimals,
        address _ethUsdPriceFeed,
        uint256 _platformFeeBps,
        address _feeRecipient
    ) {
        require(_platformFeeBps <= 1000, "Fee too high"); // max 10%
        require(_feeRecipient != address(0), "Zero fee recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROPERTY_MANAGER, admin);
        _grantRole(ORACLE_ADMIN, admin);
        _grantRole(YIELD_MANAGER, admin);

        stablecoin = IERC20(_stablecoin);
        stablecoinDecimals = _stablecoinDecimals;
        ethUsdPriceFeed = IPriceFeed(_ethUsdPriceFeed);
        platformFeeBps = _platformFeeBps;
        feeRecipient = _feeRecipient;
    }

    // -----------------------------------------------------------------------
    //  Property Listing Management
    // -----------------------------------------------------------------------

    function listProperty(
        string calldata name,
        string calldata location,
        uint16 countryCode,
        string calldata propertyType,
        string calldata documentURI,
        string calldata imageURI,
        uint256 valuationUSD,
        uint256 totalTokens,
        uint256 pricePerTokenUSD,
        address tokenContract,
        address propertyOwner
    ) external onlyRole(PROPERTY_MANAGER) returns (uint256 propertyId) {
        require(tokenContract != address(0), "Zero token contract");
        require(propertyOwner != address(0), "Zero property owner");
        require(totalTokens > 0, "Zero tokens");
        require(valuationUSD > 0, "Zero valuation");
        require(pricePerTokenUSD > 0, "Zero price");

        propertyId = nextPropertyId++;

        properties[propertyId] = Property({
            id: propertyId,
            name: name,
            location: location,
            countryCode: countryCode,
            propertyType: propertyType,
            documentURI: documentURI,
            imageURI: imageURI,
            valuationUSD: valuationUSD,
            totalTokens: totalTokens,
            tokensSold: 0,
            pricePerTokenUSD: pricePerTokenUSD,
            tokenContract: tokenContract,
            propertyOwner: propertyOwner,
            status: PropertyStatus.Active,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit PropertyListed(propertyId, name, location, valuationUSD, tokenContract);
    }

    function updatePropertyMetadata(
        uint256 propertyId,
        string calldata documentURI,
        string calldata imageURI
    ) external onlyRole(PROPERTY_MANAGER) {
        Property storage prop = properties[propertyId];
        require(prop.tokenContract != address(0), "Property not found");

        prop.documentURI = documentURI;
        prop.imageURI = imageURI;
        prop.updatedAt = block.timestamp;

        emit PropertyUpdated(propertyId);
    }

    function setPropertyStatus(
        uint256 propertyId,
        PropertyStatus newStatus
    ) external onlyRole(PROPERTY_MANAGER) {
        Property storage prop = properties[propertyId];
        require(prop.tokenContract != address(0), "Property not found");

        prop.status = newStatus;
        prop.updatedAt = block.timestamp;

        emit PropertyStatusChanged(propertyId, newStatus);
    }

    // -----------------------------------------------------------------------
    //  Primary Market — Fractional Purchase
    // -----------------------------------------------------------------------

    /// @notice Purchase property tokens on the primary market using stablecoin.
    /// @param propertyId The property to buy tokens from.
    /// @param tokenAmount Number of tokens to purchase.
    function purchaseTokens(
        uint256 propertyId,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        Property storage prop = properties[propertyId];
        require(prop.status == PropertyStatus.Active, "Not active");
        require(tokenAmount > 0, "Zero amount");
        require(prop.tokensSold + tokenAmount <= prop.totalTokens, "Exceeds supply");

        // Use division-first to avoid overflow for very large tokenAmount values.
        // tokenAmount and pricePerTokenUSD are both 18-decimal, so divide by 1e18.
        uint256 costUSD = (tokenAmount * prop.pricePerTokenUSD) / 1e18;
        require(costUSD > 0, "Cost rounds to zero");
        // Convert to stablecoin precision
        uint256 costStable = costUSD / (10 ** (18 - stablecoinDecimals));
        require(costStable > 0, "Stablecoin cost rounds to zero");

        // Calculate platform fee
        uint256 fee = (costStable * platformFeeBps) / 10000;
        uint256 sellerProceeds = costStable - fee;

        // Transfer stablecoin from buyer
        stablecoin.safeTransferFrom(msg.sender, address(this), costStable);

        // Distribute funds
        if (fee > 0) {
            stablecoin.safeTransfer(feeRecipient, fee);
        }
        stablecoin.safeTransfer(prop.propertyOwner, sellerProceeds);

        // Mint property tokens to buyer
        prop.tokensSold += tokenAmount;
        ITerravaultToken(prop.tokenContract).mint(msg.sender, tokenAmount);

        // Auto-mark as sold out
        if (prop.tokensSold >= prop.totalTokens) {
            prop.status = PropertyStatus.SoldOut;
            emit PropertyStatusChanged(propertyId, PropertyStatus.SoldOut);
        }

        emit TokensPurchased(propertyId, msg.sender, tokenAmount, costUSD);
    }

    // -----------------------------------------------------------------------
    //  Secondary Market — Order Book
    // -----------------------------------------------------------------------

    /// @notice Create a sell order on the secondary market.
    function createSellOrder(
        uint256 propertyId,
        uint256 tokenAmount,
        uint256 pricePerTokenUSD
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        Property storage prop = properties[propertyId];
        require(prop.tokenContract != address(0), "Property not found");
        require(tokenAmount > 0, "Zero amount");
        require(pricePerTokenUSD > 0, "Zero price");

        ITerravaultToken token = ITerravaultToken(prop.tokenContract);
        require(token.balanceOf(msg.sender) >= tokenAmount, "Insufficient tokens");

        // Transfer tokens to marketplace escrow
        token.transferFrom(msg.sender, address(this), tokenAmount);

        orderId = nextOrderId++;
        sellOrders[orderId] = SellOrder({
            orderId: orderId,
            propertyId: propertyId,
            seller: msg.sender,
            tokenAmount: tokenAmount,
            pricePerTokenUSD: pricePerTokenUSD,
            createdAt: block.timestamp,
            active: true
        });

        emit SellOrderCreated(orderId, propertyId, msg.sender, tokenAmount, pricePerTokenUSD);
    }

    /// @notice Cancel a sell order and reclaim escrowed tokens.
    function cancelSellOrder(uint256 orderId) external nonReentrant {
        SellOrder storage order = sellOrders[orderId];
        require(order.active, "Order not active");
        require(order.seller == msg.sender, "Not seller");

        order.active = false;

        Property storage prop = properties[order.propertyId];
        ITerravaultToken(prop.tokenContract).transfer(msg.sender, order.tokenAmount);

        emit SellOrderCancelled(orderId);
    }

    /// @notice Fill a sell order (buy tokens on secondary market).
    /// @param orderId The sell order to fill.
    /// @param amount  Number of tokens to buy (partial fills allowed).
    function fillSellOrder(
        uint256 orderId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        SellOrder storage order = sellOrders[orderId];
        require(order.active, "Order not active");
        require(amount > 0 && amount <= order.tokenAmount, "Invalid amount");

        uint256 costUSD = (amount * order.pricePerTokenUSD) / 1e18;
        require(costUSD > 0, "Cost rounds to zero");
        uint256 costStable = costUSD / (10 ** (18 - stablecoinDecimals));
        require(costStable > 0, "Stablecoin cost rounds to zero");

        uint256 fee = (costStable * platformFeeBps) / 10000;
        uint256 sellerProceeds = costStable - fee;

        // Collect payment
        stablecoin.safeTransferFrom(msg.sender, address(this), costStable);
        if (fee > 0) {
            stablecoin.safeTransfer(feeRecipient, fee);
        }
        stablecoin.safeTransfer(order.seller, sellerProceeds);

        // Transfer escrowed tokens to buyer
        Property storage prop = properties[order.propertyId];
        ITerravaultToken(prop.tokenContract).transfer(msg.sender, amount);

        order.tokenAmount -= amount;
        if (order.tokenAmount == 0) {
            order.active = false;
        }

        emit SellOrderFilled(orderId, msg.sender, amount, costUSD);
    }

    // -----------------------------------------------------------------------
    //  Rental Yield Distribution
    // -----------------------------------------------------------------------

    /// @notice Deposit rental yield in ETH for a property.
    function depositRentalYield(
        uint256 propertyId,
        uint256 periodStart,
        uint256 periodEnd
    ) external payable onlyRole(YIELD_MANAGER) nonReentrant {
        Property storage prop = properties[propertyId];
        require(prop.tokenContract != address(0), "Property not found");
        require(msg.value > 0, "No ETH");
        require(periodEnd > periodStart, "Invalid period");

        uint256 periodId = nextRentalPeriodId++;
        rentalPeriods[periodId] = RentalPeriod({
            propertyId: propertyId,
            totalYieldETH: msg.value,
            periodStart: periodStart,
            periodEnd: periodEnd,
            distributed: false
        });

        propertyRentalPeriods[propertyId].push(periodId);

        emit RentalYieldDeposited(periodId, propertyId, msg.value);
    }

    /// @notice Distribute deposited rental yield through the token's dividend mechanism.
    function distributeRentalYield(uint256 periodId) external onlyRole(YIELD_MANAGER) nonReentrant {
        RentalPeriod storage period = rentalPeriods[periodId];
        require(!period.distributed, "Already distributed");
        require(period.totalYieldETH > 0, "No yield");

        period.distributed = true;

        Property storage prop = properties[period.propertyId];
        uint256 fee = (period.totalYieldETH * platformFeeBps) / 10000;
        uint256 distributable = period.totalYieldETH - fee;

        // Send fee
        if (fee > 0) {
            (bool feeOk, ) = payable(feeRecipient).call{value: fee}("");
            require(feeOk, "Fee transfer failed");
        }

        // Deposit into token's dividend mechanism
        ITerravaultToken(prop.tokenContract).depositDividends{value: distributable}();

        emit RentalYieldDistributed(periodId, period.propertyId);
    }

    // -----------------------------------------------------------------------
    //  Oracle / Valuation
    // -----------------------------------------------------------------------

    function setPriceFeed(address newFeed) external onlyRole(ORACLE_ADMIN) {
        require(newFeed != address(0), "Zero address");
        ethUsdPriceFeed = IPriceFeed(newFeed);
        emit PriceFeedUpdated(newFeed);
    }

    function updateValuation(
        uint256 propertyId,
        uint256 newValuationUSD
    ) external onlyRole(ORACLE_ADMIN) {
        Property storage prop = properties[propertyId];
        require(prop.tokenContract != address(0), "Property not found");
        require(newValuationUSD > 0, "Zero valuation");

        uint256 oldValuation = prop.valuationUSD;
        prop.valuationUSD = newValuationUSD;
        prop.updatedAt = block.timestamp;

        emit ValuationUpdated(propertyId, oldValuation, newValuationUSD);
    }

    /// @notice Get the current ETH/USD price from the oracle.
    function getEthUsdPrice() public view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = ethUsdPriceFeed.latestRoundData();
        require(answer > 0, "Invalid price");
        require(block.timestamp - updatedAt < 3600, "Stale price"); // 1 hour staleness

        uint8 feedDecimals = ethUsdPriceFeed.decimals();
        // Normalize to 18 decimals
        return uint256(answer) * (10 ** (18 - feedDecimals));
    }

    /// @notice Convert a USD amount (18 decimals) to ETH using oracle.
    function usdToEth(uint256 usdAmount) public view returns (uint256) {
        uint256 ethPrice = getEthUsdPrice();
        return (usdAmount * 1e18) / ethPrice;
    }

    // -----------------------------------------------------------------------
    //  Admin
    // -----------------------------------------------------------------------

    function setPlatformFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= 1000, "Fee too high");
        platformFeeBps = newFeeBps;
    }

    function setFeeRecipient(address newRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRecipient != address(0), "Zero address");
        feeRecipient = newRecipient;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    function getProperty(uint256 propertyId) external view returns (Property memory) {
        return properties[propertyId];
    }

    function getOrder(uint256 orderId) external view returns (SellOrder memory) {
        return sellOrders[orderId];
    }

    function getRentalPeriod(uint256 periodId) external view returns (RentalPeriod memory) {
        return rentalPeriods[periodId];
    }

    function getPropertyRentalPeriodCount(uint256 propertyId) external view returns (uint256) {
        return propertyRentalPeriods[propertyId].length;
    }

    /// @notice Get token price in ETH using oracle.
    function getTokenPriceETH(uint256 propertyId) external view returns (uint256) {
        return usdToEth(properties[propertyId].pricePerTokenUSD);
    }

    /// @notice Calculate total value of an investor's holdings in a property.
    function getHoldingValueUSD(
        uint256 propertyId,
        address investor
    ) external view returns (uint256) {
        Property storage prop = properties[propertyId];
        ITerravaultToken token = ITerravaultToken(prop.tokenContract);
        uint256 balance = token.balanceOf(investor);
        return (balance * prop.pricePerTokenUSD) / 1e18;
    }

    receive() external payable {}
}
