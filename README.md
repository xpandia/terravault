# Terravault

**Real estate was the last asset class trapped behind borders. We just set it free.**

---

## The Problem

Latin America holds **$3.2 trillion** in real estate value, yet:

- **92% of institutional-grade properties** are inaccessible to everyday investors
- Cross-border acquisition is buried under layers of bureaucracy, intermediaries, and opaque legal structures
- Settlement takes **60-120 days**, with costs eating 8-12% of transaction value
- There is no liquid secondary market — capital gets locked for years

The world's fastest-growing investor demographic is locked out of the world's most reliable asset class.

## The Solution

**Terravault** tokenizes institutional-grade LATAM real estate into compliant, tradeable digital securities — making a $100 investment as simple as a $100M one.

We bring **regulatory-compliant fractional ownership** to premium properties across Colombia, Mexico, Brazil, and Chile using the ERC-3643 security token standard, purpose-built for real-world assets with identity verification and transfer restrictions baked into the protocol.

## How It Works

### 1. Curate & Structure
Premium properties are sourced, legally structured into SPVs, independently appraised, and registered on-chain. Each asset gets a digital twin — an ERC-3643 token representing verified fractional ownership.

### 2. Verify & Invest
Investors complete KYC/AML through our integrated identity oracle. Once verified, they can purchase fractional tokens starting at **$100 USD**, with full legal rights encoded in the smart contract.

### 3. Earn & Trade
Token holders receive **automated rental yield distributions** directly to their wallet. Tokens can be traded on compliant secondary markets — unlocking liquidity that traditional real estate never offered.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Blockchain** | Ethereum / Polygon PoS (EVM-compatible) |
| **Token Standard** | ERC-3643 (T-REX) — institutional security token standard |
| **Smart Contracts** | Solidity ^0.8.20 — TerravaultToken, IdentityRegistry, ComplianceModule, PropertyMarketplace |
| **Identity Layer** | On-chain IdentityRegistry with KYC expiry and country/category gating |
| **Frontend** | Static HTML/CSS/JS landing page (single-page) |
| **Oracle Integration** | Chainlink-compatible IPriceFeed interface for ETH/USD |
| **Backend** | Node.js / Express.js API, in-memory storage, IPFS (document uploads) |
| **Libraries** | OpenZeppelin v5 (ERC20, AccessControl, ReentrancyGuard, Pausable, SafeERC20) |

## Architecture

```
Investor (KYC'd Wallet)
        |
    [Landing Page (HTML/CSS/JS)]
        |
    [Express.js API]
        |
    [ethers.js]
        |
  ------+------
  |            |
[Polygon]   [Chainlink-compatible Oracle]
  |            |
  +-----+------+
        |
  [ERC-3643 Token Suite]
   ├── IdentityRegistry.sol
   ├── ComplianceModule.sol
   ├── TerravaultToken.sol (ERC-3643 + Dividends)
   └── PropertyMarketplace.sol (Primary + Secondary Market)
        |
      [IPFS]
```

## Team

| Role | Focus |
|---|---|
| **Product & Strategy** | Market positioning, investor UX, regulatory mapping |
| **Smart Contract Engineer** | ERC-3643 implementation, compliance modules, dividend logic |
| **Full-Stack Engineer** | Next.js frontend, API layer, wallet integration |
| **Blockchain / Oracle Engineer** | Chainlink integration, identity oracle, on-chain appraisal feeds |
| **Design** | Brand identity, landing page, investor dashboard UI |

## Hackathon Submission Checklist

- [ ] Project registered on DoraHacks (RWA Demo Day — Hong Kong Web3 Festival)
- [x] README with vision, architecture, and tech stack
- [ ] Landing page live and deployed
- [x] ERC-3643 smart contracts written (TerravaultToken, ComplianceModule, IdentityRegistry, PropertyMarketplace)
- [ ] Smart contracts compiled and tested (Hardhat / Foundry)
- [ ] Identity Registry + Compliance Module functional on testnet
- [ ] Dividend distribution contract tested with mock yield
- [ ] Frontend: Property listing page with token purchase flow
- [ ] Frontend: Investor dashboard showing holdings + yield
- [x] Chainlink-compatible oracle interface defined in PropertyMarketplace
- [ ] Demo video (3-5 min walkthrough)
- [x] Pitch deck
- [ ] Contract addresses + verification on block explorer
- [ ] Live demo URL

## Links

- **Live Demo:** _Coming soon_
- **Pitch Deck:** _Coming soon_
- **Demo Video:** _Coming soon_
- **Contracts (Testnet):** _Coming soon_

---

> "The biggest real estate market you've never been able to touch — until now."

**Terravault** — Own the World. One Token at a Time.
