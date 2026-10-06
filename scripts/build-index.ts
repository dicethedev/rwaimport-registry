import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

import { validateRegistry } from "../src/registry.js";
import { scoreCompleteness } from "../src/completeness.js";

const gzipAsync = promisify(gzip);
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  await readFile(path.join(rootDirectory, "package.json"), "utf8"),
) as { version: string };
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
  const policyJson = json(result.registry.deploymentPolicies);
  const resolverPolicyJson = json({
    schemaVersion: 1,
    deployments: result.registry.deploymentPolicies.deployments
      .filter((policy) => policy.evmChecks.length > 0 || policy.ledgerChecks.length > 0)
      .map((policy) => ({
        input: policy.input,
        ...(policy.evmChecks.length > 0 ? { evmChecks: policy.evmChecks } : {}),
        ...(policy.ledgerChecks.length > 0 ? { ledgerChecks: policy.ledgerChecks } : {}),
      })),
  });
  await Promise.all([
    writeFile(path.join(outputDirectory, "registry.json"), snapshotJson, "utf8"),
    writeFile(path.join(outputDirectory, "registry.json.gz"), snapshotGzip),
    writeFile(path.join(outputDirectory, "deployment-policies.json"), policyJson, "utf8"),
    writeFile(path.join(outputDirectory, "resolver-policies.json"), resolverPolicyJson, "utf8"),
  ]);

  const indexes = {
    byChain: {} as Record<string, string[]>,
    byIssuer: {} as Record<string, string[]>,
    byUnderlying: {} as Record<string, string[]>,
    byAssetClass: {} as Record<string, string[]>,
    bySymbol: {} as Record<string, string[]>,
  };
  const assetChecksums: Record<string, string> = {};
  const completeness: Record<string, ReturnType<typeof scoreCompleteness>> = {};
  let deploymentCount = 0;

  for (const record of result.registry.assets) {
    const assetId = record.asset.id;
    const recordJson = json(record);
    await writeFile(path.join(outputAssetsDirectory, `${assetId}.json`), recordJson, "utf8");
    assetChecksums[assetId] = sha256(recordJson);
    completeness[assetId] = scoreCompleteness(record, new Date(generatedAt));
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
  await writeFile(path.join(outputDirectory, "completeness.json"), json(completeness), "utf8");

  const scores = Object.values(completeness).map(({ total }) => total);

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    registryVersion: packageMetadata.version,
    counts: {
      assets: result.registry.assets.length,
      deployments: deploymentCount,
      underlyings: result.registry.underlyings.length,
      organizations: result.registry.organizations.length,
      issuers: result.registry.issuers.length,
      chains: result.registry.chains.length,
      standards: result.registry.standards.length,
      deploymentPolicies: result.registry.deploymentPolicies.deployments.length,
      averageCompleteness: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    },
    files: {
      "registry.json": { sha256: sha256(snapshotJson), bytes: Buffer.byteLength(snapshotJson) },
      "registry.json.gz": { sha256: sha256(snapshotGzip), bytes: snapshotGzip.byteLength },
      "completeness.json": {
        sha256: sha256(json(completeness)),
        bytes: Buffer.byteLength(json(completeness)),
      },
      "deployment-policies.json": {
        sha256: sha256(policyJson),
        bytes: Buffer.byteLength(policyJson),
      },
      "resolver-policies.json": {
        sha256: sha256(resolverPolicyJson),
        bytes: Buffer.byteLength(resolverPolicyJson),
      },
    },
    assetChecksums,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), json(manifest), "utf8");
  console.log(
    `Built registry, manifest, ${result.registry.assets.length} asset files, and five indexes in ${outputDirectory}.`,
  );
}
