'use client';

import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';
import { HideScrollbar } from '@/components/landing/hide-scrollbar';

interface LegalPageLayoutProps {
  title: string;
  lastModified: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, lastModified, children }: LegalPageLayoutProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!contentRef.current) return;
    try {
      await navigator.clipboard.writeText(contentRef.current.innerText);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  return (
    <SiteThemeScope>
    <div className="bg-white min-h-screen" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
      <HideScrollbar />
      <Header />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 py-16 sm:py-24 pt-[96px] sm:pt-[112px]">
        {/* Hero */}
        <div className="flex items-start justify-between gap-4 mb-12">
          <div>
            <h1
              className="text-[36px] sm:text-[48px] font-bold tracking-tight text-[#1a1a1a] leading-tight"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {title}
            </h1>
            <p className="text-[14px] text-[#6b7280] mt-2">Last modified: {lastModified}</p>
          </div>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 mt-2 flex items-center gap-2 border border-[#e5e7eb] rounded-[8px] px-4 py-2 bg-white hover:bg-[#f5f3f0] transition-colors text-sm text-[#3a3a3a] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy all
              </>
            )}
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="legal-content space-y-8">
          {children}
        </div>
      </div>
      <Footer />
    </div>
    </SiteThemeScope>
  );
}

export function LegalSection({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pb-8 border-b border-[#e5e7eb] last:border-b-0">
      <h3
        className="text-[20px] sm:text-[24px] font-bold text-[#3a3a3a] mb-4"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      >
        {number}. {title}
      </h3>
      <div className="text-[15px] sm:text-[16px] text-[#48484b] leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  );
}
