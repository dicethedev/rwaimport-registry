import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await validateRegistry(rootDirectory);

if (!result.valid || !result.registry) {
  console.error("Cannot build an invalid registry. Run npm run validate for details.");
  process.exitCode = 1;
} else {
  const outputDirectory = path.join(rootDirectory, "dist");
  const outputFile = path.join(outputDirectory, "registry.json");
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...result.registry,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Built ${outputFile}`);
}
