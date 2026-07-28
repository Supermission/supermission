export type OneInchSocialLink = {
    name: string;
    url: string;
}

export type OneInchQuote = {
    price: number;
    volume_24h: number;
    volume_change_24h: number;
    percent_change_1h: number;
    percent_change_24h: number;
    percent_change_7d: number;
    percent_change_30d: number;
    percent_change_60d: number;
    percent_change_90d: number;
    market_cap: number;
    market_cap_dominance: number;
    fully_diluted_market_cap: number;
    tvl: any;
    last_updated: string;
}

export type OneInchDetails = {
    provider: string;
    providerURL: string;
    vol24: number;
    marketCap: number;
    circulatingSupply: number;
    totalSupply: number;
    quote: OneInchQuote
}

export type OneInchAssets = {
    name: string;
    website: string;
    symbol: string;
    type: string;
    description: string;
    research: string;
    explorer: string;
    decimals: number;
    status: string;
    tags: string[];
    links: OneInchSocialLink[];
}

export type OneInchInfoDataResponse = {
    assets: OneInchAssets
    details: OneInchDetails;
}

export async function fetchTokenInfoFromOneInch(
    chainId: number,
    tokenAddress: string,
    provider?: string
): Promise<OneInchInfoDataResponse | null>{
    try {
        if (!Number.isFinite(Number(chainId))) {
            console.error("[1 inch] invalid chain id", chainId);
            return null;
        }

        const oneInchUrl = `https://api.1inch.com/token-details/v1.0/details/${chainId}/${tokenAddress}`;

        const res = await fetch(
            provider ? `${oneInchUrl}?provider=${provider}` : oneInchUrl,
            {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${process.env.ONE_INCH_API_KEY}`
                },
            }
        );

        if (!res.ok){
            const errorText = await res.text();
            console.error(
                "[1 inch] error",
                res.status,
                errorText
            );
            return null;
        }

        const response = await res.json();
        console.log("response is", response);
        return response as OneInchInfoDataResponse;
    } catch (error) {
        console.error("[1 inch] fetch failed", error);
        return null;
    }
}
