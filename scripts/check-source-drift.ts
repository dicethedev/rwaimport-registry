import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

interface OndoToken {
  chainId: number;
  address?: string;
  symbol: string;
}

interface RobinhoodApiAsset {
  id: string;
  tokenSymbol: string;
  status: string;
  deployments: Array<{ chainId: number; contractAddress: string }>;
}

const sources = {
  ondoEvm:
    "https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/main/tokenlist.json",
  ondoSolana:
    "https://raw.githubusercontent.com/ondoprotocol/gm-solana-simulator/main/constants.rs",
  robinhood: "https://api.robinhood.com/rhj/assets",
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validation = await validateRegistry(rootDirectory);
if (!validation.valid || !validation.registry) {
  throw new Error("Registry must pass local validation before source drift can be checked");
}

const [ondoEvmSource, ondoSolanaSource, robinhoodSource] = await Promise.all([
  fetchText(sources.ondoEvm),
  fetchText(sources.ondoSolana),
  fetchText(sources.robinhood),
]);
const ondoTokens = (JSON.parse(ondoEvmSource) as { tokens: OndoToken[] }).tokens;
const solanaMints = new Map<string, string>();
for (const match of ondoSolanaSource.matchAll(
  /\("([A-Za-z0-9]+)",\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"\),/g,
)) {
  if (match[1] && match[2]) solanaMints.set(match[1], match[2]);
}
const robinhoodAssets = (JSON.parse(robinhoodSource) as { assets: RobinhoodApiAsset[] }).assets;
const robinhoodBySymbol = new Map(
  robinhoodAssets.map((asset) => [asset.tokenSymbol, asset]),
);
const errors: string[] = [];

for (const record of validation.registry.assets) {
  if (record.asset.issuerId === "ondo-global-markets") {
    for (const deployment of record.deployments) {
      if (deployment.chain === "solana") {
        const latestAddress = solanaMints.get(record.asset.symbol);
        if (latestAddress !== deployment.address) {
          errors.push(
            `${record.asset.id} Solana mint changed from ${deployment.address} to ${latestAddress ?? "missing"}`,
          );
        }
        continue;
      }
      const latest = ondoTokens.find(
        (token) => token.symbol === record.asset.symbol && token.chainId === deployment.chainId,
      );
      if (!latest?.address || latest.address.toLowerCase() !== deployment.address.toLowerCase()) {
        errors.push(
          `${record.asset.id} ${deployment.chain} address changed from ${deployment.address} to ${latest?.address ?? "missing"}`,
        );
      }
    }
  }

  if (record.asset.issuerId === "robinhood-assets-jersey") {
    const latest = robinhoodBySymbol.get(record.asset.symbol);
    if (!latest || latest.status !== "ASSET_STATUS_ACTIVE") {
      errors.push(`${record.asset.id} is no longer active in Robinhood's asset API`);
      continue;
    }
    const deployment = record.deployments.find((candidate) => candidate.chainId === 4663);
    const latestDeployment = latest.deployments.find((candidate) => candidate.chainId === 4663);
    if (
      !deployment ||
      !latestDeployment ||
      deployment.address.toLowerCase() !== latestDeployment.contractAddress.toLowerCase()
    ) {
      errors.push(
        `${record.asset.id} Robinhood deployment changed from ${deployment?.address ?? "missing"} to ${latestDeployment?.contractAddress ?? "missing"}`,
      );
    }
  }
}

const registryRobinhoodSymbols = new Set(
  validation.registry.assets
    .filter(({ asset }) => asset.issuerId === "robinhood-assets-jersey")
    .map(({ asset }) => asset.symbol),
);
for (const asset of robinhoodAssets) {
  if (asset.status === "ASSET_STATUS_ACTIVE" && !registryRobinhoodSymbols.has(asset.tokenSymbol)) {
    errors.push(`New active Robinhood asset is not imported: ${asset.tokenSymbol}`);
  }
}

if (errors.length > 0) {
  console.error(`Official-source drift detected (${errors.length} change(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("No address, status, or catalog drift detected in official issuer sources.");
}
