import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRegistry } from "../src/registry.js";

interface LinkIssue {
  kind: "broken" | "inconclusive";
  message: string;
}

async function checkUrl(url: string): Promise<LinkIssue | undefined> {
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 || response.status === 405 || response.status === 410) {
      response = await fetch(url, {
        headers: { range: "bytes=0-0" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    }
    if (response.status === 404 || response.status === 410) {
      return { kind: "broken", message: `${url}: HTTP ${response.status}` };
    }
    if (response.status >= 500) {
      return { kind: "inconclusive", message: `${url}: HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      kind: "inconclusive",
      message: `${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return undefined;
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validation = await validateRegistry(rootDirectory);
if (!validation.valid || !validation.registry) {
  throw new Error("Registry must pass local validation before links can be checked");
}
const urls = new Set<string>();
for (const record of validation.registry.assets) {
  for (const source of record.sources) urls.add(source.url);
  const links = record.asset.marketDataLinks as Array<{ url: string }> | undefined;
  for (const link of links ?? []) urls.add(link.url);
}
for (const organization of validation.registry.organizations) {
  for (const source of organization.sources as Array<{ url: string }>) urls.add(source.url);
}
for (const standard of validation.registry.standards) urls.add(standard.referenceUrl as string);

const queue = [...urls].sort();
const broken: string[] = [];
const inconclusive: string[] = [];
let cursor = 0;
async function worker(): Promise<void> {
  while (cursor < queue.length) {
    const url = queue[cursor];
    cursor += 1;
    if (!url) continue;
    const issue = await checkUrl(url);
    if (issue?.kind === "broken") broken.push(issue.message);
    if (issue?.kind === "inconclusive") inconclusive.push(issue.message);
  }
}
await Promise.all(Array.from({ length: 48 }, () => worker()));

if (broken.length > 0) {
  console.error(`Link check found ${broken.length} confirmed broken URL(s):`);
  for (const error of broken) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${queue.length} unique source and verification links.`);
}
if (inconclusive.length > 0) {
  console.warn(
    `${inconclusive.length} link check(s) were inconclusive because a server timed out or returned 5xx.`,
  );
  for (const warning of inconclusive.slice(0, 10)) console.warn(`- ${warning}`);
  if (inconclusive.length > 10) console.warn(`- ...and ${inconclusive.length - 10} more`);
}
