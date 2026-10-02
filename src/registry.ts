import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type {
  Asset,
  AssetRecord,
  Chain,
  Compliance,
  Deployment,
  Issuer,
  Organization,
  Registry,
  Source,
  Standard,
  Underlying,
  Valuation,
  Claim,
  HistoryEvent,
  ValidationResult,
} from "./types.js";

type SchemaName =
  | "asset"
  | "deployments"
  | "compliance"
  | "sources"
  | "issuer"
  | "chain"
  | "standard"
  | "underlying"
  | "organization"
  | "valuation"
  | "claims"
  | "history";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaDirectory = path.resolve(sourceDirectory, "../schemas");

async function readJson<T>(filePath: string): Promise<T> {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function formatAjvErrors(filePath: string, errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map(
    (error) => `${filePath}${error.instancePath || "/"}: ${error.message ?? "is invalid"}`,
  );
}

async function createValidators(schemaDirectory: string): Promise<Record<SchemaName, ValidateFunction>> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const names: SchemaName[] = [
    "asset",
    "deployments",
    "compliance",
    "sources",
    "issuer",
    "chain",
    "standard",
    "underlying",
    "organization",
    "valuation",
    "claims",
    "history",
  ];
  const validators = {} as Record<SchemaName, ValidateFunction>;

  for (const name of names) {
    const schemaFile = path.join(schemaDirectory, `${name}.schema.json`);
    validators[name] = ajv.compile(await readJson(schemaFile));
  }

  return validators;
}

async function loadFlatRecords<T extends { id: string }>(
  directory: string,
  validator: ValidateFunction,
  errors: string[],
): Promise<T[]> {
  const records: T[] = [];
  for (const filePath of await jsonFiles(directory)) {
    const record = await readJson<T>(filePath);
    if (!validator(record)) {
      errors.push(...formatAjvErrors(filePath, validator.errors));
    }
    const fileId = path.basename(filePath, ".json");
    if (record.id !== fileId) {
      errors.push(`${filePath}: file name must equal record id "${record.id}"`);
    }
    records.push(record);
  }
  return records;
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function checkUnique(label: string, values: string[], errors: string[]): void {
  for (const duplicate of findDuplicates(values)) {
    errors.push(`Duplicate ${label}: ${duplicate}`);
  }
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

export async function validateRegistry(
  rootDirectory: string,
  schemaDirectory = defaultSchemaDirectory,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const validators = await createValidators(schemaDirectory);

  const issuers = await loadFlatRecords<Issuer>(
    path.join(rootDirectory, "issuers"),
    validators.issuer,
    errors,
  );
  const chains = await loadFlatRecords<Chain>(
    path.join(rootDirectory, "chains"),
    validators.chain,
    errors,
  );
  const standards = await loadFlatRecords<Standard>(
    path.join(rootDirectory, "standards"),
    validators.standard,
    errors,
  );
  const underlyings = await loadFlatRecords<Underlying>(
    path.join(rootDirectory, "underlyings"),
    validators.underlying,
    errors,
  );
  const organizations = await loadFlatRecords<Organization>(
    path.join(rootDirectory, "organizations"),
    validators.organization,
    errors,
  );

  const assets: AssetRecord[] = [];
  const assetEntries = await readdir(path.join(rootDirectory, "assets"), { withFileTypes: true });
  for (const entry of assetEntries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const assetDirectory = path.join(rootDirectory, "assets", entry.name);
    const asset = await readJson<Asset>(path.join(assetDirectory, "asset.json"));
    const deployments = await readJson<Deployment[]>(path.join(assetDirectory, "deployments.json"));
    const compliance = await readJson<Compliance>(path.join(assetDirectory, "compliance.json"));
    const sources = await readJson<Source[]>(path.join(assetDirectory, "sources.json"));
    const valuation = await readJson<Valuation>(path.join(assetDirectory, "valuation.json"));
    const claims = await readJson<Claim[]>(path.join(assetDirectory, "claims.json"));
    const history = await readJson<HistoryEvent[]>(path.join(assetDirectory, "history.json"));

    for (const [name, value, fileName] of [
      ["asset", asset, "asset.json"],
      ["deployments", deployments, "deployments.json"],
      ["compliance", compliance, "compliance.json"],
      ["sources", sources, "sources.json"],
      ["valuation", valuation, "valuation.json"],
      ["claims", claims, "claims.json"],
      ["history", history, "history.json"],
    ] as const) {
      const validator = validators[name];
      if (!validator(value)) {
        errors.push(...formatAjvErrors(path.join(assetDirectory, fileName), validator.errors));
      }
    }

    if (asset.id !== entry.name) {
      errors.push(`${assetDirectory}: directory name must equal asset id "${asset.id}"`);
    }
    assets.push({ asset, deployments, compliance, sources, valuation, claims, history });
  }

  checkUnique("asset id", assets.map(({ asset }) => asset.id), errors);
  checkUnique("issuer id", issuers.map((issuer) => issuer.id), errors);
  checkUnique("chain id", chains.map((chain) => chain.id), errors);
  checkUnique(
    "network reference",
    chains.map((chain) => `${chain.namespace}:${chain.reference}`),
    errors,
  );
  checkUnique("standard id", standards.map((standard) => standard.id), errors);
  checkUnique("underlying id", underlyings.map((underlying) => underlying.id), errors);
  checkUnique("organization id", organizations.map((organization) => organization.id), errors);
  checkUnique(
    "deployment",
    assets.flatMap(({ deployments }) =>
      deployments.map((deployment) => {
        const chain = chains.find((candidate) => candidate.id === deployment.chain);
        const address = chain?.type === "evm" ? deployment.address.toLowerCase() : deployment.address;
        return `${deployment.chain}:${address}`;
      }),
    ),
    errors,
  );

  const issuerIds = new Set(issuers.map((issuer) => issuer.id));
  const chainById = new Map(chains.map((chain) => [chain.id, chain]));
  const standardIds = new Set(standards.map((standard) => standard.id));
  const underlyingIds = new Set(underlyings.map((underlying) => underlying.id));
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  const assetIds = new Set(assets.map(({ asset }) => asset.id));

  for (const underlying of underlyings) {
    for (const sourceAssetId of underlying.sourceAssetIds) {
      if (!assetIds.has(sourceAssetId)) {
        errors.push(`Underlying ${underlying.id} references unknown source asset ${sourceAssetId}`);
      }
    }
    const underlyingSourceIdList = (underlying.sources ?? []).map((source) => source.id);
    const underlyingSourceIds = new Set(underlyingSourceIdList);
    checkUnique(
      `source id in underlying ${underlying.id}`,
      underlyingSourceIdList,
      errors,
    );
    for (const claim of underlying.claims ?? []) {
      for (const sourceId of claim.sourceIds) {
        if (!underlyingSourceIds.has(sourceId)) {
          errors.push(`Underlying ${underlying.id} claim ${claim.field} references unknown source ${sourceId}`);
        }
      }
    }
  }

  for (const chain of chains) {
    if (chain.type === "evm" && chain.chainId === undefined) {
      errors.push(`EVM chain ${chain.id} must define a numeric chainId`);
    }
    if (chain.type !== "evm" && chain.chainId !== undefined) {
      errors.push(`Non-EVM chain ${chain.id} must not define a numeric chainId`);
    }
  }

  for (const standard of standards) {
    for (const relatedId of standard.relatedStandardIds ?? []) {
      if (!standardIds.has(relatedId)) {
        errors.push(`Standard ${standard.id} references unknown standard ${relatedId}`);
      }
    }
  }

  for (const { asset, deployments, compliance, sources, valuation, claims, history } of assets) {
    const sourceIds = new Set(sources.map((source) => source.id));
    checkUnique(`source id in asset ${asset.id}`, sources.map((source) => source.id), errors);

    for (const issuerId of [asset.issuerId, ...(asset.tokenizationProviderIds ?? [])]) {
      if (!issuerIds.has(issuerId)) errors.push(`Asset ${asset.id} references unknown issuer ${issuerId}`);
    }
    if (!underlyingIds.has(asset.underlyingId)) {
      errors.push(`Asset ${asset.id} references unknown underlying ${asset.underlyingId}`);
    }
    for (const organizationRole of asset.organizationRoles) {
      if (!organizationIds.has(organizationRole.organizationId)) {
        errors.push(
          `Asset ${asset.id} references unknown organization ${organizationRole.organizationId}`,
        );
      }
    }
    for (const sourceId of [...asset.verifiedBy, ...compliance.verifiedBy, ...valuation.verifiedBy]) {
      if (!sourceIds.has(sourceId)) errors.push(`Asset ${asset.id} references unknown source ${sourceId}`);
    }
    for (const relationship of asset.relationships ?? []) {
      if (relationship.assetId === asset.id) {
        errors.push(`Asset ${asset.id} must not relate to itself`);
      }
      if (!assetIds.has(relationship.assetId)) {
        errors.push(`Asset ${asset.id} relationship references unknown asset ${relationship.assetId}`);
      }
      for (const sourceId of relationship.verifiedBy) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`Asset ${asset.id} relationship references unknown source ${sourceId}`);
        }
      }
    }
    checkUnique(`history event id in asset ${asset.id}`, history.map((event) => event.id), errors);
    for (const claim of claims) {
      for (const sourceId of claim.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`Asset ${asset.id} claim ${claim.field} references unknown source ${sourceId}`);
        }
      }
    }
    for (const event of history) {
      for (const sourceId of event.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`Asset ${asset.id} history event ${event.id} references unknown source ${sourceId}`);
        }
      }
    }
    for (const deployment of deployments) {
      const chain = chainById.get(deployment.chain);
      if (!chain) {
        errors.push(`Asset ${asset.id} references unknown chain ${deployment.chain}`);
      } else if (chain.type === "evm" && chain.chainId !== deployment.chainId) {
        errors.push(`Asset ${asset.id} deployment chainId does not match ${deployment.chain}`);
      } else if (chain.type !== "evm" && deployment.chainId !== undefined) {
        errors.push(`Asset ${asset.id} deployment must not use numeric chainId for ${deployment.chain}`);
      } else if (chain.type === "solana" && base58DecodedLength(deployment.address) !== 32) {
        errors.push(`Asset ${asset.id} deployment address is not a 32-byte Solana public key`);
      } else if (!new RegExp(chain.addressPattern).test(deployment.address)) {
        errors.push(`Asset ${asset.id} deployment address does not match ${deployment.chain}`);
      }
      for (const standardId of deployment.standardIds) {
        if (!standardIds.has(standardId)) {
          errors.push(`Asset ${asset.id} references unknown standard ${standardId}`);
        }
      }
      for (const sourceId of deployment.verifiedBy) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`Asset ${asset.id} deployment references unknown source ${sourceId}`);
        }
      }
    }
  }

  const registry: Registry = { assets, issuers, chains, standards, underlyings, organizations };
  return { valid: errors.length === 0, errors, registry };
}
