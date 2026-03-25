/**
 * Terravault API Server
 * Real World Asset Tokenization for LATAM Real Estate
 *
 * Handles: property management, investor KYC/onboarding, portfolio tracking,
 * yield calculation/distribution, and document management (IPFS).
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const { ethers } = require("ethers");
const winston = require("winston");

// ---------------------------------------------------------------------------
//  Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// ---------------------------------------------------------------------------
//  Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "terravault-demo-secret-2026";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || "";
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001";
const DEMO_MODE = process.env.DEMO_MODE === "true" || !MARKETPLACE_ADDRESS;

// ---------------------------------------------------------------------------
//  Provider & Contract ABIs (minimal for API interaction)
// ---------------------------------------------------------------------------

let provider;
let signer;

try {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  if (process.env.ADMIN_PRIVATE_KEY) {
    signer = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  }
} catch (err) {
  logger.warn("Blockchain provider not available — running in offline mode");
}

const MARKETPLACE_ABI = [
  "function getProperty(uint256 propertyId) view returns (tuple(uint256 id, string name, string location, uint16 countryCode, string propertyType, string documentURI, string imageURI, uint256 valuationUSD, uint256 totalTokens, uint256 tokensSold, uint256 pricePerTokenUSD, address tokenContract, address propertyOwner, uint8 status, uint256 createdAt, uint256 updatedAt))",
  "function nextPropertyId() view returns (uint256)",
  "function listProperty(string,string,uint16,string,string,string,uint256,uint256,uint256,address,address) returns (uint256)",
  "function updateValuation(uint256 propertyId, uint256 newValuationUSD)",
  "function getEthUsdPrice() view returns (uint256)",
  "function getHoldingValueUSD(uint256 propertyId, address investor) view returns (uint256)",
  "function getTokenPriceETH(uint256 propertyId) view returns (uint256)",
  "function depositRentalYield(uint256 propertyId, uint256 periodStart, uint256 periodEnd) payable",
  "function distributeRentalYield(uint256 periodId)",
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function pendingDividends(address investor) view returns (uint256)",
  "function propertyValuation() view returns (uint256)",
  "function propertyId() view returns (string)",
  "function propertyURI() view returns (string)",
];

const IDENTITY_REGISTRY_ABI = [
  "function registerIdentity(address,uint16,uint8,uint64)",
  "function updateIdentity(address,uint16,uint8,uint64)",
  "function removeIdentity(address)",
  "function isVerified(address) view returns (bool)",
  "function getIdentity(address) view returns (tuple(bool verified, uint16 country, uint8 category, uint64 expiresAt))",
];

// ---------------------------------------------------------------------------
//  In-memory stores (replace with DB in production)
// ---------------------------------------------------------------------------

const investors = new Map();       // investorId -> investor record
const kycRequests = new Map();     // requestId -> KYC request
const documents = new Map();       // docId -> document metadata
const yieldRecords = new Map();    // propertyId -> yield history
const propertiesStore = [];        // In-memory property seed data
const portfolioStore = new Map();  // walletAddress -> holdings
const activityStore = [];          // Recent activity feed
const purchasesStore = new Map();  // walletAddress -> purchases

// ---------------------------------------------------------------------------
//  Seed Data
// ---------------------------------------------------------------------------

const SEED_PROPERTIES = [
  {
    id: 0,
    name: "Torre Chapultepec",
    location: "Polanco, Ciudad de México, CDMX",
    city: "CDMX",
    country: "México",
    countryCode: 484,
    propertyType: "Commercial",
    description: "Edificio de oficinas clase A+ en el corazón de Polanco. 32 pisos con vista panorámica al Bosque de Chapultepec. Certificación LEED Gold, inquilinos ancla multinacionales.",
    valuationUSD: 2500000,
    totalTokens: 25000,
    tokensSold: 18750,
    pricePerTokenUSD: 100,
    apy: 8.5,
    occupancy: 94,
    yearBuilt: 2019,
    sizeSqm: 28500,
    rentalYieldMonthly: 17708,
    status: "Active",
    tokenContract: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    propertyOwner: "0xabc123def456abc123def456abc123def456abc1",
    documents: {
      deed: "ipfs://QmXyz...deed",
      appraisal: "ipfs://QmXyz...appraisal",
      legal: "ipfs://QmXyz...legal",
      financials: "ipfs://QmXyz...financials"
    },
    createdAt: "2025-09-15T10:00:00.000Z",
    updatedAt: "2026-03-20T14:30:00.000Z"
  },
  {
    id: 1,
    name: "Oficinas El Poblado",
    location: "El Poblado, Medellín, Antioquia",
    city: "Medellín",
    country: "Colombia",
    countryCode: 170,
    propertyType: "Mixed-Use",
    description: "Complejo de uso mixto en la zona más exclusiva de Medellín. 4 torres interconectadas con oficinas, retail de lujo y coworking. Hub tecnológico con 98% de conectividad de fibra óptica.",
    valuationUSD: 1800000,
    totalTokens: 18000,
    tokensSold: 10800,
    pricePerTokenUSD: 100,
    apy: 9.2,
    occupancy: 91,
    yearBuilt: 2021,
    sizeSqm: 22000,
    rentalYieldMonthly: 13800,
    status: "Active",
    tokenContract: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
    propertyOwner: "0xdef456abc123def456abc123def456abc123def4",
    documents: {
      deed: "ipfs://QmAbc...deed",
      appraisal: "ipfs://QmAbc...appraisal",
      legal: "ipfs://QmAbc...legal",
      financials: "ipfs://QmAbc...financials"
    },
    createdAt: "2025-11-01T08:00:00.000Z",
    updatedAt: "2026-03-18T11:15:00.000Z"
  },
  {
    id: 2,
    name: "Residencial Ipanema Tower",
    location: "Ipanema, São Paulo, SP",
    city: "São Paulo",
    country: "Brasil",
    countryCode: 76,
    propertyType: "Residential",
    description: "Torre residencial de ultra-lujo en el barrio de Ipanema, São Paulo. 120 unidades con amenidades de nivel resort: infinity pool, spa, gimnasio, concierge 24/7. Diseño de Isay Weinfeld.",
    valuationUSD: 3200000,
    totalTokens: 32000,
    tokensSold: 22400,
    pricePerTokenUSD: 100,
    apy: 7.8,
    occupancy: 97,
    yearBuilt: 2022,
    sizeSqm: 35000,
    rentalYieldMonthly: 20800,
    status: "Active",
    tokenContract: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    propertyOwner: "0x123abc456def123abc456def123abc456def1234",
    documents: {
      deed: "ipfs://QmDef...deed",
      appraisal: "ipfs://QmDef...appraisal",
      legal: "ipfs://QmDef...legal",
      financials: "ipfs://QmDef...financials"
    },
    createdAt: "2026-01-10T09:00:00.000Z",
    updatedAt: "2026-03-22T16:45:00.000Z"
  }
];

propertiesStore.push(...SEED_PROPERTIES);

// Seed investors
const SEED_INVESTORS = [
  {
    walletAddress: "0x742d35cc6634c0532925a3b844bc9e7595f2bd70",
    fullName: "Carlos Andrés Restrepo",
    email: "carlos.restrepo@inversiones.co",
    countryCode: 170,
    accreditationLevel: 1,
    role: "investor",
    kycApprovedAt: "2025-10-20T14:00:00.000Z"
  },
  {
    walletAddress: "0x8ba1f109551bd432803012645ac136ddd64dba72",
    fullName: "María Fernanda López Chen",
    email: "mf.lopez@capitalgrupo.mx",
    countryCode: 484,
    accreditationLevel: 2,
    role: "investor",
    kycApprovedAt: "2025-12-05T09:30:00.000Z"
  }
];

SEED_INVESTORS.forEach(inv => investors.set(inv.walletAddress, inv));

// Seed portfolio holdings
portfolioStore.set("0x742d35cc6634c0532925a3b844bc9e7595f2bd70", [
  { propertyId: 0, tokens: 50, purchasePrice: 95, purchasedAt: "2025-10-25T10:00:00.000Z" },
  { propertyId: 2, tokens: 45, purchasePrice: 98, purchasedAt: "2026-01-15T14:00:00.000Z" }
]);
portfolioStore.set("0x8ba1f109551bd432803012645ac136ddd64dba72", [
  { propertyId: 0, tokens: 75, purchasePrice: 97, purchasedAt: "2025-11-10T09:00:00.000Z" },
  { propertyId: 1, tokens: 100, purchasePrice: 100, purchasedAt: "2026-02-01T11:00:00.000Z" },
  { propertyId: 2, tokens: 50, purchasePrice: 99, purchasedAt: "2026-02-20T16:00:00.000Z" }
]);

// Seed yield records
yieldRecords.set("0", [
  { propertyId: 0, amountUSD: 708.33, periodStart: "2026-01-01", periodEnd: "2026-01-31", status: "distributed", distributedAt: "2026-02-01T10:00:00.000Z" },
  { propertyId: 0, amountUSD: 708.33, periodStart: "2026-02-01", periodEnd: "2026-02-28", status: "distributed", distributedAt: "2026-03-01T10:00:00.000Z" },
  { propertyId: 0, amountUSD: 708.33, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "pending", distributedAt: null }
]);
yieldRecords.set("1", [
  { propertyId: 1, amountUSD: 1058.33, periodStart: "2026-01-01", periodEnd: "2026-01-31", status: "distributed", distributedAt: "2026-02-01T10:00:00.000Z" },
  { propertyId: 1, amountUSD: 1058.33, periodStart: "2026-02-01", periodEnd: "2026-02-28", status: "distributed", distributedAt: "2026-03-01T10:00:00.000Z" },
  { propertyId: 1, amountUSD: 1058.33, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "pending", distributedAt: null }
]);
yieldRecords.set("2", [
  { propertyId: 2, amountUSD: 650.00, periodStart: "2026-01-01", periodEnd: "2026-01-31", status: "distributed", distributedAt: "2026-02-01T10:00:00.000Z" },
  { propertyId: 2, amountUSD: 650.00, periodStart: "2026-02-01", periodEnd: "2026-02-28", status: "distributed", distributedAt: "2026-03-01T10:00:00.000Z" },
  { propertyId: 2, amountUSD: 650.00, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "pending", distributedAt: null }
]);

// Seed activity
activityStore.push(
  { type: "purchase", investor: "Carlos A. Restrepo", property: "Torre Chapultepec", tokens: 50, amount: 4750, date: "2025-10-25T10:00:00.000Z" },
  { type: "yield", investor: "Carlos A. Restrepo", property: "Torre Chapultepec", amount: 35.42, date: "2026-02-01T10:00:00.000Z" },
  { type: "purchase", investor: "María F. López Chen", property: "Oficinas El Poblado", tokens: 100, amount: 10000, date: "2026-02-01T11:00:00.000Z" },
  { type: "purchase", investor: "María F. López Chen", property: "Residencial Ipanema Tower", tokens: 50, amount: 4950, date: "2026-02-20T16:00:00.000Z" },
  { type: "yield", investor: "María F. López Chen", property: "Oficinas El Poblado", amount: 58.80, date: "2026-03-01T10:00:00.000Z" },
  { type: "purchase", investor: "Carlos A. Restrepo", property: "Residencial Ipanema Tower", tokens: 45, amount: 4410, date: "2026-01-15T14:00:00.000Z" },
  { type: "yield", investor: "Carlos A. Restrepo", property: "Residencial Ipanema Tower", amount: 29.25, date: "2026-03-01T10:00:00.000Z" }
);

// ---------------------------------------------------------------------------
//  Express App
// ---------------------------------------------------------------------------

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use(limiter);

// File upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/json",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ---------------------------------------------------------------------------
//  Auth Middleware
// ---------------------------------------------------------------------------

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
//  Health
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "terravault-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
//  Auth Routes
// ---------------------------------------------------------------------------

app.post("/api/v1/auth/login", (req, res) => {
  const { walletAddress, signature, message } = req.body;
  if (!walletAddress || !signature || !message) {
    return res.status(400).json({ error: "walletAddress, signature, and message required" });
  }

  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    const investor = investors.get(walletAddress.toLowerCase());
    const role = investor?.role || "investor";

    const token = jwt.sign(
      { walletAddress: walletAddress.toLowerCase(), role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, walletAddress, role });
  } catch (err) {
    logger.error("Login error", { error: err.message });
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ---------------------------------------------------------------------------
//  Investor KYC / Onboarding
// ---------------------------------------------------------------------------

app.post("/api/v1/kyc/submit", authenticate, async (req, res) => {
  try {
    const {
      fullName,
      email,
      countryCode,
      documentType,
      documentNumber,
      accreditationLevel,
    } = req.body;

    if (!fullName || !email || !countryCode || !documentType || !documentNumber) {
      return res.status(400).json({ error: "Missing required KYC fields" });
    }

    const requestId = uuidv4();
    const kycRequest = {
      id: requestId,
      walletAddress: req.user.walletAddress,
      fullName,
      email,
      countryCode: parseInt(countryCode),
      documentType,
      documentNumber,
      accreditationLevel: accreditationLevel || 0, // 0=retail, 1=accredited, 2=institutional
      status: "pending",
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    };

    kycRequests.set(requestId, kycRequest);

    logger.info("KYC submitted", { requestId, wallet: req.user.walletAddress });
    res.status(201).json({ requestId, status: "pending" });
  } catch (err) {
    logger.error("KYC submit error", { error: err.message });
    res.status(500).json({ error: "Failed to submit KYC" });
  }
});

app.get("/api/v1/kyc/status", authenticate, (req, res) => {
  const requests = [];
  for (const [, entry] of kycRequests) {
    if (entry.walletAddress === req.user.walletAddress) {
      requests.push(entry);
    }
  }
  res.json({ requests });
});

app.post(
  "/api/v1/kyc/review/:requestId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const { approved, notes } = req.body;

      const kycReq = kycRequests.get(requestId);
      if (!kycReq) {
        return res.status(404).json({ error: "KYC request not found" });
      }

      kycReq.status = approved ? "approved" : "rejected";
      kycReq.reviewedAt = new Date().toISOString();
      kycReq.reviewedBy = req.user.walletAddress;
      kycReq.notes = notes;

      // If approved, register on-chain identity
      if (approved && signer && process.env.IDENTITY_REGISTRY_ADDRESS) {
        try {
          const registry = new ethers.Contract(
            process.env.IDENTITY_REGISTRY_ADDRESS,
            IDENTITY_REGISTRY_ABI,
            signer
          );

          const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
          const tx = await registry.registerIdentity(
            kycReq.walletAddress,
            kycReq.countryCode,
            kycReq.accreditationLevel,
            expiresAt
          );
          await tx.wait();

          kycReq.onChainTx = tx.hash;
          logger.info("Identity registered on-chain", {
            wallet: kycReq.walletAddress,
            tx: tx.hash,
          });
        } catch (chainErr) {
          logger.error("On-chain registration failed", {
            error: chainErr.message,
          });
          kycReq.onChainError = chainErr.message;
        }
      }

      // Upsert investor record
      if (approved) {
        investors.set(kycReq.walletAddress, {
          walletAddress: kycReq.walletAddress,
          fullName: kycReq.fullName,
          email: kycReq.email,
          countryCode: kycReq.countryCode,
          accreditationLevel: kycReq.accreditationLevel,
          role: "investor",
          kycApprovedAt: kycReq.reviewedAt,
        });
      }

      res.json({ requestId, status: kycReq.status });
    } catch (err) {
      logger.error("KYC review error", { error: err.message });
      res.status(500).json({ error: "Failed to review KYC" });
    }
  }
);

// ---------------------------------------------------------------------------
//  Property Management
// ---------------------------------------------------------------------------

app.get("/api/v1/properties", async (req, res) => {
  try {
    if (DEMO_MODE || !provider || !MARKETPLACE_ADDRESS) {
      return res.json({ properties: propertiesStore, total: propertiesStore.length, mode: "demo" });
    }

    const marketplace = new ethers.Contract(
      MARKETPLACE_ADDRESS,
      MARKETPLACE_ABI,
      provider
    );

    const count = await marketplace.nextPropertyId();
    const properties = [];

    for (let i = 0; i < count; i++) {
      try {
        const prop = await marketplace.getProperty(i);
        properties.push({
          id: Number(prop.id),
          name: prop.name,
          location: prop.location,
          countryCode: Number(prop.countryCode),
          propertyType: prop.propertyType,
          documentURI: prop.documentURI,
          imageURI: prop.imageURI,
          valuationUSD: ethers.formatUnits(prop.valuationUSD, 18),
          totalTokens: ethers.formatUnits(prop.totalTokens, 18),
          tokensSold: ethers.formatUnits(prop.tokensSold, 18),
          pricePerTokenUSD: ethers.formatUnits(prop.pricePerTokenUSD, 18),
          tokenContract: prop.tokenContract,
          propertyOwner: prop.propertyOwner,
          status: ["Draft", "Active", "SoldOut", "Suspended", "Delisted"][
            Number(prop.status)
          ],
          createdAt: new Date(Number(prop.createdAt) * 1000).toISOString(),
          updatedAt: new Date(Number(prop.updatedAt) * 1000).toISOString(),
        });
      } catch {
        // Skip properties that fail to load
      }
    }

    res.json({ properties, total: properties.length });
  } catch (err) {
    logger.error("Get properties error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

app.get("/api/v1/properties/:id", async (req, res) => {
  try {
    if (DEMO_MODE || !provider || !MARKETPLACE_ADDRESS) {
      const prop = propertiesStore.find(p => p.id === parseInt(req.params.id));
      if (!prop) return res.status(404).json({ error: "Property not found" });
      return res.json({ property: prop, mode: "demo" });
    }

    const marketplace = new ethers.Contract(
      MARKETPLACE_ADDRESS,
      MARKETPLACE_ABI,
      provider
    );

    const prop = await marketplace.getProperty(req.params.id);

    let ethPrice = null;
    try {
      const priceETH = await marketplace.getTokenPriceETH(req.params.id);
      ethPrice = ethers.formatEther(priceETH);
    } catch {
      // Oracle might not be configured
    }

    res.json({
      property: {
        id: Number(prop.id),
        name: prop.name,
        location: prop.location,
        countryCode: Number(prop.countryCode),
        propertyType: prop.propertyType,
        documentURI: prop.documentURI,
        imageURI: prop.imageURI,
        valuationUSD: ethers.formatUnits(prop.valuationUSD, 18),
        totalTokens: ethers.formatUnits(prop.totalTokens, 18),
        tokensSold: ethers.formatUnits(prop.tokensSold, 18),
        pricePerTokenUSD: ethers.formatUnits(prop.pricePerTokenUSD, 18),
        pricePerTokenETH: ethPrice,
        tokenContract: prop.tokenContract,
        propertyOwner: prop.propertyOwner,
        status: ["Draft", "Active", "SoldOut", "Suspended", "Delisted"][
          Number(prop.status)
        ],
        createdAt: new Date(Number(prop.createdAt) * 1000).toISOString(),
        updatedAt: new Date(Number(prop.updatedAt) * 1000).toISOString(),
      },
    });
  } catch (err) {
    logger.error("Get property error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch property" });
  }
});

app.post(
  "/api/v1/properties",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      if (!signer || !MARKETPLACE_ADDRESS) {
        return res.status(503).json({ error: "Blockchain signer unavailable" });
      }

      const {
        name,
        location,
        countryCode,
        propertyType,
        documentURI,
        imageURI,
        valuationUSD,
        totalTokens,
        pricePerTokenUSD,
        tokenContract,
        propertyOwner,
      } = req.body;

      const marketplace = new ethers.Contract(
        MARKETPLACE_ADDRESS,
        MARKETPLACE_ABI,
        signer
      );

      const tx = await marketplace.listProperty(
        name,
        location,
        countryCode,
        propertyType,
        documentURI || "",
        imageURI || "",
        ethers.parseUnits(valuationUSD.toString(), 18),
        ethers.parseUnits(totalTokens.toString(), 18),
        ethers.parseUnits(pricePerTokenUSD.toString(), 18),
        tokenContract,
        propertyOwner
      );

      const receipt = await tx.wait();
      logger.info("Property listed", { tx: tx.hash });

      res.status(201).json({
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (err) {
      logger.error("List property error", { error: err.message });
      res.status(500).json({ error: "Failed to list property" });
    }
  }
);

// ---------------------------------------------------------------------------
//  Portfolio Tracking
// ---------------------------------------------------------------------------

app.get("/api/v1/portfolio/:walletAddress", authenticate, async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (
      req.user.walletAddress !== walletAddress.toLowerCase() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Can only view own portfolio" });
    }

    if (DEMO_MODE || !provider || !MARKETPLACE_ADDRESS) {
      // Fall back to demo portfolio data
      const wallet = walletAddress.toLowerCase();
      const holdings = portfolioStore.get(wallet) || [];
      const enriched = holdings.map(h => {
        const prop = propertiesStore.find(p => p.id === h.propertyId);
        const currentValue = h.tokens * (prop?.pricePerTokenUSD || 100);
        return {
          propertyId: h.propertyId,
          propertyName: prop?.name || "Unknown",
          location: prop?.location || "Unknown",
          balance: h.tokens.toString(),
          holdingValueUSD: currentValue.toString(),
          pendingDividendsETH: "0.0",
        };
      });
      const totalValue = enriched.reduce((sum, h) => sum + parseFloat(h.holdingValueUSD), 0);
      return res.json({ walletAddress: wallet, holdings: enriched, totalValueUSD: totalValue.toString(), holdingCount: enriched.length, mode: "demo" });
    }

    const marketplace = new ethers.Contract(
      MARKETPLACE_ADDRESS,
      MARKETPLACE_ABI,
      provider
    );

    const count = await marketplace.nextPropertyId();
    const holdings = [];
    let totalValueUSD = 0n;

    for (let i = 0; i < count; i++) {
      try {
        const prop = await marketplace.getProperty(i);
        const token = new ethers.Contract(prop.tokenContract, TOKEN_ABI, provider);

        const balance = await token.balanceOf(walletAddress);
        if (balance === 0n) continue;

        const supply = await token.totalSupply();
        const holdingValue = await marketplace.getHoldingValueUSD(i, walletAddress);
        const ownershipPct =
          supply > 0n ? (balance * 10000n) / supply : 0n;

        let pendingDivs = 0n;
        try {
          pendingDivs = await token.pendingDividends(walletAddress);
        } catch {
          // Token may not support dividends
        }

        totalValueUSD += holdingValue;

        holdings.push({
          propertyId: i,
          propertyName: prop.name,
          location: prop.location,
          tokenContract: prop.tokenContract,
          balance: ethers.formatUnits(balance, 18),
          totalSupply: ethers.formatUnits(supply, 18),
          ownershipPercentage: (Number(ownershipPct) / 100).toFixed(2),
          holdingValueUSD: ethers.formatUnits(holdingValue, 18),
          pendingDividendsETH: ethers.formatEther(pendingDivs),
        });
      } catch {
        // Skip properties that fail
      }
    }

    res.json({
      walletAddress,
      holdings,
      totalValueUSD: ethers.formatUnits(totalValueUSD, 18),
      holdingCount: holdings.length,
    });
  } catch (err) {
    logger.error("Portfolio error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// ---------------------------------------------------------------------------
//  Yield Calculation & Distribution
// ---------------------------------------------------------------------------

app.get("/api/v1/yield/:propertyId", authenticate, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const history = yieldRecords.get(propertyId) || [];

    if (!provider || !MARKETPLACE_ADDRESS) {
      return res.json({ propertyId, yields: history });
    }

    const marketplace = new ethers.Contract(
      MARKETPLACE_ADDRESS,
      MARKETPLACE_ABI,
      provider
    );

    const prop = await marketplace.getProperty(propertyId);
    const valuationUSD = ethers.formatUnits(prop.valuationUSD, 18);

    // Calculate annualized yield from history
    let totalYieldETH = 0;
    for (const record of history) {
      totalYieldETH += parseFloat(record.amountETH);
    }

    res.json({
      propertyId,
      propertyName: prop.name,
      valuationUSD,
      totalYieldDistributedETH: totalYieldETH.toFixed(6),
      yieldHistory: history,
    });
  } catch (err) {
    logger.error("Yield fetch error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch yield data" });
  }
});

app.post(
  "/api/v1/yield/deposit",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      if (!signer || !MARKETPLACE_ADDRESS) {
        return res.status(503).json({ error: "Blockchain signer unavailable" });
      }

      const { propertyId, amountETH, periodStart, periodEnd } = req.body;
      if (!propertyId && propertyId !== 0) {
        return res.status(400).json({ error: "propertyId required" });
      }

      const marketplace = new ethers.Contract(
        MARKETPLACE_ADDRESS,
        MARKETPLACE_ABI,
        signer
      );

      const start = Math.floor(new Date(periodStart).getTime() / 1000);
      const end = Math.floor(new Date(periodEnd).getTime() / 1000);

      const tx = await marketplace.depositRentalYield(propertyId, start, end, {
        value: ethers.parseEther(amountETH.toString()),
      });

      const receipt = await tx.wait();

      // Track locally
      const record = {
        propertyId,
        amountETH: amountETH.toString(),
        periodStart,
        periodEnd,
        txHash: tx.hash,
        depositedAt: new Date().toISOString(),
      };
      const existing = yieldRecords.get(String(propertyId)) || [];
      existing.push(record);
      yieldRecords.set(String(propertyId), existing);

      logger.info("Yield deposited", { propertyId, tx: tx.hash });

      res.status(201).json({
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (err) {
      logger.error("Yield deposit error", { error: err.message });
      res.status(500).json({ error: "Failed to deposit yield" });
    }
  }
);

app.post(
  "/api/v1/yield/distribute/:periodId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      if (!signer || !MARKETPLACE_ADDRESS) {
        return res.status(503).json({ error: "Blockchain signer unavailable" });
      }

      const marketplace = new ethers.Contract(
        MARKETPLACE_ADDRESS,
        MARKETPLACE_ABI,
        signer
      );

      const tx = await marketplace.distributeRentalYield(req.params.periodId);
      const receipt = await tx.wait();

      logger.info("Yield distributed", {
        periodId: req.params.periodId,
        tx: tx.hash,
      });

      res.json({
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (err) {
      logger.error("Yield distribution error", { error: err.message });
      res.status(500).json({ error: "Failed to distribute yield" });
    }
  }
);

// ---------------------------------------------------------------------------
//  Document Management (IPFS)
// ---------------------------------------------------------------------------

app.post(
  "/api/v1/documents/upload",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { propertyId, documentType, description } = req.body;

      let ipfsCid = null;

      // Attempt IPFS upload
      try {
        const { create } = await import("ipfs-http-client");
        const ipfs = create({ url: IPFS_API_URL });
        const result = await ipfs.add(req.file.buffer);
        ipfsCid = result.cid.toString();
      } catch {
        // IPFS not available — store hash of content as fallback identifier
        const hash = ethers.keccak256(req.file.buffer);
        ipfsCid = `local-${hash.slice(0, 16)}`;
        logger.warn("IPFS unavailable, using local hash", { cid: ipfsCid });
      }

      const docId = uuidv4();
      const doc = {
        id: docId,
        propertyId: propertyId || null,
        documentType: documentType || "general",
        description: description || "",
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        ipfsCid,
        ipfsUrl: ipfsCid.startsWith("local-")
          ? null
          : `ipfs://${ipfsCid}`,
        uploadedBy: req.user.walletAddress,
        uploadedAt: new Date().toISOString(),
      };

      documents.set(docId, doc);

      logger.info("Document uploaded", { docId, ipfsCid });
      res.status(201).json(doc);
    } catch (err) {
      logger.error("Document upload error", { error: err.message });
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

app.get("/api/v1/documents", authenticate, (req, res) => {
  const { propertyId } = req.query;
  const docs = [];

  for (const [, doc] of documents) {
    if (propertyId && doc.propertyId !== propertyId) continue;
    docs.push(doc);
  }

  res.json({ documents: docs, total: docs.length });
});

app.get("/api/v1/documents/:docId", authenticate, (req, res) => {
  const doc = documents.get(req.params.docId);
  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }
  res.json(doc);
});

app.delete(
  "/api/v1/documents/:docId",
  authenticate,
  requireRole("admin"),
  (req, res) => {
    const doc = documents.get(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    documents.delete(req.params.docId);
    logger.info("Document deleted", { docId: req.params.docId });
    res.json({ message: "Document deleted" });
  }
);

// ---------------------------------------------------------------------------
//  Investor Management (Admin)
// ---------------------------------------------------------------------------

app.get(
  "/api/v1/investors",
  authenticate,
  requireRole("admin"),
  (_req, res) => {
    const list = [];
    for (const [, inv] of investors) {
      list.push(inv);
    }
    res.json({ investors: list, total: list.length });
  }
);

app.get(
  "/api/v1/investors/:walletAddress/verification",
  authenticate,
  async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (!provider || !process.env.IDENTITY_REGISTRY_ADDRESS) {
        // Fallback to local data
        const inv = investors.get(walletAddress.toLowerCase());
        return res.json({
          walletAddress,
          verified: !!inv?.kycApprovedAt,
          source: "local",
        });
      }

      const registry = new ethers.Contract(
        process.env.IDENTITY_REGISTRY_ADDRESS,
        IDENTITY_REGISTRY_ABI,
        provider
      );

      const verified = await registry.isVerified(walletAddress);
      let identity = null;
      try {
        identity = await registry.getIdentity(walletAddress);
      } catch {
        // Might not be registered
      }

      res.json({
        walletAddress,
        verified,
        identity: identity
          ? {
              country: Number(identity.country),
              category: Number(identity.category),
              expiresAt: new Date(
                Number(identity.expiresAt) * 1000
              ).toISOString(),
            }
          : null,
        source: "on-chain",
      });
    } catch (err) {
      logger.error("Verification check error", { error: err.message });
      res.status(500).json({ error: "Failed to check verification" });
    }
  }
);

// ---------------------------------------------------------------------------
//  Demo / Seed-Backed Endpoints (no blockchain required)
// ---------------------------------------------------------------------------

// Properties - returns seed data when blockchain is unavailable
app.get("/api/v1/demo/properties", (_req, res) => {
  res.json({ properties: propertiesStore, total: propertiesStore.length });
});

app.get("/api/v1/demo/properties/:id", (req, res) => {
  const prop = propertiesStore.find(p => p.id === parseInt(req.params.id));
  if (!prop) return res.status(404).json({ error: "Property not found" });
  res.json({ property: prop });
});

// Portfolio - returns seed holdings
app.get("/api/v1/demo/portfolio/:walletAddress", (req, res) => {
  const wallet = req.params.walletAddress.toLowerCase();
  const holdings = portfolioStore.get(wallet) || [];
  const enriched = holdings.map(h => {
    const prop = propertiesStore.find(p => p.id === h.propertyId);
    const currentValue = h.tokens * (prop?.pricePerTokenUSD || 100);
    const costBasis = h.tokens * h.purchasePrice;
    const pnl = currentValue - costBasis;
    const yieldEarned = h.tokens * (prop?.apy || 8) / 100 * (prop?.pricePerTokenUSD || 100) / 12 * 3; // ~3 months
    return {
      ...h,
      propertyName: prop?.name || "Unknown",
      propertyType: prop?.propertyType || "Unknown",
      location: prop?.location || "Unknown",
      currentPrice: prop?.pricePerTokenUSD || 100,
      currentValue,
      costBasis,
      pnl,
      pnlPercent: ((pnl / costBasis) * 100).toFixed(2),
      yieldEarned: Math.round(yieldEarned * 100) / 100,
      apy: prop?.apy || 0
    };
  });
  const totalValue = enriched.reduce((sum, h) => sum + h.currentValue, 0);
  const totalYield = enriched.reduce((sum, h) => sum + h.yieldEarned, 0);
  const totalPnl = enriched.reduce((sum, h) => sum + h.pnl, 0);
  res.json({
    walletAddress: wallet,
    holdings: enriched,
    totalValueUSD: totalValue,
    totalYieldEarned: Math.round(totalYield * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    holdingCount: enriched.length
  });
});

// Yields
app.get("/api/v1/demo/yields", (_req, res) => {
  const allYields = [];
  for (const [propId, records] of yieldRecords) {
    const prop = propertiesStore.find(p => p.id === parseInt(propId));
    records.forEach(r => {
      allYields.push({ ...r, propertyName: prop?.name || "Unknown" });
    });
  }
  allYields.sort((a, b) => new Date(b.periodStart) - new Date(a.periodStart));
  const totalDistributed = allYields.filter(y => y.status === "distributed").reduce((s, y) => s + y.amountUSD, 0);
  const totalPending = allYields.filter(y => y.status === "pending").reduce((s, y) => s + y.amountUSD, 0);
  res.json({ yields: allYields, totalDistributed, totalPending });
});

app.get("/api/v1/demo/yields/:propertyId", (req, res) => {
  const records = yieldRecords.get(req.params.propertyId) || [];
  const prop = propertiesStore.find(p => p.id === parseInt(req.params.propertyId));
  res.json({ propertyId: req.params.propertyId, propertyName: prop?.name, yields: records });
});

// Activity feed
app.get("/api/v1/demo/activity", (_req, res) => {
  const sorted = [...activityStore].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ activity: sorted });
});

// Platform metrics
app.get("/api/v1/demo/metrics", (_req, res) => {
  const tvl = propertiesStore.reduce((sum, p) => sum + (p.tokensSold * p.pricePerTokenUSD), 0);
  const totalValuation = propertiesStore.reduce((sum, p) => sum + p.valuationUSD, 0);
  const totalInvestors = investors.size;
  const totalTokensSold = propertiesStore.reduce((sum, p) => sum + p.tokensSold, 0);
  res.json({ tvl, totalValuation, totalInvestors, totalProperties: propertiesStore.length, totalTokensSold });
});

// KYC - open endpoints for demo
app.get("/api/v1/demo/kyc/:walletAddress", (req, res) => {
  const wallet = req.params.walletAddress.toLowerCase();
  const inv = investors.get(wallet);
  if (inv) {
    return res.json({ status: "verified", investor: inv });
  }
  // Check pending KYC
  for (const [, entry] of kycRequests) {
    if (entry.walletAddress === wallet) {
      return res.json({ status: entry.status, request: entry });
    }
  }
  res.json({ status: "none" });
});

app.post("/api/v1/demo/kyc/submit", (req, res) => {
  const { walletAddress, fullName, email, countryCode, documentType, documentNumber, accreditationLevel } = req.body;
  if (!fullName || !email || !countryCode || !documentType) {
    return res.status(400).json({ error: "Missing required KYC fields" });
  }
  const requestId = uuidv4();
  const kycRequest = {
    id: requestId,
    walletAddress: (walletAddress || "0xdemo").toLowerCase(),
    fullName,
    email,
    countryCode: parseInt(countryCode),
    documentType,
    documentNumber: documentNumber || "",
    accreditationLevel: accreditationLevel || 0,
    status: "pending",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
  };
  kycRequests.set(requestId, kycRequest);
  res.status(201).json({ requestId, status: "pending" });
});

// Buy tokens (demo)
app.post("/api/v1/demo/buy", (req, res) => {
  const { walletAddress, propertyId, tokens } = req.body;
  if (propertyId === undefined || !tokens) {
    return res.status(400).json({ error: "propertyId and tokens required" });
  }
  const prop = propertiesStore.find(p => p.id === parseInt(propertyId));
  if (!prop) return res.status(404).json({ error: "Property not found" });
  const available = prop.totalTokens - prop.tokensSold;
  if (tokens > available) return res.status(400).json({ error: "Not enough tokens available" });

  prop.tokensSold += tokens;
  const wallet = (walletAddress || "0xdemo").toLowerCase();
  const existing = portfolioStore.get(wallet) || [];
  const holding = existing.find(h => h.propertyId === parseInt(propertyId));
  if (holding) {
    holding.tokens += tokens;
  } else {
    existing.push({ propertyId: parseInt(propertyId), tokens, purchasePrice: prop.pricePerTokenUSD, purchasedAt: new Date().toISOString() });
  }
  portfolioStore.set(wallet, existing);

  const inv = investors.get(wallet);
  activityStore.push({
    type: "purchase",
    investor: inv?.fullName || "Demo Investor",
    property: prop.name,
    tokens,
    amount: tokens * prop.pricePerTokenUSD,
    date: new Date().toISOString()
  });

  res.status(201).json({ success: true, tokensRemaining: prop.totalTokens - prop.tokensSold, totalCost: tokens * prop.pricePerTokenUSD });
});

// Demo KYC auto-approve (submit + instant approval for demo)
app.post("/api/v1/demo/kyc/approve", (req, res) => {
  const { walletAddress, fullName, email, countryCode, accreditationLevel } = req.body;
  if (!walletAddress || !fullName) {
    return res.status(400).json({ error: "walletAddress and fullName required" });
  }
  const wallet = walletAddress.toLowerCase();
  const investor = {
    walletAddress: wallet,
    fullName,
    email: email || `${fullName.split(" ")[0].toLowerCase()}@demo.terravault.io`,
    countryCode: parseInt(countryCode) || 170,
    accreditationLevel: accreditationLevel || 0,
    role: "investor",
    kycApprovedAt: new Date().toISOString(),
  };
  investors.set(wallet, investor);
  logger.info("Demo KYC auto-approved", { wallet, fullName });
  res.status(201).json({ status: "approved", investor });
});

// Demo yield distribution (simulate distributing pending yields)
app.post("/api/v1/demo/yields/distribute", (req, res) => {
  const { propertyId } = req.body;
  const records = yieldRecords.get(String(propertyId));
  if (!records) return res.status(404).json({ error: "No yield records for this property" });

  let distributed = 0;
  records.forEach(r => {
    if (r.status === "pending") {
      r.status = "distributed";
      r.distributedAt = new Date().toISOString();
      distributed++;
    }
  });

  const prop = propertiesStore.find(p => p.id === parseInt(propertyId));
  if (distributed > 0 && prop) {
    activityStore.push({
      type: "yield",
      investor: "All holders",
      property: prop.name,
      amount: records.filter(r => r.distributedAt === records[records.length - 1].distributedAt).reduce((s, r) => s + r.amountUSD, 0),
      date: new Date().toISOString()
    });
  }

  res.json({ success: true, periodsDistributed: distributed, propertyName: prop?.name });
});

// Demo auth (no signature required)
app.post("/api/v1/demo/auth", (req, res) => {
  const { walletAddress } = req.body;
  const wallet = (walletAddress || "0x742d35cc6634c0532925a3b844bc9e7595f2bd70").toLowerCase();
  const investor = investors.get(wallet);
  const token = jwt.sign({ walletAddress: wallet, role: investor?.role || "investor" }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, walletAddress: wallet, investor: investor || null });
});

// ---------------------------------------------------------------------------
//  Error Handling
// ---------------------------------------------------------------------------

app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  logger.info(`Terravault API running on port ${PORT}`);
  logger.info(`Mode: ${DEMO_MODE ? "DEMO (no blockchain required)" : "LIVE"}`);
  logger.info(`RPC: ${RPC_URL}`);
  logger.info(`Marketplace: ${MARKETPLACE_ADDRESS || "not configured (demo mode active)"}`);
  if (DEMO_MODE) {
    logger.info(`Demo endpoints: /api/v1/demo/* and /api/v1/* (fallback to in-memory data)`);
    logger.info(`Properties loaded: ${propertiesStore.length}`);
    logger.info(`Investors loaded: ${investors.size}`);
  }
});

module.exports = app;
