import type {
  UniswapQuoteParams,
  UniswapQuoteResponse,
  SupportedChainId,
  TokenInfo,
} from './types';

const TRADE_API_URL =
  process.env.UNISWAP_TRADE_API_URL ||
  'https://trade-api.gateway.uniswap.org/v1';

const API_KEY = process.env.UNISWAP_API_KEY || '';

const QUOTE_TIMEOUT_MS = 12_000;

export class UniswapApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'UniswapApiError';
  }
}

export async function getUniswapQuote(
  params: UniswapQuoteParams
): Promise<UniswapQuoteResponse> {
  if (!API_KEY) {
    throw new UniswapApiError('Uniswap API key is not configured', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);

  try {
    const body = {
      tokenInChainId: params.chainId,
      tokenOutChainId: params.chainId,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amount: params.amount,
      type: params.type,
      swapper: params.swapper,
      slippageTolerance: params.slippageTolerance ?? 50, // 0.5% default
      urgency: 'normal' as const,
    };

    const res = await fetch(`${TRADE_API_URL}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UniswapApiError(
        'Invalid response from Uniswap API',
        502,
        text.slice(0, 500)
      );
    }

    if (!res.ok) {
      const detail =
        json?.detail || json?.errorCode || json?.message || 'Unknown error';
      console.error('[Uniswap API] Quote error:', {
        status: res.status,
        detail,
        params: { ...body, swapper: body.swapper.slice(0, 10) + '...' },
      });

      if (res.status === 429) {
        throw new UniswapApiError(
          'Rate limited. Please wait and try again.',
          429
        );
      }
      if (res.status === 400) {
        throw new UniswapApiError(
          `Invalid quote parameters: ${detail}`,
          400,
          json
        );
      }
      throw new UniswapApiError(
        `Uniswap API error: ${detail}`,
        res.status,
        json
      );
    }

    return json as UniswapQuoteResponse;
  } catch (e) {
    if (e instanceof UniswapApiError) throw e;
    if ((e as Error).name === 'AbortError') {
      throw new UniswapApiError('Uniswap API request timed out', 504);
    }
    throw new UniswapApiError(
      `Failed to get Uniswap quote: ${(e as Error).message}`,
      500
    );
  } finally {
    clearTimeout(timeout);
  }
}

// Token list cache: chainId -> { tokens, fetchedAt }
const tokenListCache = new Map<
  number,
  { tokens: TokenInfo[]; fetchedAt: number }
>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getUniswapTokenList(
  chainId: SupportedChainId
): Promise<TokenInfo[]> {
  const cached = tokenListCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return cached.tokens;
  }

  try {
    // Use Uniswap's default token list
    const res = await fetch(
      'https://gateway.ipfs.io/ipns/tokens.uniswap.org',
      { next: { revalidate: 300 } } // 5-min ISR cache
    );
    if (!res.ok) throw new Error(`Token list fetch failed: ${res.status}`);

    const data = await res.json();
    const tokens: TokenInfo[] = (data.tokens || [])
      .filter((t: any) => t.chainId === chainId)
      .map((t: any) => ({
        address: t.address,
        chainId: t.chainId,
        decimals: t.decimals,
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI,
      }));

    tokenListCache.set(chainId, { tokens, fetchedAt: Date.now() });
    return tokens;
  } catch (e) {
    console.error('[Uniswap] Token list fetch error:', e);
    // Return cached even if stale on error
    if (cached) return cached.tokens;
    return [];
  }
}
