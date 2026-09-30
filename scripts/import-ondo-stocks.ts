import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface TokenListEntry {
  chainId: number;
  address?: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface TokenList {
  timestamp: string;
  tokens: TokenListEntry[];
}

const TOKEN_LIST_COMMIT = "f5a82fca4b2a81aa8fc1ce65b8982f36d6cd40f4";
const TOKEN_LIST_URL =
  `https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/${TOKEN_LIST_COMMIT}/tokenlist.json`;
const ACCESSED_AT = "2026-09-30";
const TARGET_ASSET_COUNT = 300;
const excludedNamePattern =
  /ETF|ETN|Fund|Trust|Index|Treasury|Bond|Notes|Portfolio|Bitcoin|Ethereum|Gold|Silver|Oil|Commodity|VIX|Ultra|Short|Bear|Bull|Leveraged|Income|Dividend|Covered Call|S&P|Russell|Nasdaq|Dow Jones/i;
const excludedSymbols = new Set([
  "BLKDIGon",
  "BLKGRWon",
  "BOTon",
  "QQQon",
  "SPCXon",
  "USDY",
  "USDon",
]);

const chainDetails: Record<
  number,
  { id: string; explorer: string; explorerName: string; llamaChain: string }
> = {
  1: {
    id: "ethereum",
    explorer: "https://etherscan.io/token",
    explorerName: "Etherscan",
    llamaChain: "ethereum",
  },
  56: {
    id: "bnb-chain",
    explorer: "https://bscscan.com/token",
    explorerName: "BscScan",
    llamaChain: "bsc",
  },
};

function assetIdFromSymbol(symbol: string): string {
  return symbol.toLowerCase();
}

function underlyingName(name: string): string {
  return name.replace(/\s*\(Ondo Tokenized\)$/, "");
}

async function loadTokenList(): Promise<TokenList> {
  const suppliedPath = process.argv[2];
  if (suppliedPath) {
    return JSON.parse(await readFile(path.resolve(suppliedPath), "utf8")) as TokenList;
  }
  const response = await fetch(TOKEN_LIST_URL);
  if (!response.ok) throw new Error(`Unable to download token list: ${response.status}`);
  return (await response.json()) as TokenList;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokenList = await loadTokenList();
const selectedSymbols = [
  ...new Set(
    tokenList.tokens
      .filter(
        (token) =>
          token.chainId === 1 &&
          token.address &&
          !excludedNamePattern.test(token.name) &&
          !excludedSymbols.has(token.symbol),
      )
      .map((token) => token.symbol),
  ),
]
  .sort((left, right) => left.localeCompare(right))
  .slice(0, TARGET_ASSET_COUNT);

if (selectedSymbols.length !== TARGET_ASSET_COUNT) {
  throw new Error(
    `Expected ${TARGET_ASSET_COUNT} eligible assets but found ${selectedSymbols.length}`,
  );
}

for (const symbol of selectedSymbols) {
  const tokens = tokenList.tokens.filter(
    (token) => token.symbol === symbol && token.address && chainDetails[token.chainId],
  );
  if (tokens.length === 0) throw new Error(`Selected asset ${symbol} has no supported deployment`);

  const primary = tokens.find((token) => token.chainId === 1) ?? tokens[0];
  if (!primary) throw new Error(`Selected asset ${symbol} is missing primary metadata`);
  const id = assetIdFromSymbol(symbol);
  const name = underlyingName(primary.name);
  const assetDirectory = path.join(repositoryRoot, "assets", id);
  await mkdir(assetDirectory, { recursive: true });

  const asset = {
    schemaVersion: 1,
    id,
    name: primary.name,
    symbol,
    description: `Tokenized economic exposure to ${name}, issued by Ondo Global Markets (BVI) Limited.`,
    assetClass: "public-equity",
    issuerId: "ondo-global-markets",
    tokenizationProviderIds: ["ondo-finance"],
    status: "active",
    website: `https://app.ondo.finance/assets/${id}`,
    marketDataLinks: [
      {
        provider: "Ondo Finance",
        type: "issuer",
        url: `https://app.ondo.finance/assets/${id}`,
        description: "Issuer product page and primary instrument information.",
      },
      {
        provider: "RWA.xyz",
        type: "aggregator",
        url: "https://app.rwa-xyz.com/stocks",
        description: `Independent tokenized-stock market dashboard; search for ${symbol}.`,
      },
      ...tokens.flatMap((token) => {
        const chain = chainDetails[token.chainId];
        if (!chain || !token.address) throw new Error(`Unsupported deployment for ${symbol}`);
        return [
          {
            provider: "DefiLlama",
            type: "price-api",
            url: `https://coins.llama.fi/prices/current/${chain.llamaChain}:${token.address}`,
            description: `Current third-party price response for the ${chain.id} deployment.`,
          },
          {
            provider: chain.explorerName,
            type: "chain-explorer",
            url: `${chain.explorer}/${token.address}`,
            description: `Onchain supply, holders, transfers, and contract activity on ${chain.id}.`,
          },
        ];
      }),
    ],
    verifiedBy: ["ondo-token-list", "ondo-product-page"],
  };
  const deployments = tokens
    .sort((left, right) => left.chainId - right.chainId)
    .map((token) => {
      const chain = chainDetails[token.chainId];
      if (!chain || !token.address) throw new Error(`Unsupported deployment for ${symbol}`);
      return {
        chain: chain.id,
        chainId: token.chainId,
        address: token.address,
        standardIds: ["erc20"],
        decimals: token.decimals,
        status: "active",
        verifiedBy: ["ondo-token-list", `${chain.id}-explorer`],
      };
    });
  const compliance = {
    schemaVersion: 1,
    permissioned: "no",
    kycRequired: "yes",
    identityRequired: "no",
    transferRestricted: "yes",
    eligibleInvestorTypes: ["retail", "professional", "institutional"],
    notes:
      "Direct minting and redemption require Ondo onboarding and KYC. Tokens may be held or acquired through third parties without direct onboarding, subject to jurisdictional, sanctions, and other restrictions.",
    verifiedBy: ["ondo-stocks-guide"],
  };
  const sources = [
    {
      id: "ondo-token-list",
      type: "issuer",
      title: `Ondo official token list at commit ${TOKEN_LIST_COMMIT.slice(0, 12)}`,
      url: TOKEN_LIST_URL,
      publisher: "Ondo Finance",
      accessedAt: ACCESSED_AT,
    },
    {
      id: "ondo-product-page",
      type: "issuer",
      title: `${primary.name} product page`,
      url: `https://app.ondo.finance/assets/${id}`,
      publisher: "Ondo Finance",
      accessedAt: ACCESSED_AT,
    },
    {
      id: "ondo-stocks-guide",
      type: "documentation",
      title: "Ondo Stocks product, onboarding, and eligibility overview",
      url: "https://ondo.finance/ondo-stocks",
      publisher: "Ondo Finance",
      accessedAt: ACCESSED_AT,
    },
    ...tokens.map((token) => {
      const chain = chainDetails[token.chainId];
      if (!chain || !token.address) throw new Error(`Unsupported deployment for ${symbol}`);
      return {
        id: `${chain.id}-explorer`,
        type: "chain-explorer",
        title: `${symbol} contract on ${chain.id}`,
        url: `${chain.explorer}/${token.address}`,
        publisher: chain.explorerName,
        accessedAt: ACCESSED_AT,
      };
    }),
  ];

  await Promise.all([
    writeFile(path.join(assetDirectory, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`),
    writeFile(
      path.join(assetDirectory, "deployments.json"),
      `${JSON.stringify(deployments, null, 2)}\n`,
    ),
    writeFile(
      path.join(assetDirectory, "compliance.json"),
      `${JSON.stringify(compliance, null, 2)}\n`,
    ),
    writeFile(path.join(assetDirectory, "sources.json"), `${JSON.stringify(sources, null, 2)}\n`),
  ]);
}

console.log(
  `Imported ${selectedSymbols.length} Ondo Stocks from token list dated ${tokenList.timestamp}.`,
);
