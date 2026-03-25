# Terravault -- RWA Demo Day Submission (Hong Kong Web3 Festival)

**Hackathon:** RWA Demo Day -- Hong Kong Web3 Festival
**Deadline:** March 31, 2026
**Team:** Xpandia
**Repo:** https://github.com/xpandia/terravault
**Format:** Pitch competition (live demo + presentation to judges)
**Chain:** BNB Chain Testnet (ChainID 97)

---

## THE PITCH (5-minute format)

### Open: The $3.2 Trillion Lock-Out (60 seconds)

> "$3.2 trillion in Latin American real estate. The most reliable asset class on the continent. But if you are not already wealthy, you cannot touch it."

- 92% of institutional-grade LATAM properties are inaccessible to everyday investors.
- Cross-border acquisition: 60-120 days, 8-12% in intermediary fees, opaque legal structures in foreign jurisdictions.
- No secondary market. Capital locked for years. No liquidity, no price discovery.
- The fastest-growing investor demographic in the world is locked out of the most proven asset class.

**Hook for HK judges:** "Asian investors already know LATAM real estate delivers 7-12% annual yields. They just cannot access it. We fix that."

---

### Solution: Terravault (60 seconds)

Terravault tokenizes premium LATAM real estate into compliant digital securities on BNB Chain.

1. Properties are legally structured into SPVs, independently appraised.
2. Each property becomes a **TerravaultToken** -- an ERC-3643 security token with built-in compliance.
3. Investors complete KYC, get verified on-chain, and buy fractional tokens starting at **$100** in stablecoins.
4. Rental income is distributed automatically and proportionally to all token holders.
5. Tokens trade on a built-in secondary market -- **liquidity that real estate has never had**.

**One-liner:** "We made a $100 investment as simple as a $100 million one."

---

### Why This Is Real: Compliance-First Architecture (60 seconds)

This is **not** another ERC-20 wrapper. This is a regulated security token.

- **ERC-3643 (T-REX standard)** -- the institutional standard used by real securities on-chain.
- **On-chain IdentityRegistry** -- KYC verification with country codes (ISO 3166-1), investor categories (retail/accredited/institutional), and expiry timestamps. Not "trust us" -- verifiable on-chain.
- **ComplianceModule** -- every transfer is checked against per-investor caps, max investor count, country blocklists, and minimum accreditation level. Non-compliant transfers revert at the protocol level.
- **Forced transfer and token recovery** -- built for regulators and courts, not against them.
- **Automated dividend distribution** -- accumulator pattern, gas-efficient, no loops, no manual calculation.

**For HK judges:** "We built the compliance stack that institutional allocators require. This is not DeFi cosplaying as TradFi -- this is TradFi infrastructure running on-chain."

---

### Live Demo: BNB Chain Testnet (60 seconds)

**Show deployed contracts on BscScan:**

| Contract | Role |
|---|---|
| IdentityRegistry | On-chain KYC: verify investors, enforce country/category restrictions |
| ComplianceModule | Transfer restriction engine: caps, blocklists, accreditation gates |
| TerravaultToken | ERC-3643 security token with dividends, freeze, recovery |
| PropertyMarketplace | Primary market (mint), secondary order book (escrow), yield distribution |

**Demo flow:**
1. Register investor on-chain (country: Colombia, category: retail).
2. List property: Torre Chapultepec (CDMX, $2.5M, 25,000 tokens @ $100).
3. Purchase 100 tokens ($100) -- compliance module checks identity before minting.
4. Deposit rental yield -> distribute through dividend mechanism -> investor withdraws.
5. Create sell order on secondary market -> another verified investor fills it.

---

### The Ask (60 seconds)

**Market:** $3.2T LATAM real estate, completely untokenized.

**BNB Chain fit:**
- EVM-compatible, low gas costs (critical for $100 micro-investments).
- Largest user base in Asia-Pacific -- the bridge for Asian capital into LATAM real estate.
- Chainlink oracle support for real-time property valuations.
- BNB Chain DeFi ecosystem for future composability (lending against RWA tokens, LP pools).

**Next steps:**
1. BNB Chain mainnet deployment (Q2 2026).
2. First property listing: Bogota, Colombia -- 5 properties, $8M total value.
3. Stablecoin integration (USDT/BUSD on BSC).
4. Partnership with LATAM real estate SPV structures and local legal counsel.
5. Apply for ICC Incubation Package ($100K value) to accelerate go-to-market.

**Close:** "Latin America has $3.2 trillion in real estate and zero tokenization infrastructure. BNB Chain has 100 million users and zero LATAM RWA exposure. Terravault is the bridge."

---

## OBJECTION PREP (Hong Kong Judges)

| Objection | Response |
|---|---|
| "How is this different from RealT / Lofty / Propy?" | They focus on US properties with US-specific structures. We are LATAM-first -- the region with the largest access gap and highest yield potential for cross-border investors. Our compliance module is jurisdiction-agnostic, not US-centric. |
| "Is this legally compliant?" | ERC-3643 is the same standard used by institutional tokenizations. Properties are structured through SPVs with local legal counsel in each jurisdiction. The on-chain compliance module enforces transfer restrictions at the protocol level -- it does not replace legal structure, it enforces it. |
| "Why BNB Chain instead of Ethereum/Polygon?" | Gas costs matter when your target ticket is $100. BNB Chain has the lowest cost for EVM security tokens. The Asia-Pacific user base is our distribution channel for cross-border LATAM investment. Chainlink oracles are available. We are fully EVM-compatible and can deploy to any chain. |
| "What about liquidity on a secondary market?" | The built-in order book with partial fills and escrow creates native liquidity. As more properties list, the marketplace creates network effects. We do not depend on external DEX liquidity -- we generate our own. |
| "How do dividends work on-chain?" | Accumulator pattern: when rental yield is deposited, a global `dividendPerToken` counter increments. Each investor's pending dividends are computed from (balance * accumulator) minus recorded debt. No loops, no gas scaling with investor count. Works for 10 or 10,000 holders at the same cost. |
| "What is the regulatory risk in LATAM?" | Colombia, Mexico, and Brazil all have sandbox frameworks or existing regulations for digital securities. We structure through SPVs which are recognized legal entities. The compliance module enforces whatever restrictions local regulators require -- it is configurable per jurisdiction. |
| "How do you handle property management off-chain?" | SPV structure with local property managers. Rental income flows from property manager -> SPV bank account -> on-chain yield deposit -> automatic distribution. We are the tokenization and compliance layer, not the property management layer. |
| "What is the ICC Incubation Package?" | ICC (International Chamber of Commerce) partnership with BNB Chain offers $100K in resources for RWA projects. We are applying for this as part of the hackathon track. It accelerates our go-to-market with legal, technical, and business development support. |

---

## Smart Contract Architecture

| Contract | Purpose |
|---|---|
| **IdentityRegistry** | On-chain KYC: investor verification, country codes (ISO 3166-1), investor categories (retail/accredited/institutional), expiry timestamps |
| **ComplianceModule** | Transfer restriction engine: per-investor caps, max investor count, country blocklist, minimum accreditation, token-contract-only write access |
| **TerravaultToken** | ERC-3643 security token: compliance-checked transfers, freeze/unfreeze, forced transfers (regulatory), token recovery (lost wallets), native dividend distribution with accumulator pattern, property metadata (IPFS URI, valuation) |
| **PropertyMarketplace** | Primary market (stablecoin purchases -> token minting), secondary order book (sell orders with escrow, partial fills), rental yield deposit and distribution via token dividend mechanism, Chainlink-compatible oracle for ETH/USD pricing, platform fees (basis points) |

---

## Demo Video Script (3-5 minutes)

### Scene 1: The Problem (0:00 - 0:40)

**Visual:** Skyline shots of Bogota, Mexico City, Sao Paulo. Overlay stats.

**Narration:** "$3.2 trillion in Latin American real estate. The world's most reliable asset class. But if you are not already wealthy, you cannot touch it. Cross-border acquisition takes 60 to 120 days, costs 8-12% in fees, and requires navigating opaque legal structures in foreign jurisdictions. There is no secondary market -- your capital is locked for years."

### Scene 2: The Solution (0:40 - 1:15)

**Visual:** Terravault branding. Architecture diagram.

**Narration:** "Terravault tokenizes premium LATAM properties into compliant digital securities on BNB Chain. Each property is legally structured into an SPV, independently appraised, and represented on-chain as an ERC-3643 security token. Investors complete KYC, get verified on the on-chain identity registry, and purchase fractional tokens starting at $100."

### Scene 3: Smart Contract Demo on BNB Chain (1:15 - 2:30)

**Visual:** Screen recording -- BscScan + contract interactions.

1. **(1:15)** Show deployed contracts on BscScan testnet. Four verified contracts.
2. **(1:35)** Register investor: `registerIdentity(address, 170, 0, expiry)` -- Colombia, retail.
3. **(1:55)** List property + purchase 100 tokens. Show compliance check before mint.
4. **(2:10)** Deposit rental yield -> distribute -> investor withdraws dividends.

### Scene 4: Secondary Market (2:30 - 3:00)

1. Investor A creates sell order (50 tokens @ $1.10).
2. Investor B fills partially (25 tokens).
3. Stablecoin flows, compliance checked, tokens transferred.

### Scene 5: Why BNB Chain + Close (3:00 - 3:30)

"Deployed on BNB Chain. Low gas costs for micro-investments. Asia-Pacific user base for cross-border LATAM capital. $3.2 trillion waiting to be tokenized. We are the bridge."

**End card:** Terravault. "Own the World. One Token at a Time."

---

## Quick Start

```bash
# Clone
git clone https://github.com/xpandia/terravault.git
cd terravault

# Backend API (demo mode -- no blockchain required)
cd src/backend
npm install
DEMO_MODE=true node server.js
# API at http://localhost:3000
# Demo endpoints: /api/v1/demo/properties, /api/v1/demo/buy, etc.
# Primary endpoints also work in demo mode with in-memory fallback.

# Smart Contracts (BNB Chain testnet)
cd src/contracts
cp .env.example .env
# Edit .env with your deployer key
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network bnbTestnet

# Frontend
open src/frontend/index.html
```

### Environment Variables

```bash
# Backend .env
JWT_SECRET=your-secret-key
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
ADMIN_PRIVATE_KEY=0x...
MARKETPLACE_ADDRESS=0x...
IDENTITY_REGISTRY_ADDRESS=0x...
DEMO_MODE=true   # Set to "true" for demo without blockchain

# Contracts .env
DEPLOYER_PRIVATE_KEY=0x...
BSCSCAN_API_KEY=...
```

---

## Submission Checklist

- [x] ERC-3643 smart contracts (TerravaultToken, IdentityRegistry, ComplianceModule, PropertyMarketplace)
- [x] On-chain compliance stack (KYC, country gating, investor caps, accreditation)
- [x] Automated dividend distribution (accumulator pattern)
- [x] Primary + secondary marketplace with escrow
- [x] Chainlink-compatible oracle integration
- [x] Hardhat config for BNB Chain Testnet (ChainID 97)
- [x] Automated deployment script (deploys all 4 contracts + seeds sample property)
- [x] Node.js/Express API backend with demo mode
- [x] 3 realistic LATAM properties seeded (CDMX, Medellin, Sao Paulo)
- [x] Demo buy flow (updates in-memory state)
- [x] Demo yield distribution flow
- [x] Demo KYC submit + auto-approve flow
- [x] Landing page
- [x] Source code on GitHub
- [x] Pitch structure for 5-minute presentation
- [x] Objection prep for HK judges
- [x] BNB Chain deployment guide (DEPLOY_BNB.md)
- [ ] BNB Chain testnet deployment (deploy before Mar 31)
- [ ] Contract verification on BscScan
- [ ] Demo video (record per script above)
- [ ] DoraHacks BUIDL page published
