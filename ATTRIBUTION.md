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

### RWA.xyz

Credited as an independent tokenized-asset market-data provider. Each stock record links
to the RWA.xyz Stocks dashboard so users can search for the symbol and compare total value,
returns, holders, transfers, networks, and platform-level metrics. RWAImport currently does
not copy or cache RWA.xyz market values.

### DefiLlama

Credited as an independent price-data provider. Each supported deployment links directly
to DefiLlama's public current-price API by chain and contract address. RWAImport currently
does not copy or cache the returned price.

### Etherscan, BscScan, and Solana Explorer

Credited as chain explorers. Deployment records link to the appropriate explorer for
contract or mint details, token supply, holders, and transfer activity.

## Contributor rule

Do not add a provider merely for visibility. Add it to `sources.json` only when a registry
claim was obtained from that provider. Add it to `marketDataLinks` when it offers an external
place to inspect current market or onchain information. Never copy live figures into the
registry unless the schema gains explicit timestamp and refresh semantics.
