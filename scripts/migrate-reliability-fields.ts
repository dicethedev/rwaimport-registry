import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;
type Availability = "known" | "unknown" | "not-applicable";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = path.join(root, "assets");
const verificationSnapshotPath = path.join(root, "snapshots", "onchain", "deployments.json");
let storedVerifications = new Map<string, JsonObject>();
try {
  const snapshot = JSON.parse(await readFile(verificationSnapshotPath, "utf8")) as {
    deployments: Array<{ chain: string; address: string; verification: JsonObject }>;
  };
  storedVerifications = new Map(snapshot.deployments.map((entry) => [
    `${entry.chain}:${entry.address.toLowerCase()}`,
    entry.verification,
  ]));
} catch {
  storedVerifications = new Map();
}
const currentVerifications: Array<{ assetId: string; chain: string; address: string; verification: JsonObject }> = [];

function availability(record: JsonObject, field: string): Availability {
  return record[field] === undefined || record[field] === null ? "unknown" : "known";
}

function sourceDate(sources: JsonObject[]): string {
  return sources
    .map((source) => String(source.lastVerifiedAt ?? source.accessedAt ?? "1970-01-01"))
    .sort()
    .at(-1) ?? "1970-01-01";
}

function claimsFor(
  prefix: "asset" | "compliance" | "valuation",
  record: JsonObject,
  sourceIds: string[],
  reviewedAt: string,
): JsonObject[] {
  const ignored = new Set(["schemaVersion", "verifiedBy", "dataAvailability"]);
  return Object.keys(record)
    .filter((field) => !ignored.has(field))
    .sort()
    .map((field) => ({
      field: `${prefix}.${field}`,
      sourceIds,
      reviewedAt,
      reviewStatus: "verified",
      confidence: "high",
    }));
}

const entries = (await readdir(assetsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

for (const entry of entries) {
  const directory = path.join(assetsDirectory, entry.name);
  const asset = JSON.parse(await readFile(path.join(directory, "asset.json"), "utf8")) as JsonObject;
  const compliance = JSON.parse(await readFile(path.join(directory, "compliance.json"), "utf8")) as JsonObject;
  const valuation = JSON.parse(await readFile(path.join(directory, "valuation.json"), "utf8")) as JsonObject;
  const deployments = JSON.parse(await readFile(path.join(directory, "deployments.json"), "utf8")) as JsonObject[];
  const sources = JSON.parse(await readFile(path.join(directory, "sources.json"), "utf8")) as JsonObject[];

  asset.dataAvailability = {
    securityType: availability(asset, "securityType"),
    shareClass: availability(asset, "shareClass"),
    offeringType: availability(asset, "offeringType"),
    regulatoryExemption: availability(asset, "regulatoryExemption"),
    prospectusUrl: availability(asset, "prospectusUrl"),
  };
  compliance.dataAvailability = {
    minimumSubscription: availability(compliance, "minimumSubscription"),
    minimumRedemption: availability(compliance, "minimumRedemption"),
    lockupPeriod: availability(compliance, "lockupPeriod"),
  };
  valuation.dataAvailability = {
    oracle: availability(valuation, "oracle"),
    reserveReporting: availability(valuation, "reserveReportingUrl"),
  };
  for (const deployment of deployments) {
    const key = `${String(deployment.chain)}:${String(deployment.address).toLowerCase()}`;
    deployment.verification ??= storedVerifications.get(key);
    if (deployment.verification) {
      currentVerifications.push({
        assetId: String(asset.id),
        chain: String(deployment.chain),
        address: String(deployment.address),
        verification: deployment.verification as JsonObject,
      });
    }
  }

  const reviewedAt = sourceDate(sources);
  const assetSources = asset.verifiedBy as string[];
  const complianceSources = compliance.verifiedBy as string[];
  const valuationSources = valuation.verifiedBy as string[];
  const claims = [
    ...claimsFor("asset", asset, assetSources, reviewedAt),
    ...claimsFor("compliance", compliance, complianceSources, reviewedAt),
    ...claimsFor("valuation", valuation, valuationSources, reviewedAt),
    ...deployments.flatMap((deployment, index) => {
      const sourceIds = deployment.verifiedBy as string[];
      return ["chain", "address", "standardIds", "status"].map((field) => ({
        field: `deployments[${index}].${field}`,
        sourceIds,
        reviewedAt,
        reviewStatus: "verified",
        confidence: "high",
      }));
    }),
  ];

  const historyPath = path.join(directory, "history.json");
  const writes = [
    writeFile(path.join(directory, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`),
    writeFile(path.join(directory, "compliance.json"), `${JSON.stringify(compliance, null, 2)}\n`),
    writeFile(path.join(directory, "valuation.json"), `${JSON.stringify(valuation, null, 2)}\n`),
    writeFile(path.join(directory, "deployments.json"), `${JSON.stringify(deployments, null, 2)}\n`),
    writeFile(path.join(directory, "claims.json"), `${JSON.stringify(claims, null, 2)}\n`),
  ];
  try {
    await access(historyPath);
  } catch {
    writes.push(writeFile(historyPath, "[]\n"));
  }
  await Promise.all(writes);
}

await mkdir(path.dirname(verificationSnapshotPath), { recursive: true });
await writeFile(verificationSnapshotPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: currentVerifications.map(({ verification }) => String(verification.lastVerifiedAt ?? "")).sort().at(-1) ?? new Date().toISOString(),
  deployments: currentVerifications,
}, null, 2)}\n`);

const underlyingDirectory = path.join(root, "underlyings");
for (const fileName of (await readdir(underlyingDirectory)).filter((name) => name.endsWith(".json"))) {
  const filePath = path.join(underlyingDirectory, fileName);
  const underlying = JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
  underlying.dataAvailability = {
    identifiers: availability(underlying, "identifiers"),
    exchange: availability(underlying, "exchange"),
    jurisdiction: availability(underlying, "jurisdiction"),
  };
  await writeFile(filePath, `${JSON.stringify(underlying, null, 2)}\n`);
}

console.log(`Added explicit availability, claim evidence, and history files to ${entries.length} products.`);
