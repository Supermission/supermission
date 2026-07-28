'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { createConfig, WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base, polygon, mainnet, arbitrum } from 'wagmi/chains';
import { http, type Config } from 'wagmi';
import { Toaster } from 'sonner';
import { useState } from 'react';
import { AuthProvider } from '@/components/auth/require-auth';
import { robinhoodChain } from '@/lib/chains/robinhood';

const chains = [base, polygon, mainnet, arbitrum, robinhoodChain] as const;

// HTTP options shared across all chains. `batch: true` coalesces JSON-RPC calls
// into single HTTP requests through the proxy.
const httpOpts = { batch: true, timeout: 10_000, retryCount: 3, retryDelay: 1000 } as const;

// Browser transports all go through the same-origin RPC proxy (/api/rpc/<chain>),
// which forwards to the paid QuickNode endpoints server-side. The QuickNode auth
// key never ships to the client. WSS stays server-only (its Origin-based auth
// can't be domain-protected), so the browser uses HTTP only.
const baseTransport = http('/api/rpc/base', httpOpts);
const polygonTransport = http('/api/rpc/polygon', httpOpts);
const mainnetTransport = http('/api/rpc/ethereum', httpOpts);
const arbitrumTransport = http('/api/rpc/arbitrum', httpOpts);
const robinhoodTransport = http('/api/rpc/robinhood', httpOpts);

export type WagmiConfigType = Config;

// Wagmi config from @privy-io/wagmi (NOT from wagmi directly)
const wagmiConfig = createConfig({
  chains,
  transports: {
    [base.id]: baseTransport,
    [polygon.id]: polygonTransport,
    [mainnet.id]: mainnetTransport,
    [arbitrum.id]: arbitrumTransport,
    [robinhoodChain.id]: robinhoodTransport,
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        onError: (error) => {
          console.error('[RPC Mutation Error]', error.message);
        },
      },
    },
  }));

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#000000',
          logo: undefined,
        },
        supportedChains: [base, polygon, mainnet, arbitrum, robinhoodChain],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          showWalletUIs: false,
        },
        loginMethods: ['twitter', 'google', 'email'],
        defaultChain: base,
        fundingMethodConfig: {
          moonpay: {
            useSandbox: process.env.NODE_ENV !== 'production',
          },
        },
      }}
    >
      <SmartWalletsProvider>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <AuthProvider>
          {children}
          </AuthProvider>
          <Toaster
            position="top-center"
            duration={2500}
            closeButton
            toastOptions={{
              closeButton: true,
              closeButtonAriaLabel: 'Close notification',
              style: {
                fontFamily: 'var(--font-sans)',
              },
              className: 'toast-center',
            }}
          />
        </WagmiProvider>
      </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
