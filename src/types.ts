export interface Asset {
  schemaVersion: 1;
  id: string;
  name: string;
  symbol: string;
  assetClass: string;
  issuerId: string;
  tokenizationProviderIds?: string[];
  status: string;
  verifiedBy: string[];
  [key: string]: unknown;
}

export interface Deployment {
  chain: string;
  chainId: number;
  address: string;
  standardIds: string[];
  status: string;
  verifiedBy: string[];
  [key: string]: unknown;
}

export interface Compliance {
  schemaVersion: 1;
  verifiedBy: string[];
  [key: string]: unknown;
}

export interface Source {
  id: string;
  type: string;
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
  [key: string]: unknown;
}

export interface Issuer {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface Chain {
  id: string;
  chainId: number;
  name: string;
  [key: string]: unknown;
}

export interface Standard {
  id: string;
  name: string;
  relatedStandardIds?: string[];
  [key: string]: unknown;
}

export interface AssetRecord {
  asset: Asset;
  deployments: Deployment[];
  compliance: Compliance;
  sources: Source[];
}

export interface Registry {
  assets: AssetRecord[];
  issuers: Issuer[];
  chains: Chain[];
  standards: Standard[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  registry?: Registry;
}
