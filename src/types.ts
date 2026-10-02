export interface Asset {
  schemaVersion: 2;
  id: string;
  name: string;
  symbol: string;
  underlyingId: string;
  instrumentType: string;
  denominationCurrency: string;
  organizationRoles: Array<{ organizationId: string; roles: string[] }>;
  assetClass: string;
  issuerId: string;
  tokenizationProviderIds?: string[];
  status: string;
  verifiedBy: string[];
  dataAvailability: Record<string, "known" | "unknown" | "not-applicable">;
  relationships?: Array<{ type: string; assetId: string; verifiedBy: string[] }>;
  [key: string]: unknown;
}

export interface Deployment {
  chain: string;
  chainId?: number;
  address: string;
  assetNamespace?: string;
  assetReference?: string;
  standardIds: string[];
  status: string;
  verifiedBy: string[];
  verification?: {
    lastVerifiedAt: string;
    accountExists: boolean;
    method: string;
    [key: string]: unknown;
  };
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
  chainId?: number;
  name: string;
  type: "evm" | "solana" | "stellar" | "xrpl" | "aptos" | "sui" | "cosmos";
  namespace: string;
  reference: string;
  addressPattern: string;
  [key: string]: unknown;
}

export interface Standard {
  id: string;
  name: string;
  referenceUrl: string;
  relatedStandardIds?: string[];
  [key: string]: unknown;
}

export interface Underlying {
  schemaVersion: 1;
  id: string;
  name: string;
  ticker: string;
  type: string;
  status: string;
  sourceAssetIds: string[];
  dataAvailability: Record<string, "known" | "unknown" | "not-applicable">;
  sources?: Array<{ id: string; [key: string]: unknown }>;
  claims?: Array<{ field: string; sourceIds: string[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface Organization {
  schemaVersion: 1;
  id: string;
  name: string;
  status: string;
  sources: Array<{ url: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface Valuation {
  schemaVersion: 1;
  quoteCurrency: string;
  valuationType: string;
  verifiedBy: string[];
  [key: string]: unknown;
}

export interface Claim {
  field: string;
  sourceIds: string[];
  reviewedAt: string;
  reviewStatus: "verified" | "needs-review" | "disputed";
  confidence: "high" | "medium" | "low";
  [key: string]: unknown;
}

export interface HistoryEvent {
  id: string;
  type: string;
  effectiveAt: string;
  recordedAt: string;
  summary: string;
  sourceIds: string[];
  [key: string]: unknown;
}

export interface AssetRecord {
  asset: Asset;
  deployments: Deployment[];
  compliance: Compliance;
  sources: Source[];
  valuation: Valuation;
  claims: Claim[];
  history: HistoryEvent[];
}

export interface Registry {
  assets: AssetRecord[];
  issuers: Issuer[];
  chains: Chain[];
  standards: Standard[];
  underlyings: Underlying[];
  organizations: Organization[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  registry?: Registry;
}
