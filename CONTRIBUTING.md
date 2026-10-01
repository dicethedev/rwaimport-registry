# Contributing

Registry changes are data changes with product and trust implications. Every pull request
should be small, source-backed, and independently verifiable.

## Requirements

- Use lowercase kebab-case IDs and directory names.
- Prefer issuer documentation, regulatory filings, and official chain explorers.
- Do not infer compliance requirements from marketing copy.
- Record retrieval, last-verification, review-after, source-version, and confidence metadata
  for every source. Add a content hash when the imported response or snapshot is available.
- Use checksum-preserving EVM addresses when known; validation currently accepts any
  correctly sized hexadecimal address.
- Preserve each network's native address form. Address validation comes from the referenced
  chain record; never force a non-EVM address into an EVM/Solana combined expression.
- Reuse an existing underlying when products reference the same instrument, but create
  separate products when issuer, legal rights, share class, or redemption terms differ.
- Attribute issuer, manager, tokenization provider, transfer agent, custodian, administrator,
  auditor, oracle, and broker/dealer roles to reusable organization records when disclosed.
- Never reuse an asset ID for a different economic product.
- Mark obsolete deployments `inactive`; do not delete historical facts without an
  explanation in the pull request.

Run `npm run check` before submitting a change.
