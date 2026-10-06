import { cp, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRegistry } from "../src/registry.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validFixture = path.join(repositoryRoot, "tests/fixtures/valid");

describe("registry validation", () => {
  it("accepts a valid, source-backed registry", async () => {
    const result = await validateRegistry(validFixture);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.registry?.assets).toHaveLength(1);
  });

  it("rejects cross-file references that do not exist", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const assetFile = path.join(temporaryRoot, "assets/example-treasury/asset.json");
    const asset = JSON.parse(await readFile(assetFile, "utf8")) as Record<string, unknown>;
    asset.issuerId = "missing-issuer";
    await writeFile(assetFile, `${JSON.stringify(asset, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Asset example-treasury references unknown issuer missing-issuer");
  });

  it("rejects an unknown underlying or organization role", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const assetFile = path.join(temporaryRoot, "assets/example-treasury/asset.json");
    const asset = JSON.parse(await readFile(assetFile, "utf8")) as Record<string, unknown>;
    asset.underlyingId = "missing-underlying";
    asset.organizationRoles = [{ organizationId: "missing-organization", roles: ["issuer"] }];
    await writeFile(assetFile, `${JSON.stringify(asset, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Asset example-treasury references unknown underlying missing-underlying",
    );
    expect(result.errors).toContain(
      "Asset example-treasury references unknown organization missing-organization",
    );
  });

  it("requires freshness metadata for every evidence source", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const sourceFile = path.join(
      temporaryRoot,
      "assets/example-treasury/sources.json",
    );
    const sources = JSON.parse(await readFile(sourceFile, "utf8")) as Array<
      Record<string, unknown>
    >;
    if (!sources[0]) throw new Error("Fixture source is missing");
    delete sources[0].reviewAfter;
    await writeFile(sourceFile, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("required property 'reviewAfter'"))).toBe(
      true,
    );
  });

  it("rejects a deployment whose numeric chain id disagrees with its chain", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const deploymentFile = path.join(
      temporaryRoot,
      "assets/example-treasury/deployments.json",
    );
    const deployments = JSON.parse(await readFile(deploymentFile, "utf8")) as Array<
      Record<string, unknown>
    >;
    if (!deployments[0]) throw new Error("Fixture deployment is missing");
    deployments[0].chainId = 8453;
    await writeFile(deploymentFile, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Asset example-treasury deployment chainId does not match ethereum",
    );
  });

  it("rejects a numeric chain id on a non-EVM deployment", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const chainFile = path.join(temporaryRoot, "chains/ethereum.json");
    const chain = JSON.parse(await readFile(chainFile, "utf8")) as Record<string, unknown>;
    chain.type = "solana";
    chain.namespace = "solana";
    chain.reference = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    await writeFile(chainFile, `${JSON.stringify(chain, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Non-EVM chain ethereum must not define a numeric chainId");
    expect(result.errors).toContain(
      "Asset example-treasury deployment must not use numeric chainId for ethereum",
    );
  });

  it("rejects a Base58 value that is not a 32-byte Solana public key", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const chainFile = path.join(temporaryRoot, "chains/ethereum.json");
    const chain = JSON.parse(await readFile(chainFile, "utf8")) as Record<string, unknown>;
    chain.type = "solana";
    chain.namespace = "solana";
    chain.reference = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    delete chain.chainId;
    await writeFile(chainFile, `${JSON.stringify(chain, null, 2)}\n`, "utf8");

    const deploymentFile = path.join(
      temporaryRoot,
      "assets/example-treasury/deployments.json",
    );
    const deployments = JSON.parse(await readFile(deploymentFile, "utf8")) as Array<
      Record<string, unknown>
    >;
    if (!deployments[0]) throw new Error("Fixture deployment is missing");
    delete deployments[0].chainId;
    deployments[0].address = "7qy1j4Mechfyr6AST3djH4vk4kiEYC2cjEytXdondo";
    await writeFile(deploymentFile, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Asset example-treasury deployment address is not a 32-byte Solana public key",
    );
  });

  it("uses each chain's own address pattern", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const chainFile = path.join(temporaryRoot, "chains/ethereum.json");
    const chain = JSON.parse(await readFile(chainFile, "utf8")) as Record<string, unknown>;
    chain.type = "stellar";
    chain.namespace = "stellar";
    chain.reference = "pubnet";
    chain.addressPattern = "^G[A-Z2-7]{55}$";
    delete chain.chainId;
    await writeFile(chainFile, `${JSON.stringify(chain, null, 2)}\n`, "utf8");

    const deploymentFile = path.join(
      temporaryRoot,
      "assets/example-treasury/deployments.json",
    );
    const deployments = JSON.parse(await readFile(deploymentFile, "utf8")) as Array<
      Record<string, unknown>
    >;
    if (!deployments[0]) throw new Error("Fixture deployment is missing");
    delete deployments[0].chainId;
    await writeFile(deploymentFile, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Asset example-treasury deployment address does not match ethereum",
    );
  });

  it("requires exactly one permission policy for every deployment", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const policyFile = path.join(temporaryRoot, "deployment-policies.json");
    const catalog = JSON.parse(await readFile(policyFile, "utf8")) as { deployments: unknown[] };
    catalog.deployments = [];
    await writeFile(policyFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Deployment ethereum:0x1111111111111111111111111111111111111111 is missing a permission policy",
    );
  });

  it("validates permission-policy provenance and deployment references", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const policyFile = path.join(temporaryRoot, "deployment-policies.json");
    const catalog = JSON.parse(await readFile(policyFile, "utf8")) as {
      deployments: Array<Record<string, any>>;
    };
    catalog.deployments[0]!.provenance.sourceIds = ["missing-source"];
    catalog.deployments[0]!.input.chainId = 8453;
    await writeFile(policyFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Deployment policy ethereum:0x1111111111111111111111111111111111111111 references unknown source missing-source",
    );
    expect(result.errors).toContain(
      "Deployment policy ethereum:0x1111111111111111111111111111111111111111 has a conflicting EVM input",
    );
  });

  it("rejects permission checks the resolver cannot execute", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    const policyFile = path.join(temporaryRoot, "deployment-policies.json");
    const catalog = JSON.parse(await readFile(policyFile, "utf8")) as {
      deployments: Array<Record<string, any>>;
    };
    catalog.deployments[0]!.evmChecks[0].signature = "mint(address,uint256)";
    await writeFile(policyFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Deployment policy ethereum:0x1111111111111111111111111111111111111111 uses unsupported EVM check mint(address,uint256)",
    );
  });

  it("accepts a canonical legacy Aptos package::module::Coin deployment", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rwaimport-registry-"));
    await cp(validFixture, temporaryRoot, { recursive: true });
    await rename(
      path.join(temporaryRoot, "chains/ethereum.json"),
      path.join(temporaryRoot, "chains/aptos.json"),
    );
    const chainFile = path.join(temporaryRoot, "chains/aptos.json");
    const chain = JSON.parse(await readFile(chainFile, "utf8")) as Record<string, unknown>;
    Object.assign(chain, {
      id: "aptos",
      name: "Aptos",
      type: "aptos",
      namespace: "aptos",
      reference: "1",
      addressPattern: "^0x[a-fA-F0-9]{64}$",
      nativeCurrency: "APT",
    });
    delete chain.chainId;
    await writeFile(chainFile, `${JSON.stringify(chain, null, 2)}\n`, "utf8");
    await cp(
      path.join(repositoryRoot, "standards/aptos-coin.json"),
      path.join(temporaryRoot, "standards/aptos-coin.json"),
    );
    await cp(
      path.join(repositoryRoot, "standards/aptos-fungible-asset.json"),
      path.join(temporaryRoot, "standards/aptos-fungible-asset.json"),
    );

    const address = `0x${"0".repeat(63)}1`;
    const coinType = "0x1::usdc::USDC";
    const deploymentFile = path.join(temporaryRoot, "assets/example-treasury/deployments.json");
    const deployments = JSON.parse(await readFile(deploymentFile, "utf8")) as Array<Record<string, any>>;
    Object.assign(deployments[0]!, {
      chain: "aptos",
      address,
      assetNamespace: "coin",
      assetReference: coinType,
      standardIds: ["aptos-coin"],
    });
    delete deployments[0]!.chainId;
    deployments[0]!.verification.method = "aptos-api";
    await writeFile(deploymentFile, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");

    const policyFile = path.join(temporaryRoot, "deployment-policies.json");
    const catalog = JSON.parse(await readFile(policyFile, "utf8")) as {
      deployments: Array<Record<string, any>>;
    };
    Object.assign(catalog.deployments[0]!, {
      deployment: { chain: "aptos", address, assetReference: coinType },
      input: { network: "aptos", address, coinType },
      nonEvmPolicy: {
        network: "aptos",
        assetModel: "legacy-coin",
        coinType,
        objectOwner: { availability: "not-applicable" },
        capabilities: {
          mint: { availability: "unknown" },
          burn: { availability: "unknown" },
          freeze: { availability: "unknown" },
          transfer: { availability: "unknown" }
        }
      },
      supportedChecks: ["aptos-coin-info", "aptos-capabilities"],
      evmChecks: [],
      ledgerChecks: [],
    });
    await writeFile(policyFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

    const result = await validateRegistry(temporaryRoot);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
