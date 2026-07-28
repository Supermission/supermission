import {
  MarketHealth,
  MarketTrend,
  VolatilityLevel,
  MomentumStrength,
  QualityLevel,
} from "../types";

type OhlcvCandle = { open: number; high: number; low: number; close: number; volume: number; volume_usd: number };

export function buildMarketHealth(
  candles: OhlcvCandle[] | null
): MarketHealth {
  // ---------- safe defaults ----------
  if (!candles || candles.length < 10) {
    return {
      trend: "SIDEWAYS",
      volatility: "HIGH",
      momentum: "WEAK",
      avgVolumePerMinUsd: 0,
      volumeQuality: "LOW",
    };
  }

  // ---------- avg volume ----------
  const avgVolumePerMinUsd =
    candles.reduce((s, c) => s + c.volume_usd, 0) / candles.length;

  // ---------- volume quality ----------
  const volumeQuality: QualityLevel =
    avgVolumePerMinUsd > 2000
      ? "HIGH"
      : avgVolumePerMinUsd > 300
      ? "MEDIUM"
      : "LOW";

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

  // ---------- volatility ----------
  const volatility: VolatilityLevel =
    volatilityValue > 0.015
      ? "HIGH"
      : volatilityValue > 0.005
      ? "MEDIUM"
      : "LOW";

  // ---------- trend ----------
  const priceChange =
    candles[candles.length - 1].close / candles[0].open - 1;

  const trend: MarketTrend =
    priceChange > 0.015
      ? "UPTREND"
      : priceChange < -0.015
      ? "DOWNTREND"
      : "SIDEWAYS";

  // ---------- momentum ----------
  // Compare last 20% vs first 20% of candles
  const slice = Math.max(2, Math.floor(candles.length * 0.2));

  const earlyReturn =
    candles[slice].close / candles[0].open - 1;

  const recentReturn =
    candles[candles.length - 1].close /
      candles[candles.length - slice].open -
    1;

  let momentum: MomentumStrength = "WEAK";

  if (recentReturn > earlyReturn * 1.2 && recentReturn > 0) {
    momentum = "STRONG";
  } else if (recentReturn > earlyReturn * 0.8) {
    momentum = "MODERATE";
  }

  return {
    trend,
    volatility,
    momentum,
    avgVolumePerMinUsd: Math.round(avgVolumePerMinUsd),
    volumeQuality,
  };
}
