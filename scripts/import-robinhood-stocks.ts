import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface RobinhoodDeployment {
  contractAddress: string;
  chainId: number;
}

interface RobinhoodAsset {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  deployments: RobinhoodDeployment[];
  status: "ASSET_STATUS_ACTIVE" | "ASSET_STATUS_INACTIVE" | "ASSET_STATUS_UNSPECIFIED";
  tokenDecimals: number;
  isin: string;
}

interface RobinhoodAssetResponse {
  assets: RobinhoodAsset[];
}

const ASSET_API_URL = "https://api.robinhood.com/rhj/assets";
const STOCK_TOKEN_DOCS_URL = "https://docs.robinhood.com/chain/stock-tokens/";
const CONTRACT_DOCS_URL = "https://docs.robinhood.com/chain/contracts/";
const ACCESSED_AT = "2026-10-01";
const RETRIEVED_AT = "2026-10-01T00:00:00Z";
const REVIEW_AFTER = "2026-11-01";
const ROBINHOOD_CHAIN_ID = 4663;

function assetId(symbol: string): string {
  return `robinhood-${symbol.toLowerCase()}`;
}

function underlyingName(name: string): string {
  return name.replace(/\s*•\s*Robinhood Token$/, "");
}

function underlyingIdFromSymbol(
  symbol: string,
  classification: "public-equity" | "exchange-traded-fund",
): string {
  return `${classification === "exchange-traded-fund" ? "fund" : "equity"}-${symbol.toLowerCase()}`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assetClass(name: string): "public-equity" | "exchange-traded-fund" {
  return /\bETF\b|\bETN\b|\bFund\b|\bTrust\b|\bIndex\b|\bTreasury\b|\bBond\b|\bS&P\b|\bRussell\b|\bNasdaq\b|\bDow Jones\b/i.test(
    name,
  )
    ? "exchange-traded-fund"
    : "public-equity";
}

async function loadAssetResponse(): Promise<{ parsed: RobinhoodAssetResponse; source: string }> {
  const suppliedPath = process.argv[2];
  if (suppliedPath) {
    const source = await readFile(path.resolve(suppliedPath), "utf8");
    return { parsed: JSON.parse(source) as RobinhoodAssetResponse, source };
  }
  const response = await fetch(ASSET_API_URL);
  if (!response.ok) throw new Error(`Unable to download Robinhood assets: ${response.status}`);
  const source = await response.text();
  return { parsed: JSON.parse(source) as RobinhoodAssetResponse, source };
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const response = await loadAssetResponse();
const snapshotRelativePath = `snapshots/robinhood/assets-${ACCESSED_AT}.json`;
const snapshotPath = path.join(repositoryRoot, snapshotRelativePath);
await mkdir(path.dirname(snapshotPath), { recursive: true });
await writeFile(snapshotPath, response.source);
const activeAssets = response.parsed.assets
  .filter((asset) => asset.status === "ASSET_STATUS_ACTIVE")
  .sort((left, right) => left.tokenSymbol.localeCompare(right.tokenSymbol));

const symbols = new Set<string>();
const addresses = new Set<string>();
for (const sourceAsset of activeAssets) {
  if (symbols.has(sourceAsset.tokenSymbol)) {
    throw new Error(`Duplicate Robinhood symbol ${sourceAsset.tokenSymbol}`);
  }
  symbols.add(sourceAsset.tokenSymbol);
  const deployments = sourceAsset.deployments.filter(
    (deployment) => deployment.chainId === ROBINHOOD_CHAIN_ID,
  );
  if (deployments.length !== 1) {
    throw new Error(
      `${sourceAsset.tokenSymbol} must have exactly one Robinhood Chain deployment`,
    );
  }
  const deployment = deployments[0];
  if (!deployment || !/^0x[a-fA-F0-9]{40}$/.test(deployment.contractAddress)) {
    throw new Error(`${sourceAsset.tokenSymbol} has an invalid contract address`);
  }
  const normalizedAddress = deployment.contractAddress.toLowerCase();
  if (addresses.has(normalizedAddress)) {
    throw new Error(`Duplicate Robinhood contract ${deployment.contractAddress}`);
  }
  addresses.add(normalizedAddress);

  const id = assetId(sourceAsset.tokenSymbol);
  const name = underlyingName(sourceAsset.tokenName);
  const classification = assetClass(name);
  const explorerUrl =
    `https://robinhoodchain.blockscout.com/token/${deployment.contractAddress}`;
  const directory = path.join(repositoryRoot, "assets", id);
  await mkdir(directory, { recursive: true });

  const asset = {
    schemaVersion: 2,
    id,
    name: sourceAsset.tokenName,
    symbol: sourceAsset.tokenSymbol,
    underlyingId: underlyingIdFromSymbol(sourceAsset.tokenSymbol, classification),
    instrumentType: "debt-security",
    denominationCurrency: "USD",
    legalStructure: "Tokenized debt security issued by Robinhood Assets (Jersey) Limited.",
    securityType: "Tokenized debt security referencing a publicly traded equity or ETF",
    underlyingRights: "Economic exposure only; holders do not receive legal or beneficial rights in the referenced underlying security.",
    redemptionRights: "Direct subscription and redemption are limited to Authorized Participants after KYB onboarding.",
    organizationRoles: [
      {
        organizationId: "robinhood-assets-jersey",
        roles: ["issuer", "tokenization-provider"],
      },
    ],
    description:
      `Tokenized debt security issued by Robinhood Assets (Jersey) Limited, providing economic exposure to ${name} without ownership rights in the underlying security.`,
    identifiers: [
      { scheme: "isin", value: sourceAsset.isin },
      { scheme: "issuer-id", value: sourceAsset.id },
    ],
    assetClass: classification,
    issuerId: "robinhood-assets-jersey",
    status: "active",
    website: STOCK_TOKEN_DOCS_URL,
    marketDataLinks: [
      {
        provider: "Robinhood",
        type: "issuer",
        url: ASSET_API_URL,
        description: `Official asset metadata and deployment catalog; search for ${sourceAsset.tokenSymbol}.`,
      },
      {
        provider: "Robinhood Chain Blockscout",
        type: "chain-explorer",
        url: explorerUrl,
        description: "Onchain contract, supply, holders, and transfers on Robinhood Chain.",
      },
    ],
    verifiedBy: ["robinhood-assets-api", "robinhood-stock-token-docs"],
  };
  const registryDeployments = [
    {
      chain: "robinhood-chain",
      chainId: ROBINHOOD_CHAIN_ID,
      address: deployment.contractAddress,
      assetNamespace: "erc20",
      assetReference: deployment.contractAddress,
      deploymentType: "issuer-native",
      standardIds: ["erc20", "erc8056"],
      standardEvidence: [
        {
          standardId: "erc20",
          method: "issuer-documentation",
          sourceId: "robinhood-stock-token-docs",
        },
        {
          standardId: "erc8056",
          method: "issuer-documentation",
          sourceId: "robinhood-stock-token-docs",
        },
      ],
      decimals: sourceAsset.tokenDecimals,
      status: "active",
      verifiedBy: ["robinhood-assets-api", "robinhood-chain-explorer"],
    },
  ];
  const compliance = {
    schemaVersion: 1,
    permissioned: "no",
    kycRequired: "yes",
    identityRequired: "no",
    transferRestricted: "no",
    transferEnforcement: "legal-only",
    primaryMarket: {
      access: "authorized-participants-only",
      kycRequired: "unknown",
      kybRequired: "yes",
      notes: "Direct subscription and redemption are limited to Authorized Participants after KYB onboarding.",
    },
    secondaryMarket: {
      access: "permissionless",
      kycRequired: "no",
      kybRequired: "no",
      notes: "The ERC-20 tokens can be held and transferred in compatible wallets, subject to legal jurisdiction restrictions.",
    },
    prohibitedJurisdictions: ["US", "CA", "GB", "CH"],
    eligibleInvestorTypes: ["retail", "professional", "institutional"],
    notes:
      "Direct subscription and redemption are limited to Authorized Participants after KYB onboarding. Tokens are transferable ERC-20s and may be acquired through secondary markets, but offers and sales are prohibited to U.S. persons and restricted in other jurisdictions, including Canada, the United Kingdom, and Switzerland.",
    verifiedBy: ["robinhood-stock-token-docs"],
  };
  const sources = [
    {
      id: "robinhood-assets-api",
      type: "issuer",
      title: `${sourceAsset.tokenSymbol} metadata in Robinhood's official asset API`,
      url: ASSET_API_URL,
      publisher: "Robinhood",
      accessedAt: ACCESSED_AT,
      retrievedAt: RETRIEVED_AT,
      lastVerifiedAt: ACCESSED_AT,
      reviewAfter: REVIEW_AFTER,
      sourceVersion: `live-api:${ACCESSED_AT}`,
      contentHash: sha256(response.source),
      confidence: "high",
      description: `Archived input snapshot: ${snapshotRelativePath}`,
    },
    {
      id: "robinhood-stock-token-docs",
      type: "documentation",
      title: "Robinhood Stock Tokens overview, mechanics, and issuer disclosures",
      url: STOCK_TOKEN_DOCS_URL,
      publisher: "Robinhood",
      accessedAt: ACCESSED_AT,
      retrievedAt: RETRIEVED_AT,
      lastVerifiedAt: ACCESSED_AT,
      reviewAfter: REVIEW_AFTER,
      sourceVersion: `live-page:${ACCESSED_AT}`,
      confidence: "high",
    },
    {
      id: "robinhood-chain-explorer",
      type: "chain-explorer",
      title: `${sourceAsset.tokenSymbol} contract on Robinhood Chain`,
      url: explorerUrl,
      publisher: "Blockscout",
      accessedAt: ACCESSED_AT,
      retrievedAt: RETRIEVED_AT,
      lastVerifiedAt: ACCESSED_AT,
      reviewAfter: REVIEW_AFTER,
      sourceVersion: `onchain:${ACCESSED_AT}`,
      confidence: "high",
    },
  ];
  const valuation = {
    schemaVersion: 1,
    quoteCurrency: "USD",
    valuationType: "reference-price",
    priceSourceUrl: `https://api.robinhood.com/rhj/prices/${sourceAsset.tokenSymbol}`,
    oracle: { provider: "Chainlink", chain: "robinhood-chain" },
    updateFrequency: "15 seconds for the issuer REST price endpoint",
    corporateActionModel: "scaled-ui-multiplier",
    distributionTreatment: "multiplier-adjusted",
    verifiedBy: ["robinhood-assets-api", "robinhood-stock-token-docs"],
  };

  await Promise.all([
    writeFile(path.join(directory, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`),
    writeFile(
      path.join(directory, "deployments.json"),
      `${JSON.stringify(registryDeployments, null, 2)}\n`,
    ),
    writeFile(
      path.join(directory, "compliance.json"),
      `${JSON.stringify(compliance, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "sources.json"), `${JSON.stringify(sources, null, 2)}\n`),
    writeFile(
      path.join(directory, "valuation.json"),
      `${JSON.stringify(valuation, null, 2)}\n`,
    ),
  ]);
}

console.log(
  `Imported ${activeAssets.length} active Robinhood Stock Tokens from the official asset API.`,
);
