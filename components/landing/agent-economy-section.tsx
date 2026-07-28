'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

const ease = [0.16, 1, 0.3, 1] as const;

const pillars = [
  {
    title: 'Research',
    description: 'AI agents scan thousands of tokens, surface alpha, and deliver real-time insights, so you never miss a move.',
    stats: [
      { icon: '/landing/icon-response-time.svg', iconSize: 16, label: 'Scan speed', value: '<2s' },
      { icon: '/landing/icon-agents.svg', iconSize: 16, label: 'Tokens tracked', value: '10k+' },
      { icon: '/landing/icon-ranked.svg', iconSize: 16, label: 'Signals', value: 'LIVE' },
    ],
    href: '/markets',
    decor: '/landing/decor-hire-chair.png',
    decorSize: 240,
    decorPos: 'bottom-[-34px] right-[-71px]',
  },
  {
    title: 'Trade',
    description: 'Deploy agents that execute trades, predict market outcomes, and find the best yields across DeFi, around the clock.',
    stats: [
      { icon: '/landing/icon-response-time.svg', iconSize: 16, label: 'Execution', value: '<1s' },
      { icon: '/landing/icon-budgets.svg', iconSize: 16, label: 'Markets', value: '50+' },
      { icon: '/landing/icon-escrow.svg', iconSize: 16, label: 'Settled', value: 'USDC' },
    ],
    href: '/defai',
    decor: '/landing/decor-build-blocks.png',
    decorSize: 234,
    decorPos: 'bottom-[-41px] right-[-76px]',
  },
  {
    title: 'Secure',
    description: 'Agents audit smart contracts, flag risks, and verify protocols before you commit capital. Trust, but verify automatically.',
    stats: [
      { icon: '/landing/icon-settled.svg', iconSize: 18, label: 'Audits', value: 'AUTO' },
      { icon: '/landing/icon-judging.svg', iconSize: 18, label: 'Risk score', value: 'LIVE' },
      { icon: '/landing/icon-money.svg', iconSize: 18, label: 'From', value: '$0.01' },
    ],
    href: '/contract-audit',
    decor: '/landing/decor-win-trophy.png',
    decorSize: 180,
    decorPos: 'bottom-[-13px] right-[-45px]',
  },
];

function PillarCard({ pillar, index }: { pillar: typeof pillars[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: 0.1 + index * 0.1, duration: 0.5, ease }}
      className="w-full lg:flex-1 lg:max-w-[380px]"
    >
      <Link href={pillar.href} className="block h-full group">
        <div
          data-landing-pillar-card
          className="relative bg-[#fafbfc] group-hover:bg-[#1a1a1a] rounded-[32px] shadow-[0px_5px_10px_0px_rgba(0,0,0,0.2)] p-8 overflow-hidden group-hover:shadow-[0px_5px_10px_0px_rgba(0,0,0,0.25)] transition-all duration-300 flex flex-col justify-between w-full min-h-[421px] lg:h-[421px]"
        >
          <div className="flex flex-col gap-5">
            {/* Title */}
            <div className="flex flex-col gap-1">
              <h3 className="text-[32px] font-bold text-[#1a1a1a] group-hover:text-white leading-[32px] tracking-[0.08px] transition-colors duration-300">
                {pillar.title}
              </h3>
              <p className="text-base text-[#48484b] group-hover:text-[#a0a0a0] leading-relaxed tracking-[0.04px] transition-colors duration-300">
                {pillar.description}
              </p>
            </div>

            {/* Stats pills - vertical column */}
            <div className="flex flex-col gap-3">
              {pillar.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="inline-flex items-center gap-3 bg-[#f0f0f0] group-hover:bg-[#2a2a2a] rounded-[40px] px-4 py-2 w-fit transition-colors duration-300"
                >
                  <div className="flex items-center gap-1">
                    <Image data-landing-pillar-stat-icon src={stat.icon} alt="" width={stat.iconSize} height={stat.iconSize} className="group-hover:invert transition-all duration-300" />
                    <span className="text-sm text-[#3a3a3a] group-hover:text-[#a0a0a0] leading-6 transition-colors duration-300">{stat.label}</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#1a1a1a] group-hover:text-white leading-6 transition-colors duration-300">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* View link */}

          {/* Decorative 3D image */}
          <Image
            src={pillar.decor}
            alt=""
            className={`absolute ${pillar.decorPos} pointer-events-none group-hover:scale-x-[-1] transition-transform duration-300`}
            width={pillar.decorSize}
            height={pillar.decorSize}
          />
        </div>
      </Link>
    </motion.div>
  );
}

export function AgentEconomySection() {
  return (
    <section className="bg-white py-16 sm:py-24 px-4 sm:px-6 md:px-8">
      <div className="max-w-[1200px] mx-auto flex flex-col items-center">

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-center mb-4 w-full"
          >
            <h2 className="text-[40px] sm:text-[56px] md:text-[64px] font-bold text-[#1a1a1a] tracking-[-1.28px] leading-[1.05]">
              Your Onchain AI Crew
            </h2>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-base sm:text-lg text-[#48484b] text-center max-w-2xl mx-auto mb-12 sm:mb-16"
          >
            Your AI-powered trading crew: researching tokens, trading prediction markets, finding yields, auditing contracts, and trading perps
          </motion.p>

          {/* Cards */}
          <div className="flex flex-col lg:flex-row gap-5 sm:gap-6 justify-center items-center lg:items-stretch">
            {pillars.map((pillar, index) => (
              <PillarCard key={pillar.title} pillar={pillar} index={index} />
            ))}
          </div>
      </div>
    </section>
  );
}
