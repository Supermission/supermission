import type { Metadata } from 'next';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { HideScrollbar } from '@/components/landing/hide-scrollbar';
import { MissionReveal } from '@/components/mission/mission-reveal';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';

export const metadata: Metadata = {
  title: '$MISSION — Live on Robinhood Chain | Supermission',
  description: 'The AI trading terminal now has a token — live on Robinhood Chain. CA: 0xD374595B39069A56Ee5Da6592f9252D366e53482',
  openGraph: {
    title: '$MISSION — Live on Robinhood Chain',
    description: 'The AI trading terminal now has a token, launched fair on Robinhood Chain. CA: 0xD374595B39069A56Ee5Da6592f9252D366e53482',
    url: 'https://supermission.fun/mission',
  },
  twitter: {
    card: 'summary_large_image',
    title: '$MISSION — Live on Robinhood Chain',
    description: 'The AI trading terminal now has a token, live on Robinhood Chain. CA: 0xD374595B39069A56Ee5Da6592f9252D366e53482',
  },
};

export default function MissionPage() {
  // Themed page. Authored in the site hex-utility vocabulary (bg-white,
  // text-[#1a1a1a], border-[#e5e7eb]…), which globals.css `.dark.site-theme-scope`
  // auto-remaps for dark mode — so SiteThemeScope + the toggle give real light/dark
  // without any per-element dark: variants.
  return (
    <SiteThemeScope>
      <div className="min-h-screen flex flex-col bg-[#fafafa]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
        <HideScrollbar />
        <Header rightExtra={<SiteThemeToggle />} hideSettings />
        <main className="flex-1 pt-16 sm:pt-[72px]">
          <MissionReveal />
          <Footer />
        </main>
      </div>
    </SiteThemeScope>
  );
}
