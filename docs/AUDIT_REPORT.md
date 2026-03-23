# TERRAVAULT -- Technical & Strategic Audit Report

**Auditor:** Senior Technical Auditor (Independent)
**Date:** 2026-03-23
**Scope:** Full codebase, pitch materials, investor documentation, landing page
**Verdict:** See Section 10

---

## 1. CODE QUALITY -- 6.5/10

### Strengths
- Clean, well-organized file structure with clear separation of concerns (contracts, backend, frontend, pitch)
- Consistent code style across Solidity contracts with thorough NatSpec-style comments
- Backend follows Express.js best practices: helmet, rate limiting, structured logging with winston, JWT auth, RBAC
- Proper error handling throughout the backend with try/catch blocks and meaningful error responses
- API versioning (`/api/v1/`) is in place from the start

### Weaknesses
- **Zero test files.** No unit tests, no integration tests, no contract tests. For a project handling real money and security tokens, this is a disqualifying gap. No Hardhat config, no Foundry config, no test runner of any kind exists in the project.
- No linting configuration (eslint, solhint, prettier configs are absent)
- No CI/CD pipeline or deployment scripts
- No `.env.example` file to guide configuration -- the backend has a hardcoded fallback JWT secret (`terravault-dev-secret-change-me`) which is a security anti-pattern even for dev environments
- The backend uses in-memory stores (`Map()`) for all data (investors, KYC, documents, yields). This is acknowledged with a comment but is functionally a prototype, not an MVP.
- No TypeScript in the backend despite the README claiming "TypeScript" in the tech stack
- Frontend is a single monolithic HTML file (~1000+ lines of inline CSS and JS). No component architecture, no build system, no framework despite the README claiming Next.js 14.

---

## 2. LANDING PAGE -- 7.5/10

### Strengths
- Visually polished, premium aesthetic with a cohesive emerald/gold color palette that communicates institutional trust
- Strong typographic hierarchy using Inter font family with proper weight distribution
- Thoughtful CSS animations: scroll reveal effects, hover states, animated globe visual, progress bars
- Responsive design considerations with `clamp()` for fluid typography
- Good information architecture: Problem -> Solution -> How It Works -> Assets -> Security -> CTA flow
- Mobile hamburger menu toggle is present

### Weaknesses
- Single HTML file with all CSS inline -- no separation, no maintainability path
- The globe visualization is purely decorative CSS, not a real WebGL/canvas element -- acceptable for a hackathon but looks basic up close
- No actual wallet connection functionality. The "Connect Wallet" and "Start Investing" buttons are non-functional CTAs
- Asset card images are gradient placeholders, not real property photos
- No JavaScript interaction beyond scroll animations -- no Web3 integration, no MetaMask, no actual dApp behavior
- The page is a marketing landing page, not a functional application. There is no investor dashboard, no purchase flow, no portfolio view -- all of which the pitch materials promise to demo live.
- Mobile responsiveness is partially implemented (media queries exist for nav) but full responsive testing appears incomplete

---

## 3. SMART CONTRACTS -- 8.0/10

### Strengths -- TerravaultToken.sol

- **ERC-3643 compliance is genuine.** The contract implements the core T-REX pillars: IdentityRegistry with KYC expiry, ComplianceModule with transfer restrictions, country blocklists, investor category gating, per-investor caps, and max investor count limits.
- Proper use of OpenZeppelin v5 contracts: ERC20, AccessControl, ReentrancyGuard, Pausable
- Correct `_update()` override pattern for Solidity ^0.8.20 (OZ v5) instead of the deprecated `_beforeTokenTransfer`
- Role-based access control with granular roles: AGENT, FREEZER, RECOVERY, SUPPLY
- Forced transfer mechanism for regulatory/court orders -- a real-world necessity for security tokens
- Token recovery for lost wallets with automatic dividend transfer and old wallet freeze
- Dividend distribution uses the accumulator pattern (`dividendPerTokenAccumulated`) which is gas-efficient and mathematically sound
- Dividends are settled before balance changes in `_update()`, which is the correct ordering
- `nonReentrant` on all ETH-sending functions (withdrawDividends, forcedTransfer, recoverTokens)

### Strengths -- PropertyMarketplace.sol

- Complete primary and secondary market implementation with escrow-based sell orders
- Partial fill support on secondary market orders
- Chainlink oracle integration with staleness check (1-hour threshold)
- Platform fee system with basis points and configurable cap (max 10%)
- SafeERC20 for stablecoin interactions
- Rental yield distribution that flows through the token's native dividend mechanism -- architecturally elegant
- Proper decimal normalization between 18-decimal internal pricing and variable stablecoin decimals

### Weaknesses & Security Concerns

- **CRITICAL: ComplianceModule functions `transferred()`, `created()`, `destroyed()` have no access control.** Anyone can call these to manipulate `investorBalances` and `currentInvestorCount`. The module should restrict calls to the token contract only, or use an `onlyToken` modifier.
- **CRITICAL: `_reconcileDividendDebt()` is defined but never called.** The comment explains it should reconcile after balance changes, but it is dead code. The system relies on the next `_settleDividends()` call to implicitly fix debt, which works but introduces a window where `pendingDividends()` returns stale values after transfers.
- **HIGH: Dividend rounding dust.** When `(msg.value * DIVIDEND_PRECISION) / totalSupply()` truncates, the contract will accumulate small amounts of unclaimable ETH over time. No sweep mechanism exists.
- **MEDIUM: `_settleDividends()` in `_update()` is called before `super._update()` changes balances, then sets debt based on pre-transfer balances.** After `super._update()` changes balances, the debt is stale. The next call to `_settleDividends` for that address will correct it, but there is a brief inconsistency window.
- **MEDIUM: No events on ComplianceModule's `transferred/created/destroyed`.** Makes off-chain auditing difficult.
- **LOW: `purchaseTokens()` cost calculation:** `tokenAmount * prop.pricePerTokenUSD / 1e18` can overflow for very large token amounts. Use `mulDiv` or reorder operations.
- **LOW: No `receive()` or `fallback()` on TerravaultToken** -- if someone sends ETH directly (not through `depositDividends`), it will revert. This is actually correct behavior, but worth documenting.
- No formal verification, no audit by a third-party firm
- No deployment scripts, no migration patterns
- Contracts are not compiled -- no artifacts, no ABI files generated

---

## 4. BACKEND -- 7.0/10

### Strengths
- Well-structured Express.js API with clean route organization
- Proper security middleware stack: helmet, CORS, rate limiting (200 req/15min)
- Signature-based authentication using `ethers.verifyMessage` -- Web3-native auth
- JWT with role-based authorization middleware
- Graceful degradation: runs in "offline mode" when blockchain provider is unavailable
- IPFS integration for document management with local hash fallback
- File upload with mime-type whitelist and 50MB limit
- Portfolio endpoint iterates all properties and aggregates holdings per wallet -- functional design
- Proper error handling with winston logging to both console and file
- Module export of `app` for testing (though no tests exist)

### Weaknesses
- **All data is in-memory Maps.** No database. Server restart = total data loss. The README claims PostgreSQL but none exists.
- **Hardcoded JWT fallback secret** in source code. Even with the "change-me" suffix, this is a security risk if deployed without proper env configuration.
- **No input validation/sanitization** beyond basic presence checks. No schema validation (Joi, Zod, express-validator).
- **No pagination** on list endpoints (`/properties`, `/investors`, `/documents`). The properties endpoint sequentially calls `getProperty(i)` in a for-loop -- this will be extremely slow with more than ~20 properties due to N+1 RPC calls.
- **No caching layer.** Every request hits the blockchain provider directly.
- **No WebSocket/SSE** for real-time updates (new trades, yield distributions).
- **Missing endpoints** that the frontend/pitch would need: no user registration, no stablecoin balance check, no transaction history, no secondary market order listing.
- The IPFS integration uses dynamic `import()` for `ipfs-http-client` inside a route handler -- this should be top-level.
- **No health check for blockchain connectivity** -- the `/health` endpoint always returns "ok" even if the provider is down.
- CORS is set to `*` by default -- acceptable for dev, dangerous for production.

---

## 5. PITCH MATERIALS -- 9.0/10

### Strengths
- **PITCH_DECK.md** is exceptional. Professional venture-grade narrative structure. The opening hook ("The most valuable asset class on Earth... is the one 2 billion people can't touch") is compelling. Market sizing is data-backed with clear TAM/SAM/SOM methodology. Competitive analysis is specific and honest. The business model slide shows per-property unit economics. The close is fundraise-ready with specific use of funds and milestones.
- **DEMO_SCRIPT.md** is one of the most thoughtful demo scripts I have reviewed for a hackathon project. It includes a pre-demo checklist, timestamp-by-timestamp narration, specific UI references, audience psychology notes ("let that land"), a contingency plan for demo failure, and delivery coaching. This is conference-presenter level preparation.
- **VIDEO_STORYBOARD.md** is cinematic and professionally conceived. Scene-by-scene breakdown with visual directions, voiceover scripts, audio cues, editing rhythm notes, and multi-format deliverable specs. Production references (Stripe, Apple, BlackRock) are appropriate for the positioning.
- **pitch_deck.html** is a fully interactive slide deck with keyboard navigation, progress bar, slide transitions, and speaker notes overlay. The visual design matches the brand identity. This is significantly above the typical hackathon Canva/Google Slides submission.

### Weaknesses
- The pitch deck promises a live demo of a fully functional platform ("Not a Figma mockup. Not a testnet. This is the product.") -- but the actual product is a static landing page with no Web3 functionality. This creates a credibility gap if judges inspect the code.
- Team slide uses placeholder brackets: "[CEO]", "[CTO]", "[Head of Legal/Compliance]". For a hackathon submission, actual team info should be filled in.
- Claims of "LOIs signed with 3 property developers" and "2,400+ waitlist signups" are unverifiable.
- The investor brief says "$3.5M Seed" while the pitch deck says "$3M Seed" -- inconsistency.
- Contact info is placeholder: `[yourname@terravault.io]`

---

## 6. INVESTOR READINESS -- 8.0/10

### Strengths
- **INVESTOR_BRIEF.md** is a thorough, institutional-quality document covering: one-liner, problem with data, solution with 10x improvement table, why-now thesis, market sizing, unit economics, competitive moat, go-to-market, business model, 3-year financial projections, team requirements, funding ask, risk matrix, and exit strategy.
- Unit economics are specific and reasonable: $64K revenue per property, 82% gross margin, LTV:CAC of 8:1, CAC payback of 4 months.
- Risk matrix is honest and includes mitigations for regulatory, liquidity cold-start, property, smart contract, and adoption risks.
- Comparable company data (RealT, Lofty, Securitize, Centrifuge, Maple) is current and relevant.
- Exit strategy includes specific acquirer categories with strategic rationale.

### Weaknesses
- No cap table or equity structure proposed
- Financial projections show Year 1 revenue of $500K and Year 3 of $8.2M -- aggressive but not unreasonable for the thesis. However, they are entirely hypothetical given zero traction data.
- The document is well-researched but may be too long (300+ lines) for an initial investor touchpoint. An executive summary or one-pager version is missing.
- Some data points (ECLAC 2024, Chainalysis 2024, Knight Frank) are cited but not linked.

---

## 7. HACKATHON FIT -- 7.0/10

### Strengths
- Strong alignment with RWA tokenization track. ERC-3643 is the right standard for the use case.
- The LATAM focus is a genuine market gap -- no serious competitors in this specific niche.
- Smart contracts demonstrate real technical depth in security token compliance.
- Pitch materials are far above hackathon average. The demo script and video storyboard show the team understands presentation.
- Complete project narrative from problem to solution to business model.

### Weaknesses
- **The hackathon checklist in README.md has every item unchecked.** Every single box is `[ ]`, not `[x]`. This is a red flag for judges: it signals the team knows what needs to be done but has not done it.
- **No deployed contracts.** No testnet addresses. No block explorer links. The README "Links" section has four "Coming soon" placeholders.
- **No live demo URL.** The pitch is built around a live demo that does not exist.
- **No tests.** Hackathon judges increasingly look for test coverage as a signal of engineering rigor.
- **README claims Next.js, TypeScript, PostgreSQL, The Graph, Foundry** -- none of these exist in the codebase. The frontend is vanilla HTML. The backend is plain JavaScript with in-memory storage. There is no indexing layer.
- The gap between what the pitch promises and what the code delivers is the single biggest risk. A savvy judge will inspect the repo.
- No Chainlink integration actually exists in the codebase -- the contracts define the interface but there is no deployment or configuration connecting to a real oracle.

---

## 8. CRITICAL ISSUES

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **P0** | ComplianceModule `transferred()`, `created()`, `destroyed()` lack access control -- anyone can call them to corrupt investor tracking | `TerravaultToken.sol:194-220` |
| 2 | **P0** | Zero test coverage across the entire project. No confidence in correctness. | Project-wide |
| 3 | **P0** | README and pitch claim tech stack (Next.js, TypeScript, PostgreSQL, The Graph, Foundry) that does not exist. This is misrepresentation. | `README.md` |
| 4 | **P0** | No deployed contracts, no testnet addresses, no live demo despite pitch being entirely built around a live demonstration | Project-wide |
| 5 | **P1** | Hardcoded JWT secret fallback in backend source code | `server.js:42` |
| 6 | **P1** | `_reconcileDividendDebt()` is dead code -- defined but never invoked | `TerravaultToken.sol:512-515` |
| 7 | **P1** | In-memory data stores in backend -- server restart loses all KYC, investor, and document data | `server.js:96-99` |
| 8 | **P1** | Funding amount inconsistency: pitch deck says $3M, investor brief says $3.5M | `PITCH_DECK.md` vs `INVESTOR_BRIEF.md` |
| 9 | **P2** | No input validation/sanitization on API endpoints | `server.js` |
| 10 | **P2** | Dividend rounding dust accumulation with no recovery mechanism | `TerravaultToken.sol:463` |

---

## 9. RECOMMENDATIONS

### P0 -- Must Fix Before Any Demo or Submission

1. **Add access control to ComplianceModule state-mutating functions.** Add an `onlyToken` modifier or store the token contract address and require `msg.sender == tokenContract`. Without this, the entire compliance layer is bypassable.

2. **Write contract tests.** At minimum: token minting with identity verification, transfer compliance checks, dividend deposit/withdrawal/settlement across transfers, forced transfer, token recovery, ComplianceModule country blocking, and marketplace primary/secondary purchase flows. Use Hardhat or Foundry. Aim for 80%+ line coverage.

3. **Fix the README.** Either update the tech stack claims to match reality (vanilla HTML frontend, Express.js with in-memory storage), or actually implement the claimed stack. Misrepresenting the tech stack to judges is worse than having a simpler stack honestly described.

4. **Deploy contracts to a testnet** (Polygon Amoy or Sepolia). Verify on block explorer. Add addresses to README. This is table stakes for a blockchain hackathon.

### P1 -- Should Fix Before Pitch Day

5. **Remove the hardcoded JWT secret.** Require `JWT_SECRET` env var or refuse to start. Add a `.env.example` file.

6. **Either call `_reconcileDividendDebt()` in the right place (after `super._update()` in `_update()`) or remove it entirely.** Dead code in a financial contract erodes trust.

7. **Add a basic database.** Even SQLite via `better-sqlite3` would be an improvement over in-memory Maps. If PostgreSQL is too heavy for the hackathon, use SQLite and be honest about it.

8. **Resolve the funding amount discrepancy** between pitch deck ($3M) and investor brief ($3.5M). Pick one number.

### P2 -- Nice to Have

9. **Add express-validator or Zod** for request body validation on all POST endpoints.

10. **Add a dust sweep function** to the token contract allowing the admin to recover accumulated rounding dust.

11. **Add pagination** to the properties and investors list endpoints.

12. **Fill in team placeholder brackets** in the pitch deck.

13. **Add a minimal Web3 connection** to the landing page -- even just MetaMask connect + network display would demonstrate dApp capability.

---

## 10. OVERALL SCORE & VERDICT

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Code Quality | 6.5 | 15% | 0.975 |
| Landing Page | 7.5 | 10% | 0.750 |
| Smart Contracts | 8.0 | 25% | 2.000 |
| Backend | 7.0 | 15% | 1.050 |
| Pitch Materials | 9.0 | 15% | 1.350 |
| Investor Readiness | 8.0 | 10% | 0.800 |
| Hackathon Fit | 7.0 | 10% | 0.700 |
| **OVERALL** | | | **7.625 / 10** |

### Verdict

**Terravault is a project with an outstanding pitch wrapped around an incomplete product.**

The smart contracts are the strongest technical artifact -- the ERC-3643 implementation is thoughtful, the dividend mechanism is correctly architected, and the marketplace contract demonstrates real domain understanding of tokenized real estate. The pitch materials are genuinely exceptional and would hold up in a Series Seed presentation, not just a hackathon.

However, there is a dangerous credibility gap. The pitch promises a live, functional platform with Next.js frontend, PostgreSQL database, Chainlink oracles, and deployed contracts. The reality is a static HTML landing page, an Express server with in-memory storage, no deployed contracts, and no Web3 interaction. Every item on the hackathon checklist is unchecked. The README's "Links" section is four lines of "Coming soon."

If judges only watch the pitch, this project could win. If judges inspect the repository, the gap between narrative and reality will be immediately apparent and damaging.

**The fix is not to build less ambitious pitch materials. The fix is to close the gap by deploying what exists, connecting the frontend to the contracts, and being honest about what is prototype vs. production.** A working testnet demo with honest scope is worth more than a cinematic pitch deck describing features that do not exist.

The bones are strong. The contracts are real. The market thesis is sound. Ship the demo.

---

*This audit was conducted on 2026-03-23 based on all files present in the repository at the time of review. No code was executed. No contracts were compiled or deployed as part of this audit.*
