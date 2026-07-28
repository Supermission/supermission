import { getGoPlusAccessToken } from "../utils/goPlusToken";
import { getGoPlusChainId } from "../utils/chainMapping";

export async function fetchSecurityFromGoPlus(
  chainId: number,
  address: string
) {
  const chain = getGoPlusChainId(chainId);
  const url = `https://api.gopluslabs.io/api/v1/token_security/${chain}?contract_addresses=${address}`;

  try {
    const token = await getGoPlusAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: token },
    });

    if (!res.ok) return undefined;

    const json = await res.json();
    const raw =
      json?.result?.[address] ??
      json?.result?.[address.toLowerCase()] ??
      Object.values(json?.result ?? {})[0];

    if (!raw) return undefined;

    return {
      security: {
        isHoneypot: raw.is_honeypot === "1",
        buyTaxPercent: Number(raw.buy_tax ?? 0),
        sellTaxPercent: Number(raw.sell_tax ?? 0),
        canMint: raw.is_mintable === "1",
        canPauseTransfers: raw.transfer_pausable === "1",
        canChangeOwnership: raw.can_take_back_ownership === "1",
        hiddenOwner: raw.hidden_owner === "1",
        proxyContract: raw.is_proxy === "1",
        selfDestruct: raw.selfdestruct === "1",
        openSource: raw.is_open_source === "1",
      },

      holders: {
        count: Number(raw.holder_count ?? 0),
        creatorPercent: Number(raw.creator_percent ?? 0),
        rawHolders: raw.holders ?? [],
      },

      liquidity: {
        dex: raw.dex ?? [],
        lpHolderCount: Number(raw.lp_holder_count ?? 0),
      },

      supply: {
        totalSupply: Number(raw.total_supply ?? 0),
        isMintable: raw.is_mintable === "1",
      },
    };
  } catch (err) {
    console.warn('[GoPlus] Token security fetch failed:', (err as Error).message ?? err);
    return undefined;
  }
}
