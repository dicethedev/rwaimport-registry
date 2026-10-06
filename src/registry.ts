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
  DeploymentPolicyCatalog,
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
  | "history"
  | "deployment-policies";

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
    "deployment-policies",
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

const supportedEvmPolicySignatures = new Map<string, "address" | "boolean" | "uint" | "text" | "bytes32">([
  ...["owner()", "pendingOwner()", "asset()", "identityRegistry()", "compliance()", "ruleEngine()"].map((signature) => [signature, "address"] as const),
  ...["paused()", "isAgent(address)", "isFrozen(address)", "hasRole(bytes32,address)", "canTransfer(address,address,uint256)"].map((signature) => [signature, "boolean"] as const),
  ...["totalAssets()", "convertToAssets(uint256)", "convertToShares(uint256)", "previewDeposit(uint256)", "previewRedeem(uint256)", "maxDeposit(address)", "maxRedeem(address)", "detectTransferRestriction(address,address,uint256)"].map((signature) => [signature, "uint"] as const),
  ...["version()", "VERSION()", "messageForTransferRestriction(uint8)"].map((signature) => [signature, "text"] as const),
  ...["proxiableUUID()", "getRoleAdmin(bytes32)"].map((signature) => [signature, "bytes32"] as const),
]);

export async function validateRegistry(
  rootDirectory: string,
  schemaDirectory = defaultSchemaDirectory,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const validators = await createValidators(schemaDirectory);
  const deploymentPoliciesPath = path.join(rootDirectory, "deployment-policies.json");
  const deploymentPolicies = await readJson<DeploymentPolicyCatalog>(deploymentPoliciesPath);
  if (!validators["deployment-policies"](deploymentPolicies)) {
    errors.push(...formatAjvErrors(deploymentPoliciesPath, validators["deployment-policies"].errors));
  }

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
  const deploymentByKey = new Map<string, { asset: Asset; deployment: Deployment; sourceIds: Set<string> }>();

  const deploymentKey = (chainId: string, address: string): string => {
    const chain = chainById.get(chainId);
    return `${chainId}:${chain?.type === "evm" || chain?.type === "aptos" ? address.toLowerCase() : address}`;
  };

  for (const { asset, deployments, sources } of assets) {
    for (const deployment of deployments) {
      deploymentByKey.set(deploymentKey(deployment.chain, deployment.address), {
        asset,
        deployment,
        sourceIds: new Set(sources.map((source) => source.id)),
      });
    }
  }

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
      if (deployment.chain === "aptos" && deployment.assetNamespace === "coin") {
        const coinType = deployment.assetReference;
        const canonical = coinType ? canonicalAptosCoinType(coinType) : undefined;
        if (!canonical || canonical !== coinType) {
          errors.push(`Asset ${asset.id} legacy Aptos Coin reference must use canonical package::module::Coin form`);
        } else {
          const packageAddress = canonical.split("::")[0]?.slice(2) ?? "";
          const expectedAddress = `0x${packageAddress.padStart(64, "0")}`;
          if (expectedAddress !== deployment.address.toLowerCase()) {
            errors.push(`Asset ${asset.id} legacy Aptos Coin address must equal its padded package address`);
          }
        }
        if (!deployment.standardIds.includes("aptos-coin")) {
          errors.push(`Asset ${asset.id} legacy Aptos Coin deployment must declare aptos-coin`);
        }
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

  const policyKeys = new Set<string>();
  for (const policy of deploymentPolicies.deployments) {
    const key = deploymentKey(policy.deployment.chain, policy.deployment.address);
    if (policyKeys.has(key)) errors.push(`Duplicate deployment policy: ${key}`);
    policyKeys.add(key);
    const target = deploymentByKey.get(key);
    if (!target) {
      errors.push(`Deployment policy ${key} references an unknown deployment`);
      continue;
    }
    if (policy.assetId !== target.asset.id) {
      errors.push(`Deployment policy ${key} references asset ${policy.assetId} instead of ${target.asset.id}`);
    }
    if ((policy.deployment.assetReference ?? target.deployment.assetReference) !== target.deployment.assetReference) {
      errors.push(`Deployment policy ${key} has a conflicting assetReference`);
    }
    for (const sourceId of policy.provenance.sourceIds) {
      if (!target.sourceIds.has(sourceId)) {
        errors.push(`Deployment policy ${key} references unknown source ${sourceId}`);
      }
    }
    const chain = chainById.get(target.deployment.chain);
    if (chain?.type === "evm") {
      if (!("chainId" in policy.input) || policy.input.chainId !== target.deployment.chainId || policy.input.address.toLowerCase() !== target.deployment.address.toLowerCase()) {
        errors.push(`Deployment policy ${key} has a conflicting EVM input`);
      }
      if (policy.ledgerChecks.length > 0 || policy.nonEvmPolicy) {
        errors.push(`Deployment policy ${key} mixes EVM and non-EVM expectations`);
      }
    } else {
      if (!("network" in policy.input) || policy.input.network !== target.deployment.chain || policy.input.address.toLowerCase() !== target.deployment.address.toLowerCase()) {
        errors.push(`Deployment policy ${key} has a conflicting ledger input`);
      }
      if (policy.evmChecks.length > 0) errors.push(`Deployment policy ${key} contains EVM checks for a non-EVM deployment`);
      if (!policy.nonEvmPolicy || policy.nonEvmPolicy.network !== target.deployment.chain) {
        errors.push(`Deployment policy ${key} is missing matching non-EVM permission metadata`);
      }
      if (target.deployment.chain === "stellar" && "network" in policy.input) {
        const observedSymbol = String(target.deployment.verification?.observedSymbol ?? target.asset.symbol);
        if (policy.input.assetCode !== observedSymbol) errors.push(`Deployment policy ${key} has a conflicting Stellar assetCode`);
      }
      if (target.deployment.chain === "aptos" && target.deployment.assetNamespace === "coin" && "network" in policy.input) {
        if (policy.input.coinType !== target.deployment.assetReference) errors.push(`Deployment policy ${key} has a conflicting Aptos coinType`);
      }
    }
    for (const standardId of ["erc3643", "erc4626", "erc1404", "cmtat"] as const) {
      const declared = target.deployment.standardIds.includes(standardId);
      const modeled = policy.standardPolicies[standardId] !== undefined;
      if (declared !== modeled) {
        errors.push(`Deployment policy ${key} must ${declared ? "define" : "not define"} ${standardId} expectations`);
      }
    }
    const checkFields = [...policy.evmChecks, ...policy.ledgerChecks].map(({ field }) => field);
    checkUnique(`permission check field in ${key}`, checkFields, errors);
    if (checkFields.length > 32) errors.push(`Deployment policy ${key} exceeds 32 executable checks`);
    for (const check of policy.evmChecks) {
      const outputType = supportedEvmPolicySignatures.get(check.signature);
      if (!outputType) {
        errors.push(`Deployment policy ${key} uses unsupported EVM check ${check.signature}`);
        continue;
      }
      const argumentText = check.signature.slice(check.signature.indexOf("(") + 1, -1);
      const expectedArguments = argumentText === "" ? 0 : argumentText.split(",").length;
      const actualArguments = Array.isArray(check.args) ? check.args.length : 0;
      if (actualArguments !== expectedArguments) errors.push(`Deployment policy ${key} has the wrong argument count for ${check.signature}`);
      const expected = check.expected;
      if (outputType === "address" && (typeof expected !== "string" || !/^0x[a-fA-F0-9]{40}$/u.test(expected))) {
        errors.push(`Deployment policy ${key} requires an address expectation for ${check.signature}`);
      } else if (outputType === "boolean" && typeof expected !== "boolean") {
        errors.push(`Deployment policy ${key} requires a boolean expectation for ${check.signature}`);
      } else if (outputType === "uint" && (typeof expected !== "string" || !/^\d+$/u.test(expected))) {
        errors.push(`Deployment policy ${key} requires a decimal-string expectation for ${check.signature}`);
      } else if (outputType === "text" && typeof expected !== "string") {
        errors.push(`Deployment policy ${key} requires a text expectation for ${check.signature}`);
      } else if (outputType === "bytes32" && (typeof expected !== "string" || !/^0x[a-fA-F0-9]{64}$/u.test(expected))) {
        errors.push(`Deployment policy ${key} requires a bytes32 expectation for ${check.signature}`);
      }
    }
  }
  for (const key of deploymentByKey.keys()) {
    if (!policyKeys.has(key)) errors.push(`Deployment ${key} is missing a permission policy`);
  }

  const registry: Registry = { assets, issuers, chains, standards, underlyings, organizations, deploymentPolicies };
  return { valid: errors.length === 0, errors, registry };
}

function canonicalAptosCoinType(value: string): string | undefined {
  const parts = value.split("::");
  if (parts.length !== 3) return undefined;
  const packageId = parts[0]?.match(/^0x([a-fA-F0-9]{1,64})$/u)?.[1];
  const moveIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
  if (!packageId || !moveIdentifier.test(parts[1] ?? "") || !moveIdentifier.test(parts[2] ?? "")) return undefined;
  const normalizedPackage = packageId.toLowerCase().replace(/^0+/u, "") || "0";
  return `0x${normalizedPackage}::${parts[1]}::${parts[2]}`;
}
