import { Metadata } from 'next';
import { PerpsTradingTerminal } from '@/components/perps/PerpsTradingTerminal';

export const dynamic = 'force-dynamic';


interface PageProps {
  params: Promise<{ coin: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { coin } = await params;
  const upper = coin.toUpperCase();
  return {
    title: `${upper}/USDC Perpetual | Supermission`,
    description: `Trade ${upper}/USDC perpetual futures on Hyperliquid with real-time charts, orderbook, and up to 50x leverage.`,
    openGraph: {
      title: `${upper}/USDC Perpetual | Supermission`,
      description: `Live ${upper}/USDC perpetual futures terminal with real-time Hyperliquid data.`,
      url: `https://supermission.fun/perps/${upper}`,
    },
    alternates: {
      canonical: `https://supermission.fun/perps/${upper}`,
    },
  };
}

export default async function CoinPerpsPage({ params }: PageProps) {
  const { coin } = await params;
  return <PerpsTradingTerminal coin={coin.toUpperCase()} />;
}
