// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ============================================================================
//  Terravault Token — ERC-3643-compliant Security Token
//  Real World Asset Tokenization for LATAM Real Estate
// ============================================================================

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

interface IIdentityRegistry {
    function isVerified(address investor) external view returns (bool);
    function getCountry(address investor) external view returns (uint16);
    function getInvestorCategory(address investor) external view returns (uint8);
}

interface IComplianceModule {
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
    function transferred(address from, address to, uint256 amount) external;
    function created(address to, uint256 amount) external;
    function destroyed(address from, uint256 amount) external;
}

// ---------------------------------------------------------------------------
//  Identity Registry  (on-chain, lightweight)
// ---------------------------------------------------------------------------

contract IdentityRegistry is IIdentityRegistry, AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    struct Identity {
        bool verified;
        uint16 country;       // ISO 3166-1 numeric
        uint8  category;      // 0 = retail, 1 = accredited, 2 = institutional
        uint64 expiresAt;     // KYC expiry timestamp
    }

    mapping(address => Identity) private _identities;

    event IdentityRegistered(address indexed investor, uint16 country, uint8 category, uint64 expiresAt);
    event IdentityUpdated(address indexed investor, uint16 country, uint8 category, uint64 expiresAt);
    event IdentityRemoved(address indexed investor);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    function registerIdentity(
        address investor,
        uint16 country,
        uint8 category,
        uint64 expiresAt
    ) external onlyRole(REGISTRAR_ROLE) {
        require(investor != address(0), "Zero address");
        require(expiresAt > block.timestamp, "Already expired");
        require(!_identities[investor].verified, "Already registered");

        _identities[investor] = Identity(true, country, category, expiresAt);
        emit IdentityRegistered(investor, country, category, expiresAt);
    }

    function updateIdentity(
        address investor,
        uint16 country,
        uint8 category,
        uint64 expiresAt
    ) external onlyRole(REGISTRAR_ROLE) {
        require(_identities[investor].verified, "Not registered");
        require(expiresAt > block.timestamp, "Already expired");

        _identities[investor] = Identity(true, country, category, expiresAt);
        emit IdentityUpdated(investor, country, category, expiresAt);
    }

    function removeIdentity(address investor) external onlyRole(REGISTRAR_ROLE) {
        require(_identities[investor].verified, "Not registered");
        delete _identities[investor];
        emit IdentityRemoved(investor);
    }

    function isVerified(address investor) external view override returns (bool) {
        Identity storage id = _identities[investor];
        return id.verified && id.expiresAt > block.timestamp;
    }

    function getCountry(address investor) external view override returns (uint16) {
        return _identities[investor].country;
    }

    function getInvestorCategory(address investor) external view override returns (uint8) {
        return _identities[investor].category;
    }

    function getIdentity(address investor) external view returns (Identity memory) {
        return _identities[investor];
    }
}

// ---------------------------------------------------------------------------
//  Compliance Module
// ---------------------------------------------------------------------------

contract ComplianceModule is IComplianceModule, AccessControl {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    IIdentityRegistry public identityRegistry;

    /// @notice The token contract address — only this address may call
    ///         transferred(), created(), and destroyed().
    address public tokenContract;

    uint256 public maxTokensPerInvestor;
    uint256 public maxInvestorCount;
    uint256 public currentInvestorCount;

    // Country blocklist (ISO 3166-1 numeric)
    mapping(uint16 => bool) public blockedCountries;

    // Per-investor holdings tracking
    mapping(address => uint256) public investorBalances;

    // Minimum accreditation category for holding tokens
    uint8 public minCategory; // 0 = retail allowed, 1 = accredited only, etc.

    event CountryBlocked(uint16 indexed country);
    event CountryUnblocked(uint16 indexed country);
    event LimitsUpdated(uint256 maxPerInvestor, uint256 maxInvestors, uint8 minCategory);
    event TokenContractUpdated(address indexed newTokenContract);
    event ComplianceTransferred(address indexed from, address indexed to, uint256 amount);
    event ComplianceCreated(address indexed to, uint256 amount);
    event ComplianceDestroyed(address indexed from, uint256 amount);

    /// @dev Restricts calls to the registered token contract only.
    modifier onlyToken() {
        require(msg.sender == tokenContract, "Caller is not the token contract");
        _;
    }

    constructor(
        address admin,
        address _identityRegistry,
        uint256 _maxTokensPerInvestor,
        uint256 _maxInvestorCount,
        uint8 _minCategory
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        maxTokensPerInvestor = _maxTokensPerInvestor;
        maxInvestorCount = _maxInvestorCount;
        minCategory = _minCategory;
    }

    /// @notice Set the token contract address. Only callable by admin.
    function setTokenContract(address _tokenContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokenContract != address(0), "Zero address");
        tokenContract = _tokenContract;
        emit TokenContractUpdated(_tokenContract);
    }

    function setLimits(
        uint256 _maxPerInvestor,
        uint256 _maxInvestors,
        uint8 _minCategory
    ) external onlyRole(COMPLIANCE_ROLE) {
        maxTokensPerInvestor = _maxPerInvestor;
        maxInvestorCount = _maxInvestors;
        minCategory = _minCategory;
        emit LimitsUpdated(_maxPerInvestor, _maxInvestors, _minCategory);
    }

    function blockCountry(uint16 country) external onlyRole(COMPLIANCE_ROLE) {
        blockedCountries[country] = true;
        emit CountryBlocked(country);
    }

    function unblockCountry(uint16 country) external onlyRole(COMPLIANCE_ROLE) {
        blockedCountries[country] = false;
        emit CountryUnblocked(country);
    }

    function canTransfer(
        address from,
        address to,
        uint256 amount
    ) external view override returns (bool) {
        // Receiver must be verified
        if (!identityRegistry.isVerified(to)) return false;

        // Receiver's country must not be blocked
        if (blockedCountries[identityRegistry.getCountry(to)]) return false;

        // Receiver meets minimum accreditation
        if (identityRegistry.getInvestorCategory(to) < minCategory) return false;

        // Per-investor cap
        if (investorBalances[to] + amount > maxTokensPerInvestor) return false;

        // Max investor count (new investor check)
        if (investorBalances[to] == 0 && from != address(0)) {
            if (currentInvestorCount >= maxInvestorCount && maxInvestorCount > 0) return false;
        }

        return true;
    }

    function transferred(address from, address to, uint256 amount) external override onlyToken {
        if (investorBalances[to] == 0 && amount > 0) {
            currentInvestorCount++;
        }
        investorBalances[to] += amount;

        if (from != address(0)) {
            investorBalances[from] -= amount;
            if (investorBalances[from] == 0) {
                currentInvestorCount--;
            }
        }
        emit ComplianceTransferred(from, to, amount);
    }

    function created(address to, uint256 amount) external override onlyToken {
        if (investorBalances[to] == 0 && amount > 0) {
            currentInvestorCount++;
        }
        investorBalances[to] += amount;
        emit ComplianceCreated(to, amount);
    }

    function destroyed(address from, uint256 amount) external override onlyToken {
        investorBalances[from] -= amount;
        if (investorBalances[from] == 0) {
            currentInvestorCount--;
        }
        emit ComplianceDestroyed(from, amount);
    }
}

// ---------------------------------------------------------------------------
//  TerravaultToken — The Security Token
// ---------------------------------------------------------------------------

contract TerravaultToken is ERC20, AccessControl, ReentrancyGuard, Pausable {

    // --- Roles ---
    bytes32 public constant AGENT_ROLE       = keccak256("AGENT_ROLE");
    bytes32 public constant FREEZER_ROLE     = keccak256("FREEZER_ROLE");
    bytes32 public constant RECOVERY_ROLE    = keccak256("RECOVERY_ROLE");
    bytes32 public constant SUPPLY_ROLE      = keccak256("SUPPLY_ROLE");

    // --- Compliance ---
    IIdentityRegistry public identityRegistry;
    IComplianceModule public complianceModule;

    // --- Freeze ---
    mapping(address => bool) public frozen;

    // --- Dividend Distribution ---
    uint256 public constant DIVIDEND_PRECISION = 1e18;
    uint256 public dividendPerTokenAccumulated;
    mapping(address => uint256) private _dividendDebt;
    mapping(address => uint256) private _withdrawableDividends;

    // --- Property metadata ---
    string  public propertyId;
    string  public propertyURI;       // IPFS URI for property docs
    uint256 public propertyValuation;  // in USD (18 decimals)

    // --- Events ---
    event AddressFrozen(address indexed account, bool isFrozen);
    event TokensRecovered(address indexed lostWallet, address indexed newWallet, uint256 amount);
    event ComplianceModuleUpdated(address indexed newModule);
    event IdentityRegistryUpdated(address indexed newRegistry);
    event DividendDeposited(uint256 amount, uint256 dividendPerToken);
    event DividendWithdrawn(address indexed investor, uint256 amount);
    event PropertyMetadataUpdated(string propertyId, string propertyURI, uint256 valuation);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address admin,
        address _identityRegistry,
        address _complianceModule,
        string memory _propertyId,
        string memory _propertyURI,
        uint256 _propertyValuation
    ) ERC20(name_, symbol_) {
        require(_identityRegistry != address(0), "Zero identity registry");
        require(_complianceModule != address(0), "Zero compliance module");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
        _grantRole(FREEZER_ROLE, admin);
        _grantRole(RECOVERY_ROLE, admin);
        _grantRole(SUPPLY_ROLE, admin);

        identityRegistry = IIdentityRegistry(_identityRegistry);
        complianceModule = IComplianceModule(_complianceModule);

        propertyId = _propertyId;
        propertyURI = _propertyURI;
        propertyValuation = _propertyValuation;
    }

    // -----------------------------------------------------------------------
    //  Property Metadata
    // -----------------------------------------------------------------------

    function setPropertyMetadata(
        string calldata _propertyId,
        string calldata _propertyURI,
        uint256 _valuation
    ) external onlyRole(AGENT_ROLE) {
        propertyId = _propertyId;
        propertyURI = _propertyURI;
        propertyValuation = _valuation;
        emit PropertyMetadataUpdated(_propertyId, _propertyURI, _valuation);
    }

    // -----------------------------------------------------------------------
    //  Compliance Module Management
    // -----------------------------------------------------------------------

    function setComplianceModule(address module) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(module != address(0), "Zero address");
        complianceModule = IComplianceModule(module);
        emit ComplianceModuleUpdated(module);
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "Zero address");
        identityRegistry = IIdentityRegistry(registry);
        emit IdentityRegistryUpdated(registry);
    }

    // -----------------------------------------------------------------------
    //  Minting / Burning (Supply Management)
    // -----------------------------------------------------------------------

    function mint(address to, uint256 amount) external onlyRole(SUPPLY_ROLE) whenNotPaused {
        require(identityRegistry.isVerified(to), "Recipient not verified");
        _settleDividends(to);
        complianceModule.created(to, amount);
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(SUPPLY_ROLE) {
        _settleDividends(from);
        complianceModule.destroyed(from, amount);
        _burn(from, amount);
    }

    // -----------------------------------------------------------------------
    //  Transfer Overrides — ERC-3643 Compliance Hooks
    // -----------------------------------------------------------------------

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Minting and burning are handled separately with role checks
        if (from != address(0) && to != address(0)) {
            _requireNotPaused();
            require(!frozen[from], "Sender frozen");
            require(!frozen[to], "Recipient frozen");
            require(
                complianceModule.canTransfer(from, to, amount),
                "Transfer not compliant"
            );
        }

        // Settle dividends for both parties before balance changes
        if (from != address(0)) _settleDividends(from);
        if (to != address(0)) _settleDividends(to);

        super._update(from, to, amount);

        // Reconcile dividend debt after balance change so pendingDividends()
        // returns accurate values immediately (no stale-window).
        if (from != address(0)) _reconcileDividendDebt(from);
        if (to != address(0)) _reconcileDividendDebt(to);

        // Notify compliance module
        if (from != address(0) && to != address(0)) {
            complianceModule.transferred(from, to, amount);
        }
    }

    // -----------------------------------------------------------------------
    //  Freeze / Unfreeze
    // -----------------------------------------------------------------------

    function freeze(address account) external onlyRole(FREEZER_ROLE) {
        require(!frozen[account], "Already frozen");
        frozen[account] = true;
        emit AddressFrozen(account, true);
    }

    function unfreeze(address account) external onlyRole(FREEZER_ROLE) {
        require(frozen[account], "Not frozen");
        frozen[account] = false;
        emit AddressFrozen(account, false);
    }

    // -----------------------------------------------------------------------
    //  Pause
    // -----------------------------------------------------------------------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // -----------------------------------------------------------------------
    //  Forced Transfer (regulatory / court order)
    // -----------------------------------------------------------------------

    function forcedTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyRole(AGENT_ROLE) nonReentrant {
        require(identityRegistry.isVerified(to), "Recipient not verified");
        require(balanceOf(from) >= amount, "Insufficient balance");

        _settleDividends(from);
        _settleDividends(to);

        // Bypass compliance for forced transfer, update balances directly
        super._update(from, to, amount);
        _reconcileDividendDebt(from);
        _reconcileDividendDebt(to);
        complianceModule.transferred(from, to, amount);

        emit ForcedTransfer(from, to, amount);
    }

    // -----------------------------------------------------------------------
    //  Token Recovery (lost wallets)
    // -----------------------------------------------------------------------

    function recoverTokens(
        address lostWallet,
        address newWallet
    ) external onlyRole(RECOVERY_ROLE) nonReentrant {
        require(identityRegistry.isVerified(newWallet), "New wallet not verified");
        require(lostWallet != newWallet, "Same address");

        uint256 balance = balanceOf(lostWallet);
        require(balance > 0, "No tokens to recover");

        _settleDividends(lostWallet);
        _settleDividends(newWallet);

        // Transfer all tokens
        super._update(lostWallet, newWallet, balance);
        _reconcileDividendDebt(lostWallet);
        _reconcileDividendDebt(newWallet);
        complianceModule.transferred(lostWallet, newWallet, balance);

        // Transfer unclaimed dividends
        uint256 pendingDivs = _withdrawableDividends[lostWallet];
        if (pendingDivs > 0) {
            _withdrawableDividends[lostWallet] = 0;
            _withdrawableDividends[newWallet] += pendingDivs;
        }

        // Freeze old wallet
        frozen[lostWallet] = true;
        emit TokensRecovered(lostWallet, newWallet, balance);
        emit AddressFrozen(lostWallet, true);
    }

    // -----------------------------------------------------------------------
    //  Dividend Distribution
    // -----------------------------------------------------------------------

    /// @notice Deposit ETH dividends for all token holders proportionally.
    function depositDividends() external payable onlyRole(AGENT_ROLE) nonReentrant {
        require(msg.value > 0, "No ETH sent");
        require(totalSupply() > 0, "No supply");

        uint256 dividendPerToken = (msg.value * DIVIDEND_PRECISION) / totalSupply();
        dividendPerTokenAccumulated += dividendPerToken;

        emit DividendDeposited(msg.value, dividendPerToken);
    }

    /// @notice Withdraw accumulated dividends.
    function withdrawDividends() external nonReentrant whenNotPaused {
        require(!frozen[msg.sender], "Account frozen");
        _settleDividends(msg.sender);

        uint256 amount = _withdrawableDividends[msg.sender];
        require(amount > 0, "No dividends");

        _withdrawableDividends[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit DividendWithdrawn(msg.sender, amount);
    }

    /// @notice View pending dividends for an investor.
    function pendingDividends(address investor) external view returns (uint256) {
        uint256 accumulated = (balanceOf(investor) * dividendPerTokenAccumulated) / DIVIDEND_PRECISION;
        uint256 debt = _dividendDebt[investor];
        return _withdrawableDividends[investor] + (accumulated > debt ? accumulated - debt : 0);
    }

    function _settleDividends(address account) private {
        if (account == address(0)) return;

        uint256 owed = (balanceOf(account) * dividendPerTokenAccumulated) / DIVIDEND_PRECISION;
        uint256 debt = _dividendDebt[account];

        if (owed > debt) {
            _withdrawableDividends[account] += (owed - debt);
        }

        // Debt is reset based on current accumulated value; will be correct after
        // the balance change in _update.
        _dividendDebt[account] = (balanceOf(account) * dividendPerTokenAccumulated) / DIVIDEND_PRECISION;
    }

    /// @dev After any balance change we must reset dividend debt to match new balance.
    ///      Called after super._update() in _update(), forcedTransfer(), and recoverTokens()
    ///      to ensure pendingDividends() returns accurate values immediately.
    function _reconcileDividendDebt(address account) private {
        if (account == address(0)) return;
        _dividendDebt[account] = (balanceOf(account) * dividendPerTokenAccumulated) / DIVIDEND_PRECISION;
    }

    // -----------------------------------------------------------------------
    //  Dividend Dust Recovery
    // -----------------------------------------------------------------------

    /// @notice Recover accumulated rounding dust from dividend distributions.
    ///         Only callable by admin. Sends unclaimable ETH to the specified recipient.
    function sweepDividendDust(address payable recipient) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Zero address");

        // The contract's ETH balance minus what is owed to investors is dust.
        // We cannot compute exact owed amount without iterating all holders,
        // so we allow admin to sweep only a small amount (< 0.1 ETH) as a safety bound.
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to sweep");
        require(balance <= 0.1 ether, "Balance too large — likely not dust");

        (bool success, ) = recipient.call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    // -----------------------------------------------------------------------
    //  View Helpers
    // -----------------------------------------------------------------------

    function isCompliant(address from, address to, uint256 amount) external view returns (bool) {
        if (frozen[from] || frozen[to]) return false;
        return complianceModule.canTransfer(from, to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
