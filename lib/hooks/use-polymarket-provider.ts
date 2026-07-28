// use-polymarket-provider.ts - Provides EIP-1193 provider via wagmi connector
// Handles Privy embedded wallet and external wallets for Polymarket trading
import { useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { providers } from 'ethers';
import { usePaymentWallet } from './use-payment-wallet';

export interface PolymarketProviderInfo {
  /** The address used for Polymarket trading */
  tradingAddress: string;
  /** Whether the user is using a Privy embedded wallet */
  isCDP: boolean;
  /** Get the current chain ID from the connector provider */
  getCurrentChainId: () => Promise<number | null>;
  /** Create a Web3Provider from the connector */
  createWeb3Provider: () => Promise<providers.Web3Provider>;
  /** Get a signer that returns the correct trading address */
  getSigner: (provider: providers.Web3Provider) => providers.JsonRpcSigner;
  /** Whether the provider is ready to use */
  isReady: boolean;
}

export function usePolymarketProvider(): PolymarketProviderInfo {
  const { address, connector } = useAccount();
  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();

  // Trading address: use payment wallet address
  const tradingAddress = paymentAddress || address || '';

  // Get EIP-1193 provider from the connector
  const getConnectorProvider = useCallback(async (): Promise<providers.ExternalProvider> => {
    if (connector && typeof connector.getProvider === 'function') {
      const p = await connector.getProvider();
      return p as providers.ExternalProvider;
    }

    // Fallback to window.ethereum
    if (typeof window !== 'undefined' && window.ethereum) {
      return window.ethereum;
    }

    throw new Error('No wallet provider available');
  }, [connector]);

  // Get current chain ID from the connector provider
  const getCurrentChainId = useCallback(async (): Promise<number | null> => {
    try {
      const p = await getConnectorProvider();
      if (p && typeof p.request === 'function') {
        const chainIdHex = await p.request({ method: 'eth_chainId' });
        return parseInt(chainIdHex as string, 16);
      }
    } catch (err) {
      console.warn('[PolyProvider] Failed to get chain ID:', err);
    }
    return null;
  }, [getConnectorProvider]);

  // Create Web3Provider from connector provider
  const createWeb3Provider = useCallback(async (): Promise<providers.Web3Provider> => {
    const p = await getConnectorProvider();
    const { providers: ethersProviders } = await import('ethers');
    const web3Provider = new ethersProviders.Web3Provider(p, 'any');
    await web3Provider.ready;
    return web3Provider;
  }, [getConnectorProvider]);

  // Get signer
  const getSigner = useCallback(
    (provider: providers.Web3Provider): providers.JsonRpcSigner => {
      return provider.getSigner();
    },
    []
  );

  const isReady = !!(tradingAddress && connector);

  return {
    tradingAddress,
    isCDP: false, // No CDP concept with Privy
    getCurrentChainId,
    createWeb3Provider,
    getSigner,
    isReady,
  };
}
