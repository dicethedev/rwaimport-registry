import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";
import type { Deployment } from "../src/types.js";

interface RpcResponse {
  id: number;
  result?: string;
  error?: { message: string };
}

interface SolanaAccount {
  owner: string;
  data: [string, string];
}

interface SolanaRpcResponse {
  result?: { value: Array<SolanaAccount | null> };
  error?: { message: string };
}

interface DeploymentRef extends Deployment {
  assetId: string;
  symbol: string;
}

const rpcUrls: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  4663: "https://rpc.mainnet.chain.robinhood.com",
};
const solanaRpcUrl = "https://api.mainnet-beta.solana.com";
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const stellarHorizonUrl = "https://horizon.stellar.org";
const aptosApiUrl = "https://api.mainnet.aptoslabs.com/v1";
const selectors = { name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567" };
const eip1967Slots = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
};
const writeSnapshot = process.argv.includes("--write");
const verifiedAt = new Date().toISOString();

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeString(value: string | undefined): string | undefined {
  if (!value?.startsWith("0x") || value.length < 66) return undefined;
  try {
    const bytes = Buffer.from(value.slice(2), "hex");
    let output: Buffer;
    const offset = Number(BigInt(`0x${bytes.subarray(0, 32).toString("hex")}`));
    if (offset >= 32 && offset + 32 <= bytes.length) {
      const length = Number(BigInt(`0x${bytes.subarray(offset, offset + 32).toString("hex")}`));
      output = bytes.subarray(offset + 32, offset + 32 + length);
    } else {
      output = bytes.subarray(0, 32);
    }
    const decoded = output.toString("utf8").replace(/\0+$/u, "").trim();
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function decodeStorageAddress(value: string | undefined): string | undefined {
  if (!value?.startsWith("0x") || value.length !== 66) return undefined;
  const address = `0x${value.slice(-40)}`;
  return /^0x0{40}$/u.test(address) ? undefined : address;
}

async function postRpc(url: string, body: unknown): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status !== 429 && response.status < 500) return response;
      await response.text();
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 2 ** attempt * 1_000);
    } catch (error) {
      lastError = error;
      await wait(2 ** attempt * 1_000);
    }
  }
  throw new Error(`RPC did not become available for ${url}`, { cause: lastError });
}

async function getWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (response.status !== 429 && response.status < 500) return response;
      await response.text();
    } catch (error) {
      lastError = error;
    }
    await wait(2 ** attempt * 1_000);
  }
  throw new Error(`Endpoint did not become available for ${url}`, { cause: lastError });
}

function verificationAvailability(deployment: Deployment, observed: Record<string, unknown>) {
  const known = (value: unknown) => value === undefined ? "unknown" : "known";
  return {
    deploymentTransaction: known(deployment.deploymentTransaction),
    deploymentBlock: known(deployment.deploymentBlock),
    proxyImplementation: observed.proxyChecked
      ? (observed.implementationAddress ? "known" : "not-applicable")
      : known(deployment.implementationAddress ?? deployment.proxyAddress),
    contractAdmin: observed.proxyChecked
      ? (observed.contractAdmin ? "known" : "not-applicable")
      : "unknown",
    explorerVerification: "unknown",
    observedName: known(observed.observedName),
    observedSymbol: known(observed.observedSymbol),
    observedDecimals: known(observed.observedDecimals),
  };
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validation = await validateRegistry(rootDirectory, path.join(rootDirectory, "schemas"));
if (!validation.registry) {
  throw new Error("Registry could not be loaded");
}
if (!validation.valid) {
  const onlyMissingSnapshots = validation.errors.every((error) =>
    error.includes("deployments.json") && error.includes("required property 'verification'"),
  );
  if (!writeSnapshot || !onlyMissingSnapshots) {
    throw new Error(`Registry must pass local validation before on-chain verification:\n${validation.errors.join("\n")}`);
  }
}

const registry = validation.registry;
const deployments: DeploymentRef[] = registry.assets.flatMap(({ asset, deployments: assetDeployments }) =>
  assetDeployments.map((deployment) => {
    Object.defineProperties(deployment, {
      assetId: { value: asset.id, enumerable: false },
      symbol: { value: asset.symbol, enumerable: false },
    });
    return deployment as DeploymentRef;
  }),
);
const errors: string[] = [];
let verifiedCount = 0;

for (const [chainIdText, rpcUrl] of Object.entries(rpcUrls)) {
  const chainId = Number(chainIdText);
  const chainDeployments = deployments.filter((deployment) => deployment.chainId === chainId);
  if (chainDeployments.length === 0) continue;
  const batchSize = chainId === 4663 ? 5 : 40;

  for (let offset = 0; offset < chainDeployments.length; offset += batchSize) {
    const batch = chainDeployments.slice(offset, offset + batchSize);
    const payload = batch.flatMap((deployment, index) => {
      const baseId = (offset + index) * 6;
      return [
        { jsonrpc: "2.0", id: baseId, method: "eth_getCode", params: [deployment.address, "latest"] },
        { jsonrpc: "2.0", id: baseId + 1, method: "eth_call", params: [{ to: deployment.address, data: selectors.name }, "latest"] },
        { jsonrpc: "2.0", id: baseId + 2, method: "eth_call", params: [{ to: deployment.address, data: selectors.symbol }, "latest"] },
        { jsonrpc: "2.0", id: baseId + 3, method: "eth_call", params: [{ to: deployment.address, data: selectors.decimals }, "latest"] },
        { jsonrpc: "2.0", id: baseId + 4, method: "eth_getStorageAt", params: [deployment.address, eip1967Slots.implementation, "latest"] },
        { jsonrpc: "2.0", id: baseId + 5, method: "eth_getStorageAt", params: [deployment.address, eip1967Slots.admin, "latest"] },
      ];
    });
    const response = await postRpc(rpcUrl, payload);
    if (!response.ok) throw new Error(`${chainId} RPC returned HTTP ${response.status}`);
    const results = (await response.json()) as RpcResponse[];
    const resultById = new Map(results.map((result) => [result.id, result]));

    batch.forEach((deployment, index) => {
      const baseId = (offset + index) * 6;
      const codeResult = resultById.get(baseId);
      const code = codeResult?.result;
      if (!codeResult || codeResult.error || !code || code === "0x") {
        errors.push(`${deployment.assetId} ${deployment.chain} ${deployment.address}: ${codeResult?.error?.message ?? "no deployed bytecode"}`);
        return;
      }
      const observedName = decodeString(resultById.get(baseId + 1)?.result);
      const observedSymbol = decodeString(resultById.get(baseId + 2)?.result);
      const decimalsResult = resultById.get(baseId + 3)?.result;
      const observedDecimals = decimalsResult && decimalsResult !== "0x" ? Number(BigInt(decimalsResult)) : undefined;
      const implementationAddress = decodeStorageAddress(resultById.get(baseId + 4)?.result);
      const contractAdmin = decodeStorageAddress(resultById.get(baseId + 5)?.result);
      const observed = {
        ...(observedName ? { observedName } : {}),
        ...(observedSymbol ? { observedSymbol } : {}),
        ...(Number.isInteger(observedDecimals) && observedDecimals! >= 0 && observedDecimals! <= 255 ? { observedDecimals } : {}),
        ...(implementationAddress ? { implementationAddress } : {}),
        ...(contractAdmin ? { contractAdmin } : {}),
        proxyChecked: true,
      };
      const runtimeCodeSha256 = sha256(Buffer.from(code.slice(2), "hex"));
      const previousHash = deployment.verification?.runtimeCodeSha256;
      if (!writeSnapshot && previousHash && previousHash !== runtimeCodeSha256) {
        errors.push(`${deployment.assetId} ${deployment.chain} ${deployment.address}: runtime bytecode hash changed`);
      }
      const previousImplementation = deployment.verification?.implementationAddress;
      if (!writeSnapshot && previousImplementation && previousImplementation !== implementationAddress) {
        errors.push(`${deployment.assetId} ${deployment.chain} ${deployment.address}: proxy implementation changed`);
      }
      deployment.verification = {
        lastVerifiedAt: verifiedAt,
        accountExists: true,
        method: "evm-bytecode",
        runtimeCodeSha256,
        explorerVerified: "unknown",
        ...(observedName ? { observedName } : {}),
        ...(observedSymbol ? { observedSymbol } : {}),
        ...(Number.isInteger(observedDecimals) && observedDecimals! >= 0 && observedDecimals! <= 255 ? { observedDecimals } : {}),
        ...(implementationAddress ? { implementationAddress } : {}),
        ...(contractAdmin ? { contractAdmin } : {}),
        dataAvailability: verificationAvailability(deployment, observed),
      };
    });
    if (chainId === 4663 && offset + batchSize < chainDeployments.length) await wait(1_000);
  }
  verifiedCount += chainDeployments.length;
  console.log(`Verified ${chainDeployments.length} deployed contracts on chain ${chainId}.`);
}

const solanaDeployments = deployments.filter((deployment) => deployment.chain === "solana");
for (let offset = 0; offset < solanaDeployments.length; offset += 100) {
  const batch = solanaDeployments.slice(offset, offset + 100);
  const response = await postRpc(solanaRpcUrl, {
    jsonrpc: "2.0",
    id: offset / 100,
    method: "getMultipleAccounts",
    params: [batch.map((deployment) => deployment.address), { encoding: "base64", commitment: "confirmed" }],
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`);
  const result = (await response.json()) as SolanaRpcResponse;
  if (result.error || !result.result) throw new Error(`Solana RPC failed: ${result.error?.message ?? "missing result"}`);
  batch.forEach((deployment, index) => {
    const account = result.result?.value[index];
    if (!account) {
      errors.push(`${deployment.assetId} solana ${deployment.address}: mint account not found`);
      return;
    }
    if (account.owner !== token2022ProgramId) {
      errors.push(`${deployment.assetId} solana ${deployment.address}: unexpected owner ${account.owner}`);
      return;
    }
    const bytes = Buffer.from(account.data[0], "base64");
    const observed = bytes.length > 44 ? { observedDecimals: bytes[44] } : {};
    const accountDataSha256 = sha256(bytes);
    deployment.verification = {
      lastVerifiedAt: verifiedAt,
      accountExists: true,
      method: "solana-account-owner",
      accountDataSha256,
      owner: account.owner,
      explorerVerified: "unknown",
      ...observed,
      dataAvailability: verificationAvailability(deployment, observed),
    };
  });
}
verifiedCount += solanaDeployments.length;
if (solanaDeployments.length > 0) console.log(`Verified ${solanaDeployments.length} Token-2022 mints on Solana.`);

const stellarDeployments = deployments.filter((deployment) => deployment.chain === "stellar");
for (const deployment of stellarDeployments) {
  const query = new URLSearchParams({ asset_code: deployment.symbol, asset_issuer: deployment.address, limit: "1" });
  const response = await getWithRetry(`${stellarHorizonUrl}/assets?${query}`);
  const body = await response.text();
  if (!response.ok) {
    errors.push(`${deployment.assetId} stellar ${deployment.address}: Horizon HTTP ${response.status}`);
    continue;
  }
  const result = JSON.parse(body) as { _embedded?: { records?: unknown[] } };
  if (!result._embedded?.records?.length) {
    errors.push(`${deployment.assetId} stellar ${deployment.address}: issued asset not found`);
    continue;
  }
  const observed = { observedSymbol: deployment.symbol };
  deployment.verification = {
    lastVerifiedAt: verifiedAt,
    accountExists: true,
    method: "stellar-horizon",
    accountDataSha256: sha256(body),
    explorerVerified: "unknown",
    ...observed,
    dataAvailability: verificationAvailability(deployment, observed),
  };
}
verifiedCount += stellarDeployments.length;

const aptosDeployments = deployments.filter((deployment) => deployment.chain === "aptos");
for (const deployment of aptosDeployments) {
  const response = await getWithRetry(`${aptosApiUrl}/accounts/${deployment.address}/resources`);
  const body = await response.text();
  if (!response.ok) {
    errors.push(`${deployment.assetId} aptos ${deployment.address}: Aptos API HTTP ${response.status}`);
    continue;
  }
  deployment.verification = {
    lastVerifiedAt: verifiedAt,
    accountExists: true,
    method: "aptos-api",
    accountDataSha256: sha256(body),
    explorerVerified: "unknown",
    dataAvailability: verificationAvailability(deployment, {}),
  };
}
verifiedCount += aptosDeployments.length;

const unverifiedDeployments = deployments.filter((deployment) =>
  deployment.chain !== "solana" && deployment.chain !== "stellar" && deployment.chain !== "aptos" &&
  (deployment.chainId === undefined || !(deployment.chainId in rpcUrls)),
);
for (const deployment of unverifiedDeployments) {
  errors.push(`${deployment.assetId} ${deployment.chain} ${deployment.address}: no verification adapter`);
}

if (errors.length > 0) {
  console.error(`On-chain verification failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  if (writeSnapshot) {
    const snapshotDirectory = path.join(rootDirectory, "snapshots", "onchain");
    await mkdir(snapshotDirectory, { recursive: true });
    await Promise.all(registry.assets.map(({ asset, deployments: assetDeployments }) =>
      writeFile(path.join(rootDirectory, "assets", asset.id, "deployments.json"), `${JSON.stringify(assetDeployments, null, 2)}\n`),
    ));
    await writeFile(path.join(snapshotDirectory, "deployments.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: verifiedAt,
      deployments: deployments.map(({ assetId, chain, address, verification }) => ({ assetId, chain, address, verification })),
    }, null, 2)}\n`);
    console.log(`Stored verification snapshots with timestamp ${verifiedAt}.`);
  }
  console.log(`On-chain verification passed for ${verifiedCount} deployments.`);
}
