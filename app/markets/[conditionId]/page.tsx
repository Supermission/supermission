import { Metadata } from 'next';
import { WORKER_API } from '@/lib/config/worker';
import MarketDetailClient from './MarketDetailClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ conditionId: string }>;
}

/**
 * SEO metadata sourced from the market question. Fetches the single-market
 * worker endpoint server-side; falls back to a generic title when unreachable
 * so the page never fails to render on a metadata hiccup.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { conditionId } = await params;
  try {
    const r = await fetch(`${WORKER_API}/v1/markets/${conditionId}`, { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      const m = d?.market ?? d;
      if (m?.question) {
        const title = `${m.question} | SUPERMISSION`;
        const description =
          (typeof m.description === 'string' && m.description.trim().length > 0
            ? m.description.trim().slice(0, 160)
            : `Live prices, order book depth, AI signals and one-tap trading for "${m.question}" on SUPERMISSION.`);
        return {
          title,
          description,
          openGraph: { title, description },
        };
      }
    }
  } catch {
    // fall through to generic metadata
  }
  return {
    title: 'Market | SUPERMISSION',
    description: 'Prediction market detail — live prices, order book depth, AI signals, and one-tap trading.',
  };
}

export default function MarketDetailPage() {
  return <MarketDetailClient />;
}
