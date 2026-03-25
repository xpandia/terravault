# Terravault -- BNB Chain Testnet Deployment Guide

## Prerequisites

- Node.js >= 18
- A wallet with testnet BNB (tBNB)
- BscScan API key (free at https://bscscan.com/myapikey)

## Step 1: Get Testnet BNB

1. Go to https://testnet.bnbchain.org/faucet-smart
2. Connect your wallet or paste your address.
3. Request 0.5 tBNB (enough for all deployments).
4. Confirm balance on https://testnet.bscscan.com

## Step 2: Configure Environment

```bash
cd src/contracts
cp .env.example .env
```

Edit `.env`:

```
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
BSCSCAN_API_KEY=YOUR_BSCSCAN_API_KEY
STABLECOIN_ADDRESS=0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
PRICE_FEED_ADDRESS=0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526
PLATFORM_FEE_BPS=250
```

**STABLECOIN_ADDRESS**: BNB Testnet USDT at `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`.
**PRICE_FEED_ADDRESS**: Chainlink BNB/USD on testnet at `0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526`.

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Compile Contracts

```bash
npx hardhat compile
```

Expected output: four contracts compiled (IdentityRegistry, ComplianceModule, TerravaultToken, PropertyMarketplace).

## Step 5: Deploy to BNB Testnet

```bash
npx hardhat run scripts/deploy.js --network bnbTestnet
```

The script deploys all four contracts in order:

1. **IdentityRegistry** -- on-chain KYC registry
2. **ComplianceModule** -- transfer restriction engine (wired to IdentityRegistry)
3. **TerravaultToken** -- ERC-3643 security token (wired to both)
4. **PropertyMarketplace** -- primary/secondary market + yield distribution

Post-deployment the script also:
- Calls `ComplianceModule.setTokenContract(TerravaultToken)` to wire compliance
- Registers the deployer as a verified investor (Mexico, institutional)
- Lists a sample property: **Torre Chapultepec** (CDMX, $2.5M, 25,000 tokens @ $100)

Save the output -- it contains all contract addresses and verification commands.

## Step 6: Verify on BscScan

The deployment script prints verification commands. Run them one by one:

```bash
npx hardhat verify --network bnbTestnet <IdentityRegistry_Address> "<deployer_address>"

npx hardhat verify --network bnbTestnet <ComplianceModule_Address> "<deployer>" "<identityRegistry>" "<maxTokensPerInvestor>" "500" "0"

npx hardhat verify --network bnbTestnet <TerravaultToken_Address> "Terravault Torre Chapultepec" "TV-CHAP" "<deployer>" "<identityRegistry>" "<complianceModule>" "PROP-CDMX-001" "ipfs://QmTerravaultChapultepecDocs" "<valuation>"

npx hardhat verify --network bnbTestnet <PropertyMarketplace_Address> "<deployer>" "<stablecoin>" "18" "<priceFeed>" "250" "<deployer>"
```

After verification, contracts show source code and a green checkmark on BscScan.

## Step 7: Initialize with Sample Property (already done by deploy script)

The deployment script already lists Torre Chapultepec. To add more properties manually:

```bash
npx hardhat console --network bnbTestnet
```

```javascript
const marketplace = await ethers.getContractAt("PropertyMarketplace", "<MARKETPLACE_ADDRESS>");

// List Oficinas El Poblado (Medellin)
await marketplace.listProperty(
  "Oficinas El Poblado",
  "El Poblado, Medellin, Antioquia",
  170,  // Colombia
  "Mixed-Use",
  "ipfs://QmElPobladoDocs",
  "ipfs://QmElPobladoImg",
  ethers.parseUnits("1800000", 18),
  ethers.parseUnits("18000", 18),
  ethers.parseUnits("100", 18),
  "<TOKEN_CONTRACT_ADDRESS>",
  "<PROPERTY_OWNER_ADDRESS>"
);
```

## Step 8: Connect Backend API

Update the backend `.env`:

```
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
MARKETPLACE_ADDRESS=<deployed_marketplace_address>
IDENTITY_REGISTRY_ADDRESS=<deployed_identity_registry_address>
ADMIN_PRIVATE_KEY=<deployer_private_key>
```

Then restart the backend:

```bash
cd src/backend
node server.js
```

## Contract Addresses (fill in after deployment)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x...` |
| ComplianceModule | `0x...` |
| TerravaultToken | `0x...` |
| PropertyMarketplace | `0x...` |

## Troubleshooting

**"insufficient funds"**: Get more tBNB from the faucet (https://testnet.bnbchain.org/faucet-smart).

**"nonce too low"**: Reset your nonce in MetaMask (Settings > Advanced > Clear activity tab data) or wait and retry.

**Verification fails**: Ensure `BSCSCAN_API_KEY` is set and you are using the exact same constructor arguments that were logged during deployment.

**Compilation errors**: Run `npm install` to ensure OpenZeppelin v5 is installed. The contracts require Solidity 0.8.20.
