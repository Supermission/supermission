import {
  MarketTrend,
  QualityLevel,
  RiskLevel,
  VolatilityLevel,
  MarketSnapshot,
} from "../types";

type OhlcvCandle = { open: number; high: number; low: number; close: number; volume: number; volume_usd: number };

export function buildMarketSnapshot(
  candles: OhlcvCandle[] | null,
  totalLiquidityUsd?: number,
  top10HolderPercent?: number
): MarketSnapshot {
  // ---------- defaults ----------
  let hasMarketData = false;
  let avgVolumeUsdPerMin = 0;

  let liquidityQuality: QualityLevel = "LOW";
  let volatility: VolatilityLevel = "HIGH";
  let trend: MarketTrend = "SIDEWAYS";
  let manipulationRisk: RiskLevel = "HIGH";

  const signals: MarketSnapshot["signals"] = {};

  // ---------- insufficient data ----------
  if (!candles || candles.length < 10) {
    signals.lowLiquidity = true;

    return {
      hasMarketData,
      avgVolumeUsdPerMin,
      liquidityQuality,
      volatility,
      trend,
      manipulationRisk,
      signals,
    };
  }

  // ---------- market data exists ----------
  hasMarketData = true;

  // ---------- avg volume ----------
  avgVolumeUsdPerMin =
    candles.reduce((s, c) => s + c.volume_usd, 0) / candles.length;

  // ---------- returns ----------
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }

  const variance =
    returns.reduce((s, r) => s + r * r, 0) / (returns.length || 1);
  const volatilityValue = Math.sqrt(variance);

  // ---------- trend ----------
  const priceChange =
    candles[candles.length - 1].close / candles[0].open - 1;

  // ---------- liquidity quality ----------
  if (totalLiquidityUsd != null) {
    if (totalLiquidityUsd > 500_000) liquidityQuality = "HIGH";
    else if (totalLiquidityUsd > 100_000) liquidityQuality = "MEDIUM";
  } else {
    if (avgVolumeUsdPerMin > 2000) liquidityQuality = "HIGH";
    else if (avgVolumeUsdPerMin > 300) liquidityQuality = "MEDIUM";
  }

  // ---------- volatility ----------
  volatility =
    volatilityValue > 0.015
      ? "HIGH"
      : volatilityValue > 0.005
      ? "MEDIUM"
      : "LOW";

  // ---------- trend ----------
  trend =
    priceChange > 0.015
      ? "UPTREND"
      : priceChange < -0.015
      ? "DOWNTREND"
      : "SIDEWAYS";

  // ---------- manipulation risk ----------
  if (
    liquidityQuality === "LOW" ||
    (top10HolderPercent != null && top10HolderPercent > 40)
  ) {
    manipulationRisk = "HIGH";
  } else if (volatility === "HIGH") {
    manipulationRisk = "MEDIUM";
  } else {
    manipulationRisk = "LOW";
  }

  // ---------- signals ----------
  signals.lowLiquidity = liquidityQuality === "LOW";
  signals.highVolatility = volatility === "HIGH";
  signals.highHolderConcentration =
    top10HolderPercent != null && top10HolderPercent > 40;

  return {
    hasMarketData,
    avgVolumeUsdPerMin: Math.round(avgVolumeUsdPerMin),
    liquidityQuality,
    volatility,
    trend,
    manipulationRisk,
    signals,
  };
}
