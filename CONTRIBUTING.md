# Contributing

Registry changes are data changes with product and trust implications. Every pull request
should be small, source-backed, and independently verifiable.

## Requirements

- Use lowercase kebab-case IDs and directory names.
- Prefer issuer documentation, regulatory filings, and official chain explorers.
- Do not infer compliance requirements from marketing copy.
- Record an ISO `YYYY-MM-DD` access date for every source.
- Use checksum-preserving EVM addresses when known; validation currently accepts any
  correctly sized hexadecimal address.
- Use case-preserving Base58 addresses for Solana mints and identify networks with their
  CAIP-2 namespace and reference.
- Never reuse an asset ID for a different economic product.
- Mark obsolete deployments `inactive`; do not delete historical facts without an
  explanation in the pull request.

Run `npm run check` before submitting a change.
