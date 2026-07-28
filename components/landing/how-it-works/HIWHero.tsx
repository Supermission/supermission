'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const ease = [0.16, 1, 0.3, 1] as const;

export function HIWHero() {
  return (
    <section className="bg-white py-16 sm:py-24 px-4 sm:px-6 md:px-8">
      <div className="max-w-6xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ease }}
          className="inline-flex items-center gap-2 bg-[#f5f3f0] rounded-full px-4 py-1.5 mb-6"
        >
          <Image
            src="/landing/flow-badge-icon.svg"
            alt=""
            className="w-4 h-4"
            width={16}
            height={16}
            data-site-badge-icon="true"
          />
          <span className="text-sm font-medium text-[#3a3a3a] tracking-[-0.28px]">How It Works</span>
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, ease }}
          className="text-[40px] sm:text-[56px] md:text-[72px] font-bold text-[#1a1a1a] tracking-[-1.44px] leading-[1.05] mb-5"
        >
          The DeFi Terminal,
          <br />
          Explained
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-[#48484b] max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Supermission connects your intent to on-chain execution through AI-powered DeFi tools: gasless trades, optimized yields, and real-time market intelligence.
        </motion.p>

        {/* Animated flow line */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-3 max-w-xl mx-auto"
        >
          <span className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Intent</span>
          <div className="flex-1 relative h-[2px]">
            <div
              className="absolute inset-0 border-t-2 border-dashed border-[#d1d5db]"
              data-site-flow-dash="true"
            />
            <motion.div
              className="absolute top-[-3px] w-2 h-2 rounded-full bg-[#1a1a1a]"
              data-site-flow-ball="true"
              animate={{ left: ['0%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <span className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Execution</span>
        </motion.div>
      </div>
    </section>
  );
}
