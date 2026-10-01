import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

import { validateRegistry } from "../src/registry.js";

const gzipAsync = promisify(gzip);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await validateRegistry(rootDirectory);

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function addToIndex(index: Record<string, string[]>, key: string, assetId: string): void {
  index[key] ??= [];
  index[key].push(assetId);
}

if (!result.valid || !result.registry) {
  console.error("Cannot build an invalid registry. Run npm run validate for details.");
  process.exitCode = 1;
} else {
  const outputDirectory = path.join(rootDirectory, "dist");
  const outputAssetsDirectory = path.join(outputDirectory, "assets");
  const outputIndexesDirectory = path.join(outputDirectory, "indexes");
  await rm(outputAssetsDirectory, { recursive: true, force: true });
  await rm(outputIndexesDirectory, { recursive: true, force: true });
  await Promise.all([
    mkdir(outputAssetsDirectory, { recursive: true }),
    mkdir(outputIndexesDirectory, { recursive: true }),
  ]);

  const generatedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: 2,
    generatedAt,
    ...result.registry,
  };
  const snapshotJson = json(snapshot);
  const snapshotGzip = await gzipAsync(snapshotJson, { level: 9 });
  await Promise.all([
    writeFile(path.join(outputDirectory, "registry.json"), snapshotJson, "utf8"),
    writeFile(path.join(outputDirectory, "registry.json.gz"), snapshotGzip),
  ]);

  const indexes = {
    byChain: {} as Record<string, string[]>,
    byIssuer: {} as Record<string, string[]>,
    byUnderlying: {} as Record<string, string[]>,
    byAssetClass: {} as Record<string, string[]>,
    bySymbol: {} as Record<string, string[]>,
  };
  const assetChecksums: Record<string, string> = {};
  let deploymentCount = 0;

  for (const record of result.registry.assets) {
    const assetId = record.asset.id;
    const recordJson = json(record);
    await writeFile(path.join(outputAssetsDirectory, `${assetId}.json`), recordJson, "utf8");
    assetChecksums[assetId] = sha256(recordJson);
    deploymentCount += record.deployments.length;
    addToIndex(indexes.byIssuer, record.asset.issuerId, assetId);
    addToIndex(indexes.byUnderlying, record.asset.underlyingId, assetId);
    addToIndex(indexes.byAssetClass, record.asset.assetClass, assetId);
    addToIndex(indexes.bySymbol, record.asset.symbol.toLowerCase(), assetId);
    for (const deployment of record.deployments) addToIndex(indexes.byChain, deployment.chain, assetId);
  }

  await Promise.all(
    Object.entries(indexes).map(([name, value]) =>
      writeFile(path.join(outputIndexesDirectory, `${name}.json`), json(value), "utf8"),
    ),
  );

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    registryVersion: "0.2.0",
    counts: {
      assets: result.registry.assets.length,
      deployments: deploymentCount,
      underlyings: result.registry.underlyings.length,
      organizations: result.registry.organizations.length,
      issuers: result.registry.issuers.length,
      chains: result.registry.chains.length,
      standards: result.registry.standards.length,
    },
    files: {
      "registry.json": { sha256: sha256(snapshotJson), bytes: Buffer.byteLength(snapshotJson) },
      "registry.json.gz": { sha256: sha256(snapshotGzip), bytes: snapshotGzip.byteLength },
    },
    assetChecksums,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), json(manifest), "utf8");
  console.log(
    `Built registry, manifest, ${result.registry.assets.length} asset files, and five indexes in ${outputDirectory}.`,
  );
}
