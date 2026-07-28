import type { Metadata } from 'next';
import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { Footer } from '@/components/layout/footer';
import { HideScrollbar } from '@/components/landing/hide-scrollbar';
import { HIWHero } from '@/components/landing/how-it-works/HIWHero';
import { VideoSection } from '@/components/landing/how-it-works/VideoSection';
import { DeepDiveSection } from '@/components/landing/how-it-works/DeepDiveSection';
import { MeetOurAgents } from '@/components/landing/how-it-works/MeetOurAgents';
import { CTASection } from '@/components/landing/cta-section';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';

export const metadata: Metadata = {
  title: 'How It Works | Supermission',
  description:
    'How SUPERMISSION works. Type what you want, DELPHI executes on-chain: swaps, lending, yield, prediction markets.',
  openGraph: {
    title: 'How It Works | Supermission',
    description:
      'How SUPERMISSION works. Type what you want, DELPHI executes on-chain: swaps, lending, yield, prediction markets.',
    url: 'https://supermission.fun/how-it-works',
  },
};

export default function HowItWorksPage() {
  return (
    <SiteThemeScope>
      <div
        className="min-h-screen flex flex-col bg-white"
        style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
      >
        <HideScrollbar />
        <Header rightExtra={<SiteThemeToggle />} hideSettings />

        <main className="flex-1 pt-16 sm:pt-[72px]">
          <HIWHero />
          <MeetOurAgents />
          <VideoSection />
          <DeepDiveSection />
          <CTASection />
          <Footer />
        </main>
      </div>
    </SiteThemeScope>
  );
}
