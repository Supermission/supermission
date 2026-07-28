import type { Metadata } from 'next';
import ShareContent from './share-content';

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const market = (params.market as string) || 'PnL Card';
  const pnl = Number(params.pnl || 0);
  const isProfit = pnl >= 0;
  const sign = isProfit ? '+' : '-';
  const pctStr = `${sign}${Math.abs(pnl).toFixed(2)}%`;
  const pos = (params.pos as string) || 'YES';

  const title = `${pctStr} on ${market} | Supermission`;
  const description = `${pos} position: ${pctStr}. Trade prediction markets on Supermission.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Supermission',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      creator: '@missiondotfun',
      site: '@missiondotfun',
    },
  };
}

export default function PnLSharePage() {
  return <ShareContent />;
}
