import { normalizeAddress } from "./utils/normalize";
import {
  ChainName,
  RiskLevel,
  TokenDueDiligenceResponse,
} from "./types";

// raw data helpers
import { fetchTokenIdentityFromCoinGecko } from "./helpers/coingeckoHelper";
import { fetchTokenInfoFromOneInch } from "./helpers/oneInchTokenHelper";
import { fetchSecurityFromGoPlus } from "./helpers/goPlusDataHelper";
import { buildMarketHealth } from "./analyzers/marketHealth";
import { buildTokenomics } from "./analyzers/tokenomics";
import { buildMarketSnapshot } from "./analyzers/marketsnapshot";
import { buildRiskSummary } from "./analyzers/riskSummary";
import { buildVerdict } from "./analyzers/verdict";
import { buildHolderAnalysis } from "./analyzers/holderAnalysis";
import { computeSecurityScore } from "./analyzers/securityScore";
import { fetchOhlcvCandles } from "@/lib/coindesk/candles";

function getChainName(chainId: number): ChainName {
  switch (Number(chainId)) {
    case 1:      return "ETH_MAINNET";
    case 56:     return "BSC_MAINNET";
    case 8453:   return "BASE_MAINNET";
    case 101:
    case 1399811149: return "SOLANA_MAINNET";
    case 146:    return "SONIC_MAINNET";
    case 10143:  return "MONAD_MAINNET";
    default:     return "ETH_MAINNET";
  }
}


export async function fetchTokenDueDiligence(
  contractAddress: string,
  chainId: number
): Promise<TokenDueDiligenceResponse> {
  if (!Number.isFinite(Number(chainId))) {
    throw new Error(`Invalid chain id: ${chainId}`);
  }

  const address = normalizeAddress(contractAddress);

  // ------------------ fetch raw data in parallel ------------------
  const [
    cgRes,
    oneInchRes,
    goPlusRes,
    candlesRes,
  ] = await Promise.allSettled([
    fetchTokenIdentityFromCoinGecko(chainId, address),
    fetchTokenInfoFromOneInch(chainId, address),
    fetchSecurityFromGoPlus(chainId, address),
    fetchOhlcvCandles(address, chainId, 48),
  ]);

  console.log("cg res is", cgRes);
  console.log("one inch res is", oneInchRes);
  console.log("go plus res is", goPlusRes);
  console.log("candles res is", candlesRes.status === "fulfilled" ? `${candlesRes.value?.length ?? 0} candles` : "failed");

  const cg = cgRes.status === "fulfilled" ? cgRes.value : undefined;
  const oneInch = oneInchRes.status === "fulfilled" ? oneInchRes.value : undefined;
  const goPlus = goPlusRes.status === "fulfilled" ? goPlusRes.value : undefined;
  const candles = candlesRes.status === "fulfilled" ? candlesRes.value : null;

  // Track which APIs failed for transparency
  const failedSources: string[] = [];
  if (cgRes.status === "rejected") failedSources.push("CoinGecko");
  if (oneInchRes.status === "rejected") failedSources.push("1inch");
  if (goPlusRes.status === "rejected") failedSources.push("GoPlus");
  if (candlesRes.status === "rejected") failedSources.push("CoinDesk");

  // ------------------ TOKEN ------------------
  // Fallback: use basic info from oneInch if CoinGecko fails
  if (!cg && !oneInch) {
    throw new Error("Unable to fetch token identity (both CoinGecko and 1inch failed)");
  }

  const token = {
    name: cg?.name ?? oneInch?.assets?.name,
    symbol: cg?.symbol ?? oneInch?.assets?.symbol ?? "???",
    chain: getChainName(chainId),
    address,
    logo: cg?.logo,
    description: cg?.description ?? oneInch?.assets?.description,
    website: cg?.website ?? oneInch?.assets?.website,
    socials: cg?.socials ?? (oneInch?.assets?.links ? {
      twitter: oneInch.assets.links.find(l => l.name?.toLowerCase() === 'twitter')?.url,
      telegram: oneInch.assets.links.find(l => l.name?.toLowerCase() === 'telegram')?.url,
      discord: oneInch.assets.links.find(l => l.name?.toLowerCase() === 'discord')?.url,
    } : undefined),
    verified: cg?.verified ?? false,
    category: undefined,
  };

  // ------------------ PRICE ------------------
  const price = oneInch
    ? {
        current: oneInch.details.quote.price,
        currency: "USD" as const,
        percentChange: {
          "1h": oneInch.details.quote.percent_change_1h,
          "24h": oneInch.details.quote.percent_change_24h,
          "7d": oneInch.details.quote.percent_change_7d,
          "30d": oneInch.details.quote.percent_change_30d,
          "60d": oneInch.details.quote.percent_change_60d,
          "90d": oneInch.details.quote.percent_change_90d,
        },
        volume24h: oneInch.details.vol24,
        marketCap: oneInch.details.marketCap,
        fdv: oneInch.details.quote.fully_diluted_market_cap,
        lastUpdated: oneInch.details.quote.last_updated,
      }
    : undefined;

  // ------------------ MARKET HEALTH ------------------
  const market = buildMarketHealth(candles);

  // ------------------ HOLDERS ------------------
  const holders = buildHolderAnalysis({
    holders: goPlus?.holders?.rawHolders,
    holderCount: goPlus?.holders?.count,
    creatorPercent: goPlus?.holders?.creatorPercent,
  });

  // ------------------ LIQUIDITY ------------------
  const totalLiquidityUsd =
    goPlus?.liquidity?.dex?.reduce(
      (s: number, d: any) => s + Number(d.liquidity ?? 0),
      0
    ) ?? 0;

  const liquidityRisk: RiskLevel =
    totalLiquidityUsd < 50_000
      ? "HIGH"
      : totalLiquidityUsd < 150_000
      ? "MEDIUM"
      : "LOW";

  const liquidity = {
    totalUsd: totalLiquidityUsd,
    dexCount: goPlus?.liquidity?.dex?.length ?? 0,
    primaryDex: goPlus?.liquidity?.dex?.[0]?.name,
    lpLockedPercent: undefined,
    lpHolderCount: goPlus?.liquidity?.lpHolderCount ?? 0,
    liquidityRisk,
  };

  // ------------------ TOKENOMICS ------------------
  const tokenomics = buildTokenomics({
    totalSupply: goPlus?.supply?.totalSupply,
    circulatingSupply: oneInch?.details.circulatingSupply,
    maxSupply: undefined,
    isMintable: goPlus?.supply?.isMintable ?? false,
    holders: goPlus?.holders?.rawHolders,
    marketCap: oneInch?.details.marketCap,
    fdv: oneInch?.details.quote.fully_diluted_market_cap,
  });

  // ------------------ MARKET SNAPSHOT ------------------
  const marketSnapshot = buildMarketSnapshot(
    candles,
    totalLiquidityUsd,
    holders.top10Percent
  );

  const security = goPlus?.security
    ? {
        ...goPlus.security,
        securityScore: computeSecurityScore(goPlus.security),
      }
    : undefined;

  // ------------------ RISK SUMMARY ------------------
  const risk = buildRiskSummary({
    security,
    liquidity,
    holders,
    marketSnapshot,
  });

  // ------------------ VERDICT ------------------
  const verdict = buildVerdict({
    risk,
    market,
    snapshot: marketSnapshot,
    tokenomics,
    holders,
  });

  // ------------------ FINAL RESPONSE ------------------
  return {
    token,
    verdict,
    price,
    market,
    tokenomics,
    holders,
    liquidity,
    security,
    marketSnapshot,
    risk,
    sources: {
      identity: cg ? "CoinGecko" : oneInch ? "1inch" : undefined,
      price: oneInch ? "1inch" : undefined,
      security: goPlus ? "GoPlus" : undefined,
      ohlcv: candles ? "CoinDesk" : undefined,
    },
    dataAvailability: {
      identity: !!cg || !!oneInch,
      price: !!oneInch,
      security: !!goPlus,
      ohlcv: !!candles,
    },
    failedSources: failedSources.length > 0 ? failedSources : undefined,
    lastUpdated: new Date().toISOString(),
  };
}
