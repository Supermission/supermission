import {
  RiskSummary,
  RiskLevel,
  SecurityAnalysis,
  LiquidityAnalysis,
  HolderAnalysis,
  MarketSnapshot,
} from "../types";

export function buildRiskSummary(params: {
  security?: SecurityAnalysis;
  liquidity?: LiquidityAnalysis;
  holders?: HolderAnalysis;
  marketSnapshot?: MarketSnapshot;
}): RiskSummary {
  const {
    security,
    liquidity,
    holders,
    marketSnapshot,
  } = params;

  // ---------- scam risk ----------
  let scamRisk: RiskLevel = "LOW";

  if (
    security?.isHoneypot ||
    security?.hiddenOwner ||
    security?.proxyContract ||
    security?.canChangeOwnership ||
    security?.openSource === false
  ) {
    scamRisk = "HIGH";
  }

  // ---------- rug risk ----------
  let rugRisk: RiskLevel = "LOW";

  if (
    security?.canMint ||
    security?.canPauseTransfers ||
    security?.canChangeOwnership
  ) {
    rugRisk = "HIGH";
  } else if (
    liquidity &&
    liquidity.totalUsd < 100_000
  ) {
    rugRisk = "MEDIUM";
  }

  // ---------- liquidity risk ----------
  let liquidityRisk: RiskLevel = "LOW";

  if (!liquidity || liquidity.totalUsd < 50_000) {
    liquidityRisk = "HIGH";
  } else if (liquidity.totalUsd < 150_000) {
    liquidityRisk = "MEDIUM";
  }

  if (!liquidity?.lpHolderCount || liquidity?.lpHolderCount <= 1) {
    liquidityRisk = "HIGH";
  }

  // ---------- manipulation risk ----------
  let manipulationRisk: RiskLevel = "LOW";

  if (marketSnapshot?.manipulationRisk === "HIGH") {
    manipulationRisk = "HIGH";
  } else if (holders?.top10Percent && holders?.top10Percent > 40) {
    manipulationRisk = "MEDIUM";
  }

  // ---------- overall risk ----------
  const risks: RiskLevel[] = [
    scamRisk,
    rugRisk,
    liquidityRisk,
    manipulationRisk,
  ];

  const highCount = risks.filter((r) => r === "HIGH").length;
  const mediumCount = risks.filter((r) => r === "MEDIUM").length;

  let overall: RiskLevel = "LOW";

  if (highCount >= 2) {
    overall = "HIGH";
  } else if (highCount === 1 || mediumCount >= 2) {
    overall = "MEDIUM";
  }

  return {
    overall,
    scamRisk,
    rugRisk,
    liquidityRisk,
    manipulationRisk,
  };
}
