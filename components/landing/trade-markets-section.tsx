'use client';

import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;
const fontBricolage = { fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' };

// Designer bento cards (SVG). Widths/heights are the SVG viewBox dims — the
// 868.57 / 464.38 width ratio (~1.87) matches the 1.3fr/0.7fr column split, and
// the per-row heights line up, so the four cards tile cleanly with h-auto.
const CARDS = [
  { src: '/landing/card-prediction.webp', alt: 'Prediction Markets — trade on real-world outcomes with an AI-powered edge', w: 869, h: 506 },
  { src: '/landing/card-perpetuals.svg', alt: 'Perpetuals — leverage up to 50x on crypto', w: 464, h: 506 },
  { src: '/landing/card-edge.svg', alt: 'Edge Detection — multi-factor signal scoring on every opportunity', w: 869, h: 549 },
  { src: '/landing/card-portfolio.svg', alt: 'Portfolio — live P&L with smart alerts', w: 464, h: 549 },
];

export function TradeMarketsSection() {
  return (
    <section className="bg-white py-16 sm:py-24 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-[1440px] mx-auto">

          {/* Pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease }}
            className="flex justify-center mb-5"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-semibold text-[#3a3a3a] tracking-[0.06em] uppercase"
              style={fontBricolage}
            >
              <svg data-landing-marketplace-icon width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="10" width="3" height="5" rx="0.5" fill="currentColor" />
                <rect x="6" y="6" width="3" height="9" rx="0.5" fill="currentColor" />
                <rect x="11" y="2" width="3" height="13" rx="0.5" fill="currentColor" />
              </svg>
              AI-Powered Marketplace
            </span>
          </motion.div>

          {/* Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[40px] sm:text-[56px] md:text-[72px] font-bold text-[#1a1a1a] tracking-[-2px] leading-[1.1] text-center mb-4"
            style={fontBricolage}
          >
            Trade Markets With Measurable Edge
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="text-[18px] sm:text-[20px] text-[#6b7280] text-center tracking-[-0.3px] max-w-xl mx-auto mb-16"
            style={fontBricolage}
          >
            Discover, analyze, and execute trades using real-time AI intelligence.
          </motion.p>

          {/* Cards — designer SVG bento: wide (Prediction / Edge) left, square
              (Perpetuals / Portfolio) right; single column on mobile. */}
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_0.7fr] gap-4 max-w-[1020px] mx-auto">
            {CARDS.map((c, i) => (
              <motion.div
                key={c.src}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08, ease }}
                data-landing-trade-card
                className="rounded-[24px] overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt={c.alt} width={c.w} height={c.h} className="w-full h-auto block" loading="lazy" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
