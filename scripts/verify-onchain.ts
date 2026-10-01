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
};
const solanaRpcUrl = "https://api.mainnet-beta.solana.com";
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validation = await validateRegistry(rootDirectory);
if (!validation.valid || !validation.registry) {
  throw new Error("Registry must pass local validation before on-chain verification");
}

const deployments = validation.registry.assets.flatMap(({ asset, deployments: assetDeployments }) =>
  assetDeployments.map((deployment) => ({ assetId: asset.id, ...deployment })),
);
const errors: string[] = [];

for (const [chainIdText, rpcUrl] of Object.entries(rpcUrls)) {
  const chainId = Number(chainIdText);
  const chainDeployments = deployments.filter((deployment) => deployment.chainId === chainId);
  if (chainDeployments.length === 0) continue;

  const payload = chainDeployments.map((deployment, index) => ({
    jsonrpc: "2.0",
    id: index,
    method: "eth_getCode",
    params: [deployment.address, "latest"],
  }));
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${chainId} RPC returned HTTP ${response.status}`);
  const results = (await response.json()) as EvmRpcResponse[];
  const resultById = new Map(results.map((result) => [result.id, result]));

  chainDeployments.forEach((deployment, index) => {
    const result = resultById.get(index);
    if (!result || result.error || !result.result || result.result === "0x") {
      errors.push(
        `${deployment.assetId} ${deployment.chain} ${deployment.address}: ` +
          (result?.error?.message ?? "no deployed bytecode"),
      );
    }
  });
  console.log(`Verified ${chainDeployments.length} deployed contracts on chain ${chainId}.`);
}

const solanaDeployments = deployments.filter((deployment) => deployment.chain === "solana");
for (let offset = 0; offset < solanaDeployments.length; offset += 100) {
  const batch = solanaDeployments.slice(offset, offset + 100);
  const response = await fetch(solanaRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: offset / 100,
      method: "getMultipleAccounts",
      params: [
        batch.map((deployment) => deployment.address),
        { encoding: "base64", commitment: "confirmed" },
      ],
    }),
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
  console.log(`Verified ${solanaDeployments.length} Token-2022 mints on Solana.`);
}

if (errors.length > 0) {
  console.error(`On-chain verification failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`On-chain verification passed for ${deployments.length} deployments.`);
}
