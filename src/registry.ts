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
  Registry,
  Source,
  Standard,
  ValidationResult,
} from "./types.js";

type SchemaName =
  | "asset"
  | "deployments"
  | "compliance"
  | "sources"
  | "issuer"
  | "chain"
  | "standard";

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

  const assets: AssetRecord[] = [];
  const assetEntries = await readdir(path.join(rootDirectory, "assets"), { withFileTypes: true });
  for (const entry of assetEntries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const assetDirectory = path.join(rootDirectory, "assets", entry.name);
    const asset = await readJson<Asset>(path.join(assetDirectory, "asset.json"));
    const deployments = await readJson<Deployment[]>(path.join(assetDirectory, "deployments.json"));
    const compliance = await readJson<Compliance>(path.join(assetDirectory, "compliance.json"));
    const sources = await readJson<Source[]>(path.join(assetDirectory, "sources.json"));

    for (const [name, value, fileName] of [
      ["asset", asset, "asset.json"],
      ["deployments", deployments, "deployments.json"],
      ["compliance", compliance, "compliance.json"],
      ["sources", sources, "sources.json"],
    ] as const) {
      const validator = validators[name];
      if (!validator(value)) {
        errors.push(...formatAjvErrors(path.join(assetDirectory, fileName), validator.errors));
      }
    }

    if (asset.id !== entry.name) {
      errors.push(`${assetDirectory}: directory name must equal asset id "${asset.id}"`);
    }
    assets.push({ asset, deployments, compliance, sources });
  }

  checkUnique("asset id", assets.map(({ asset }) => asset.id), errors);
  checkUnique("issuer id", issuers.map((issuer) => issuer.id), errors);
  checkUnique("chain id", chains.map((chain) => chain.id), errors);
  checkUnique("numeric chain id", chains.map((chain) => String(chain.chainId)), errors);
  checkUnique("standard id", standards.map((standard) => standard.id), errors);
  checkUnique(
    "deployment",
    assets.flatMap(({ deployments }) =>
      deployments.map((deployment) => `${deployment.chainId}:${deployment.address.toLowerCase()}`),
    ),
    errors,
  );

  const issuerIds = new Set(issuers.map((issuer) => issuer.id));
  const chainById = new Map(chains.map((chain) => [chain.id, chain]));
  const standardIds = new Set(standards.map((standard) => standard.id));

  for (const standard of standards) {
    for (const relatedId of standard.relatedStandardIds ?? []) {
      if (!standardIds.has(relatedId)) {
        errors.push(`Standard ${standard.id} references unknown standard ${relatedId}`);
      }
    }
  }

  for (const { asset, deployments, compliance, sources } of assets) {
    const sourceIds = new Set(sources.map((source) => source.id));
    checkUnique(`source id in asset ${asset.id}`, sources.map((source) => source.id), errors);

    for (const issuerId of [asset.issuerId, ...(asset.tokenizationProviderIds ?? [])]) {
      if (!issuerIds.has(issuerId)) errors.push(`Asset ${asset.id} references unknown issuer ${issuerId}`);
    }
    for (const sourceId of [...asset.verifiedBy, ...compliance.verifiedBy]) {
      if (!sourceIds.has(sourceId)) errors.push(`Asset ${asset.id} references unknown source ${sourceId}`);
    }
    for (const deployment of deployments) {
      const chain = chainById.get(deployment.chain);
      if (!chain) {
        errors.push(`Asset ${asset.id} references unknown chain ${deployment.chain}`);
      } else if (chain.chainId !== deployment.chainId) {
        errors.push(`Asset ${asset.id} deployment chainId does not match ${deployment.chain}`);
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

  const registry: Registry = { assets, issuers, chains, standards };
  return errors.length === 0 ? { valid: true, errors, registry } : { valid: false, errors };
}
