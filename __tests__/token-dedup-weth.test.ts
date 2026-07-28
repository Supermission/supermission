/**
 * Tests for: "Too many WETHs" — duplicate WETH entries in token lists
 *
 * Issue: The token list API merges local tokens (from goat/plugins.ts) with
 * LI.FI tokens. Each chain defines its own WETH with a different contract
 * address. When querying for a single chain, only one WETH should appear.
 * But if the chain filtering is wrong, or if LI.FI also returns WETH,
 * duplicates can appear.
 */

import { describe, it, expect } from 'vitest';
import { getAllTokens } from '@/lib/goat/plugins';

// Replicate getLocalTokensForChain from app/api/defi/tokens/route.ts
function getLocalTokensForChain(
  all: ReturnType<typeof getAllTokens>,
  chainId: number
) {
  const chainKey =
    chainId === 8453
      ? 'base'
      : chainId === 137
        ? 'polygon'
        : chainId === 42161
          ? 'arbitrum'
          : chainId === 1
            ? 'ethereum'
            : null;

  if (!chainKey) return [];

  return (all[chainKey as keyof typeof all] || []).map((t) => ({
    address: Object.values(t.chains)[0]?.contractAddress || '',
    chainId,
    decimals: t.decimals,
    symbol: t.symbol,
    name: t.name,
  }));
}

// Replicate the fixed deduplication logic from app/api/defi/tokens/route.ts
function mergeTokens(
  localTokens: { address: string; symbol: string; [k: string]: any }[],
  lifiTokens: { address: string; symbol: string; [k: string]: any }[]
) {
  const seenAddresses = new Set<string>();
  const seenSymbols = new Set<string>();
  const merged: typeof localTokens = [];

  for (const token of localTokens) {
    const addrKey = token.address.toLowerCase();
    const symKey = token.symbol.toUpperCase();
    if (!seenAddresses.has(addrKey)) {
      seenAddresses.add(addrKey);
      seenSymbols.add(symKey);
      merged.push(token);
    }
  }

  for (const token of lifiTokens) {
    const addrKey = token.address.toLowerCase();
    const symKey = token.symbol.toUpperCase();
    if (!seenAddresses.has(addrKey) && !seenSymbols.has(symKey)) {
      seenAddresses.add(addrKey);
      seenSymbols.add(symKey);
      merged.push(token);
    }
  }

  return merged;
}

describe('Token deduplication — no duplicate WETHs per chain', () => {
  it('each chain should have exactly one WETH in local tokens', () => {
    const all = getAllTokens();

    for (const [chainName, chainId] of [
      ['base', 8453],
      ['polygon', 137],
      ['arbitrum', 42161],
      ['ethereum', 1],
    ] as const) {
      const tokens = getLocalTokensForChain(all, chainId);
      const weths = tokens.filter(t => t.symbol === 'WETH');
      expect(weths.length, `${chainName} should have exactly 1 WETH`).toBe(1);
    }
  });

  it('local tokens for a single chain should have no duplicate addresses', () => {
    const all = getAllTokens();

    for (const chainId of [8453, 137, 42161, 1]) {
      const tokens = getLocalTokensForChain(all, chainId);
      const addresses = tokens.map(t => t.address.toLowerCase());
      const uniqueAddresses = new Set(addresses);
      expect(
        uniqueAddresses.size,
        `Chain ${chainId} should have no duplicate addresses`
      ).toBe(addresses.length);
    }
  });

  it('local tokens for a single chain should have no duplicate symbols', () => {
    const all = getAllTokens();

    for (const chainId of [8453, 137, 42161, 1]) {
      const tokens = getLocalTokensForChain(all, chainId);
      const symbols = tokens.map(t => t.symbol);
      const uniqueSymbols = new Set(symbols);
      expect(
        uniqueSymbols.size,
        `Chain ${chainId} should have no duplicate symbols`
      ).toBe(symbols.length);
    }
  });

  it('merging local + LI.FI tokens should deduplicate WETH by address', () => {
    const localTokens = [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', chainId: 8453 },
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, name: 'USD Coin', chainId: 8453 },
    ];

    // Simulate LI.FI returning WETH with same address
    const lifiTokens = [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', chainId: 8453 },
      { address: '0x0000000000000000000000000000000000000NEW', symbol: 'NEW', decimals: 18, name: 'New Token', chainId: 8453 },
    ];

    const merged = mergeTokens(localTokens, lifiTokens);
    const weths = merged.filter(t => t.symbol === 'WETH');

    expect(weths.length).toBe(1);
    expect(merged.length).toBe(3); // USDC, WETH, NEW
  });

  it('FIXED: LI.FI returning WETH with different address is deduplicated by symbol', () => {
    const localTokens = [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', chainId: 8453 },
    ];

    const lifiTokens = [
      // Different address but same symbol — now deduplicated by symbol too
      { address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', chainId: 8453 },
    ];

    const merged = mergeTokens(localTokens, lifiTokens);
    const weths = merged.filter(t => t.symbol === 'WETH');

    // FIXED: Symbol-based dedup prevents duplicate WETHs
    expect(weths.length).toBe(1);
    // Local token takes priority
    expect(weths[0].address).toBe('0x4200000000000000000000000000000000000006');
  });

  it('getAllTokens() cross-chain should have WETH on each chain with unique addresses', () => {
    const all = getAllTokens();
    const wethAddresses: string[] = [];

    for (const [, tokens] of Object.entries(all)) {
      const weths = tokens.filter(t => t.symbol === 'WETH');
      for (const weth of weths) {
        const addr = Object.values(weth.chains)[0]?.contractAddress;
        if (addr) wethAddresses.push(addr.toLowerCase());
      }
    }

    // Each chain's WETH should have a unique contract address
    const unique = new Set(wethAddresses);
    expect(unique.size).toBe(wethAddresses.length);
    // Should be exactly 4 chains with WETH
    expect(wethAddresses.length).toBe(4);
  });

  it('getLocalTokensForChain should not leak tokens from other chains', () => {
    const all = getAllTokens();

    // Base WETH address
    const baseTokens = getLocalTokensForChain(all, 8453);
    const baseWeth = baseTokens.find(t => t.symbol === 'WETH');
    expect(baseWeth?.address).toBe('0x4200000000000000000000000000000000000006');

    // Polygon WETH address should be different
    const polygonTokens = getLocalTokensForChain(all, 137);
    const polygonWeth = polygonTokens.find(t => t.symbol === 'WETH');
    expect(polygonWeth?.address).toBe('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619');

    // They should not cross-contaminate
    expect(baseWeth?.address).not.toBe(polygonWeth?.address);
  });
});
