import type { Metadata } from 'next';
import { Header } from '@/components/layout/header';
import { HideScrollbar } from '@/components/landing/hide-scrollbar';
import { PitchDeck } from '@/components/landing/deck/PitchDeck';

export const metadata: Metadata = {
  title: 'Investor Deck | Supermission',
  description:
    'Supermission Pre-Seed pitch deck. The AI-powered DeFi terminal: one chat, every trade, settled on Base, Polygon & Robinhood Chain.',
  openGraph: {
    title: 'Investor Deck | Supermission',
    description:
      '$1M Pre-Seed. The AI DeFi terminal on Base, Polygon & Robinhood Chain: swaps, LP, lending, yields, all via chat.',
    url: 'https://supermission.fun/deck',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function DeckPage() {
  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
    >
      <HideScrollbar />
      <Header />

      <main className="flex-1 pt-16 sm:pt-[72px]">
        <PitchDeck />
      </main>
    </div>
  );
}
