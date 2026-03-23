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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error("FATAL: JWT_SECRET environment variable is required. Set it before starting the server.");
  process.exit(1);
}
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || "";
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001";

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

// ---------------------------------------------------------------------------
//  Express App
// ---------------------------------------------------------------------------

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
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
    if (!provider || !MARKETPLACE_ADDRESS) {
      return res.status(503).json({ error: "Blockchain connection unavailable" });
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
    if (!provider || !MARKETPLACE_ADDRESS) {
      return res.status(503).json({ error: "Blockchain connection unavailable" });
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

    if (!provider || !MARKETPLACE_ADDRESS) {
      return res.status(503).json({ error: "Blockchain connection unavailable" });
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
  logger.info(`RPC: ${RPC_URL}`);
  logger.info(`Marketplace: ${MARKETPLACE_ADDRESS || "not configured"}`);
});

module.exports = app;
