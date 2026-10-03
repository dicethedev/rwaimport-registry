# Data attribution

RWAImport distinguishes registry facts from external market-data links. A provider is
credited only for the information actually obtained from it.

## Current providers

### Ondo Finance

Credited as the primary source for the current Ondo Stocks batch:

- token names, symbols, decimals, supported networks, and EVM contract addresses come from
  Ondo's official token list;
- Solana Token-2022 mint addresses come from Ondo's official GM simulator catalog;
- product identity and issuer information come from Ondo's product pages;
- onboarding, KYC, transferability, and eligibility notes come from Ondo's official
  Ondo Stocks guide.

The import is pinned to token-list commit
`f5a82fca4b2a81aa8fc1ce65b8982f36d6cd40f4` so the provenance cannot silently change.
The Solana mint import is independently pinned to commit
`0688add3c64aadc7006712989e9ec0592b5b10f8`.

### Robinhood

Credited as the primary source for the Robinhood Stock Token collection:

- names, symbols, ISINs, decimals, stable issuer asset IDs, status, and Robinhood Chain
  contract addresses come from Robinhood's official `/rhj/assets` API;
- product structure, ERC-20 and ERC-8056 behavior, direct-issuance KYB requirements, and
  jurisdictional restrictions come from Robinhood Chain's official Stock Token documentation;
- Robinhood Chain ID `4663`, RPC, native currency, and explorer details come from Robinhood's
  official chain documentation.

The API catalog is live rather than commit-addressed. Every generated record therefore stores
the source URL, access date, SHA-256 content hash, and checked-in raw response path. The importer
accepts a downloaded response for reproducible snapshot builds and archives the exact input under
`snapshots/robinhood/`. No live price or multiplier values are copied into the registry.

### Institutional funds

The treasury, money-market, income, and credit batch uses first-party product pages and
contract catalogs from Ondo, Securitize/BlackRock, Franklin Templeton, Hashnote, Superstate,
OpenEden, Centrifuge/Janus Henderson, and WisdomTree. Product structure, eligibility, legal
rights, service-provider roles, and redemption summaries are credited to the provider that
publishes each claim.

Deployment addresses are included only when an official provider catalog publishes the full
address. This applies to BUIDL, BENJI, USYC, TBILL, and JTRSY. A provider's product page showing
that blockchain recordkeeping exists is not treated as proof of a particular public contract;
those products retain an empty deployment list until address-level evidence is available.

WisdomTree fund names and classifications come from its official tokenized-fund catalog and
digital-fund product list. Live NAV, AUM, yield, and holdings values are not copied.

### Backed

Credited for the bIB01, bIBTA, bC3M, bHIGH, and bERNX tracker-certificate records. Product and
underlying ISINs, referenced ETFs, legal structure, Arbitrum addresses, and the current
issuance/redemption status come from Backed's official product catalog and legal-documentation
page. These products are marked inactive because Backed says new issuance is unavailable;
redemption support and the deployed contracts are recorded separately rather than implying that
the products are still being issued.

### RWA.xyz

Credited as an independent tokenized-asset market-data provider. Each stock record links
to the RWA.xyz Stocks dashboard so users can search for the symbol and compare total value,
returns, holders, transfers, networks, and platform-level metrics. RWAImport currently does
not copy or cache RWA.xyz market values.

### DefiLlama

Credited as an independent price-data provider. Each supported deployment links directly
to DefiLlama's public current-price API by chain and contract address. RWAImport currently
does not copy or cache the returned price.

### Etherscan, BscScan, Arbiscan, Solana Explorer, and Robinhood Chain Blockscout

Credited as chain explorers. Deployment records link to the appropriate explorer for
contract or mint details, token supply, holders, and transfer activity.

## Contributor rule

Do not add a provider merely for visibility. Add it to `sources.json` only when a registry
claim was obtained from that provider. Add it to `marketDataLinks` when it offers an external
place to inspect current market or onchain information. Never copy live figures into the
registry unless the schema gains explicit timestamp and refresh semantics.
