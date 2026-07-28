// lib/morpho/client.ts
import { MORPHO_GRAPHQL_ENDPOINT, MORPHO_VAULTS, BASE_CHAIN_ID } from './config';
import type { MorphoVault, MorphoAllocation } from './types';

// 5-minute server-side cache (30s for fallback data so we retry the API sooner)
let vaultCache: { data: MorphoVault[]; timestamp: number; isFallback?: boolean } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 30 * 1000;

// Uses the V2 GraphQL schema per Morpho docs (vaultV2s, top-level fields)
const VAULTS_QUERY = `
  query GetVaults($chainId: [Int!]!) {
    vaultV2s(
      first: 20
      where: { chainId_in: $chainId }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
    ) {
      items {
        address
        name
        symbol
        listed
        asset {
          id
          address
          symbol
          decimals
        }
        totalAssets
        totalAssetsUsd
        totalSupply
        liquidityUsd
        avgNetApy
        performanceFee
        metadata {
          description
        }
        curators {
          items {
            addresses {
              address
            }
          }
        }
        adapters {
          items {
            address
            assets
            assetsUsd
            type
          }
        }
      }
    }
  }
`;

async function fetchGraphQL(query: string, variables: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(MORPHO_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Morpho GraphQL error: ${res.status}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Morpho GraphQL: ${json.errors[0].message}`);
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

function parseVaultItem(item: any, configVault?: typeof MORPHO_VAULTS[number]): MorphoVault {
  const totalAssetsUsd = item.totalAssetsUsd || 0;
  const netApy = item.avgNetApy || 0;
  const performanceFee = item.performanceFee || 0;

  // Curator from config (API curator addresses don't include names)
  const curator = configVault?.curator || 'Unknown';

  // Parse adapter allocations as market breakdown
  const allocations: MorphoAllocation[] = (item.adapters?.items || []).map((a: any) => {
    const allocationPct = totalAssetsUsd > 0 ? (a.assetsUsd || 0) / totalAssetsUsd : 0;
    return {
      marketId: a.address || '',
      collateralAsset: { address: '', symbol: a.type || 'Market' },
      loanAsset: {
        address: item.asset?.address || '',
        symbol: item.asset?.symbol || '?',
      },
      lltv: 0,
      supplyApy: 0,
      allocationPercentage: allocationPct,
    };
  });

  return {
    address: item.address,
    name: item.name || configVault?.name || 'Morpho Vault',
    symbol: item.symbol || '',
    asset: {
      address: item.asset?.address || configVault?.assetAddress || '',
      symbol: item.asset?.symbol || configVault?.asset || '',
      decimals: item.asset?.decimals ?? configVault?.assetDecimals ?? 18,
    },
    curator,
    apy: {
      net: netApy,
      base: netApy,
      rewards: 0,
    },
    tvl: totalAssetsUsd,
    totalAssets: item.totalAssets || '0',
    fee: performanceFee,
    allocations,
    metadata: {
      description: item.metadata?.description || undefined,
      // Liquidity-based risk tier: deeper TVL = easier to enter/exit without slippage
      riskLevel: totalAssetsUsd > 20_000_000 ? 'low' : totalAssetsUsd > 5_000_000 ? 'medium' : 'high',
      reasons: generateReasons(netApy, totalAssetsUsd, curator, performanceFee),
    },
  };
}

function generateReasons(apy: number, tvl: number, curator: string, fee: number): string[] {
  const reasons: string[] = [];
  if (apy > 0.05) reasons.push(`Strong ${(apy * 100).toFixed(2)}% APY`);
  else if (apy > 0.02) reasons.push(`Competitive ${(apy * 100).toFixed(2)}% APY`);
  if (tvl > 50_000_000) reasons.push('Deep liquidity — easy to enter/exit');
  else if (tvl > 10_000_000) reasons.push('Solid TVL — good liquidity');
  if (curator) reasons.push(`Curated by ${curator} — professional risk management`);
  if (fee <= 0.05) reasons.push('Low performance fee');
  if (reasons.length === 0) reasons.push('Morpho Blue markets — capital-efficient lending');
  return reasons;
}

/** Hardcoded fallback when GraphQL API is unavailable */
function fallbackVaults(): MorphoVault[] {
  return MORPHO_VAULTS.map((v) => ({
    address: v.address,
    name: v.name,
    symbol: '',
    asset: {
      address: v.assetAddress,
      symbol: v.asset,
      decimals: v.assetDecimals,
    },
    curator: v.curator,
    apy: { net: 0, base: 0, rewards: 0 },
    tvl: 0,
    totalAssets: '0',
    fee: 0,
    allocations: [],
    metadata: {
      riskLevel: 'medium',
      reasons: ['Live APY data temporarily unavailable — check back soon'],
    },
  }));
}

/** Fetch all configured Morpho vaults on Base. Cached for 5 min (30s if fallback). */
export async function fetchMorphoVaults(): Promise<MorphoVault[]> {
  if (vaultCache) {
    const ttl = vaultCache.isFallback ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - vaultCache.timestamp < ttl) {
      return vaultCache.data;
    }
  }

  try {
    const data = await fetchGraphQL(VAULTS_QUERY, {
      chainId: [BASE_CHAIN_ID],
    });

    const items = data?.vaultV2s?.items || [];

    // Filter to only our configured vault addresses + skip unlisted vaults
    const configAddresses = new Set(MORPHO_VAULTS.map((v) => v.address.toLowerCase()));
    const matchedItems = items.filter((item: any) =>
      configAddresses.has(item.address?.toLowerCase()) && item.listed !== false
    );

    const vaults = matchedItems.map((item: any) => {
      const configVault = MORPHO_VAULTS.find(
        (v) => v.address.toLowerCase() === item.address.toLowerCase()
      );
      return parseVaultItem(item, configVault);
    });

    // Don't cache empty results as success — API may have returned partial data
    if (vaults.length === 0) {
      console.warn('[Morpho] API returned no matching vaults, using fallback');
      const fb = fallbackVaults();
      vaultCache = { data: fb, timestamp: Date.now(), isFallback: true };
      return fb;
    }

    vaultCache = { data: vaults, timestamp: Date.now(), isFallback: false };
    return vaults;
  } catch (err) {
    console.error('[Morpho] GraphQL fetch failed, using fallback:', err);
    const fb = fallbackVaults();
    vaultCache = { data: fb, timestamp: Date.now(), isFallback: true };
    return fb;
  }
}

/** Fetch a single vault by address */
export async function fetchMorphoVault(address: string): Promise<MorphoVault | null> {
  const all = await fetchMorphoVaults();
  return all.find((v) => v.address.toLowerCase() === address.toLowerCase()) || null;
}
