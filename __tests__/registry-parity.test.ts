import { describe, it, expect } from 'vitest';
import {
  trackedAddressesFor,
  chainlinkStableRefs,
  stableIconEntries,
  WALLET_BALANCE_TOKENS,
  symbolForAddress,
  STABLECOIN_SYMBOLS,
  BASE_USDC_ADDRESS,
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
  POLYGON_USDC_NATIVE_ADDRESS,
  ARBITRUM_USDC_ADDRESS,
  ETHEREUM_USDC_ADDRESS,
} from '@/lib/tokens/registry';

// ── Original literals captured verbatim from the pre-refactor code ──

const ORIG_TRACKED: Record<string, string[]> = {
  base: [
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', '0x4200000000000000000000000000000000000006',
    '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452',
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c', '0x532f27101965dd16442e59d40670faf5ebb142e4',
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
  ],
  polygon: [
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb', '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
    '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39', '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
    '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
  ],
  ethereum: [
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xdac17f958d2ee523a2206206994597c13d831ec7',
    '0x6b175474e89094c44da98b954eedeac495271d0f', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', '0x514910771af9ca656af840dff83e8264ecf986ca',
    '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    '0xae78736cd615f374d3085123a210448e74fc6393', '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    '0xbe9895146f7af43049ca1c1ae358b0541ea49704',
  ],
  arbitrum: [
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831', '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
  ],
};

// getTokenSymbol map (identical across both dashboard routes)
const ORIG_SYMBOLS: Record<string, string> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDbC',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC.e',
  '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb': 'pUSD',
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'USDT',
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': 'DAI',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 'WETH',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH',
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 'WBTC',
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'WBTC',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'WBTC',
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'cbETH',
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': 'cbETH',
  '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': 'wstETH',
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': 'wstETH',
  '0xae78736cd615f374d3085123a210448e74fc6393': 'rETH',
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'WMATIC',
  '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39': 'LINK',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK',
  '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': 'LINK',
  '0xd6df932a45c0f255f85145f286ea0b292b21c90b': 'AAVE',
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'AAVE',
  '0xb33eaad8d922b1083446dc23f610c2567fb5180f': 'UNI',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
  '0x532f27101965dd16442e59d40670faf5ebb142e4': 'BRETT',
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 'AERO',
};

const ORIG_CHAINLINK: Record<string, string> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC',
  '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb': 'USDC',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'USDT',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': 'DAI',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 'DAI',
};

const ORIG_ICONS: Record<string, string> = {
  'usdc:8453': '/tokens/usdc-base.png',
  'usdc.e:137': '/tokens/usdce-polygon.webp',
  'pusd:137': '/tokens/polymarket.png',
  'usdg:4663': '/tokens/usdg.png',
  'usdc:137': '/tokens/usdc-base.png',
  'usdc:1': '/tokens/usdc-ethereum.png',
  'usdc:42161': '/tokens/usdc-base.png',
};

describe('token registry parity with pre-refactor literals', () => {
  it('TRACKED_TOKENS sets match exactly', () => {
    for (const chain of ['base', 'polygon', 'ethereum', 'arbitrum'] as const) {
      expect([...trackedAddressesFor(chain)].sort()).toEqual([...ORIG_TRACKED[chain]].sort());
    }
  });

  it('getTokenSymbol resolves every original address identically', () => {
    for (const [addr, sym] of Object.entries(ORIG_SYMBOLS)) {
      expect(symbolForAddress(addr) || 'TOKEN').toBe(sym);
    }
  });

  it('Chainlink stable-ref map matches (non-BSC entries)', () => {
    expect(chainlinkStableRefs()).toEqual(ORIG_CHAINLINK);
  });

  it('Stable token icon entries match', () => {
    expect(stableIconEntries()).toEqual(ORIG_ICONS);
  });

  it('Wallet balance token lists reproduce address/label/decimals', () => {
    const toKey = (t: { address: string; label: string; decimals: number }) =>
      `${t.address.toLowerCase()}|${t.label}|${t.decimals}`;
    expect(WALLET_BALANCE_TOKENS.base.map(toKey).sort()).toEqual(
      ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913|USDC|6'].sort(),
    );
    expect(WALLET_BALANCE_TOKENS.polygon.map(toKey).sort()).toEqual(
      [
        '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb|pUSD|6',
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174|USDC.e|6',
        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359|USDC|6',
      ].sort(),
    );
    expect(WALLET_BALANCE_TOKENS.arbitrum.map(toKey)).toEqual([
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831|USDC|6',
    ]);
    expect(WALLET_BALANCE_TOKENS.ethereum.map(toKey)).toEqual([
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48|USDC|6',
    ]);
    expect(WALLET_BALANCE_TOKENS.robinhood.map((t) => `${t.label}|${t.decimals}`)).toEqual([
      'USDG|6',
    ]);
  });

  it('named address constants match original checksummed literals', () => {
    expect(BASE_USDC_ADDRESS).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(POLYGON_PUSD_ADDRESS).toBe('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB');
    expect(POLYGON_USDCE_ADDRESS).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    expect(POLYGON_USDC_NATIVE_ADDRESS).toBe('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
    expect(ARBITRUM_USDC_ADDRESS).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
    expect(ETHEREUM_USDC_ADDRESS).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });

  it('registry stablecoin symbols cover the recurring-bug tokens', () => {
    for (const s of ['USDC', 'USDC.e', 'pUSD', 'USDbC', 'USDG', 'USDT', 'DAI']) {
      expect(STABLECOIN_SYMBOLS.has(s)).toBe(true);
    }
  });
});
