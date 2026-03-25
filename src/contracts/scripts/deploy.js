/**
 * Terravault — BNB Chain Testnet Deployment Script
 *
 * Deploys all four contracts in order:
 *   1. IdentityRegistry
 *   2. ComplianceModule
 *   3. TerravaultToken
 *   4. PropertyMarketplace
 *
 * Then wires them together and seeds a sample LATAM property.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network bnbTestnet
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(70));
  console.log("  TERRAVAULT — BNB CHAIN DEPLOYMENT");
  console.log("=".repeat(70));
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Balance:   ${hre.ethers.formatEther(balance)} BNB`);
  console.log(`  Network:   ${hre.network.name} (chainId ${hre.network.config.chainId || "local"})`);
  console.log("=".repeat(70));

  if (balance === 0n) {
    throw new Error("Deployer has 0 BNB. Get testnet BNB from https://testnet.bnbchain.org/faucet-smart");
  }

  // -----------------------------------------------------------------------
  //  1. Deploy IdentityRegistry
  // -----------------------------------------------------------------------
  console.log("\n[1/4] Deploying IdentityRegistry...");
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy(deployer.address);
  await identityRegistry.waitForDeployment();
  const identityRegistryAddr = await identityRegistry.getAddress();
  console.log(`  IdentityRegistry:  ${identityRegistryAddr}`);

  // -----------------------------------------------------------------------
  //  2. Deploy ComplianceModule
  // -----------------------------------------------------------------------
  console.log("\n[2/4] Deploying ComplianceModule...");
  const maxTokensPerInvestor = hre.ethers.parseUnits("10000", 18); // 10,000 tokens max per investor
  const maxInvestorCount = 500;
  const minCategory = 0; // retail allowed

  const ComplianceModule = await hre.ethers.getContractFactory("ComplianceModule");
  const complianceModule = await ComplianceModule.deploy(
    deployer.address,
    identityRegistryAddr,
    maxTokensPerInvestor,
    maxInvestorCount,
    minCategory
  );
  await complianceModule.waitForDeployment();
  const complianceModuleAddr = await complianceModule.getAddress();
  console.log(`  ComplianceModule:  ${complianceModuleAddr}`);

  // -----------------------------------------------------------------------
  //  3. Deploy TerravaultToken (first property: Torre Chapultepec, CDMX)
  // -----------------------------------------------------------------------
  console.log("\n[3/4] Deploying TerravaultToken...");
  const TerravaultToken = await hre.ethers.getContractFactory("TerravaultToken");
  const terravaultToken = await TerravaultToken.deploy(
    "Terravault Torre Chapultepec",       // name
    "TV-CHAP",                             // symbol
    deployer.address,                      // admin
    identityRegistryAddr,                  // identity registry
    complianceModuleAddr,                  // compliance module
    "PROP-CDMX-001",                       // propertyId
    "ipfs://QmTerravaultChapultepecDocs",  // propertyURI (placeholder)
    hre.ethers.parseUnits("2500000", 18)   // valuation: $2.5M USD
  );
  await terravaultToken.waitForDeployment();
  const terravaultTokenAddr = await terravaultToken.getAddress();
  console.log(`  TerravaultToken:   ${terravaultTokenAddr}`);

  // Wire: ComplianceModule needs to know the token contract
  console.log("  -> Setting token contract on ComplianceModule...");
  const setTokenTx = await complianceModule.setTokenContract(terravaultTokenAddr);
  await setTokenTx.wait();
  console.log("  -> Done.");

  // -----------------------------------------------------------------------
  //  4. Deploy PropertyMarketplace
  // -----------------------------------------------------------------------
  console.log("\n[4/4] Deploying PropertyMarketplace...");

  // Config
  const stablecoinAddress = process.env.STABLECOIN_ADDRESS || "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
  const stablecoinDecimals = 18; // testnet token decimals
  const priceFeedAddress = process.env.PRICE_FEED_ADDRESS || "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
  const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || "250");

  const PropertyMarketplace = await hre.ethers.getContractFactory("PropertyMarketplace");
  const marketplace = await PropertyMarketplace.deploy(
    deployer.address,
    stablecoinAddress,
    stablecoinDecimals,
    priceFeedAddress,
    platformFeeBps,
    deployer.address // fee recipient = deployer for testnet
  );
  await marketplace.waitForDeployment();
  const marketplaceAddr = await marketplace.getAddress();
  console.log(`  PropertyMarketplace: ${marketplaceAddr}`);

  // -----------------------------------------------------------------------
  //  Post-deployment: Register deployer as verified investor + list property
  // -----------------------------------------------------------------------
  console.log("\n[Post] Registering deployer as verified investor...");
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const regTx = await identityRegistry.registerIdentity(
    deployer.address,
    484,  // Mexico (ISO 3166-1 numeric)
    2,    // institutional
    oneYearFromNow
  );
  await regTx.wait();
  console.log("  -> Deployer registered (Mexico, institutional).");

  console.log("\n[Post] Listing sample property on marketplace...");
  const listTx = await marketplace.listProperty(
    "Torre Chapultepec",                          // name
    "Polanco, Ciudad de Mexico, CDMX",            // location
    484,                                           // countryCode (Mexico)
    "Commercial",                                  // propertyType
    "ipfs://QmTerravaultChapultepecDocs",          // documentURI
    "ipfs://QmTerravaultChapultepecImg",           // imageURI
    hre.ethers.parseUnits("2500000", 18),          // valuationUSD ($2.5M)
    hre.ethers.parseUnits("25000", 18),            // totalTokens (25,000)
    hre.ethers.parseUnits("100", 18),              // pricePerTokenUSD ($100)
    terravaultTokenAddr,                           // tokenContract
    deployer.address                               // propertyOwner
  );
  await listTx.wait();
  console.log("  -> Property listed: Torre Chapultepec (ID: 0).");

  // -----------------------------------------------------------------------
  //  Summary
  // -----------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("  DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log(`
  IdentityRegistry:    ${identityRegistryAddr}
  ComplianceModule:    ${complianceModuleAddr}
  TerravaultToken:     ${terravaultTokenAddr}
  PropertyMarketplace: ${marketplaceAddr}

  Stablecoin:          ${stablecoinAddress}
  Price Feed:          ${priceFeedAddress}
  Platform Fee:        ${platformFeeBps / 100}%

  Sample Property:     Torre Chapultepec (CDMX) — $2.5M — 25,000 tokens @ $100

  Explorer: https://testnet.bscscan.com/address/${marketplaceAddr}
  `);

  // -----------------------------------------------------------------------
  //  Verification commands
  // -----------------------------------------------------------------------
  console.log("  VERIFY COMMANDS (run after deployment):");
  console.log("  -".repeat(35));
  console.log(`  npx hardhat verify --network bnbTestnet ${identityRegistryAddr} "${deployer.address}"`);
  console.log(`  npx hardhat verify --network bnbTestnet ${complianceModuleAddr} "${deployer.address}" "${identityRegistryAddr}" "${maxTokensPerInvestor}" "${maxInvestorCount}" "${minCategory}"`);
  console.log(`  npx hardhat verify --network bnbTestnet ${terravaultTokenAddr} "Terravault Torre Chapultepec" "TV-CHAP" "${deployer.address}" "${identityRegistryAddr}" "${complianceModuleAddr}" "PROP-CDMX-001" "ipfs://QmTerravaultChapultepecDocs" "${hre.ethers.parseUnits("2500000", 18)}"`);
  console.log(`  npx hardhat verify --network bnbTestnet ${marketplaceAddr} "${deployer.address}" "${stablecoinAddress}" "${stablecoinDecimals}" "${priceFeedAddress}" "${platformFeeBps}" "${deployer.address}"`);
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
