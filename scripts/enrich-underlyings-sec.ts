import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SecPayload {
  fields: string[];
  data: Array<Array<number | string>>;
}

type JsonObject = Record<string, unknown>;
const endpoint = "https://www.sec.gov/files/company_tickers_exchange.json";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkMode = process.argv.includes("--check");
const response = await fetch(endpoint, {
  headers: { "user-agent": "RWAImport Registry maintainers registry@rwaimport.xyz" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`SEC company ticker catalog returned HTTP ${response.status}`);
const payload = await response.json() as SecPayload;
const positions = Object.fromEntries(payload.fields.map((field, index) => [field, index]));
const cikPosition = positions.cik;
const tickerPosition = positions.ticker;
const exchangePosition = positions.exchange;
if (cikPosition === undefined || tickerPosition === undefined || exchangePosition === undefined) {
  throw new Error("SEC company ticker catalog is missing a required field");
}
const byTicker = new Map(payload.data.map((row) => [String(row[tickerPosition] ?? "").toUpperCase(), row]));
const retrievedAt = new Date().toISOString();
let sharedCount = 0;
let enrichedCount = 0;
const driftErrors: string[] = [];

for (const fileName of (await readdir(path.join(root, "underlyings"))).filter((name) => name.endsWith(".json"))) {
  const filePath = path.join(root, "underlyings", fileName);
  const underlying = JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
  const sourceAssetIds = underlying.sourceAssetIds as string[];
  if (sourceAssetIds.length < 2) continue;
  sharedCount += 1;
  const row = byTicker.get(String(underlying.ticker).toUpperCase());
  if (!row) continue;
  const cik = String(row[cikPosition] ?? "").padStart(10, "0");
  const exchange = String(row[exchangePosition] ?? "");
  if (!exchange || !cik) continue;

  if (checkMode) {
    const identifiers = (underlying.identifiers ?? []) as Array<{ scheme: string; value: string }>;
    const storedCik = identifiers.find((identifier) => identifier.scheme === "cik")?.value;
    if (underlying.exchange !== exchange) {
      driftErrors.push(`${underlying.id}: exchange changed from ${String(underlying.exchange)} to ${exchange}`);
    }
    if (storedCik !== cik) {
      driftErrors.push(`${underlying.id}: CIK changed from ${String(storedCik)} to ${cik}`);
    }
    enrichedCount += 1;
    continue;
  }

  const identifiers = (underlying.identifiers ?? []) as Array<{ scheme: string; value: string }>;
  if (!identifiers.some((identifier) => identifier.scheme === "cik")) {
    identifiers.push({ scheme: "cik", value: cik });
  }
  underlying.identifiers = identifiers;
  underlying.exchange = exchange;
  underlying.jurisdiction = "US";
  underlying.dataAvailability = { identifiers: "known", exchange: "known", jurisdiction: "known" };
  underlying.sources = [
    ...((underlying.sources ?? []) as JsonObject[]).filter((source) => source.id !== "sec-company-tickers-exchange"),
    {
      id: "sec-company-tickers-exchange",
      title: "SEC company ticker and exchange catalog",
      url: endpoint,
      publisher: "U.S. Securities and Exchange Commission",
      retrievedAt,
    },
  ];
  const retainedClaims = ((underlying.claims ?? []) as JsonObject[]).filter((claim) =>
    !["identifiers", "exchange", "jurisdiction"].includes(String(claim.field)),
  );
  underlying.claims = [
    ...retainedClaims,
    ...["identifiers", "exchange", "jurisdiction"].map((field) => ({
      field,
      sourceIds: ["sec-company-tickers-exchange"],
      reviewStatus: "verified",
    })),
  ];
  await writeFile(filePath, `${JSON.stringify(underlying, null, 2)}\n`);
  enrichedCount += 1;
}

if (driftErrors.length > 0) {
  console.error(`SEC underlying drift check failed with ${driftErrors.length} change(s):`);
  for (const error of driftErrors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`${checkMode ? "Checked" : "Enriched"} ${enrichedCount} of ${sharedCount} shared underlyings against the official SEC ticker and exchange catalog.`);
}
