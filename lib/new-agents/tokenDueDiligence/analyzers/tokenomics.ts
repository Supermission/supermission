import { Tokenomics, RiskLevel } from "../types";

type RawHolder = {
  address?: string;
  balance?: string | number;
  percent?: string | number;
};

export function buildTokenomics(params: {
  totalSupply?: number;
  circulatingSupply?: number;
  maxSupply?: number;
  isMintable: boolean;
  holders?: RawHolder[];
  marketCap?: number;
  fdv?: number;
}): Tokenomics {
  const {
    totalSupply = 0,
    circulatingSupply,
    maxSupply,
    isMintable,
    holders = [],
    marketCap,
    fdv,
  } = params;

  // ---------- burned supply ----------
  const burnHolder = holders.find(
    (h) =>
      h.address?.toLowerCase() ===
      "0x000000000000000000000000000000000000dead"
  );

  const burnedSupplyPercent =
    burnHolder?.percent != null
      ? Number(burnHolder.percent)
      : undefined;

  // ---------- fdv / market cap ----------
  const fdvToMarketCapRatio =
    marketCap && fdv && marketCap > 0
      ? Number((fdv / marketCap).toFixed(2))
      : undefined;

  // ---------- inflation risk ----------
  let inflationRisk: RiskLevel = "LOW";

  if (isMintable) {
    inflationRisk = "HIGH";
  } else if (
    fdvToMarketCapRatio != null &&
    fdvToMarketCapRatio > 2
  ) {
    inflationRisk = "MEDIUM";
  } else if (fdvToMarketCapRatio == null) {
    inflationRisk = "MEDIUM";
  }

  return {
    totalSupply,
    circulatingSupply,
    maxSupply,
    fdvToMarketCapRatio,
    isMintable,
    burnedSupplyPercent,
    inflationRisk,
  };
}
