# Registry migrations

## Product schema v1 to v2

Version 2 separates a tokenized product from its referenced underlying and makes the legal
and operational model explicit.

For each existing product:

1. Create or reuse an `underlyings/<id>.json` record and add `underlyingId`.
2. Add `instrumentType`, `denominationCurrency`, and `organizationRoles`.
3. Describe the product with the applicable legal/product fields, including security type,
   underlying and redemption rights, offering type, and regulatory exemption when known.
4. Add referenced organizations to `organizations/` while retaining `issuers/` during the
   compatibility period.
5. Add `valuation.json` for NAV, price feed, oracle, distribution, and reserve behavior.
6. Split primary- and secondary-market requirements in `compliance.json`.
7. Add freshness metadata to sources and evidence for every asserted token standard.

`npm run build:underlyings` rebuilds shared underlying records from product links. It does not
decide whether two products have equivalent legal rights; contributors must choose the correct
shared underlying ID before running it.

## Distribution changes in 0.2.0

The npm package exports the full `dist/registry.json`, `dist/manifest.json`, per-product records
under `dist/assets/`, and indexes under `dist/indexes/`. The full registry is also available as
`dist/registry.json.gz`. Consumers should verify manifest SHA-256 values when transporting
generated artifacts.

## Reliability changes in 0.3.0

Version 0.3.0 makes missing information explicit and adds durable evidence artifacts without
changing the product schema version:

1. Every product, compliance, valuation, and underlying record has `dataAvailability` values
   using `known`, `unknown`, or `not-applicable`.
2. Every product directory contains `claims.json` and `history.json`.
3. Every public deployment contains persisted verification. EVM results include runtime
   bytecode hashes, observed token metadata, and EIP-1967 implementation/admin values when
   present. Other ledgers store network-appropriate account evidence.
4. `snapshots/onchain/deployments.json` preserves verification across deterministic importer
   reruns. Refresh it with `npm run verify:onchain:write` after reviewing live changes.
5. Generated distributions include `completeness.json`; the manifest reports the catalog's
   average completeness score.

Run `npm run migrate:reliability` after a custom bulk import, then refresh onchain evidence for
new public deployments. Existing import commands run the reliability migration automatically.
