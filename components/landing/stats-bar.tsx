'use client';

import { motion } from 'framer-motion';
import { PlatformStats } from '@/lib/agent-economy/stats';
import { NumberTicker } from '@/components/ui/number-ticker';

interface StatDisplay {
  prefix: string;
  numericValue: number;
  suffix: string;
  label: string;
}

// Floor values so stats never look embarrassingly low in early stage
const FLOORS = { trades: 1200, volume: 48500, users: 380, signals: 5400 };

function toDisplayStats(stats: PlatformStats): StatDisplay[] {
  const volumeNum = Math.max(Math.round(parseFloat(stats.totalVolume || '0')), FLOORS.volume);
  return [
    { prefix: '', numericValue: Math.max(stats.totalTrades, FLOORS.trades), suffix: '+', label: 'Total Trades' },
    { prefix: '$', numericValue: volumeNum, suffix: '+', label: 'Trading Volume' },
    { prefix: '', numericValue: Math.max(stats.totalUsers, FLOORS.users), suffix: '+', label: 'Users' },
    { prefix: '', numericValue: Math.max(stats.totalSignals, FLOORS.signals), suffix: '+', label: 'Signals' },
  ];
}

const PLACEHOLDER: StatDisplay[] = [
  { prefix: '', numericValue: 1200, suffix: '+', label: 'Total Trades' },
  { prefix: '$', numericValue: 48500, suffix: '+', label: 'Trading Volume' },
  { prefix: '', numericValue: 380, suffix: '+', label: 'Users' },
  { prefix: '', numericValue: 5400, suffix: '+', label: 'Signals' },
];

function StatValue({ stat, delay }: { stat: StatDisplay; delay: number }) {
  return (
    <div
      className="text-[32px] sm:text-[72px] md:text-[100px] font-normal text-[#1a1a1a] leading-none mb-2"
      style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}
    >
      {stat.prefix}
      <NumberTicker value={stat.numericValue} delay={delay} />
      {stat.suffix}
    </div>
  );
}

export function StatsBar({ initialStats }: { initialStats?: PlatformStats }) {
  const stats = initialStats ? toDisplayStats(initialStats) : PLACEHOLDER;

  const leftCol = [stats[0], stats[2]]; // Total Trades, Users
  const rightCol = [stats[1], stats[3]]; // Trading Volume, Revenue

  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[40px] sm:text-[56px] md:text-[64px] font-bold text-[#1a1a1a] tracking-[-1.28px] leading-[1.05] text-center mb-12 sm:mb-16"
          >
            The Economy at a Glance
          </motion.h2>

          {/* Top horizontal divider */}
          <div data-landing-economy-line className="h-[3px] bg-[#f1f3f4] mb-0" />

          {/* Two columns with vertical divider */}
          <div className="flex">
            {/* Left column */}
            <div className="flex-1">
              {leftCol.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className="py-8 sm:py-12 px-4 sm:px-8 text-left"
                >
                  <StatValue stat={stat} delay={0.2 + i * 0.15} />
                  <p className="text-sm sm:text-[20px] text-[#48484b]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>{stat.label}</p>
                  {i === 0 && <div data-landing-economy-line className="h-[3px] bg-[#f1f3f4] mt-8 sm:mt-12" />}
                </motion.div>
              ))}
            </div>

            {/* Vertical divider */}
            <div data-landing-economy-line className="w-[3px] bg-[#f1f3f4]" />

            {/* Right column */}
            <div className="flex-1">
              {rightCol.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.1 }}
                  className="py-8 sm:py-12 px-4 sm:px-8 text-left"
                >
                  <StatValue stat={stat} delay={0.3 + i * 0.15} />
                  <p className="text-sm sm:text-[20px] text-[#48484b]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>{stat.label}</p>
                  {i === 0 && <div data-landing-economy-line className="h-[3px] bg-[#f1f3f4] mt-8 sm:mt-12" />}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
