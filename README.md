# RWAImport Registry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The structured, source-backed asset registry used by RWAImport.

This repository describes tokenized financial products, their underlying instruments,
organizations, blockchain deployments, legal and compliance characteristics, valuation
behavior, token standards, and the evidence supporting each claim. It does **not** contain
API, UI, indexing, or smart-contract analysis code.

Use Node 22.22.2+, Node 24.15.0+, or Node 26+ with the pinned npm 12.2.0 toolchain.

## Core model

An underlying is the referenced real-world instrument or portfolio. An asset is a distinct
tokenized product with its own issuer, legal rights, eligibility rules, and redemption terms.
A deployment is one contract, mint, or ledger asset representing that product on one network.
This separation lets consumers compare products that reference the same stock, ETF, commodity,
or fund without treating their legal claims as equivalent.

```text
underlying ──< product ──< deployment >── chain
                   │             └──< standard + evidence
                   ├──< organization + role
                   ├── compliance
                   ├── valuation
                   └──< source (evidence + freshness)
```

## Repository layout

```text
assets/<asset-id>/
  asset.json          Product, underlying link, legal model, and organization roles
  deployments.json    Chain-specific token contracts, mints, or ledger assets
  compliance.json     Primary/secondary access, transfer, and eligibility requirements
  sources.json        Evidence, retrieval dates, review dates, and source versions
  valuation.json      NAV, price/oracle, distributions, and reserve reporting
  claims.json         Field-level links from asserted facts to evidence sources
  history.json        Append-only product, legal, and deployment change events
underlyings/           Shared underlying instruments and referenced portfolios
organizations/        Reusable organizations referenced with product-specific roles
issuers/               Compatibility catalog for issuer/provider IDs
chains/                Network definitions and network-specific address patterns
standards/             Token standards understood by RWAImport
schemas/               JSON Schemas for every record type
scripts/               Import, validation, monitoring, and build commands
src/                   Reusable registry loading and validation code
tests/                 Integrity tests and non-production fixtures
examples/              Copyable examples; never loaded as verified registry data
snapshots/             Provider inputs and stored onchain verification evidence
deployment-policies.json Permission, standard, and ledger expectations for every deployment
```

The standards catalog includes finalized ERCs, proposals still under review, native ledger
standards, and maintained industry frameworks such as CMTAT. See `standards/README.md` for
status meanings and scope.

## Getting started

Use one of the Node.js and npm versions declared above and in `package.json`.

```bash
npm ci
npm run check
```

`npm run validate` checks JSON Schemas, chain-specific address formats, and cross-file
relationships. `npm run build` writes the full registry, a compressed copy, a lightweight
manifest with checksums, one file per product, and indexes by chain, issuer, underlying,
asset class, and symbol. It also writes `dist/completeness.json`, with identity, legal,
compliance, deployment-verification, valuation, and source-freshness scores for every product.

Live checks are separate from deterministic tests:

- `npm run verify:onchain` checks stored hashes, EIP-1967 implementations and admins, EVM token
  metadata, Solana Token-2022 mints, Stellar assets, and Aptos objects.
- `npm run verify:onchain:write` refreshes stored verification evidence after review.
- `npm run check:source-drift` compares current provider catalogs with checked-in records.
- `npm run check:underlyings:sec` checks shared ticker, exchange, and CIK metadata against the SEC.
- `npm run check:links` checks evidence and market-data links.

A scheduled workflow runs the network-dependent checks weekly.

## Deployment permission policies

`deployment-policies.json` records explicit owner, admin, mint, burn, pause, and upgrade
expectations for every deployment. It also supports ERC-3643 relationships, ERC-4626 vault
settings, ERC-1404 restrictions, CMTAT controls, Solana authorities and extensions, Stellar
signers and thresholds, and Aptos object or legacy Coin capabilities. Unknown values remain
explicitly unknown; the policy synchronizer never infers a privileged account from a token name
or issuer.

Each policy points to its exact deployment and contains evidence source IDs, a review date,
reviewer, and review status. Run `npm run sync:deployment-policies` after adding or removing
deployments, then replace generated `needs-review` expectations only when evidence supports the
change. Builds emit the complete catalog as `dist/deployment-policies.json` and executable,
resolver-compatible checks as `dist/resolver-policies.json`.

Published GitHub releases run the registry against the current API and resolver before notifying
the resolver's `registry-published` workflow with the exact registry commit SHA. Configure the
`RWAIMPORT_RELEASE_TOKEN` environment secret with permission to dispatch the resolver workflow;
repository and compatibility refs can be overridden with the documented workflow variables.

## Current catalog

The catalog contains 634 source-backed products, 516 underlying records, and 1,413
deployments across ten network definitions, including EVM chains, Solana, Stellar, and Aptos.

Arbitrum One currently has ten live, bytecode-verified deployments spanning tokenized treasury
and money-market products, registered fund shares, and fixed-income tracker certificates. The
network batch includes BUIDL, BENJI, USDY, TBILL, JTRSY, bIB01, bIBTA, bC3M, bHIGH, and bERNX;
each address links back to first-party product or contract documentation and is independently
checked through the Arbitrum One RPC.

The Ondo collection contains 400 products representing company equities and exchange-traded
instruments. It includes 1,187 deployments: 400 each on Ethereum and BNB Smart Chain plus 387
valid Token-2022 mints on Solana. EVM deployments come from Ondo Finance's official token list
at immutable commit `f5a82fca4b2a81aa8fc1ce65b8982f36d6cd40f4`; Solana mints come from
Ondo's official simulator catalog at immutable commit
`0688add3c64aadc7006712989e9ec0592b5b10f8`.

The Robinhood collection contains 195 active Stock Tokens and tokenized ETFs issued by
Robinhood Assets (Jersey) Limited, with 195 deployments on Robinhood Chain mainnet. Records
come from Robinhood's official asset API as accessed on `2026-10-01`; each includes the
official asset UID, ISIN, ERC-20 and ERC-8056 standards, issuer disclosures, and an official
Blockscout contract link. The raw `2026-10-01` API response is archived under
`snapshots/robinhood/` and tied to every record by SHA-256. Run
`npm run import:robinhood-stocks` to refresh from the API or pass a downloaded JSON response.

The institutional-funds batch adds 23 treasury, money-market, income, credit, and registered
digital-fund products from Ondo, BlackRock/Securitize, Franklin Templeton, Hashnote, Superstate,
OpenEden, Centrifuge/Janus Henderson, and WisdomTree. It includes 23 deployments published in
official provider contract catalogs. Products whose transfer-agent records are blockchain-based
but whose public token address is not disclosed are intentionally represented with zero
deployments. Run `npm run import:institutional-funds` to reproduce this curated batch.

The diversification batch adds sixteen source-backed products: PAXG, XAUT, KAU, KAG, ACRED,
HLSCOPE, JAAA, ACRDX, HYB, ORY X, NIFCOT1, bIB01, bIBTA, bC3M, bHIGH, and bERNX. It establishes
dedicated commodity, private-credit, treasury, money-market, corporate-bond, and real-estate
records while leaving undisclosed deployments empty. The eight public deployments are verified
onchain. Backed's five legacy tracker certificates are explicitly marked inactive because new
issuance has ended; their active Arbitrum contracts and continuing redemption support remain
recorded. Run
`npm run import:diversification-batch` to reproduce the batch.

All 118 underlyings shared by more than one product have identifiers. The 117 exchange-listed
underlyings also have exchange and listing-jurisdiction evidence. Most are checked against the
SEC company ticker/exchange catalog; QQQ, EWY, and INDA use official manager product documents.
The remaining shared underlying is the Apollo Diversified Credit Fund, which is not
exchange-listed.

Every product has provider-appropriate `marketDataLinks`. These are outbound verification links,
not imported live values. See `ATTRIBUTION.md` for the credit and provenance policy.

## Adding a product

1. Copy `examples/assets/example-treasury` to `assets/<asset-id>`.
2. Replace every example value with facts from primary or authoritative sources.
3. Reuse or add the correct underlying and every organization referenced by a role.
4. Add evidence URLs, freshness fields, and standard evidence for deployments.
5. Add `claims.json` mappings and preserve material changes in `history.json`.
6. Use explicit `known`, `unknown`, or `not-applicable` availability states; never guess.
7. Add referenced issuers, chains, and standards if they do not exist.
8. Run `npm run check`.

Never use example addresses or unverified metadata in `assets/`. A missing public deployment is
represented by an empty array, not by a guessed contract.

## Versioning policy

Product records use `schemaVersion: 2`; supporting record types currently use version 1.
Breaking schema changes must increment the affected record version and include a migration.
Changes to facts do not require a schema version change. See [MIGRATIONS.md](MIGRATIONS.md).

## License

RWAImport Registry is open-source software released under the [MIT License](LICENSE).
