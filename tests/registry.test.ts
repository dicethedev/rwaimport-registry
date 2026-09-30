import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
});
