'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ease = [0.16, 1, 0.3, 1] as const;

const agents = [
  {
    title: 'DeFi Yields',
    description:
      'Scan 1000+ pools across all chains for the best APY with risk analysis.',
    stats: { time: '2s', price: '$0.01', rating: '4.8/5' },
    query: 'find me best yield on USDC',
    headerImg: '/landing/agent-defi-yields.png',
    imgW: 100,
    imgH: 100,
  },
  {
    title: 'Wallet Intelligence',
    description:
      'Comprehensive multi-chain wallet analysis with NFT tracking, DeFi positions, and security',
    stats: { time: '4s', price: '$0.15', rating: '4.9/5' },
    query: 'analyze 0xWhales Wallet',
    headerImg: '/landing/agent-wallet-intel.png',
    imgW: 126,
    imgH: 126,
  },
  {
    title: 'Token Research',
    description:
      'Security audit, holder analysis, liquidity check, risk score.',
    stats: { time: '1s', price: '$0.1', rating: '4.7/5' },
    query: 'Is this memecoin a good investment?',
    headerImg: '/landing/agent-token-research.png',
    imgW: 101,
    imgH: 116,
  },
];

function AgentCardCompact({ agent }: { agent: (typeof agents)[0] }) {
  return (
    <Link
      href={`/defai?prompt=${encodeURIComponent(agent.query)}`}
      className="block h-full"
    >
      <div data-landing-agent-card className="h-full bg-[#fafbfc] border border-[#e7e9eb] overflow-clip group hover:shadow-[0px_5px_15px_rgba(0,0,0,0.08)] transition-shadow duration-300 rounded-[16px] sm:rounded-[24px]">
        {/* Image header */}
        <div className="bg-[#f5f5f5] h-[100px] sm:h-[130px] flex items-center justify-center overflow-clip">
          <Image
            src={agent.headerImg}
            alt={agent.title}
            width={Math.round(agent.imgW * 0.8)}
            height={Math.round(agent.imgH * 0.8)}
            className="object-contain"
          />
        </div>

        {/* Content */}
        <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-3 sm:pb-5 flex flex-col gap-[10px] sm:gap-[14px] flex-1">
          <h3
            className="text-[18px] sm:text-[24px] font-bold text-[#1a1a1a]"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            {agent.title}
          </h3>
          <p
            className="text-[13px] sm:text-[14px] leading-[1.5] text-[#48484b] line-clamp-3 h-auto sm:h-[63px]"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            {agent.description}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-[6px] sm:gap-[10px] mt-auto">
            <div className="px-[6px] sm:px-[10px] py-[6px] rounded-[8px]">
              <div className="flex items-center gap-[4px] mb-[2px]">
                <Image src="/landing/icon-avg-time.svg" alt="" className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]" width={15} height={15} />
                <span className="text-[11px] sm:text-[13px] text-[#3a3a3a] whitespace-nowrap" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>Avg. Time</span>
              </div>
              <p className="text-[11px] sm:text-[13px] font-extrabold text-[#1a1a1a]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>{agent.stats.time}</p>
            </div>
            <Image src="/landing/icon-divider.svg" alt="" className="w-[1px] h-[36px] sm:h-[42px]" width={1} height={42} />
            <div className="px-[6px] sm:px-[10px] py-[6px] rounded-[8px]">
              <div className="flex items-center gap-[4px] mb-[2px]">
                <Image src="/landing/icon-pricing.svg" alt="" className="w-[14px] h-[14px] sm:w-[16px] sm:h-[16px]" width={16} height={16} />
                <span className="text-[11px] sm:text-[13px] text-[#3a3a3a]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>Pricing</span>
              </div>
              <p className="text-[11px] sm:text-[13px] font-extrabold text-[#1a1a1a]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>{agent.stats.price}</p>
            </div>
            <Image src="/landing/icon-divider.svg" alt="" className="w-[1px] h-[36px] sm:h-[42px]" width={1} height={42} />
            <div className="px-[6px] sm:px-[10px] py-[6px] rounded-[8px]">
              <div className="flex items-center gap-[4px] mb-[2px]">
                <Image src="/landing/icon-rating.svg" alt="" className="w-[14px] h-[14px] sm:w-[16px] sm:h-[16px]" width={16} height={16} />
                <span className="text-[11px] sm:text-[13px] text-[#3a3a3a]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>Rating</span>
              </div>
              <p className="text-[11px] sm:text-[13px] font-extrabold text-[#1a1a1a]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>{agent.stats.rating}</p>
            </div>
          </div>

          {/* Example query */}
          <p className="text-[13px] sm:text-[14px] text-[#48484b]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
            Eg. &quot;{agent.query}&quot;
          </p>
        </div>
      </div>
    </Link>
  );
}

function AgentCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const doubled = [...agents, ...agents];

  const scrollByCard = (dir: 'left' | 'right') => {
    const track = trackRef.current;
    if (!track) return;
    // Temporarily pause animation, shift position via margin trick
    setPaused(true);
    const cards = track.querySelectorAll<HTMLDivElement>('[data-card]');
    if (dir === 'right' && cards.length > 0) {
      // Move first card to end
      const first = cards[0];
      track.appendChild(first);
    } else if (dir === 'left' && cards.length > 0) {
      // Move last card to start
      const last = cards[cards.length - 1];
      track.prepend(last);
    }
    setTimeout(() => setPaused(false), 50);
  };

  return (
    <div className="relative w-full">
      {/* Left arrow */}
      <button
        onClick={() => scrollByCard('left')}
        className="absolute left-2 sm:-left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white border border-[#e7e9eb] shadow-[0_2px_8px_rgba(0,0,0,0.1)] flex items-center justify-center hover:bg-[#f5f5f5] transition-colors"
        aria-label="Previous"
      >
        <ChevronLeft className="w-5 h-5 text-[#1a1a1a]" />
      </button>

      {/* Right arrow */}
      <button
        onClick={() => scrollByCard('right')}
        className="absolute right-2 sm:-right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white border border-[#e7e9eb] shadow-[0_2px_8px_rgba(0,0,0,0.1)] flex items-center justify-center hover:bg-[#f5f5f5] transition-colors"
        aria-label="Next"
      >
        <ChevronRight className="w-5 h-5 text-[#1a1a1a]" />
      </button>

      <div
        className="overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          ref={trackRef}
          className={`flex gap-3 sm:gap-4 ${paused ? '' : 'animate-scroll-agents'}`}
          style={{ width: 'max-content' }}
        >
          {doubled.map((agent, i) => (
            <div key={`${agent.title}-${i}`} data-card className="flex-shrink-0 w-[72vw] sm:w-[320px]">
              <AgentCardCompact agent={agent} />
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-agents {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll-agents {
          animation: scroll-agents 25s linear infinite;
        }
      `}</style>
    </div>
  );
}

export function OurAgentsSection() {
  return (
    <section className="bg-white py-16 sm:py-24 px-4 sm:px-6 md:px-8">
      <div className="max-w-[1248px] mx-auto">
          {/* Pill badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex justify-center mb-12 sm:mb-16"
          >
            <div className="inline-flex items-center gap-2 bg-[#f1f3f4] rounded-[43px] px-5 py-2.5">
              <Image
                data-site-badge-icon="true"
                src="/landing/agents-badge-icon.svg"
                alt=""
                className="w-[28px] h-[28px]"
                width={28}
                height={28}
              />
              <span
                className="text-[20px] font-medium text-[#3a3a3a]"
                style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}
              >
                Your Intelligence Team
              </span>
            </div>
          </motion.div>

          {/* Carousel */}
          <AgentCarousel />
      </div>
    </section>
  );
}
