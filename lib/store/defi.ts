import { create } from 'zustand';
import type { TokenInfo, NormalizedQuoteResponse } from '@/lib/uniswap/types';

export type DeFiSubTab = 'swap' | 'pools' | 'positions' | 'lend';

interface DeFiState {
  // Active sub-tab
  activeSubTab: DeFiSubTab;
  setActiveSubTab: (tab: DeFiSubTab) => void;

  // Chain selection
  activeChainId: number;
  setActiveChainId: (chainId: number) => void;

  // Cross-chain
  toChainId: number;
  setToChainId: (chainId: number) => void;
  crossChainMode: boolean;
  setCrossChainMode: (enabled: boolean) => void;

  // Swap tokens
  tokenIn: TokenInfo | null;
  tokenOut: TokenInfo | null;
  amountIn: string;
  setTokenIn: (token: TokenInfo | null) => void;
  setTokenOut: (token: TokenInfo | null) => void;
  setAmountIn: (amount: string) => void;
  swapTokens: () => void;

  // Slippage
  slippageMode: 'auto' | 'custom';
  customSlippageBps: number;
  setSlippageMode: (mode: 'auto' | 'custom') => void;
  setCustomSlippageBps: (bps: number) => void;

  // Token lists (cached per chain)
  tokenLists: Record<number, TokenInfo[]>;
  setTokenList: (chainId: number, tokens: TokenInfo[]) => void;

  // Last quote
  lastQuote: NormalizedQuoteResponse | null;
  setLastQuote: (quote: NormalizedQuoteResponse | null) => void;
}

export const useDefiStore = create<DeFiState>((set) => ({
  activeSubTab: 'swap',
  setActiveSubTab: (tab) => set({ activeSubTab: tab }),

  activeChainId: 8453,
  setActiveChainId: (chainId) => set({ activeChainId: chainId }),

  toChainId: 8453,
  setToChainId: (chainId) => set({ toChainId: chainId }),
  crossChainMode: false,
  setCrossChainMode: (enabled) => set((state) => ({
    crossChainMode: enabled,
    // When disabling cross-chain, reset toChainId to match source
    toChainId: enabled ? state.toChainId : state.activeChainId,
    // Reset tokens and quote when toggling
    tokenOut: enabled ? null : state.tokenOut,
    lastQuote: null,
  })),

  tokenIn: null,
  tokenOut: null,
  amountIn: '',
  setTokenIn: (token) => set({ tokenIn: token }),
  setTokenOut: (token) => set({ tokenOut: token }),
  setAmountIn: (amount) => set({ amountIn: amount }),
  swapTokens: () =>
    set((state) => ({
      tokenIn: state.tokenOut,
      tokenOut: state.tokenIn,
      amountIn: '',
      lastQuote: null,
    })),

  slippageMode: 'auto',
  customSlippageBps: 50,
  setSlippageMode: (mode) => set({ slippageMode: mode }),
  setCustomSlippageBps: (bps) => set({ customSlippageBps: bps }),

  tokenLists: {},
  setTokenList: (chainId, tokens) =>
    set((state) => ({
      tokenLists: { ...state.tokenLists, [chainId]: tokens },
    })),

  lastQuote: null,
  setLastQuote: (quote) => set({ lastQuote: quote }),
}));
