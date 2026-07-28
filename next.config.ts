import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'app.hyperliquid.xyz' },
      { protocol: 'https', hostname: '*.coingecko.com' },
      { protocol: 'https', hostname: 'polymarket-upload.s3.us-east-2.amazonaws.com' },
    ],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking attacks
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Point AI agents / LLMs to the agent documentation
          {
            key: 'Link',
            value: '<https://supermission.fun/llms.txt>; rel="llms-txt"',
          },
          // Restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content Security Policy - permissive for Web3 apps
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://auth.privy.io https://*.privy.io https://*.walletconnect.com https://*.walletconnect.org https://s3.tradingview.com https://us-assets.i.posthog.com",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https:",
              "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://*.quiknode.pro wss://*.quiknode.pro https://*.base.org https://base.llamarpc.com https://1rpc.io https://auth.privy.io https://*.privy.io https://*.rpc.privy.systems https://*.walletconnect.com https://*.walletconnect.org https://rpc.walletconnect.org https://api.web3modal.org wss://*.walletconnect.com wss://*.walletconnect.org https://gateway.pinata.cloud https://*.infura.io wss://*.infura.io https://polygon-rpc.com https://clob.polymarket.com https://gamma-api.polymarket.com https://*.polygon-rpc.com wss://*.polygon-rpc.com https://polygon.drpc.org https://*.drpc.org wss://*.drpc.org https://li.quest https://*.li.quest https://data-api.polymarket.com https://bridge.polymarket.com wss://ws-subscriptions-clob.polymarket.com https://worker.supermission.fun https://*.posthog.com https://us.i.posthog.com https://*.hyperliquid.xyz wss://*.hyperliquid.xyz https://api.hyperliquid.xyz wss://api.hyperliquid.xyz",
              "frame-src 'self' https://auth.privy.io https://*.privy.io https://*.walletconnect.com https://*.walletconnect.org https://dexscreener.com https://www.dextools.io https://www.tradingview-widget.com https://s.tradingview.com https://*.tradingview.com https://www.youtube.com",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/.well-known/farcaster.json',
        destination: 'https://api.farcaster.xyz/miniapps/hosted-manifest/019a0ffe-3479-9fde-e225-061b225acf64',
        permanent: false, // 307 temporary redirect
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Fix for viem and other ESM packages
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    if (isServer) {
      config.externals.push('@circle-fin/x402-batching', '@circle-fin/x402-batching/server', '@circle-fin/bridge-kit');
    }

    // Handle viem bundling issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      // Add missing module fallbacks
      'x402-fetch': false,
      '@react-native-async-storage/async-storage': false,
    };

    // Stub out Solana packages - not needed for Base-only project
    // but pulled in transitively by x402 -> @solana-program/token -> @solana/kit
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana/kit': false,
      '@solana-program/token': false,
      ...(!isServer && {
        '@circle-fin/x402-batching': false,
        '@circle-fin/x402-batching/server': false,
        '@circle-fin/bridge-kit': false,
      }),
    };

    return config;
  },
  // Disable static optimization for dynamic routes with blockchain data
  experimental: {
    optimizePackageImports: [
      'viem',
      'framer-motion',
      'lucide-react',
      '@privy-io/react-auth',
      '@privy-io/wagmi',
      '@tanstack/react-query',
      'react-markdown',
      'date-fns',
      'sonner',
      'ethers',
      '@ethersproject/units',
      '@polymarket/clob-client-v2',
      'zustand',
      'recharts',
    ],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default withBundleAnalyzer(nextConfig);
