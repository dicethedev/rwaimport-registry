import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AssetClass =
  | "treasury"
  | "money-market"
  | "private-credit"
  | "public-equity"
  | "other";

interface DeploymentSeed {
  chain: string;
  chainId?: number;
  address: string;
  namespace: string;
  standards: string[];
}

interface ProductSeed {
  id: string;
  name: string;
  symbol: string;
  underlyingId: string;
  underlyingName: string;
  underlyingType: string;
  assetClass: AssetClass;
  issuerId: string;
  organizations: Array<{ organizationId: string; roles: string[] }>;
  website: string;
  sourceTitle: string;
  instrumentType?: string;
  legalStructure: string;
  securityType: string;
  underlyingRights: string;
  redemptionRights: string;
  offeringType: string;
  regulatoryExemption?: string;
  investorPreset: "us-registered" | "us-private" | "non-us-professional" | "institutional";
  minimumSubscription?: string;
  valuationType?: string;
  distributionTreatment?: string;
  deployments?: DeploymentSeed[];
  contractSource?: string;
  contractSourceTitle?: string;
}

interface OrganizationSeed {
  id: string;
  name: string;
  legalName?: string;
  jurisdiction?: string;
  website: string;
  type: "asset-manager" | "issuer" | "tokenization-provider" | "other";
}

const ACCESSED_AT = "2026-10-01";
const RETRIEVED_AT = "2026-10-01T00:00:00Z";
const REVIEW_AFTER = "2027-01-01";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const organizations: OrganizationSeed[] = [
  { id: "blackrock", name: "BlackRock", legalName: "BlackRock, Inc.", jurisdiction: "US", website: "https://www.blackrock.com", type: "asset-manager" },
  { id: "securitize", name: "Securitize", jurisdiction: "US", website: "https://securitize.io", type: "tokenization-provider" },
  { id: "bny-mellon", name: "BNY", legalName: "The Bank of New York Mellon Corporation", jurisdiction: "US", website: "https://www.bny.com", type: "other" },
  { id: "franklin-templeton", name: "Franklin Templeton", legalName: "Franklin Resources, Inc.", jurisdiction: "US", website: "https://www.franklintempleton.com", type: "asset-manager" },
  { id: "hashnote", name: "Hashnote", jurisdiction: "US", website: "https://www.hashnote.com", type: "issuer" },
  { id: "circle", name: "Circle", legalName: "Circle Internet Group, Inc.", jurisdiction: "US", website: "https://www.circle.com", type: "tokenization-provider" },
  { id: "superstate", name: "Superstate", jurisdiction: "US", website: "https://superstate.com", type: "tokenization-provider" },
  { id: "invesco", name: "Invesco", legalName: "Invesco Ltd.", jurisdiction: "US", website: "https://www.invesco.com", type: "asset-manager" },
  { id: "bitwise", name: "Bitwise Asset Management", jurisdiction: "US", website: "https://bitwiseinvestments.com", type: "asset-manager" },
  { id: "openeden", name: "OpenEden", jurisdiction: "SG", website: "https://openeden.com", type: "tokenization-provider" },
  { id: "anemoy-capital", name: "Anemoy Capital", jurisdiction: "VG", website: "https://anemoy.io", type: "issuer" },
  { id: "janus-henderson", name: "Janus Henderson Investors", jurisdiction: "GB", website: "https://www.janushenderson.com", type: "asset-manager" },
  { id: "centrifuge", name: "Centrifuge", website: "https://centrifuge.io", type: "tokenization-provider" },
  { id: "wisdomtree-digital-trust", name: "WisdomTree Digital Trust", jurisdiction: "US", website: "https://www.wisdomtree.com/onchain/tokenized-funds", type: "issuer" },
  { id: "wisdomtree-asset-management", name: "WisdomTree Asset Management", jurisdiction: "US", website: "https://www.wisdomtree.com", type: "asset-manager" },
  { id: "invesco-short-duration-government-fund", name: "Invesco Short Duration US Government Securities Fund", jurisdiction: "US", website: "https://superstate.com/assets/ustb", type: "issuer" },
  { id: "bitwise-crypto-carry-fund", name: "Bitwise Crypto Carry Fund", jurisdiction: "US", website: "https://superstate.com/assets/uscc", type: "issuer" },
  { id: "pricewaterhousecoopers", name: "PricewaterhouseCoopers", website: "https://www.pwc.com", type: "other" },
  { id: "jp-morgan", name: "J.P. Morgan", jurisdiction: "US", website: "https://www.jpmorgan.com", type: "other" },
  { id: "trident-trust", name: "Trident Trust", website: "https://www.tridenttrust.com", type: "other" },
  { id: "mha-cayman", name: "MHA Cayman", jurisdiction: "KY", website: "https://www.mha.ky", type: "other" },
  { id: "chronicle", name: "Chronicle", website: "https://chroniclelabs.org", type: "other" },
  { id: "nav-fund-services", name: "NAV Fund Services", jurisdiction: "US", website: "https://www.navconsulting.net", type: "other" },
  { id: "anchorage-digital", name: "Anchorage Digital", jurisdiction: "US", website: "https://www.anchorage.com", type: "other" },
  { id: "ernst-young", name: "Ernst & Young", website: "https://www.ey.com", type: "other" },
  { id: "protege-fund-services", name: "Protege Fund Services", website: "https://protegefs.com", type: "other" },
  { id: "tj-assurance-partners", name: "TJ Assurance Partners", jurisdiction: "SG", website: "https://www.tjassurance.com", type: "other" },
];

const buidlDeployments: DeploymentSeed[] = [
  { chain: "ethereum", chainId: 1, address: "0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041", namespace: "erc20", standards: ["erc20"] },
  { chain: "solana", address: "GyWgeqpy5GueU2YbkE8xqUeVEokCMMCEeUrfbtMw6phr", namespace: "spl", standards: ["solana-token-2022"] },
];

const benjiDeployments: DeploymentSeed[] = [
  { chain: "stellar", address: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5", namespace: "stellar", standards: ["stellar-asset"] },
  { chain: "polygon", chainId: 137, address: "0x408A634B8a8f0dE729B48574a3a7Ec3fE820B00A", namespace: "erc20", standards: ["erc20"] },
  { chain: "arbitrum", chainId: 42161, address: "0xB9e4765BCE2609bC1949592059B17Ea72fEe6C6A", namespace: "erc20", standards: ["erc20"] },
  { chain: "avalanche", chainId: 43114, address: "0xE08b4c1005603427420e64252a8b120cacE4D122", namespace: "erc20", standards: ["erc20"] },
  { chain: "aptos", address: "0x7b5e9cac3433e9202f28527f707c89e1e47b19de2c33e4db9521a63ad219b739", namespace: "fa", standards: ["aptos-fungible-asset"] },
  { chain: "ethereum", chainId: 1, address: "0x3DDc84940Ab509C11B20B76B466933f40b750dc9", namespace: "erc20", standards: ["erc20"] },
  { chain: "base", chainId: 8453, address: "0x60CfC2b186a4CF647486e42c42B11cC6D571d1E4", namespace: "erc20", standards: ["erc20"] },
  { chain: "solana", address: "5Tu84fKBpe9vfXeotjvfvWdWbAjy3hqsExvuHgFqFxA1", namespace: "spl", standards: ["solana-token-2022"] },
];

const usycDeployments: DeploymentSeed[] = [
  { chain: "ethereum", chainId: 1, address: "0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b", namespace: "erc20", standards: ["erc20"] },
  { chain: "bnb-chain", chainId: 56, address: "0x8D0fA28f221eB5735BC71d3a0Da67EE5bC821311", namespace: "bep20", standards: ["erc20"] },
  { chain: "solana", address: "7LWanZteUKtvFjv4MHYgKXXdAuCQYFPJysL9pxxdRQGn", namespace: "spl", standards: ["solana-token-2022"] },
];

const jtrsyDeployments: DeploymentSeed[] = [
  { chain: "ethereum", chainId: 1, address: "0x8c213ee79581ff4984583c6a801e5263418c4b86", namespace: "erc20", standards: ["erc20"] },
  { chain: "base", chainId: 8453, address: "0x8c213ee79581ff4984583c6a801e5263418c4b86", namespace: "erc20", standards: ["erc20"] },
  { chain: "arbitrum", chainId: 42161, address: "0x8c213ee79581ff4984583c6a801e5263418c4b86", namespace: "erc20", standards: ["erc20"] },
  { chain: "avalanche", chainId: 43114, address: "0xa5d465251fbcc907f5dd6bb2145488dfc6a2627b", namespace: "erc20", standards: ["erc20"] },
  { chain: "bnb-chain", chainId: 56, address: "0xa5d465251fBCc907f5Dd6bB2145488DFC6a2627b", namespace: "bep20", standards: ["erc20"] },
  { chain: "solana", address: "JTRu97Z4oduVwfVBWdf1fSAz8h7CBBPqEo4Jco9fZPj", namespace: "spl", standards: ["solana-token-2022"] },
];

const products: ProductSeed[] = [
  {
    id: "ousg", name: "Ondo Short-Term US Government Treasuries", symbol: "OUSG", underlyingId: "portfolio-ousg-us-government-securities", underlyingName: "OUSG US Government Securities Portfolio", underlyingType: "treasury", assetClass: "treasury", issuerId: "ondo-finance", organizations: [{ organizationId: "ondo-finance", roles: ["issuer", "asset-manager", "tokenization-provider"] }, { organizationId: "blackrock", roles: ["asset-manager"] }], website: "https://ondo.finance/ousg", sourceTitle: "Ondo OUSG official product page", legalStructure: "Tokenized interest in an investment product holding short-term U.S. government securities and institutional government liquidity products.", securityType: "Tokenized fund interest", underlyingRights: "Economic interest in the OUSG portfolio; not direct ownership of individual portfolio securities.", redemptionRights: "Eligible onboarded investors may subscribe and redeem under the published OUSG terms.", offeringType: "Private offering", regulatoryExemption: "Eligibility and offering restrictions are described in the official offering documents.", investorPreset: "institutional", minimumSubscription: "100000", valuationType: "nav"
  },
  {
    id: "usdy", name: "Ondo US Dollar Yield Token", symbol: "USDY", underlyingId: "portfolio-usdy-short-term-treasuries", underlyingName: "USDY Short-Term Treasury and Bank Deposit Portfolio", underlyingType: "treasury", assetClass: "treasury", issuerId: "ondo-finance", organizations: [{ organizationId: "ondo-finance", roles: ["issuer", "asset-manager", "tokenization-provider"] }], website: "https://ondo.finance/usdy", sourceTitle: "Ondo USDY official product page", instrumentType: "debt-security", legalStructure: "Senior secured tokenized note issued by a bankruptcy-remote special-purpose vehicle.", securityType: "Tokenized debt security", underlyingRights: "Contractual exposure to a portfolio of short-term U.S. Treasuries and bank demand deposits; no direct ownership of portfolio assets.", redemptionRights: "Eligible non-U.S. investors may redeem subject to the issuer's terms and applicable restrictions.", offeringType: "Offshore private offering", regulatoryExemption: "Regulation S", investorPreset: "non-us-professional", valuationType: "nav"
  },
  {
    id: "buidl", name: "BlackRock USD Institutional Digital Liquidity Fund", symbol: "BUIDL", underlyingId: "fund-buidl", underlyingName: "BlackRock USD Institutional Digital Liquidity Fund", underlyingType: "money-market-fund", assetClass: "money-market", issuerId: "blackrock", organizations: [{ organizationId: "blackrock", roles: ["issuer", "asset-manager"] }, { organizationId: "securitize", roles: ["tokenization-provider", "transfer-agent", "broker-dealer"] }, { organizationId: "bny-mellon", roles: ["custodian", "fund-administrator"] }, { organizationId: "pricewaterhousecoopers", roles: ["auditor"] }], website: "https://securitize.io/learn/press/blackrock-launches-first-tokenized-fund-buidl-on-the-ethereum-network", sourceTitle: "Securitize and BlackRock BUIDL launch announcement", legalStructure: "Private fund managed by BlackRock and tokenized through Securitize.", securityType: "Private fund share", underlyingRights: "Beneficial interest in the fund, which invests primarily in cash, U.S. Treasury bills, and repurchase agreements.", redemptionRights: "Eligible investors may transfer tokens to Securitize Markets for U.S. dollar redemption under fund terms.", offeringType: "Private placement", regulatoryExemption: "Securities Act Rule 506(c); Investment Company Act Section 3(c)(7)", investorPreset: "us-private", minimumSubscription: "5000000", valuationType: "fixed", distributionTreatment: "cash", deployments: buidlDeployments, contractSource: "https://investors.securitize.io/news/news-details/2025/BlackRock-and-Securitize-Debut-New-BUIDL-Share-Class-on-Solana-Network-03-25-2025/default.aspx", contractSourceTitle: "Official BUIDL Ethereum and Solana deployment disclosures"
  },
  {
    id: "benji", name: "Franklin OnChain U.S. Government Money Fund", symbol: "BENJI", underlyingId: "fund-fobxx", underlyingName: "Franklin OnChain U.S. Government Money Fund", underlyingType: "money-market-fund", assetClass: "money-market", issuerId: "franklin-templeton", organizations: [{ organizationId: "franklin-templeton", roles: ["issuer", "asset-manager", "tokenization-provider", "transfer-agent"] }], website: "https://digitalassets.franklintempleton.com/benji/", sourceTitle: "Franklin Templeton BENJI official product page", legalStructure: "U.S.-registered open-end government money market fund using blockchain-integrated share recordkeeping.", securityType: "Registered mutual fund share", underlyingRights: "One BENJI token represents one share of the Franklin OnChain U.S. Government Money Fund.", redemptionRights: "Shareholders may purchase and redeem fund shares through approved Franklin Templeton channels under the prospectus.", offeringType: "SEC-registered public fund", investorPreset: "us-registered", valuationType: "fixed", distributionTreatment: "reinvested", deployments: benjiDeployments, contractSource: "https://digitalassets.franklintempleton.com/benji/benji-contracts/", contractSourceTitle: "Franklin Templeton official BENJI contract catalog"
  },
  {
    id: "usyc", name: "Hashnote International Short Duration Yield Fund", symbol: "USYC", underlyingId: "fund-sdyf", underlyingName: "Hashnote International Short Duration Yield Fund", underlyingType: "money-market-fund", assetClass: "money-market", issuerId: "hashnote", organizations: [{ organizationId: "hashnote", roles: ["issuer", "asset-manager", "tokenization-provider"] }, { organizationId: "circle", roles: ["other"] }], website: "https://usyc.docs.hashnote.com/", sourceTitle: "Hashnote USYC official documentation", legalStructure: "Tokenized fund share issued to onboarded investors in Hashnote's short-duration yield fund.", securityType: "Private fund share", underlyingRights: "Economic interest in the fund's short-duration treasury and reverse-repurchase strategy.", redemptionRights: "Onboarded investors may subscribe and redeem USYC through the official teller, subject to liquidity and timing rules.", offeringType: "Private fund", investorPreset: "institutional", valuationType: "oracle-price", deployments: usycDeployments, contractSource: "https://usyc.docs.hashnote.com/overview/smart-contracts", contractSourceTitle: "Hashnote official USYC smart-contract catalog"
  },
  {
    id: "ustb", name: "Invesco Short Duration US Government Securities Fund", symbol: "USTB", underlyingId: "fund-ustb", underlyingName: "Invesco Short Duration US Government Securities Fund", underlyingType: "treasury", assetClass: "treasury", issuerId: "invesco-short-duration-government-fund", organizations: [{ organizationId: "invesco-short-duration-government-fund", roles: ["issuer"] }, { organizationId: "superstate", roles: ["tokenization-provider", "transfer-agent"] }, { organizationId: "invesco", roles: ["asset-manager"] }, { organizationId: "bny-mellon", roles: ["custodian"] }, { organizationId: "pricewaterhousecoopers", roles: ["auditor"] }, { organizationId: "nav-fund-services", roles: ["fund-administrator"] }], website: "https://superstate.com/assets/ustb", sourceTitle: "Superstate USTB official product page", legalStructure: "Series of a Delaware statutory trust.", securityType: "Private fund share", underlyingRights: "Fund share representing exposure to short-duration U.S. government securities; holders do not own individual Treasury bills directly.", redemptionRights: "Same-day redemption is available under the fund terms, subject to cutoffs, liquidity, and eligibility.", offeringType: "Private placement", regulatoryExemption: "Available to accredited investors and qualified purchasers", investorPreset: "us-private", valuationType: "nav"
  },
  {
    id: "uscc", name: "Bitwise Crypto Carry Fund", symbol: "USCC", underlyingId: "fund-uscc", underlyingName: "Bitwise Crypto Carry Fund", underlyingType: "other", assetClass: "other", issuerId: "bitwise-crypto-carry-fund", organizations: [{ organizationId: "bitwise-crypto-carry-fund", roles: ["issuer"] }, { organizationId: "superstate", roles: ["tokenization-provider", "transfer-agent"] }, { organizationId: "bitwise", roles: ["asset-manager"] }, { organizationId: "anchorage-digital", roles: ["custodian"] }, { organizationId: "ernst-young", roles: ["auditor"] }, { organizationId: "nav-fund-services", roles: ["fund-administrator"] }], website: "https://superstate.com/assets/uscc", sourceTitle: "Superstate USCC official product page", legalStructure: "Series of a Delaware statutory trust.", securityType: "Private fund share", underlyingRights: "Fund interest providing exposure to crypto cash-and-carry strategies, staking, and government securities.", redemptionRights: "Subscriptions and redemptions are processed under the fund documents and applicable liquidity rules.", offeringType: "Private placement", regulatoryExemption: "Section 4(a)(2) and Regulation D Rule 506", investorPreset: "us-private", minimumSubscription: "100000", valuationType: "nav"
  },
  {
    id: "tbill", name: "OpenEden TBILL Vault", symbol: "TBILL", underlyingId: "fund-openeden-tbill", underlyingName: "OpenEden TBILL Fund", underlyingType: "treasury", assetClass: "treasury", issuerId: "openeden", organizations: [{ organizationId: "openeden", roles: ["issuer", "tokenization-provider"] }, { organizationId: "bny-mellon", roles: ["asset-manager", "custodian"] }, { organizationId: "protege-fund-services", roles: ["fund-administrator"] }, { organizationId: "tj-assurance-partners", roles: ["auditor"] }, { organizationId: "ernst-young", roles: ["auditor"] }], website: "https://docs.openeden.com/tbill", sourceTitle: "OpenEden TBILL official documentation", instrumentType: "fund-share", legalStructure: "BVI professional fund regulated by the British Virgin Islands Financial Services Commission.", securityType: "Professional fund share", underlyingRights: "Proportional economic interest in the fund's net assets, backed primarily by short-dated U.S. Treasury bills and U.S. dollars.", redemptionRights: "Fully onboarded investors may mint and redeem through the TBILL Vault under the fund terms.", offeringType: "BVI professional fund", investorPreset: "non-us-professional", valuationType: "nav", deployments: [{ chain: "ethereum", chainId: 1, address: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a", namespace: "erc20", standards: ["erc20"] }], contractSource: "https://docs.openeden.com/tbill/smart-contract-addresses", contractSourceTitle: "OpenEden official TBILL contract addresses"
  },
  {
    id: "jtrsy", name: "Janus Henderson Anemoy Treasury Fund", symbol: "JTRSY", underlyingId: "fund-jtrsy", underlyingName: "Janus Henderson Anemoy Treasury Fund", underlyingType: "treasury", assetClass: "treasury", issuerId: "anemoy-capital", organizations: [{ organizationId: "anemoy-capital", roles: ["issuer"] }, { organizationId: "janus-henderson", roles: ["asset-manager"] }, { organizationId: "centrifuge", roles: ["tokenization-provider"] }, { organizationId: "jp-morgan", roles: ["custodian"] }, { organizationId: "trident-trust", roles: ["fund-administrator"] }, { organizationId: "mha-cayman", roles: ["auditor"] }, { organizationId: "chronicle", roles: ["oracle-provider"] }], website: "https://app.centrifuge.io/pool/281474976710662", sourceTitle: "Centrifuge official JTRSY product page", legalStructure: "BVI professional fund licensed by the British Virgin Islands Financial Services Commission.", securityType: "Professional fund share", underlyingRights: "Fund share representing an interest in a portfolio of directly held short-term U.S. Treasury bills.", redemptionRights: "Daily subscriptions and redemptions for eligible non-U.S. professional investors, subject to published cutoffs.", offeringType: "BVI professional fund", investorPreset: "non-us-professional", minimumSubscription: "500000", valuationType: "nav", deployments: jtrsyDeployments, contractSource: "https://docs.centrifuge.io/developer/protocol/deployments/", contractSourceTitle: "Centrifuge official protocol deployment catalog"
  },
];

const wisdomTreeFunds = [
  ["wtgxx", "WisdomTree Treasury Money Market Digital Fund", "WTGXX", "money-market", "money-market-fund"],
  ["wtlgx", "WisdomTree Long Term Treasury Digital Fund", "WTLGX", "treasury", "treasury"],
  ["wtstx", "WisdomTree 7-10 Year Treasury Digital Fund", "WTSTX", "treasury", "treasury"],
  ["wttsx", "WisdomTree 3-7 Year Treasury Digital Fund", "WTTSX", "treasury", "treasury"],
  ["tipsx", "WisdomTree TIPS Digital Fund", "TIPSX", "treasury", "bond"],
  ["flttx", "WisdomTree Floating Rate Treasury Digital Fund", "FLTTX", "treasury", "treasury"],
  ["wtsyx", "WisdomTree Short-Term Treasury Digital Fund", "WTSYX", "treasury", "treasury"],
  ["wtsix", "WisdomTree Short-Duration Income Digital Fund", "WTSIX", "money-market", "bond"],
  ["crdyx", "WisdomTree Private Credit and Alternative Income Digital Fund", "CRDYX", "private-credit", "private-credit"],
  ["eqtyx", "WisdomTree Siegel Global Equity Digital Fund", "EQTYX", "public-equity", "other"],
  ["lngvx", "WisdomTree Siegel Longevity Digital Fund", "LNGVX", "public-equity", "other"],
  ["modrx", "WisdomTree Siegel Moderate Digital Fund", "MODRX", "public-equity", "other"],
  ["techx", "WisdomTree Technology & Innovation 100 Digital Fund", "TECHX", "public-equity", "other"],
  ["spxux", "WisdomTree 500 Digital Fund", "SPXUX", "public-equity", "other"],
] as const;

for (const [id, name, symbol, assetClass, underlyingType] of wisdomTreeFunds) {
  products.push({
    id,
    name,
    symbol,
    underlyingId: `fund-${id}`,
    underlyingName: name,
    underlyingType,
    assetClass,
    issuerId: "wisdomtree-digital-trust",
    organizations: [
      { organizationId: "wisdomtree-digital-trust", roles: ["issuer"] },
      { organizationId: "wisdomtree-asset-management", roles: ["asset-manager", "tokenization-provider"] },
    ],
    website: "https://www.wisdomtree.com/onchain/tokenized-funds",
    sourceTitle: `${name} in WisdomTree's official tokenized-fund catalog`,
    legalStructure: "Open-end mutual fund series of WisdomTree Digital Trust registered under the Investment Company Act of 1940.",
    securityType: "Registered mutual fund share with blockchain-integrated recordkeeping",
    underlyingRights: "Fund share; the blockchain record represents ownership in the registered fund rather than direct ownership of portfolio securities.",
    redemptionRights: "Purchases and redemptions are available through approved WisdomTree channels under the fund prospectus.",
    offeringType: "SEC-registered public fund",
    investorPreset: "us-registered",
    ...(id === "wtgxx" ? { minimumSubscription: "1" } : {}),
    valuationType: id === "wtgxx" ? "fixed" : "nav",
    distributionTreatment: "reinvested",
  });
}

function sourceRecord(id: string, title: string, url: string, publisher: string) {
  return {
    id,
    type: "issuer",
    title,
    url,
    publisher,
    accessedAt: ACCESSED_AT,
    retrievedAt: RETRIEVED_AT,
    lastVerifiedAt: ACCESSED_AT,
    reviewAfter: REVIEW_AFTER,
    sourceVersion: `live-page:${ACCESSED_AT}`,
    confidence: "high",
  };
}

function organizationName(id: string): string {
  if (id === "ondo-finance") return "Ondo Finance";
  return organizations.find((organization) => organization.id === id)?.name ?? id;
}

function complianceFor(product: ProductSeed) {
  const common = {
    schemaVersion: 1,
    permissioned: "yes",
    kycRequired: "yes",
    identityRequired: "yes",
    transferRestricted: "yes",
    transferEnforcement: "mixed",
    primaryMarket: {
      access: "issuer-onboarding",
      kycRequired: "yes",
      kybRequired: "yes",
      notes: "Investors must complete the issuer or distributor onboarding process before subscribing or redeeming.",
    },
    secondaryMarket: {
      access: "restricted",
      kycRequired: "yes",
      kybRequired: "yes",
      notes: "Transfers are limited by the product documents, platform rules, and, where deployed, onchain allowlist controls.",
    },
    minimumSubscription: product.minimumSubscription
      ? { amount: product.minimumSubscription, currency: "USD" }
      : undefined,
    offeringDocuments: [product.website],
    notes: "Eligibility is a summary of published requirements and is not legal or investment advice. Consult the current offering documents before transacting.",
    verifiedBy: ["official-product"],
  };
  if (product.investorPreset === "us-registered") {
    return { ...common, eligibleInvestorTypes: ["retail", "institutional"], eligibleJurisdictions: ["US"] };
  }
  if (product.investorPreset === "us-private") {
    return { ...common, eligibleInvestorTypes: ["accredited", "qualified-purchaser", "institutional"], eligibleJurisdictions: ["US"] };
  }
  if (product.investorPreset === "non-us-professional") {
    return { ...common, eligibleInvestorTypes: ["professional", "institutional"], prohibitedJurisdictions: ["US"] };
  }
  return { ...common, eligibleInvestorTypes: ["institutional", "professional"] };
}

for (const organization of organizations) {
  const source = {
    title: `${organization.name} official website`,
    url: organization.website,
    accessedAt: ACCESSED_AT,
    lastVerifiedAt: ACCESSED_AT,
    reviewAfter: REVIEW_AFTER,
    confidence: "high",
  };
  await Promise.all([
    writeFile(path.join(root, "organizations", `${organization.id}.json`), `${JSON.stringify({ schemaVersion: 1, id: organization.id, name: organization.name, ...(organization.legalName ? { legalName: organization.legalName } : {}), ...(organization.jurisdiction ? { jurisdiction: organization.jurisdiction } : {}), status: "active", website: organization.website, sources: [source] }, null, 2)}\n`),
    writeFile(path.join(root, "issuers", `${organization.id}.json`), `${JSON.stringify({ schemaVersion: 1, id: organization.id, name: organization.name, ...(organization.legalName ? { legalName: organization.legalName } : {}), type: organization.type, ...(organization.jurisdiction ? { jurisdiction: organization.jurisdiction } : {}), status: "active", website: organization.website, sources: [{ title: source.title, url: source.url, accessedAt: source.accessedAt }] }, null, 2)}\n`),
  ]);
}

for (const product of products) {
  const productSource = sourceRecord("official-product", product.sourceTitle, product.website, organizationName(product.organizations[0]?.organizationId ?? product.issuerId));
  const sources = [productSource];
  if (product.contractSource && product.contractSourceTitle) {
    sources.push(sourceRecord("official-contracts", product.contractSourceTitle, product.contractSource, organizationName(product.organizations[0]?.organizationId ?? product.issuerId)));
  }
  const directory = path.join(root, "assets", product.id);
  await mkdir(directory, { recursive: true });

  const asset = {
    schemaVersion: 2,
    id: product.id,
    name: product.name,
    symbol: product.symbol,
    underlyingId: product.underlyingId,
    instrumentType: product.instrumentType ?? "fund-share",
    denominationCurrency: "USD",
    legalStructure: product.legalStructure,
    securityType: product.securityType,
    underlyingRights: product.underlyingRights,
    redemptionRights: product.redemptionRights,
    offeringType: product.offeringType,
    ...(product.regulatoryExemption ? { regulatoryExemption: product.regulatoryExemption } : {}),
    organizationRoles: product.organizations,
    description: `${product.name} (${product.symbol}), represented through tokenized or blockchain-integrated fund records.`,
    assetClass: product.assetClass,
    issuerId: product.issuerId,
    tokenizationProviderIds: product.organizations.filter(({ roles }) => roles.includes("tokenization-provider")).map(({ organizationId }) => organizationId),
    status: "active",
    website: product.website,
    marketDataLinks: [{ provider: organizationName(product.organizations[0]?.organizationId ?? product.issuerId), type: "issuer", url: product.website, description: "Official product information, NAV, holdings, performance, or investor documentation." }],
    verifiedBy: ["official-product"],
  };
  const deployments = (product.deployments ?? []).map((deployment) => ({
    chain: deployment.chain,
    ...(deployment.chainId ? { chainId: deployment.chainId } : {}),
    address: deployment.address,
    assetNamespace: deployment.namespace,
    assetReference: deployment.address,
    deploymentType: "issuer-native",
    standardIds: deployment.standards,
    standardEvidence: deployment.standards.map((standardId) => ({ standardId, method: "issuer-documentation", sourceId: "official-contracts" })),
    status: "active",
    verifiedBy: ["official-contracts"],
  }));
  const valuation = {
    schemaVersion: 1,
    quoteCurrency: "USD",
    valuationType: product.valuationType ?? "nav",
    navSourceUrl: product.website,
    updateFrequency: "Provider-published schedule; see the official product page.",
    corporateActionModel: product.valuationType === "fixed" ? "none" : "accumulating-price",
    distributionTreatment: product.distributionTreatment ?? "reinvested",
    reserveReportingUrl: product.website,
    verifiedBy: ["official-product"],
  };
  const underlying = {
    schemaVersion: 1,
    id: product.underlyingId,
    name: product.underlyingName,
    ticker: product.symbol,
    type: product.underlyingType,
    jurisdiction: product.investorPreset === "non-us-professional" ? "VG" : "US",
    currency: "USD",
    status: "active",
    sourceAssetIds: [product.id],
  };

  await Promise.all([
    writeFile(path.join(directory, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`),
    writeFile(path.join(directory, "compliance.json"), `${JSON.stringify(complianceFor(product), null, 2)}\n`),
    writeFile(path.join(directory, "deployments.json"), `${JSON.stringify(deployments, null, 2)}\n`),
    writeFile(path.join(directory, "sources.json"), `${JSON.stringify(sources, null, 2)}\n`),
    writeFile(path.join(directory, "valuation.json"), `${JSON.stringify(valuation, null, 2)}\n`),
    writeFile(path.join(root, "underlyings", `${product.underlyingId}.json`), `${JSON.stringify(underlying, null, 2)}\n`),
  ]);
}

console.log(`Imported ${products.length} institutional fund products with ${products.reduce((count, product) => count + (product.deployments?.length ?? 0), 0)} verified deployments.`);

await import("./migrate-reliability-fields.js");
