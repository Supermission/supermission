import { Metadata } from 'next';
import { PerpsTradingTerminal } from '@/components/perps/PerpsTradingTerminal';

interface PageProps {
  params: Promise<{ coin: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { coin } = await params;
  const upper = coin.toUpperCase();
  return {
    title: `${upper}/USDC Spot | Supermission`,
    description: `Buy and sell ${upper} on Hyperliquid spot markets with real-time charts and instant execution.`,
    openGraph: {
      title: `${upper}/USDC Spot | Supermission`,
      description: `Live ${upper}/USDC spot trading terminal with real-time Hyperliquid data.`,
      url: `https://supermission.fun/spot/${upper}`,
    },
    alternates: {
      canonical: `https://supermission.fun/spot/${upper}`,
    },
  };
}

export default async function CoinSpotPage({ params }: PageProps) {
  const { coin } = await params;
  return <PerpsTradingTerminal coin={coin.toUpperCase()} isSpot />;
}
