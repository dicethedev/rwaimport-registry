import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

interface EvmRpcResponse {
  id: number;
  result?: string;
  error?: { message: string };
}

interface SolanaRpcResponse {
  result?: {
    value: Array<{ owner: string } | null>;
  };
  error?: { message: string };
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
      await wait(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : 2 ** attempt * 1_000,
      );
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

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validation = await validateRegistry(rootDirectory);
if (!validation.valid || !validation.registry) {
  throw new Error("Registry must pass local validation before on-chain verification");
}

const deployments = validation.registry.assets.flatMap(({ asset, deployments: assetDeployments }) =>
  assetDeployments.map((deployment) => ({ assetId: asset.id, symbol: asset.symbol, ...deployment })),
);
const errors: string[] = [];
let verifiedCount = 0;

for (const [chainIdText, rpcUrl] of Object.entries(rpcUrls)) {
  const chainId = Number(chainIdText);
  const chainDeployments = deployments.filter((deployment) => deployment.chainId === chainId);
  if (chainDeployments.length === 0) continue;
  const batchSize = chainId === 4663 ? 5 : 50;

  for (let offset = 0; offset < chainDeployments.length; offset += batchSize) {
    const batch = chainDeployments.slice(offset, offset + batchSize);
    const payload = batch.map((deployment, index) => ({
      jsonrpc: "2.0",
      id: offset + index,
      method: "eth_getCode",
      params: [deployment.address, "latest"],
    }));
    const response = await postRpc(rpcUrl, payload);
    if (!response.ok) throw new Error(`${chainId} RPC returned HTTP ${response.status}`);
    const results = (await response.json()) as EvmRpcResponse[];
    const resultById = new Map(results.map((result) => [result.id, result]));

    batch.forEach((deployment, index) => {
      const result = resultById.get(offset + index);
      if (!result || result.error || !result.result || result.result === "0x") {
        errors.push(
          `${deployment.assetId} ${deployment.chain} ${deployment.address}: ` +
            (result?.error?.message ?? "no deployed bytecode"),
        );
      }
    });
    if (chainId === 4663 && offset + batchSize < chainDeployments.length) {
      await wait(1_000);
    }
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
    params: [
      batch.map((deployment) => deployment.address),
      { encoding: "base64", commitment: "confirmed" },
    ],
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`);
  const result = (await response.json()) as SolanaRpcResponse;
  if (result.error || !result.result) {
    throw new Error(`Solana RPC failed: ${result.error?.message ?? "missing result"}`);
  }
  batch.forEach((deployment, index) => {
    const account = result.result?.value[index];
    if (!account) {
      errors.push(`${deployment.assetId} solana ${deployment.address}: mint account not found`);
    } else if (account.owner !== token2022ProgramId) {
      errors.push(
        `${deployment.assetId} solana ${deployment.address}: unexpected owner ${account.owner}`,
      );
    }
  });
}
if (solanaDeployments.length > 0) {
  verifiedCount += solanaDeployments.length;
  console.log(`Verified ${solanaDeployments.length} Token-2022 mints on Solana.`);
}

const stellarDeployments = deployments.filter((deployment) => deployment.chain === "stellar");
for (const deployment of stellarDeployments) {
  const query = new URLSearchParams({
    asset_code: deployment.symbol,
    asset_issuer: deployment.address,
    limit: "1",
  });
  const response = await getWithRetry(`${stellarHorizonUrl}/assets?${query}`);
  if (!response.ok) {
    errors.push(`${deployment.assetId} stellar ${deployment.address}: Horizon HTTP ${response.status}`);
    continue;
  }
  const result = (await response.json()) as { _embedded?: { records?: unknown[] } };
  if (!result._embedded?.records || result._embedded.records.length === 0) {
    errors.push(`${deployment.assetId} stellar ${deployment.address}: issued asset not found`);
  }
}
if (stellarDeployments.length > 0) {
  verifiedCount += stellarDeployments.length;
  console.log(`Verified ${stellarDeployments.length} issued assets on Stellar.`);
}

const aptosDeployments = deployments.filter((deployment) => deployment.chain === "aptos");
for (const deployment of aptosDeployments) {
  const response = await getWithRetry(
    `${aptosApiUrl}/accounts/${deployment.address}/resources`,
  );
  if (!response.ok) {
    errors.push(`${deployment.assetId} aptos ${deployment.address}: Aptos API HTTP ${response.status}`);
  }
}
if (aptosDeployments.length > 0) {
  verifiedCount += aptosDeployments.length;
  console.log(`Verified ${aptosDeployments.length} fungible-asset objects on Aptos.`);
}

const unverifiedDeployments = deployments.filter(
  (deployment) =>
    deployment.chain !== "solana" &&
    deployment.chain !== "stellar" &&
    deployment.chain !== "aptos" &&
    (deployment.chainId === undefined || !(deployment.chainId in rpcUrls)),
);
for (const deployment of unverifiedDeployments) {
  errors.push(
    `${deployment.assetId} ${deployment.chain} ${deployment.address}: no verification adapter`,
  );
}

if (errors.length > 0) {
  console.error(`On-chain verification failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`On-chain verification passed for ${verifiedCount} deployments.`);
}
