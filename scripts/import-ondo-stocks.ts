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

interface SolanaMint {
  symbol: string;
  address: string;
}

const TOKEN_LIST_COMMIT = "f5a82fca4b2a81aa8fc1ce65b8982f36d6cd40f4";
const TOKEN_LIST_URL =
  `https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/${TOKEN_LIST_COMMIT}/tokenlist.json`;
const SOLANA_LIST_COMMIT = "0688add3c64aadc7006712989e9ec0592b5b10f8";
const SOLANA_LIST_URL =
  `https://raw.githubusercontent.com/ondoprotocol/gm-solana-simulator/${SOLANA_LIST_COMMIT}/constants.rs`;
const ACCESSED_AT = "2026-10-01";
const TARGET_ASSET_COUNT = 400;
const CORE_EQUITY_COUNT = 300;
const excludedEquityNamePattern =
  /ETF|ETN|Fund|Trust|Index|Treasury|Bond|Notes|Portfolio|Bitcoin|Ethereum|Gold|Silver|Oil|Commodity|VIX|Ultra|Short|Bear|Bull|Leveraged|Income|Dividend|Covered Call|S&P|Russell|Nasdaq|Dow Jones/i;
const excludedEquitySymbols = new Set([
  "BLKDIGon",
  "BLKGRWon",
  "BOTon",
  "QQQon",
  "SPCXon",
  "USDY",
  "USDon",
]);
const excludedCatalogSymbols = new Set(["USDY", "USDon"]);

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

function assetClass(name: string): "public-equity" | "exchange-traded-fund" | "other" {
  if (/Portfolio/i.test(name)) return "other";
  if (
    /ETF|ETN|Fund|Trust|Index|Treasury|Bond|Notes|Bitcoin|Ethereum|Gold|Silver|Oil|Commodity|VIX|Ultra|Short|Bear|Bull|Leveraged|Income|Dividend|Covered Call|S&P|Russell|Nasdaq|Dow Jones/i.test(
      name,
    )
  ) {
    return "exchange-traded-fund";
  }
  return "public-equity";
}

function base58DecodedLength(value: string): number {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return -1;
    number = number * 58n + BigInt(digit);
  }
  let length = 0;
  while (number > 0n) {
    length += 1;
    number >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    length += 1;
  }
  return length;
}

async function loadText(suppliedPath: string | undefined, url: string): Promise<string> {
  if (suppliedPath) return readFile(path.resolve(suppliedPath), "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download source: ${response.status} ${url}`);
  return response.text();
}

function parseSolanaMints(source: string): Map<string, SolanaMint> {
  const mints = new Map<string, SolanaMint>();
  for (const match of source.matchAll(/\("([A-Za-z0-9]+)",\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"\),/g)) {
    const [, symbol, address] = match;
    if (!symbol || !address) continue;
    if (base58DecodedLength(address) !== 32) continue;
    if (mints.has(symbol)) throw new Error(`Duplicate Solana mint symbol ${symbol}`);
    mints.set(symbol, { symbol, address });
  }
  if (mints.size < TARGET_ASSET_COUNT) {
    throw new Error(`Expected at least ${TARGET_ASSET_COUNT} Solana mints but found ${mints.size}`);
  }
  return mints;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokenList = JSON.parse(await loadText(process.argv[2], TOKEN_LIST_URL)) as TokenList;
const solanaMints = parseSolanaMints(await loadText(process.argv[3], SOLANA_LIST_URL));
const ethereumTokens = tokenList.tokens.filter(
  (token) => token.chainId === 1 && token.address && !excludedCatalogSymbols.has(token.symbol),
);
const coreEquitySymbols = [
  ...new Set(
    ethereumTokens
      .filter(
        (token) =>
          !excludedEquityNamePattern.test(token.name) &&
          !excludedEquitySymbols.has(token.symbol),
      )
      .map((token) => token.symbol),
  ),
]
  .sort((left, right) => left.localeCompare(right))
  .slice(0, CORE_EQUITY_COUNT);
const coreSet = new Set(coreEquitySymbols);
const supplementalSymbols = [...new Set(ethereumTokens.map((token) => token.symbol))]
  .filter((symbol) => !coreSet.has(symbol))
  .sort((left, right) => left.localeCompare(right))
  .slice(0, TARGET_ASSET_COUNT - CORE_EQUITY_COUNT);
const selectedSymbols = [...coreEquitySymbols, ...supplementalSymbols];

if (selectedSymbols.length !== TARGET_ASSET_COUNT) {
  throw new Error(
    `Expected ${TARGET_ASSET_COUNT} eligible assets but found ${selectedSymbols.length}`,
  );
}

let solanaDeploymentCount = 0;
for (const symbol of selectedSymbols) {
  const evmTokens = tokenList.tokens.filter(
    (token) => token.symbol === symbol && token.address && chainDetails[token.chainId],
  );
  if (evmTokens.length === 0) throw new Error(`Selected asset ${symbol} has no supported deployment`);

  const primary = evmTokens.find((token) => token.chainId === 1) ?? evmTokens[0];
  if (!primary) throw new Error(`Selected asset ${symbol} is missing primary metadata`);
  const solanaMint = solanaMints.get(symbol);
  const id = assetIdFromSymbol(symbol);
  const name = underlyingName(primary.name);
  const classification = assetClass(name);
  const assetDirectory = path.join(repositoryRoot, "assets", id);
  await mkdir(assetDirectory, { recursive: true });

  const asset = {
    schemaVersion: 1,
    id,
    name: primary.name,
    symbol,
    description:
      classification === "public-equity"
        ? `Tokenized economic exposure to ${name}, issued by Ondo Global Markets (BVI) Limited.`
        : `Tokenized economic exposure to the ${name} instrument, issued by Ondo Global Markets (BVI) Limited.`,
    assetClass: classification,
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
      ...evmTokens.flatMap((token) => {
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
      ...(solanaMint
        ? [
            {
              provider: "DefiLlama",
              type: "price-api",
              url: `https://coins.llama.fi/prices/current/solana:${solanaMint.address}`,
              description: "Current third-party price response for the Solana deployment.",
            },
            {
              provider: "Solana Explorer",
              type: "chain-explorer",
              url: `https://explorer.solana.com/address/${solanaMint.address}`,
              description: "Onchain supply, holders, transfers, and mint activity on Solana.",
            },
          ]
        : []),
    ],
    verifiedBy: ["ondo-token-list", "ondo-product-page"],
  };
  const deployments = [
    ...evmTokens
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
      }),
    ...(solanaMint
      ? [
          {
            chain: "solana",
            address: solanaMint.address,
            standardIds: ["solana-token-2022"],
            decimals: 9,
            status: "active",
            verifiedBy: ["ondo-solana-mint-list", "solana-explorer"],
          },
        ]
      : []),
  ];
  if (solanaMint) solanaDeploymentCount += 1;
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
    ...evmTokens.map((token) => {
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
    ...(solanaMint
      ? [
          {
            id: "ondo-solana-mint-list",
            type: "issuer",
            title: `Ondo official Solana mint list at commit ${SOLANA_LIST_COMMIT.slice(0, 12)}`,
            url: SOLANA_LIST_URL,
            publisher: "Ondo Finance",
            accessedAt: ACCESSED_AT,
          },
          {
            id: "solana-explorer",
            type: "chain-explorer",
            title: `${symbol} mint on Solana`,
            url: `https://explorer.solana.com/address/${solanaMint.address}`,
            publisher: "Solana",
            accessedAt: ACCESSED_AT,
          },
        ]
      : []),
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
  `Imported ${selectedSymbols.length} Ondo assets with ${solanaDeploymentCount} Solana deployments from pinned official sources.`,
);
