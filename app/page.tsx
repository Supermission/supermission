import type { Metadata } from 'next';
import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { Footer } from '@/components/layout/footer';
import { HeroSection } from '@/components/landing/hero-section';
import { StatsBar } from '@/components/landing/stats-bar';
import { AgentEconomySection } from '@/components/landing/agent-economy-section';
import { TheFlowSection } from '@/components/landing/the-flow-section';
import { TradeMarketsSection } from '@/components/landing/trade-markets-section';
import { OurAgentsSection } from '@/components/landing/our-agents-section';
import { SocialProof } from '@/components/landing/social-proof';
import { CTASection } from '@/components/landing/cta-section';

import { HideScrollbar } from '@/components/landing/hide-scrollbar';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';
import { getPlatformStats } from '@/lib/agent-economy/stats';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {};
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://supermission.fun/#website',
      url: 'https://supermission.fun',
      name: 'SUPERMISSION',
      description: 'AI-powered DeFi terminal on Base, Polygon & Robinhood Chain. One chat, every trade: swaps, LP, lending, yields, prediction markets.',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://supermission.fun/#app',
      name: 'SUPERMISSION',
      url: 'https://supermission.fun',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: 'AI-powered DeFi terminal on Base, Polygon & Robinhood Chain. One chat to swap tokens, provide liquidity, lend, earn yield, trade prediction markets, and analyze wallets. No app-hopping required.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free to use. Zero gas fees for embedded wallet users.',
      },
      featureList: [
        'Token swaps across 40+ chains via LI.FI',
        'Uniswap V3 liquidity provision with range optimization',
        'Morpho, Aave V3, Compound III lending and yield',
        'AI yield scanner, 1,000+ pools in real-time',
        'Prediction market trading via Polymarket',
        'Wallet intelligence and smart money tracking',
        'Zero gas fees with Privy-sponsored transactions',
        'Email-to-wallet onboarding in 30 seconds',
      ],
    },
    {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://supermission.fun/markets?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
    {
      '@type': 'Organization',
      '@id': 'https://supermission.fun/#org',
      name: 'SUPERMISSION',
      url: 'https://supermission.fun',
      logo: 'https://supermission.fun/metatag.jpg',
      sameAs: ['https://github.com/Supermission'],
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://supermission.fun/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is SUPERMISSION?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'SUPERMISSION is an AI-powered DeFi terminal on Base, Polygon, and Robinhood Chain. It replaces 10+ DeFi apps with a single chat interface where you can swap tokens, provide liquidity, lend, earn yield, trade prediction markets, and analyze wallets. You type what you want, the AI agent DELPHI executes on-chain.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does SUPERMISSION work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'You type what you want in plain English (e.g., "swap 100 USDC to WETH on Base"). The AI agent DELPHI resolves tokens, finds the best route, and prepares the transaction. A preview card shows exactly what will happen. You click Confirm and it settles on-chain.',
          },
        },
        {
          '@type': 'Question',
          name: 'What blockchain does SUPERMISSION use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'SUPERMISSION is built on Base, an Ethereum Layer 2 blockchain, and also runs on Robinhood Chain — an Arbitrum-based Ethereum Layer 2 optimized for tokenized real-world assets like equities and ETFs. It also supports cross-chain swaps and analysis across Ethereum and Polygon. All payments use USDC.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need to pay gas fees?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. SUPERMISSION absorbs gas fees for embedded wallet users via Privy-sponsored transactions. You sign up with email, get a wallet instantly, and never pay gas.',
          },
        },
        {
          '@type': 'Question',
          name: 'What DeFi protocols does SUPERMISSION support?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'SUPERMISSION supports token swaps via LI.FI across 40+ chains, Uniswap V3 for liquidity provision with automated range optimization, Aave V3 and Compound III for lending, Morpho MetaMorpho for curated yield vaults, and Polymarket for prediction market trading.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is DELPHI?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'DELPHI is the AI agent that powers SUPERMISSION. It understands DeFi operations, resolves token addresses, fetches live market data, computes optimal strategies, and prepares transactions for user confirmation. It also provides smart money tracking and token safety analysis.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is SUPERMISSION free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. The platform is free to use with zero gas fees for embedded wallet users. Trading involves USDC for DeFi operations and prediction market trades.',
          },
        },
      ],
    },
  ],
};

export default async function Home() {
  const stats = await getPlatformStats();

  return (
    <SiteThemeScope>
      <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <HideScrollbar />
        <Header rightExtra={<SiteThemeToggle />} hideSettings />

        <main className="flex-1 pt-16 sm:pt-[72px]">
          <HeroSection />
          <AgentEconomySection />
          <TheFlowSection />
          <TradeMarketsSection />
          <StatsBar initialStats={stats} />
          <OurAgentsSection />
          <SocialProof />
          <CTASection />
          <Footer />
        </main>
      </div>
    </SiteThemeScope>
  );
}
