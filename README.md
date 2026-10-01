# RWAImport Registry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The structured, source-backed asset registry used by RWAImport.

This repository describes real-world assets, their issuers, blockchain deployments,
token standards, compliance characteristics, and the evidence supporting each claim.
It does **not** contain API, UI, indexing, or smart-contract analysis code.

## Core model

An asset is a stable economic identity. A deployment is one token contract or mint
representing that asset on one chain. An asset may have zero, one, or many deployments.
Chains use CAIP-2 namespace and reference fields so EVM and non-EVM networks share one model.

```text
issuer ──< asset ──< deployment >── chain
                         │
                         └──< standard

asset ──< source (evidence)
```

## Repository layout

```text
assets/<asset-id>/
  asset.json          Asset identity and classification
  deployments.json    Chain-specific token contracts
  compliance.json     Published transfer and eligibility requirements
  sources.json        Evidence supporting the registry entry
issuers/               One JSON file per issuer or service provider
chains/                Supported blockchain network definitions
standards/             Token standards understood by RWAImport
schemas/               JSON Schemas for every record type
scripts/               Validation and build commands
src/                   Reusable registry loading and validation code
tests/                 Integrity tests and non-production fixtures
examples/              Copyable examples; never loaded as verified registry data
```

The standards catalog includes finalized ERCs, proposals still under review, and maintained
industry frameworks such as CMTAT. See `standards/README.md` for status meanings and scope.

## Getting started

Requires Node.js 20 or later.

The repository includes `.nvmrc`; run `nvm use` to select the same Node.js major version
used by continuous integration.

```bash
npm install
npm run check
npm run build
```

`npm run validate` checks JSON Schemas and cross-file relationships. `npm run build`
writes a generated API-friendly snapshot to `dist/registry.json` only after validation.
`npm run verify:onchain` performs live EVM bytecode and Solana Token-2022 mint checks;
it is intentionally separate from the deterministic test suite because it requires network access.

## Current catalog

The catalog contains 595 source-backed assets with 1,382 deployments across Ethereum,
BNB Smart Chain, Solana, and Robinhood Chain.

The Ondo collection contains 400 assets representing company equities and
exchange-traded instruments. It includes 1,187 deployments: 400 each on Ethereum and BNB
Smart Chain plus 387 valid Token-2022 mints on Solana. EVM deployments come from Ondo Finance's
official token list at immutable commit `f5a82fca4b2a81aa8fc1ce65b8982f36d6cd40f4`;
Solana mints come from Ondo's official simulator catalog at immutable commit
`0688add3c64aadc7006712989e9ec0592b5b10f8`. Each asset cites its official Ondo product
page, product/eligibility guide, and a chain explorer for every deployment.

The Robinhood collection contains 195 active Stock Tokens and tokenized ETFs issued by
Robinhood Assets (Jersey) Limited, with 195 deployments on Robinhood Chain mainnet. Records
come from Robinhood's official asset API as accessed on `2026-10-01`; each includes the
official asset UID, ISIN, ERC-20 and ERC-8056 standards, issuer disclosures, and a canonical
Blockscout contract link. Run `npm run import:robinhood-stocks` to refresh from the API or
pass a downloaded JSON response to reproduce a fixed snapshot.

Every asset also has provider-appropriate `marketDataLinks` for the issuer, independent
data providers where available, and relevant chain explorers. These are outbound
verification links, not imported live values. See
`ATTRIBUTION.md` for the exact credit and provenance policy.

These collections establish the ingestion and evidence pipeline. Subsequent batches should
expand treasuries, commodities, credit, real estate, and other issuers without weakening
source requirements.

## Adding an asset

1. Copy `examples/assets/example-treasury` to `assets/<asset-id>`.
2. Replace every example value with facts from primary or authoritative sources.
3. Add the evidence URLs and access dates to `sources.json`.
4. Add referenced issuers, chains, and standards if they do not exist.
5. Run `npm run check`.

Never use example addresses or unverified metadata in `assets/`. New entries should be
added only after research, source attribution, and review.

## Versioning policy

Every record currently uses `schemaVersion: 1`. Breaking schema changes must increment
the affected record version and include a migration. Changes to facts do not require a
schema version change.

## License

RWAImport Registry is open-source software released under the [MIT License](LICENSE).
