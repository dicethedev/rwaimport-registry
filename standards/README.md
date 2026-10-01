# Supported standards and frameworks

This directory describes token standards and supporting frameworks that RWAImport can
identify or explain. Inclusion means the registry understands the specification; it does
not mean every listed asset implements it or that the specification is formally final.

| ID | Purpose | Status |
| --- | --- | --- |
| `erc20` | Fungible tokens | Final |
| `erc721` | Unique assets and deeds | Final |
| `erc1155` | Multiple fungible or non-fungible asset types | Final |
| `erc1400` | Security-token standards suite | Stagnant |
| `erc1404` | Simple restricted transfers | Active industry framework |
| `erc1450` | Transfer-agent-controlled securities | Final |
| `erc3475` | Abstract-storage bonds | Final |
| `erc3525` | Semi-fungible positions with slots and values | Final |
| `erc3643` | Permissioned tokens with identity and compliance | Final |
| `erc4519` | NFTs tied to self-authenticating physical assets | Final |
| `erc4626` | Tokenized vault shares | Final |
| `erc7092` | Financial bonds with traditional bond fields | Final |
| `erc7518` | Partitioned compliant security tokens | Review |
| `erc7551` | German eWpG crypto-security interface | Draft |
| `erc7651` | Fractionally represented NFTs | Draft |
| `erc7943` | Universal RWA compliance and enforcement interface | Final |
| `cmtat` | CMTA framework for regulated financial instruments | Active industry framework |
| `solana-token-2022` | Extensible fungible tokens on Solana | Active Solana program |

## Status meanings

- `final`, `review`, `draft`, and `stagnant` follow the Ethereum ERC process for published ERCs.
- `active` is used for maintained industry specifications such as CMTAT and ERC-1404 that
  are not represented as finalized Ethereum ERC documents.
- `solana-program` identifies a maintained Solana program specification rather than an ERC.
- Always follow `referenceUrl` for the primary specification and current implementation guidance.
