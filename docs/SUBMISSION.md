# Terravault -- RWA Demo Day Submission (Hong Kong Web3 Festival)

**Hackathon:** RWA Demo Day -- Hong Kong Web3 Festival
**Deadline:** March 31, 2026
**Team:** Xpandia
**Repo:** https://github.com/xpandia/terravault
**Format:** Pitch competition (live demo + presentation to judges)

---

## Submission Text

### One-Liner

Terravault tokenizes institutional-grade Latin American real estate into compliant, tradeable digital securities -- making a $100 investment as simple as a $100 million one.

### Project Description

Latin America holds $3.2 trillion in real estate value, yet 92% of institutional-grade properties are inaccessible to everyday investors. Cross-border acquisition is buried under bureaucracy, intermediaries, and opaque legal structures. Settlement takes 60-120 days. There is no liquid secondary market. Capital gets locked for years.

Terravault fixes this with regulatory-compliant fractional ownership using the ERC-3643 (T-REX) security token standard -- the institutional standard for real-world asset tokenization with identity verification and transfer restrictions built into the protocol layer.

**What makes this different from "another tokenization platform":**

1. **ERC-3643, not ERC-20.** We use the institutional security token standard with on-chain identity registry, compliance modules, and transfer restrictions. This is not a meme token -- it is a legally structured digital security.

2. **Full compliance stack on-chain.** IdentityRegistry enforces KYC expiry and country/category gating. ComplianceModule enforces per-investor caps, max investor counts, blocked countries, and minimum accreditation levels. Every transfer is compliance-checked before execution.

3. **Automated dividend distribution.** Rental yield flows directly to token holders proportionally, with no manual calculation or off-chain distribution. The token contract handles dividend accumulation, debt tracking, and withdrawal natively.

4. **Primary + secondary market.** The PropertyMarketplace handles initial fractional purchases (minting) and a secondary order book (peer-to-peer trading with escrow), both with platform fee collection and stablecoin settlement.

5. **LATAM-first positioning.** We target Colombia, Mexico, Brazil, and Chile -- markets with massive real estate value, growing investor populations, and fragmented access.

### BNB Chain Deployment Note

Our smart contracts are written in Solidity ^0.8.20 targeting EVM-compatible chains. While our primary development has been on Polygon PoS, the contracts are **fully compatible with BNB Chain (BSC)** -- same EVM, same Solidity compiler, same OpenZeppelin libraries. Deployment to BNB Chain testnet or mainnet requires only changing the RPC endpoint and deploying. The Chainlink-compatible `IPriceFeed` interface works with BNB Chain's Chainlink oracle feeds (BNB/USD). We will deploy to BNB Chain testnet for the hackathon submission.

### Smart Contract Architecture

| Contract | Purpose |
|---|---|
| **IdentityRegistry** | On-chain KYC: investor verification, country codes (ISO 3166-1), investor categories (retail/accredited/institutional), expiry timestamps |
| **ComplianceModule** | Transfer restriction engine: per-investor caps, max investor count, country blocklist, minimum accreditation, token-contract-only write access |
| **TerravaultToken** | ERC-3643 security token: compliance-checked transfers, freeze/unfreeze, forced transfers (regulatory), token recovery (lost wallets), native dividend distribution with accumulator pattern, property metadata (IPFS URI, valuation) |
| **PropertyMarketplace** | Primary market (stablecoin purchases -> token minting), secondary order book (sell orders with escrow, partial fills), rental yield deposit and distribution via token dividend mechanism, Chainlink-compatible oracle for ETH/USD pricing, platform fees (basis points) |

---

## Pitch Prep Notes (Hong Kong Judges)

### Key Audience Considerations

Hong Kong Web3 Festival judges will likely include:

- **Traditional finance / real estate professionals** -- Care about regulatory compliance, legal structure, and market size. Lead with ERC-3643 and the compliance stack.
- **Blockchain/DeFi-native investors** -- Care about technical architecture, composability, and novel mechanisms. Lead with the on-chain compliance module and automated dividend distribution.
- **BNB Chain ecosystem stakeholders** -- Care about BNB Chain deployment, ecosystem fit, and TVL potential. Emphasize EVM compatibility and BNB Chain deployment readiness.

### Pitch Structure (5 minutes)

**Minute 1: The Market (Hook)**
- "$3.2 trillion in LATAM real estate. 92% inaccessible to normal investors."
- Cross-border acquisition: 60-120 days, 8-12% in fees, opaque legal structures.
- The punchline: "We made a $100 investment feel like a $100 million one."

**Minute 2: How It Works (Simple)**
- Properties are legally structured into SPVs, independently appraised.
- Each property gets a TerravaultToken -- an ERC-3643 security token.
- Investors complete KYC, get verified on-chain, and buy fractional tokens starting at $100.
- Rental income is distributed automatically to token holders.
- Tokens trade on a built-in secondary market -- liquidity that real estate never had.

**Minute 3: Why This Is Real (Compliance)**
- ERC-3643 is used by real institutions (not our invention -- it is the T-REX standard).
- On-chain identity registry with KYC expiry -- not "trust us, we checked."
- Compliance module enforces transfer restrictions at the protocol level.
- Forced transfer and token recovery for regulatory/court orders.
- This is built to satisfy regulators, not dodge them.

**Minute 4: Technical Architecture (For the Builders)**
- Four Solidity contracts, OpenZeppelin v5, auditable and modular.
- Chainlink-compatible oracle interface for real-time property valuation.
- Dividend distribution uses an accumulator pattern (gas-efficient, no loops).
- Secondary market with on-chain order book, partial fills, and escrow.
- Fully EVM-compatible -- runs on Polygon, BNB Chain, Ethereum, or any EVM chain.

**Minute 5: The Ask**
- "We are deploying on BNB Chain. The LATAM real estate market is $3.2 trillion and completely untokenized. We are the bridge."
- Next steps: BNB Chain mainnet deployment, first property listing (Bogota, Colombia), stablecoin integration (BUSD/USDT on BSC), partnership with LATAM real estate SPV structures.

### Objection Prep

| Objection | Response |
|---|---|
| "How is this different from RealT / Lofty?" | They focus on US properties with US-specific structures. We are LATAM-first with cross-border compliance designed for emerging markets where the access gap is largest. |
| "Is this legally compliant?" | ERC-3643 is specifically designed for securities compliance. Properties are structured through SPVs with local legal counsel. The on-chain compliance module is a technical enforcement layer, not a replacement for legal structure. |
| "Why BNB Chain?" | EVM compatibility, low gas costs, large user base in Asia-Pacific (relevant for cross-border LATAM investment from Asian investors), and Chainlink oracle support. |
| "What about liquidity?" | The built-in secondary market with order book and partial fills creates native liquidity. As more properties list, the marketplace creates network effects. |
| "How do dividends work on-chain?" | Accumulator pattern: when rental yield is deposited, a global `dividendPerToken` counter increments. Each investor's pending dividends are computed from their balance times the counter, minus their recorded debt. No loops, no gas scaling with investor count. |

---

## Demo Video Script (3-5 minutes)

### Scene 1: The Problem (0:00 - 0:40)

**Visual:** Skyline shots of Bogota, Mexico City, Sao Paulo. Overlay stats.

**Narration:** "$3.2 trillion in Latin American real estate. The world's most reliable asset class. But if you're not already wealthy, you can't touch it. Cross-border acquisition takes 60 to 120 days, costs 8-12% in fees, and requires navigating opaque legal structures in foreign jurisdictions. There's no secondary market -- your capital is locked for years. The fastest-growing investor demographic is locked out of the most proven asset class."

### Scene 2: The Solution (0:40 - 1:15)

**Visual:** Terravault branding. Architecture diagram animating layer by layer.

**Narration:** "Terravault tokenizes premium LATAM properties into compliant digital securities. Each property is legally structured into an SPV, independently appraised, and represented on-chain as an ERC-3643 security token. Investors complete KYC, get verified on the on-chain identity registry, and purchase fractional tokens starting at $100 in stablecoins. Rental income is distributed automatically. And tokens trade on a built-in secondary market."

### Scene 3: Smart Contract Demo (1:15 - 2:30)

**Visual:** Screen recording -- deploying and interacting with contracts.

1. **(1:15 - 1:35)** **Deploy contracts to BNB Chain testnet.** Show the deployment of IdentityRegistry, ComplianceModule, TerravaultToken, and PropertyMarketplace. Show contract addresses on BscScan.

2. **(1:35 - 1:55)** **Register an investor.** Call `registerIdentity` with country code (170 for Colombia), category (0 for retail), and KYC expiry. Show the investor is now verified on-chain.

3. **(1:55 - 2:10)** **List a property and purchase tokens.** List a Bogota apartment: $500K valuation, 500,000 tokens, $1/token. Show a verified investor purchasing 100 tokens ($100). Show the compliance module checking identity, country, accreditation, and per-investor cap before allowing the mint.

4. **(2:10 - 2:30)** **Distribute rental yield.** Deposit ETH as rental yield for the property. Call `distributeRentalYield` -- show it flowing through the token's dividend mechanism. Show the investor calling `withdrawDividends` and receiving their proportional share.

### Scene 4: Secondary Market (2:30 - 3:00)

**Visual:** Screen recording continued.

1. Show investor A creating a sell order for 50 tokens at $1.10/token.
2. Show investor B filling the order (partial fill of 25 tokens).
3. Show stablecoin flowing from buyer to seller minus platform fee.
4. Show the compliance module verifying investor B's identity before allowing the transfer.

### Scene 5: Why BNB Chain + Close (3:00 - 3:30)

**Visual:** BNB Chain logo. Market size graphics. Roadmap.

**Narration:** "Fully EVM-compatible -- deployed on BNB Chain with low gas costs and access to the largest user base in Asia-Pacific. LATAM real estate for global investors. $3.2 trillion in assets waiting to be tokenized. We are the bridge."

**End card:** Terravault logo. "Own the World. One Token at a Time." GitHub URL. Team.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/xpandia/terravault.git
cd terravault

# Backend API
cd src/backend
cp .env.example .env
# Edit .env: set JWT_SECRET, RPC_URL, ADMIN_PRIVATE_KEY
npm install
npm start
# API available at http://localhost:3000

# Smart Contracts -- compile and deploy
# Using Hardhat:
npx hardhat compile
npx hardhat run scripts/deploy.js --network bnbTestnet

# Using Foundry:
forge build
forge create --rpc-url $BNB_TESTNET_RPC --private-key $DEPLOYER_KEY src/contracts/TerravaultToken.sol:TerravaultToken

# Frontend -- open the landing page
open src/frontend/index.html
```

### Environment Variables

```bash
# .env
JWT_SECRET=your-secret-key
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/    # BNB Chain testnet
ADMIN_PRIVATE_KEY=0x...                                      # Deployer wallet
MARKETPLACE_ADDRESS=0x...                                    # Deployed marketplace
IPFS_API_URL=http://127.0.0.1:5001                          # IPFS node
```

### BNB Chain Testnet Deployment

```bash
# Get testnet BNB from faucet
# https://testnet.bnbchain.org/faucet-smart

# Deploy IdentityRegistry
# Deploy ComplianceModule (with IdentityRegistry address)
# Deploy TerravaultToken (with IdentityRegistry + ComplianceModule addresses)
# Deploy PropertyMarketplace (with stablecoin, oracle, fee config)
# Call ComplianceModule.setTokenContract(TerravaultToken address)
```

---

## Submission Checklist

- [x] ERC-3643 smart contracts (TerravaultToken, IdentityRegistry, ComplianceModule, PropertyMarketplace)
- [x] On-chain compliance stack (KYC, country gating, investor caps, accreditation)
- [x] Automated dividend distribution
- [x] Primary + secondary marketplace with escrow
- [x] Chainlink-compatible oracle integration
- [x] Node.js/Express API backend
- [x] Landing page
- [x] Source code on GitHub
- [x] Pitch deck and materials
- [ ] BNB Chain testnet deployment (deploy before deadline)
- [ ] Demo video (record per script above)
- [ ] DoraHacks BUIDL page published
- [ ] Contract verification on BscScan
