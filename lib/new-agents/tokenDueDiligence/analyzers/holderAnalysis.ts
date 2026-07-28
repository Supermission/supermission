import { HolderAnalysis, RiskLevel } from "../types";

function calculateNakamoto(values: number[]): number {
  let cumulative = 0;

  for (let i = 0; i < values.length; i++) {
    cumulative += values[i];
    if (cumulative >= 51) return i + 1;
  }

  return values.length;
}


function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);

  if (sum === 0) return 0;

  let cumulative = 0;
  let weightedSum = 0;

  for (let i = 0; i < n; i++) {
    cumulative += sorted[i];
    weightedSum += cumulative;
  }

  return (n + 1 - 2 * (weightedSum / sum)) / n;
}


type RawHolder = {
  address?: string;
  percent?: string | number;
  is_contract?: number | string;
};

export function buildHolderAnalysis(params: {
  holders?: RawHolder[];
  holderCount?: number;
  creatorPercent?: number;
}): HolderAnalysis {
  const {
    holders = [],
    holderCount = 0,
    creatorPercent = 0,
  } = params;

  // ---------- normalize ----------
  const normalized = holders
    .map((h) => ({
      percent: Number(h.percent ?? 0),
      isContract: Number(h.is_contract ?? 0) === 1,
    }))
    .filter((h) => !isNaN(h.percent))
    .sort((a, b) => b.percent - a.percent);

  // ---------- top holders ----------
  const top10Percent = normalized
    .slice(0, 10)
    .reduce((s, h) => s + h.percent, 0);

  const top50Percent = normalized
    .slice(0, 50)
    .reduce((s, h) => s + h.percent, 0);

  // ---------- contract holders ----------
  const contractHolderPercent = normalized
    .filter((h) => h.isContract)
    .reduce((s, h) => s + h.percent, 0);

  // ---------- inequality ----------
  const percents = normalized.map((h) => h.percent);

  const giniCoefficient =
    percents.length >= 10 ? calculateGini(percents) : undefined;

  const nakamotoCoefficient =
    percents.length >= 10
      ? calculateNakamoto(percents)
      : undefined;

  // ---------- concentration risk ----------
  let concentrationRisk: RiskLevel = "LOW";

  if (top10Percent > 50 || nakamotoCoefficient !== undefined && nakamotoCoefficient <= 3) {
    concentrationRisk = "HIGH";
  } else if (top10Percent > 30) {
    concentrationRisk = "MEDIUM";
  }

  return {
    count: holderCount,
    top10Percent: Number(top10Percent.toFixed(2)),
    top50Percent: Number(top50Percent.toFixed(2)),
    creatorPercent: Number(creatorPercent.toFixed(2)),
    contractHolderPercent: Number(contractHolderPercent.toFixed(2)),
    giniCoefficient:
      giniCoefficient != null
        ? Number(giniCoefficient.toFixed(3))
        : undefined,
    nakamotoCoefficient,
    concentrationRisk,
  };
}
