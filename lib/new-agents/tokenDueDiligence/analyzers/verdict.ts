import {
  Verdict,
  Recommendation,
  RiskLevel,
  RiskSummary,
  MarketHealth,
  MarketSnapshot,
  Tokenomics,
  HolderAnalysis,
} from "../types";

export function buildVerdict(params: {
  risk: RiskSummary;
  market: MarketHealth;
  snapshot: MarketSnapshot;
  tokenomics: Tokenomics;
  holders: HolderAnalysis;
}): Verdict {
  const {
    risk,
    market,
    snapshot,
    tokenomics,
    holders,
  } = params;

  // ---------- overall ----------
  const overall: RiskLevel = risk.overall;

  // ---------- trade recommendation ----------
  let trade: Recommendation = "HOLD";

  if (
    overall === "HIGH" ||
    risk.manipulationRisk === "HIGH"
  ) {
    trade = "AVOID";
  } else if (
    market.trend === "UPTREND" &&
    market.momentum === "STRONG" &&
    overall === "LOW"
  ) {
    trade = "BUY";
  } else if (
    market.trend === "SIDEWAYS" ||
    market.volatility === "HIGH"
  ) {
    trade = "HOLD";
  }

  // ---------- invest recommendation ----------
  let invest: Recommendation = "HOLD";

  if (
    risk.scamRisk === "HIGH" ||
    risk.rugRisk === "HIGH" ||
    tokenomics.inflationRisk === "HIGH" ||
    holders.concentrationRisk === "HIGH"
  ) {
    invest = "AVOID";
  } else if (
    overall === "LOW" &&
    tokenomics.inflationRisk === "LOW"
  ) {
    invest = "BUY";
  }

  // ---------- key factors ----------
  const keyFactors: string[] = [];

  if (risk.scamRisk === "HIGH") {
    keyFactors.push("High scam risk detected");
  }

  if (risk.rugRisk === "HIGH") {
    keyFactors.push("Rug-pull risk due to ownership or minting controls");
  }

  if (risk.liquidityRisk === "HIGH") {
    keyFactors.push("Low liquidity increases exit risk");
  }

  if (risk.manipulationRisk === "HIGH") {
    keyFactors.push("Market is highly manipulable");
  }

  if (holders.top10Percent > 40) {
    keyFactors.push("High token concentration among top holders");
  }

  if (tokenomics.inflationRisk === "HIGH") {
    keyFactors.push("High inflation or dilution risk");
  }

  if (
    market.trend === "UPTREND" &&
    market.momentum === "STRONG"
  ) {
    keyFactors.push("Strong upward momentum detected");
  }

  // ---------- confidence ----------
  let confidence = 1;

  const riskPenalty =
    overall === "HIGH" ? 0.4 :
    overall === "MEDIUM" ? 0.25 : 0.1;

  const uncertaintyPenalty =
    keyFactors.length >= 4 ? 0.25 :
    keyFactors.length >= 2 ? 0.15 : 0.05;

  confidence = Math.max(
    0.2,
    Number((confidence - riskPenalty - uncertaintyPenalty).toFixed(2))
  );

  // ---------- summary ----------
  const summary =
    trade === "AVOID" && invest === "AVOID"
      ? "This token carries high risk and is not suitable for trading or long-term holding."
      : trade === "BUY"
      ? "Market conditions favor short-term trading opportunities."
      : invest === "BUY"
      ? "Token shows healthy fundamentals for long-term holding."
      : "Token presents mixed signals; caution is advised.";

  return {
    overall,
    confidence,
    recommendation: {
      trade,
      invest,
    },
    summary,
    keyFactors,
  };
}
