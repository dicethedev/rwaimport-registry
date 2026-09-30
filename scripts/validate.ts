import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await validateRegistry(rootDirectory);

if (!result.valid) {
  console.error(`Registry validation failed with ${result.errors.length} error(s):`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Registry is valid: ${result.registry?.assets.length ?? 0} assets, ` +
      `${result.registry?.issuers.length ?? 0} issuers, ` +
      `${result.registry?.chains.length ?? 0} chains, ` +
      `${result.registry?.standards.length ?? 0} standards.`,
  );
}
