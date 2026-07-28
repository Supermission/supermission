import { fetchTokenDueDiligence } from "./fetchTokenDueDiligence";
import { TokenDueDiligenceResponse } from "./types";

type CacheEntry = {
    raw: TokenDueDiligenceResponse;
    fetchedAt: number;
}

const TOKEN_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function getCachedTokenData(
    contractAddress: string,
    chainId: number
): Promise<TokenDueDiligenceResponse> {
    const key = `${chainId}:${contractAddress}`;
    const now = Date.now();

    const cached = TOKEN_CACHE.get(key);

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS){
        return cached.raw
    }

    const raw = await fetchTokenDueDiligence(contractAddress, chainId);
    TOKEN_CACHE.set(key, { raw, fetchedAt: now })
    return raw;
}