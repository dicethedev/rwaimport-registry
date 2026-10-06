import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Deployment, DeploymentPolicy, DeploymentPolicyCatalog, Source } from "../src/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "deployment-policies.json");

function key(chain: string, address: string): string {
  return `${chain}:${["aptos", "arbitrum", "avalanche", "base", "bnb-chain", "ethereum", "polygon", "robinhood-chain"].includes(chain) ? address.toLowerCase() : address}`;
}

function unknown(notes?: string) {
  return { availability: "unknown" as const, ...(notes ? { notes } : {}) };
}

function unavailable() {
  return { availability: "not-applicable" as const };
}

function unknownValue(notes?: string) {
  return { availability: "unknown" as const, ...(notes ? { notes } : {}) };
}

function standardPolicies(standardIds: string[]): Record<string, unknown> {
  const policies: Record<string, unknown> = {};
  if (standardIds.includes("erc3643")) {
    policies.erc3643 = {
      identityRegistry: unknownValue(),
      compliance: unknownValue(),
      agents: unknown(),
    };
  }
  if (standardIds.includes("erc4626")) {
    policies.erc4626 = {
      asset: unknownValue(),
      depositsEnabled: unknownValue(),
      withdrawalsEnabled: unknownValue(),
      maxDeposit: unknownValue(),
      maxRedeem: unknownValue(),
    };
  }
  if (standardIds.includes("erc1404")) {
    policies.erc1404 = {
      restrictionMode: unknownValue(),
      restrictionDetection: unknownValue(),
    };
  }
  if (standardIds.includes("cmtat")) {
    policies.cmtat = {
      ruleEngine: unknownValue(),
      version: unknownValue(),
      terms: unknownValue(),
    };
  }
  return policies;
}

function sourceReviewDate(sources: Source[], sourceIds: string[]): string {
  return sources
    .filter(({ id }) => sourceIds.includes(id))
    .map((source) => String(source.lastVerifiedAt ?? source.accessedAt))
    .sort()
    .at(-1) ?? "1970-01-01";
}

function generatedPolicy(assetId: string, symbol: string, deployment: Deployment, sources: Source[]): DeploymentPolicy {
  const verification = deployment.verification ?? { lastVerifiedAt: "1970-01-01T00:00:00Z", accountExists: false, method: "manual" };
  const isEvm = deployment.chainId !== undefined;
  const sourceIds = deployment.verifiedBy;
  const permissions: DeploymentPolicy["permissions"] = {
    owner: unknown("No owner is inferred from token metadata or bytecode existence."),
    admin: verification.contractAdmin
      ? { availability: "known", accounts: [String(verification.contractAdmin)], controlType: "account", notes: "Observed in the EIP-1967 admin slot." }
      : unknown(),
    mint: unknown(),
    burn: unknown(),
    pause: unknown(),
    upgrade: verification.contractAdmin
      ? { availability: "known", accounts: [String(verification.contractAdmin)], controlType: "account", notes: "Expected proxy upgrade authority from the EIP-1967 admin slot." }
      : isEvm ? unknown() : unavailable(),
  };
  const input: DeploymentPolicy["input"] = isEvm
    ? { chainId: deployment.chainId!, address: deployment.address }
    : {
        network: deployment.chain as "solana" | "stellar" | "aptos",
        address: deployment.address,
        ...(deployment.chain === "stellar" ? { assetCode: String(verification.observedSymbol ?? symbol) } : {}),
        ...(deployment.chain === "aptos" && deployment.assetNamespace === "coin" && deployment.assetReference
          ? { coinType: deployment.assetReference }
          : {}),
      };
  let nonEvmPolicy: Record<string, unknown> | undefined;
  let supportedChecks: string[];
  if (deployment.chain === "solana") {
    nonEvmPolicy = {
      network: "solana",
      tokenProgram: verification.owner ? { availability: "known", value: verification.owner } : unknownValue(),
      mintAuthority: unknown(),
      freezeAuthority: unknown(),
      updateAuthority: unknown(),
      extensions: [],
    };
    supportedChecks = ["solana-mint-authorities", "solana-token-extensions"];
  } else if (deployment.chain === "stellar") {
    nonEvmPolicy = {
      network: "stellar",
      signers: unknownValue(),
      thresholds: unknownValue(),
      authorizationFlags: unknownValue(),
    };
    supportedChecks = ["stellar-signers", "stellar-thresholds", "stellar-authorization-flags"];
  } else if (deployment.chain === "aptos") {
    const legacyCoin = deployment.assetNamespace === "coin";
    nonEvmPolicy = {
      network: "aptos",
      assetModel: legacyCoin ? "legacy-coin" : "fungible-asset",
      ...(legacyCoin && deployment.assetReference ? { coinType: deployment.assetReference } : {}),
      objectOwner: legacyCoin ? unavailable() : unknown(),
      capabilities: { mint: unknown(), burn: unknown(), freeze: unknown(), transfer: unknown() },
    };
    supportedChecks = legacyCoin ? ["aptos-coin-info", "aptos-capabilities"] : ["aptos-object-owner", "aptos-capabilities"];
  } else {
    supportedChecks = ["evm-read", ...(verification.implementationAddress || verification.contractAdmin ? ["eip1967-storage"] : [])];
  }
  return {
    assetId,
    deployment: {
      chain: deployment.chain,
      address: deployment.address,
      ...(deployment.assetReference ? { assetReference: deployment.assetReference } : {}),
    },
    input,
    permissions,
    standardPolicies: standardPolicies(deployment.standardIds),
    ...(nonEvmPolicy ? { nonEvmPolicy } : {}),
    supportedChecks,
    evmChecks: [],
    ledgerChecks: [],
    provenance: {
      sourceIds,
      reviewedAt: sourceReviewDate(sources, sourceIds),
      reviewer: "rwaimport-registry-policy-sync",
      reviewStatus: "needs-review",
      notes: "Generated baseline. Permission holders and standard-specific settings are left unknown until supported by explicit evidence.",
    },
  };
}

let existing = new Map<string, DeploymentPolicy>();
try {
  const catalog = JSON.parse(await readFile(outputPath, "utf8")) as DeploymentPolicyCatalog;
  existing = new Map(catalog.deployments.map((policy) => [key(policy.deployment.chain, policy.deployment.address), policy]));
} catch {
  existing = new Map();
}

const policies: DeploymentPolicy[] = [];
for (const entry of (await readdir(path.join(root, "assets"), { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = path.join(root, "assets", entry.name);
  const asset = JSON.parse(await readFile(path.join(directory, "asset.json"), "utf8")) as { id: string; symbol: string };
  const deployments = JSON.parse(await readFile(path.join(directory, "deployments.json"), "utf8")) as Deployment[];
  const sources = JSON.parse(await readFile(path.join(directory, "sources.json"), "utf8")) as Source[];
  for (const deployment of deployments) {
    policies.push(existing.get(key(deployment.chain, deployment.address)) ?? generatedPolicy(asset.id, asset.symbol, deployment, sources));
  }
}

const catalog: DeploymentPolicyCatalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  deployments: policies,
};
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Synchronized permission policies for ${policies.length} deployments.`);
