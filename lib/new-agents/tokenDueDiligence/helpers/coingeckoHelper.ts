import { cachedFetch } from "../../../../lib/redis/cache";
import { getCoinGeckoNetwork } from "../utils/chainMapping";

export async function fetchTokenIdentityFromCoinGecko(
  chainId: number,
  address: string
) {
  const network = getCoinGeckoNetwork(chainId);

  return cachedFetch(
    `coingecko:token-info:${network}:${address.toLowerCase()}`,
    3600, // 1h TTL — token metadata changes rarely
    async () => {
      const url = `https://api.coingecko.com/api/v3/onchain/networks/${network}/tokens/${address}/info`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-cg-demo-api-key": process.env.COINGECKO_API_KEY ?? "",
        },
      });

      if (!res.ok) {
        console.warn(`[CoinGecko] Token info fetch failed (${res.status}) for ${network}/${address}`);
        return undefined;
      }

      const json = await res.json();
      const attr = json?.data?.attributes;
      if (!attr) return undefined;

      return {
        name: attr.name,
        symbol: attr.symbol,
        address,
        logo: attr.image_url ?? undefined,
        description: attr.description ?? undefined,
        website: attr.websites?.[0],
        socials: {
          twitter: attr.twitter_handle
            ? `https://x.com/${attr.twitter_handle}`
            : undefined,
          telegram: attr.telegram_handle ?? undefined,
          discord: attr.discord_url ?? undefined,
        },
        verified: Boolean(attr.coingecko_coin_id),
        holdersDistribution: attr.holders?.distribution_percentage,
        holderCount: attr.holders?.count,
      };
    },
  );
}
