import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface AssetIdentifier {
  scheme: string;
  value: string;
}

interface AssetInput {
  id: string;
  name: string;
  symbol: string;
  underlyingId: string;
  assetClass: string;
  status: string;
  identifiers?: AssetIdentifier[];
}

interface UnderlyingOutput {
  schemaVersion: 1;
  id: string;
  name: string;
  ticker: string;
  type: string;
  identifiers?: AssetIdentifier[];
  currency: string;
  status: string;
  sourceAssetIds: string[];
  dataAvailability?: Record<string, string>;
  exchange?: string;
  jurisdiction?: string;
  sources?: unknown[];
  claims?: unknown[];
}

function underlyingName(asset: AssetInput): string {
  return asset.name
    .replace(/\s*\(Ondo Tokenized\)$/, "")
    .replace(/\s*•\s*Robinhood Token$/, "");
}

function underlyingTicker(asset: AssetInput): string {
  return asset.id.startsWith("robinhood-") ? asset.symbol : asset.symbol.replace(/on$/, "");
}

function underlyingType(assetClass: string): string {
  if (assetClass === "public-equity") return "equity";
  if (assetClass === "exchange-traded-fund") return "exchange-traded-fund";
  if (assetClass === "money-market") return "money-market-fund";
  return assetClass;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = path.join(repositoryRoot, "assets");
const underlyingsDirectory = path.join(repositoryRoot, "underlyings");
const records = new Map<string, UnderlyingOutput>();
const entries = await readdir(assetsDirectory, { withFileTypes: true });

for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
  const asset = JSON.parse(
    await readFile(path.join(assetsDirectory, entry.name, "asset.json"), "utf8"),
  ) as AssetInput;
  const type = underlyingType(asset.assetClass);
  const existing = records.get(asset.underlyingId);
  if (existing && existing.type !== type) {
    throw new Error(
      `Underlying ${asset.underlyingId} has conflicting types ${existing.type} and ${type}`,
    );
  }
  const isinIdentifiers = (asset.identifiers ?? []).filter(
    (identifier) => identifier.scheme === "isin",
  );
  if (!existing) {
    records.set(asset.underlyingId, {
      schemaVersion: 1,
      id: asset.underlyingId,
      name: underlyingName(asset),
      ticker: underlyingTicker(asset),
      type,
      ...(isinIdentifiers.length > 0 ? { identifiers: isinIdentifiers } : {}),
      currency: "USD",
      status: asset.status === "active" ? "active" : "inactive",
      sourceAssetIds: [asset.id],
    });
    continue;
  }
  existing.sourceAssetIds.push(asset.id);
  if (asset.id.startsWith("robinhood-")) {
    existing.name = underlyingName(asset);
    existing.ticker = underlyingTicker(asset);
  }
  const identifierKeys = new Set(
    (existing.identifiers ?? []).map((identifier) => `${identifier.scheme}:${identifier.value}`),
  );
  for (const identifier of isinIdentifiers) {
    if (!identifierKeys.has(`${identifier.scheme}:${identifier.value}`)) {
      existing.identifiers = [...(existing.identifiers ?? []), identifier];
    }
  }
}

await mkdir(underlyingsDirectory, { recursive: true });
for (const record of [...records.values()].sort((left, right) => left.id.localeCompare(right.id))) {
  record.sourceAssetIds.sort();
  const outputPath = path.join(underlyingsDirectory, `${record.id}.json`);
  let existing: UnderlyingOutput | undefined;
  try {
    existing = JSON.parse(await readFile(outputPath, "utf8")) as UnderlyingOutput;
  } catch {
    existing = undefined;
  }
  const existingIdentifiers = existing?.identifiers ?? [];
  const identifiers = [...(record.identifiers ?? [])];
  const identifierKeys = new Set(identifiers.map(({ scheme, value }) => `${scheme}:${value}`));
  for (const identifier of existingIdentifiers) {
    if (!identifierKeys.has(`${identifier.scheme}:${identifier.value}`)) identifiers.push(identifier);
  }
  const output = {
    ...record,
    ...(existing ? {
      name: existing.name,
      ticker: existing.ticker,
      type: existing.type,
      currency: existing.currency,
    } : {}),
    ...(identifiers.length > 0 ? { identifiers } : {}),
    ...(existing?.exchange ? { exchange: existing.exchange } : {}),
    ...(existing?.jurisdiction ? { jurisdiction: existing.jurisdiction } : {}),
    dataAvailability: existing?.dataAvailability ?? {
      identifiers: identifiers.length > 0 ? "known" : "unknown",
      exchange: existing?.exchange ? "known" : "unknown",
      jurisdiction: existing?.jurisdiction ? "known" : "unknown",
    },
    ...(existing?.sources ? { sources: existing.sources } : {}),
    ...(existing?.claims ? { claims: existing.claims } : {}),
  };
  await writeFile(
    outputPath,
    `${JSON.stringify(output, null, 2)}\n`,
  );
}

console.log(`Built ${records.size} underlying records from ${entries.filter((entry) => entry.isDirectory()).length} assets.`);
