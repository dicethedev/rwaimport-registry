import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

interface RpcResponse {
  id: number;
  result?: string;
  error?: { message: string };
}

const rpcUrls: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
};

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
  const results = (await response.json()) as RpcResponse[];
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

if (errors.length > 0) {
  console.error(`On-chain verification failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`On-chain verification passed for ${deployments.length} deployments.`);
}
