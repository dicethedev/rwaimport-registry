import type { AssetRecord } from "./types.js";

export interface CompletenessScore {
  total: number;
  identity: number;
  legal: number;
  compliance: number;
  deploymentVerification: number;
  valuation: number;
  sourceFreshness: number;
}

function ratio(points: number, known: number, total: number): number {
  return total === 0 ? points : Math.round((points * known) / total);
}

export function scoreCompleteness(record: AssetRecord, today = new Date()): CompletenessScore {
  const { asset, compliance, deployments, sources, valuation } = record;
  const identityFields = [asset.name, asset.symbol, asset.underlyingId, asset.instrumentType, asset.issuerId];
  const legalStatuses = Object.values(asset.dataAvailability ?? {});
  const complianceStatuses = Object.values(
    (compliance.dataAvailability as Record<string, string> | undefined) ?? {},
  );
  const valuationStatuses = Object.values(
    (valuation.dataAvailability as Record<string, string> | undefined) ?? {},
  );
  const identity = ratio(20, identityFields.filter(Boolean).length, identityFields.length);
  const legal = ratio(20, legalStatuses.filter((value) => value !== "unknown").length, legalStatuses.length);
  const complianceScore = ratio(
    15,
    complianceStatuses.filter((value) => value !== "unknown").length,
    complianceStatuses.length,
  );
  const deploymentVerification = deployments.length === 0
    ? 0
    : ratio(15, deployments.filter((deployment) => deployment.verification?.accountExists).length, deployments.length);
  const valuationScore = ratio(
    15,
    valuationStatuses.filter((value) => value !== "unknown").length,
    valuationStatuses.length,
  );
  const currentDate = today.toISOString().slice(0, 10);
  const sourceFreshness = ratio(
    15,
    sources.filter((source) => String(source.reviewAfter ?? "") >= currentDate).length,
    sources.length,
  );
  return {
    total: identity + legal + complianceScore + deploymentVerification + valuationScore + sourceFreshness,
    identity,
    legal,
    compliance: complianceScore,
    deploymentVerification,
    valuation: valuationScore,
    sourceFreshness,
  };
}
