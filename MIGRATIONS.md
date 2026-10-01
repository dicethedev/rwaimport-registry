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
