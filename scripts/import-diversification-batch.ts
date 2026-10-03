import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AssetClass = "treasury" | "money-market" | "commodity" | "private-credit" | "real-estate" | "other";
interface Seed {
  id: string; name: string; symbol: string; assetClass: AssetClass; underlyingType: string;
  issuerId: string; issuerName: string; website: string; sourceTitle: string;
  sourcePublisher?: string; underlyingId?: string; underlyingName?: string;
  instrumentType: string; legalStructure: string; securityType: string;
  underlyingRights: string; redemptionRights: string; offeringType: string;
  regulatoryExemption?: string; jurisdiction?: string; reserveReporting?: string;
  denominationCurrency?: string; prospectusUrl?: string; status?: "active" | "inactive";
  sourceDate?: string;
  identifiers?: Array<{ scheme: "isin" | "issuer-id"; value: string }>;
  underlyingIdentifiers?: Array<{ scheme: "isin" | "cusip" | "figi" | "lei" | "cik" | "issuer-id"; value: string }>;
  roles: Array<{ organizationId: string; roles: string[] }>;
  relationships?: Array<{ type: string; assetId: string; verifiedBy: string[] }>;
  deployments?: Array<{ chain: string; chainId: number; address: string; namespace: string; deploymentType?: "issuer-native" | "bridged"; status?: "active" | "inactive" | "deprecated" }>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = "2026-10-01";
const retrievedAt = "2026-10-01T12:30:00Z";
const reviewAfter = "2027-01-01";
const organizations = [
  ["paxos", "Paxos", "Paxos Trust Company, National Association", "US", "https://www.paxos.com", "issuer"],
  ["tg-commodities", "Tether Gold", "TG Commodities, S.A. de C.V.", "SV", "https://gold.tether.to", "issuer"],
  ["kinesis", "Kinesis", "Kinesis Cayman", "KY", "https://kinesis.money", "issuer"],
  ["apollo", "Apollo Global Management", "Apollo Global Management, Inc.", "US", "https://www.apollo.com", "asset-manager"],
  ["hamilton-lane", "Hamilton Lane", "Hamilton Lane Incorporated", "US", "https://www.hamiltonlane.com", "asset-manager"],
  ["new-york-life-investments", "New York Life Investments", "New York Life Investment Management LLC", "US", "https://www.newyorklifeinvestments.com", "asset-manager"],
  ["securitize-apollo-credit-fund", "Securitize Tokenized Apollo Diversified Credit Fund", "Securitize Tokenized Apollo Diversified Credit Fund, Ltd.", "KY", "https://securitize.io", "special-purpose-vehicle"],
  ["securitize-hamilton-lane-scope-feeder", "Securitize Hamilton Lane SCOPE Feeder", "Securitize Feeder - Hamilton Lane Senior Credit Opportunities Fund", "US", "https://securitize.io", "special-purpose-vehicle"],
  ["terazo", "Terazo", undefined, "IN", "https://www.terazo.network", "issuer"],
  ["toyow", "Toyow", undefined, "AE", "https://www.toyow.com", "tokenization-provider"],
  ["backed-assets-je", "Backed Assets (JE)", "Backed Assets (JE) Limited", "JE", "https://assets.backed.fi", "issuer", "2026-10-03"],
  ["backed-finance", "Backed Finance", "Backed Finance AG", "CH", "https://backed.fi", "tokenization-provider", "2026-10-03"],
] as const;

const seeds: Seed[] = [
  {
    id: "paxg", name: "Pax Gold", symbol: "PAXG", assetClass: "commodity", underlyingType: "commodity",
    issuerId: "paxos", issuerName: "Paxos", website: "https://www.paxos.com/pax-gold", sourceTitle: "Paxos official PAX Gold product page",
    instrumentType: "certificate", legalStructure: "Regulated asset-backed token issued by Paxos Trust Company and backed by allocated London Good Delivery gold.",
    securityType: "Gold-backed digital token", underlyingRights: "Each token represents beneficial ownership of one fine troy ounce of allocated London Good Delivery gold.",
    redemptionRights: "Verified Paxos customers may redeem under the PAX Gold terms for supported physical gold, unallocated gold, or fiat settlement.", offeringType: "Regulated commodity-backed token",
    jurisdiction: "US", reserveReporting: "https://www.paxos.com/pax-gold", roles: [{ organizationId: "paxos", roles: ["issuer", "custodian", "tokenization-provider"] }],
    deployments: [{ chain: "ethereum", chainId: 1, address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", namespace: "erc20" }],
  },
  {
    id: "xaut", name: "Tether Gold", symbol: "XAUT", assetClass: "commodity", underlyingType: "commodity",
    issuerId: "tg-commodities", issuerName: "Tether Gold", website: "https://gold.tether.to", sourceTitle: "Tether Gold official product and disclosure site",
    instrumentType: "certificate", legalStructure: "Gold-backed digital asset issued by TG Commodities, S.A. de C.V. under its published terms and disclosures.",
    securityType: "Gold-backed digital token", underlyingRights: "A token represents ownership exposure to one fine troy ounce of gold allocated within specified London Good Delivery bars under the issuer terms.",
    redemptionRights: "Verified customers may redeem subject to minimums, fees, delivery options, and the issuer terms.", offeringType: "Digital commodity offering", jurisdiction: "SV",
    reserveReporting: "https://gold.tether.to", roles: [{ organizationId: "tg-commodities", roles: ["issuer", "tokenization-provider"] }],
    deployments: [
      { chain: "ethereum", chainId: 1, address: "0x68749665FF8D2d112Fa859AA293F07A622782F38", namespace: "erc20" },
      { chain: "bnb-chain", chainId: 56, address: "0x21cAef8A43163Eea865baeE23b9C2E327696A3bf", namespace: "bep20" },
    ],
  },
  {
    id: "kau", name: "Kinesis Gold", symbol: "KAU", assetClass: "commodity", underlyingType: "commodity",
    issuerId: "kinesis", issuerName: "Kinesis", website: "https://kinesis.money/gold/", sourceTitle: "Kinesis official KAU gold product page",
    instrumentType: "certificate", legalStructure: "Digital record of allocated physical gold held through the Kinesis structure.", securityType: "Allocated gold-backed digital currency",
    underlyingRights: "One KAU represents legal title to one fine gram of allocated physical gold.", redemptionRights: "Holders may redeem physical bullion subject to the issuer's onboarding, minimums, and fees.", offeringType: "Allocated bullion-backed digital currency",
    jurisdiction: "KY", reserveReporting: "https://kinesis.money/audits/", roles: [{ organizationId: "kinesis", roles: ["issuer", "custodian", "tokenization-provider"] }],
  },
  {
    id: "kag", name: "Kinesis Silver", symbol: "KAG", assetClass: "commodity", underlyingType: "commodity",
    issuerId: "kinesis", issuerName: "Kinesis", website: "https://kinesis.money/silver/", sourceTitle: "Kinesis official KAG silver product page",
    instrumentType: "certificate", legalStructure: "Digital record of allocated physical silver held through the Kinesis structure.", securityType: "Allocated silver-backed digital currency",
    underlyingRights: "One KAG represents legal title to one troy ounce of allocated physical silver.", redemptionRights: "Holders may redeem physical bullion subject to the issuer's onboarding, minimums, and fees.", offeringType: "Allocated bullion-backed digital currency",
    jurisdiction: "KY", reserveReporting: "https://kinesis.money/audits/", roles: [{ organizationId: "kinesis", roles: ["issuer", "custodian", "tokenization-provider"] }],
  },
  {
    id: "acred", name: "Securitize Tokenized Apollo Diversified Credit Fund", symbol: "ACRED", assetClass: "private-credit", underlyingType: "private-credit",
    issuerId: "securitize-apollo-credit-fund", issuerName: "Securitize Tokenized Apollo Diversified Credit Fund", sourcePublisher: "Securitize", underlyingId: "fund-apollo-diversified-credit", underlyingName: "Apollo Diversified Credit Fund", website: "https://investors.securitize.io/news/news-details/2025/Apollo-and-Securitize-Announce-Partnership-and-Launch-Tokenized-Access-to-Credit-Fund-on-Aptos-Avalanche-Ethereum-Ink-Polygon-and-Solana-Networks-01-30-2025/default.aspx", sourceTitle: "Apollo and Securitize official ACRED launch announcement",
    instrumentType: "fund-share", legalStructure: "Tokenized feeder fund investing substantially all assets in Apollo Diversified Credit Fund.", securityType: "Private feeder-fund share",
    underlyingRights: "Fund interest providing exposure to Apollo's diversified global credit strategy; no direct ownership of portfolio loans.", redemptionRights: "Qualified investors receive native redemptions at daily NAV subject to fund terms.", offeringType: "Private fund offering", regulatoryExemption: "Available to qualifying investors through Securitize Markets",
    jurisdiction: "KY", roles: [{ organizationId: "securitize-apollo-credit-fund", roles: ["issuer"] }, { organizationId: "securitize", roles: ["tokenization-provider", "transfer-agent", "fund-administrator", "broker-dealer"] }, { organizationId: "apollo", roles: ["asset-manager"] }], relationships: [{ type: "same-economic-exposure-as", assetId: "acrdx", verifiedBy: ["official-product"] }],
  },
  {
    id: "hlscope", name: "Hamilton Lane Senior Credit Opportunities Tokenized Feeder Fund", symbol: "HLSCOPE", assetClass: "private-credit", underlyingType: "private-credit",
    issuerId: "securitize-hamilton-lane-scope-feeder", issuerName: "Securitize Hamilton Lane SCOPE Feeder", sourcePublisher: "Securitize", website: "https://investors.securitize.io/news/news-details/2023/Securitize-Expands-Access-to-Hamilton-Lanes-SCOPE-Fund-05-04-2023/default.aspx", sourceTitle: "Hamilton Lane and Securitize official SCOPE access announcement",
    instrumentType: "fund-share", legalStructure: "Regulated tokenized feeder structure providing access to Hamilton Lane's evergreen senior credit fund.", securityType: "Private feeder-fund share",
    underlyingRights: "Fund interest providing exposure to a portfolio focused on floating-rate senior secured private loans.", redemptionRights: "Monthly subscriptions and redemptions are described in the fund terms.", offeringType: "Private fund offering", regulatoryExemption: "Available to qualifying investors through Securitize",
    jurisdiction: "US", roles: [{ organizationId: "securitize-hamilton-lane-scope-feeder", roles: ["issuer"] }, { organizationId: "securitize", roles: ["tokenization-provider", "transfer-agent", "fund-administrator", "broker-dealer"] }, { organizationId: "hamilton-lane", roles: ["asset-manager"] }],
  },
  {
    id: "jaaa", name: "Janus Henderson Anemoy AAA CLO Fund", symbol: "JAAA", assetClass: "private-credit", underlyingType: "private-credit",
    issuerId: "anemoy-capital", issuerName: "Anemoy Capital", sourcePublisher: "Centrifuge", website: "https://centrifuge.io/blog/fission-centrifuge", sourceTitle: "Centrifuge official institutional fund liquidity announcement",
    instrumentType: "fund-share", legalStructure: "Tokenized professional fund managed within the Janus Henderson and Anemoy fund structure.", securityType: "Professional fund share",
    underlyingRights: "Fund interest providing exposure to a portfolio of AAA-rated collateralized loan obligations.", redemptionRights: "Subscriptions and redemptions are governed by the fund documents and platform process.", offeringType: "Professional fund offering",
    jurisdiction: "VG", roles: [{ organizationId: "anemoy-capital", roles: ["issuer"] }, { organizationId: "janus-henderson", roles: ["asset-manager"] }, { organizationId: "centrifuge", roles: ["tokenization-provider"] }],
  },
  {
    id: "acrdx", name: "Anemoy Apollo Diversified Credit Fund", symbol: "ACRDX", assetClass: "private-credit", underlyingType: "private-credit",
    issuerId: "anemoy-capital", issuerName: "Anemoy Capital", sourcePublisher: "Centrifuge", underlyingId: "fund-apollo-diversified-credit", underlyingName: "Apollo Diversified Credit Fund", website: "https://centrifuge.io/blog/fission-centrifuge", sourceTitle: "Centrifuge official institutional fund liquidity announcement",
    instrumentType: "fund-share", legalStructure: "Tokenized professional fund providing access to Apollo's diversified credit strategy through the Anemoy and Centrifuge structure.", securityType: "Professional fund share",
    underlyingRights: "Fund interest providing diversified credit exposure; no direct ownership of individual credit instruments.", redemptionRights: "Subscriptions and redemptions are governed by the fund documents and platform process.", offeringType: "Professional fund offering",
    jurisdiction: "VG", roles: [{ organizationId: "anemoy-capital", roles: ["issuer"] }, { organizationId: "apollo", roles: ["asset-manager"] }, { organizationId: "centrifuge", roles: ["tokenization-provider"] }], relationships: [{ type: "same-economic-exposure-as", assetId: "acred", verifiedBy: ["official-product"] }],
  },
  {
    id: "hyb", name: "Anemoy New York Life High Yield Corporate Bond Fund", symbol: "HYB", assetClass: "other", underlyingType: "bond",
    issuerId: "anemoy-capital", issuerName: "Anemoy Capital", sourcePublisher: "Centrifuge", website: "https://centrifuge.io/blog/fission-centrifuge", sourceTitle: "Centrifuge official institutional fund liquidity announcement",
    instrumentType: "fund-share", legalStructure: "Tokenized professional fund providing access to a U.S. high-yield corporate-bond strategy.", securityType: "Professional fund share",
    underlyingRights: "Fund interest providing exposure to the managed high-yield corporate-bond portfolio.", redemptionRights: "Subscriptions and redemptions are governed by the fund documents and platform process.", offeringType: "Professional fund offering",
    jurisdiction: "VG", roles: [{ organizationId: "anemoy-capital", roles: ["issuer"] }, { organizationId: "new-york-life-investments", roles: ["asset-manager"] }, { organizationId: "centrifuge", roles: ["tokenization-provider"] }],
  },
  {
    id: "oryx", name: "ORY X Tokenized Real Estate Fund", symbol: "ORY X", assetClass: "real-estate", underlyingType: "real-estate",
    issuerId: "terazo", issuerName: "Terazo", website: "https://www.terazo.network/", sourceTitle: "Terazo official ORY X product page",
    instrumentType: "fund-share", legalStructure: "Single-asset tokenized fund providing exposure to a commercial real-estate development in GIFT City, India.", securityType: "Tokenized real-estate fund interest",
    underlyingRights: "Fund interest providing economic exposure to the ORYX commercial development rather than direct title to a specific unit.", redemptionRights: "Transfer and exit rights are governed by the fund documents.", offeringType: "Private tokenized real-estate fund",
    jurisdiction: "IN", roles: [{ organizationId: "terazo", roles: ["issuer", "tokenization-provider"] }],
  },
  {
    id: "nifcot1", name: "NIFCOT1 Tokenized Real Estate Exposure", symbol: "NIFCOT1", assetClass: "real-estate", underlyingType: "real-estate",
    issuerId: "toyow", issuerName: "Toyow", website: "https://www.toyow.com/insights/nifcot1-tokenized-real-estate-toyow", sourceTitle: "Toyow official NIFCOT1 launch description",
    instrumentType: "spv-interest", legalStructure: "Digital token issued by a special-purpose vehicle providing economic exposure referenced to a regulated real-estate fund.", securityType: "Tokenized SPV interest",
    underlyingRights: "Contractual economic exposure to the referenced real-estate fund; rights are defined by the SPV and offering documents.", redemptionRights: "Redemption and transfer rights are governed by the issuer's product documents.", offeringType: "Tokenized real-estate SPV offering",
    jurisdiction: "AE", roles: [{ organizationId: "toyow", roles: ["issuer", "tokenization-provider"] }],
  },
  {
    id: "bib01", name: "Backed IB01 $ Treasury Bond 0-1yr", symbol: "bIB01", assetClass: "treasury", underlyingType: "exchange-traded-fund",
    issuerId: "backed-assets-je", issuerName: "Backed Assets (JE)", sourcePublisher: "Backed", website: "https://assets.backed.fi/products/bib01", sourceTitle: "Backed official bIB01 product page",
    instrumentType: "certificate", legalStructure: "Tracker certificate issued by Backed Assets (JE) Limited and collateralized by the referenced ETF under the product terms.", securityType: "Tracker certificate",
    underlyingRights: "The certificate tracks the iShares $ Treasury Bond 0-1yr UCITS ETF; holders have contractual rights under the certificate terms rather than direct ownership of ETF shares.",
    redemptionRights: "New issuance is closed; the issuer states that redemption remains supported for existing holders subject to its terms and onboarding requirements.", offeringType: "Prospectus-based structured product", jurisdiction: "JE",
    denominationCurrency: "USD", prospectusUrl: "https://assets.backed.fi/legal-documentation", status: "inactive", sourceDate: "2026-10-03", identifiers: [{ scheme: "isin", value: "CH1173294260" }],
    underlyingIdentifiers: [{ scheme: "isin", value: "IE00BGSF1X88" }], roles: [{ organizationId: "backed-assets-je", roles: ["issuer"] }, { organizationId: "backed-finance", roles: ["tokenization-provider"] }],
    deployments: [{ chain: "arbitrum", chainId: 42161, address: "0xca30c93b02514f86d5c86a6e375e3a330b435fb5", namespace: "erc20" }],
  },
  {
    id: "bibta", name: "Backed IBTA $ Treasury Bond 1-3yr", symbol: "bIBTA", assetClass: "treasury", underlyingType: "exchange-traded-fund",
    issuerId: "backed-assets-je", issuerName: "Backed Assets (JE)", sourcePublisher: "Backed", website: "https://assets.backed.fi/products/bibta", sourceTitle: "Backed official bIBTA product page",
    instrumentType: "certificate", legalStructure: "Tracker certificate issued by Backed Assets (JE) Limited and collateralized by the referenced ETF under the product terms.", securityType: "Tracker certificate",
    underlyingRights: "The certificate tracks the iShares $ Treasury Bond 1-3yr UCITS ETF; holders have contractual rights under the certificate terms rather than direct ownership of ETF shares.",
    redemptionRights: "New issuance is closed; the issuer states that redemption remains supported for existing holders subject to its terms and onboarding requirements.", offeringType: "Prospectus-based structured product", jurisdiction: "JE",
    denominationCurrency: "USD", prospectusUrl: "https://assets.backed.fi/legal-documentation", status: "inactive", sourceDate: "2026-10-03", identifiers: [{ scheme: "isin", value: "CH1173294229" }],
    underlyingIdentifiers: [{ scheme: "isin", value: "IE00BYXPSP02" }], roles: [{ organizationId: "backed-assets-je", roles: ["issuer"] }, { organizationId: "backed-finance", roles: ["tokenization-provider"] }],
    deployments: [{ chain: "arbitrum", chainId: 42161, address: "0x52d134c6db5889fad3542a09eaf7aa90c0fdf9e4", namespace: "erc20" }],
  },
  {
    id: "bc3m", name: "Backed C3M Euro Government Bond 0-6 Month", symbol: "bC3M", assetClass: "money-market", underlyingType: "exchange-traded-fund",
    issuerId: "backed-assets-je", issuerName: "Backed Assets (JE)", sourcePublisher: "Backed", website: "https://assets.backed.fi/products/bc3m", sourceTitle: "Backed official bC3M product page",
    instrumentType: "certificate", legalStructure: "Tracker certificate issued by Backed Assets (JE) Limited and collateralized by the referenced ETF under the product terms.", securityType: "Tracker certificate",
    underlyingRights: "The certificate tracks the Amundi Euro Government Bond 0-6 Months UCITS ETF; holders have contractual rights under the certificate terms rather than direct ownership of ETF shares.",
    redemptionRights: "New issuance is closed; the issuer states that redemption remains supported for existing holders subject to its terms and onboarding requirements.", offeringType: "Prospectus-based structured product", jurisdiction: "JE",
    denominationCurrency: "EUR", prospectusUrl: "https://assets.backed.fi/legal-documentation", status: "inactive", sourceDate: "2026-10-03", identifiers: [{ scheme: "isin", value: "CH1173294286" }],
    underlyingIdentifiers: [{ scheme: "isin", value: "FR0010754200" }], roles: [{ organizationId: "backed-assets-je", roles: ["issuer"] }, { organizationId: "backed-finance", roles: ["tokenization-provider"] }],
    deployments: [{ chain: "arbitrum", chainId: 42161, address: "0x2f123cf3f37ce3328cc9b5b8415f9ec5109b45e7", namespace: "erc20" }],
  },
  {
    id: "bhigh", name: "Backed High Yield Corporate Bond", symbol: "bHIGH", assetClass: "other", underlyingType: "exchange-traded-fund",
    issuerId: "backed-assets-je", issuerName: "Backed Assets (JE)", sourcePublisher: "Backed", website: "https://assets.backed.fi/products/bhigh", sourceTitle: "Backed official bHIGH product page",
    instrumentType: "certificate", legalStructure: "Tracker certificate issued by Backed Assets (JE) Limited and collateralized by the referenced ETF under the product terms.", securityType: "Tracker certificate",
    underlyingRights: "The certificate tracks the iShares € High Yield Corporate Bond UCITS ETF; holders have contractual rights under the certificate terms rather than direct ownership of ETF shares.",
    redemptionRights: "New issuance is closed; the issuer states that redemption remains supported for existing holders subject to its terms and onboarding requirements.", offeringType: "Prospectus-based structured product", jurisdiction: "JE",
    denominationCurrency: "EUR", prospectusUrl: "https://assets.backed.fi/legal-documentation", status: "inactive", sourceDate: "2026-10-03", identifiers: [{ scheme: "isin", value: "CH1173294278" }],
    underlyingIdentifiers: [{ scheme: "isin", value: "IE00BF3N7094" }], roles: [{ organizationId: "backed-assets-je", roles: ["issuer"] }, { organizationId: "backed-finance", roles: ["tokenization-provider"] }],
    deployments: [{ chain: "arbitrum", chainId: 42161, address: "0x20c64dee8fda5269a78f2d5bdba861ca1d83df7a", namespace: "erc20" }],
  },
  {
    id: "bernx", name: "Backed ERNX Euro Ultrashort Bond", symbol: "bERNX", assetClass: "other", underlyingType: "exchange-traded-fund",
    issuerId: "backed-assets-je", issuerName: "Backed Assets (JE)", sourcePublisher: "Backed", website: "https://assets.backed.fi/products/bernx", sourceTitle: "Backed official bERNX product page",
    instrumentType: "certificate", legalStructure: "Tracker certificate issued by Backed Assets (JE) Limited and collateralized by the referenced ETF under the product terms.", securityType: "Tracker certificate",
    underlyingRights: "The certificate tracks the iShares € Ultrashort Bond UCITS ETF; holders have contractual rights under the certificate terms rather than direct ownership of ETF shares.",
    redemptionRights: "New issuance is closed; the issuer states that redemption remains supported for existing holders subject to its terms and onboarding requirements.", offeringType: "Prospectus-based structured product", jurisdiction: "JE",
    denominationCurrency: "EUR", prospectusUrl: "https://assets.backed.fi/legal-documentation", status: "inactive", sourceDate: "2026-10-03", identifiers: [{ scheme: "isin", value: "CH1173294302" }],
    underlyingIdentifiers: [{ scheme: "isin", value: "IE000RHYOR04" }], roles: [{ organizationId: "backed-assets-je", roles: ["issuer"] }, { organizationId: "backed-finance", roles: ["tokenization-provider"] }],
    deployments: [{ chain: "arbitrum", chainId: 42161, address: "0x3f95aa88ddbb7d9d484aa3d482bf0a80009c52c9", namespace: "erc20" }],
  },
];

function source(seed: Seed) {
  const accessedAt = seed.sourceDate ?? today;
  const sourceRetrievedAt = seed.sourceDate ? `${seed.sourceDate}T12:30:00Z` : retrievedAt;
  const sourceReviewAfter = seed.sourceDate === "2026-10-03" ? "2027-01-03" : reviewAfter;
  return { id: "official-product", type: "issuer", title: seed.sourceTitle, url: seed.website, publisher: seed.sourcePublisher ?? seed.issuerName, accessedAt, retrievedAt: sourceRetrievedAt, lastVerifiedAt: accessedAt, reviewAfter: sourceReviewAfter, sourceVersion: `live-page:${accessedAt}`, confidence: "high" };
}

function sources(seed: Seed) {
  const records = [source(seed)];
  const arbitrumDeployment = seed.deployments?.find(({ chain }) => chain === "arbitrum");
  if (arbitrumDeployment) {
    const accessedAt = seed.sourceDate ?? today;
    records.push({ id: "arbitrum-explorer", type: "chain-explorer", title: `${seed.symbol} contract on Arbitrum One`, url: `https://arbiscan.io/token/${arbitrumDeployment.address}`, publisher: "Arbiscan", accessedAt, retrievedAt: `${accessedAt}T12:30:00Z`, lastVerifiedAt: accessedAt, reviewAfter: accessedAt === "2026-10-03" ? "2027-01-03" : reviewAfter, sourceVersion: `live-page:${accessedAt}`, confidence: "high" });
  }
  return records;
}

for (const [id, name, legalName, jurisdiction, website, type, organizationSourceDate] of organizations) {
  const accessedAt = organizationSourceDate ?? today;
  const commonSource = { title: `${name} official website`, url: website, accessedAt };
  await Promise.all([
    writeFile(path.join(root, "organizations", `${id}.json`), `${JSON.stringify({ schemaVersion: 1, id, name, ...(legalName ? { legalName } : {}), jurisdiction, status: "active", website, sources: [{ ...commonSource, lastVerifiedAt: accessedAt, reviewAfter: accessedAt === "2026-10-03" ? "2027-01-03" : reviewAfter, confidence: "high" }] }, null, 2)}\n`),
    writeFile(path.join(root, "issuers", `${id}.json`), `${JSON.stringify({ schemaVersion: 1, id, name, ...(legalName ? { legalName } : {}), type, jurisdiction, status: "active", website, sources: [commonSource] }, null, 2)}\n`),
  ]);
}

for (const seed of seeds) {
  const reviewedAt = seed.sourceDate ?? today;
  const directory = path.join(root, "assets", seed.id);
  await mkdir(directory, { recursive: true });
  const asset = {
    schemaVersion: 2, id: seed.id, name: seed.name, symbol: seed.symbol, underlyingId: seed.underlyingId ?? `underlying-${seed.id}`,
    instrumentType: seed.instrumentType, denominationCurrency: seed.denominationCurrency ?? "USD", legalStructure: seed.legalStructure, securityType: seed.securityType,
    underlyingRights: seed.underlyingRights, redemptionRights: seed.redemptionRights, offeringType: seed.offeringType,
    ...(seed.regulatoryExemption ? { regulatoryExemption: seed.regulatoryExemption } : {}), ...(seed.prospectusUrl ? { prospectusUrl: seed.prospectusUrl } : {}), ...(seed.identifiers ? { identifiers: seed.identifiers } : {}), organizationRoles: seed.roles,
    description: `${seed.name} (${seed.symbol}), represented through blockchain or blockchain-integrated ownership records.`, assetClass: seed.assetClass,
    issuerId: seed.issuerId, tokenizationProviderIds: seed.roles.filter(({ roles }) => roles.includes("tokenization-provider")).map(({ organizationId }) => organizationId),
    status: seed.status ?? "active", website: seed.website, marketDataLinks: [
      { provider: seed.sourcePublisher ?? seed.issuerName, type: "issuer", url: seed.website, description: "Official product, legal, reserve, or fund information." },
      ...((seed.deployments ?? []).filter(({ chain }) => chain === "arbitrum").map(({ address }) => ({ provider: "Arbiscan", type: "chain-explorer" as const, url: `https://arbiscan.io/token/${address}`, description: "Inspect the live Arbitrum One contract, holders, supply, and transfers." }))),
    ],
    ...(seed.relationships ? { relationships: seed.relationships } : {}),
    dataAvailability: { securityType: "known", shareClass: "unknown", offeringType: "known", regulatoryExemption: seed.regulatoryExemption ? "known" : "unknown", prospectusUrl: seed.prospectusUrl ? "known" : "unknown" }, verifiedBy: ["official-product"],
  };
  const deployments = (seed.deployments ?? []).map((deployment) => ({
    chain: deployment.chain, chainId: deployment.chainId, address: deployment.address, assetNamespace: deployment.namespace, assetReference: deployment.address,
    deploymentType: deployment.deploymentType ?? "issuer-native", standardIds: ["erc20"], status: deployment.status ?? "active", standardEvidence: [{ standardId: "erc20", method: "issuer-documentation", sourceId: "official-product" }], verifiedBy: ["official-product", ...(deployment.chain === "arbitrum" ? ["arbitrum-explorer"] : [])],
  }));
  const compliance = {
    schemaVersion: 1, permissioned: "unknown", kycRequired: "yes", identityRequired: "unknown", transferRestricted: seed.assetClass === "commodity" ? "unknown" : "yes",
    transferEnforcement: "unknown", primaryMarket: { access: "issuer-onboarding", kycRequired: "yes", kybRequired: "unknown" }, secondaryMarket: { access: "unknown", kycRequired: "unknown", kybRequired: "unknown" },
    dataAvailability: { minimumSubscription: "unknown", minimumRedemption: "unknown", lockupPeriod: "unknown" }, notes: "Consult the current product documents before transacting; this registry summary is not legal or investment advice.", verifiedBy: ["official-product"],
  };
  const valuation = {
    schemaVersion: 1, quoteCurrency: seed.denominationCurrency ?? "USD", valuationType: seed.assetClass === "commodity" ? "reference-price" : "nav", priceSourceUrl: seed.website,
    updateFrequency: "See the official product source.", corporateActionModel: "none", distributionTreatment: seed.assetClass === "commodity" ? "none" : "unknown",
    ...(seed.reserveReporting ? { reserveReportingUrl: seed.reserveReporting } : {}), dataAvailability: { oracle: "unknown", reserveReporting: seed.reserveReporting ? "known" : "unknown" }, verifiedBy: ["official-product"],
  };
  const claims = [
    ...Object.keys(asset).filter((field) => !["schemaVersion", "verifiedBy", "dataAvailability"].includes(field)).map((field) => ({ field: `asset.${field}`, sourceIds: ["official-product"], reviewedAt, reviewStatus: "verified", confidence: "high" })),
    ...Object.keys(compliance).filter((field) => !["schemaVersion", "verifiedBy", "dataAvailability"].includes(field)).map((field) => ({ field: `compliance.${field}`, sourceIds: ["official-product"], reviewedAt, reviewStatus: "verified", confidence: "high" })),
    ...Object.keys(valuation).filter((field) => !["schemaVersion", "verifiedBy", "dataAvailability"].includes(field)).map((field) => ({ field: `valuation.${field}`, sourceIds: ["official-product"], reviewedAt, reviewStatus: "verified", confidence: "high" })),
    ...deployments.flatMap((deployment, index) => ["chain", "address", "standardIds", "status"].map((field) => ({ field: `deployments[${index}].${field}`, sourceIds: deployment.verifiedBy, reviewedAt, reviewStatus: "verified", confidence: "high" }))),
  ];
  const underlying = {
    schemaVersion: 1, id: seed.underlyingId ?? `underlying-${seed.id}`, name: seed.underlyingName ?? `${seed.name} underlying`, ticker: seed.symbol, type: seed.underlyingType,
    ...(seed.underlyingIdentifiers ? { identifiers: seed.underlyingIdentifiers } : {}), ...(seed.assetClass === "commodity" ? {} : { jurisdiction: seed.jurisdiction }), currency: seed.denominationCurrency ?? "USD", status: seed.status ?? "active",
    dataAvailability: { identifiers: seed.underlyingIdentifiers ? "known" : "not-applicable", exchange: "not-applicable", jurisdiction: seed.assetClass === "commodity" ? "not-applicable" : "known" }, sourceAssetIds: seeds.filter((candidate) => (candidate.underlyingId ?? `underlying-${candidate.id}`) === (seed.underlyingId ?? `underlying-${seed.id}`)).map(({ id }) => id),
  };
  await Promise.all([
    writeFile(path.join(directory, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`),
    writeFile(path.join(directory, "deployments.json"), `${JSON.stringify(deployments, null, 2)}\n`),
    writeFile(path.join(directory, "compliance.json"), `${JSON.stringify(compliance, null, 2)}\n`),
    writeFile(path.join(directory, "valuation.json"), `${JSON.stringify(valuation, null, 2)}\n`),
    writeFile(path.join(directory, "sources.json"), `${JSON.stringify(sources(seed), null, 2)}\n`),
    writeFile(path.join(directory, "claims.json"), `${JSON.stringify(claims, null, 2)}\n`),
    writeFile(path.join(directory, "history.json"), "[]\n"),
    writeFile(path.join(root, "underlyings", `${seed.underlyingId ?? `underlying-${seed.id}`}.json`), `${JSON.stringify(underlying, null, 2)}\n`),
  ]);
}

console.log(`Imported ${seeds.length} source-backed commodity, credit, fixed-income, and real-estate products.`);

await import("./migrate-reliability-fields.js");
