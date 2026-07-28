'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const ease = [0.16, 1, 0.3, 1] as const;

export function CTASection() {
  return (
    <section className="bg-white py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-[1240px] mx-auto bg-gradient-to-b from-[#1a1a1a] to-black rounded-[40px] py-16 sm:py-20 px-6 sm:px-12 text-center overflow-hidden relative"
          style={{ minHeight: 341 }}
        >
          {/* Background gradient ellipse decoration */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 100% 120% at 50% 50%, rgba(60,60,60,0.5) 0%, transparent 70%)',
            }}
          />

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, ease }}
            className="text-[32px] sm:text-[40px] md:text-[48px] font-bold text-white tracking-[-0.96px] leading-[1.2] mb-4 relative z-10"
          >
            Start Trading with AI
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-base text-[#a1a1aa] mb-10 max-w-lg mx-auto relative z-10 tracking-[-0.32px]"
          >
            <span className="font-medium text-[#f1f3f4]">Trade smarter, research faster, earn on-chain.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, ease }}
            className="flex flex-col sm:flex-row items-center justify-center gap-2.5 relative z-10"
          >
            <Link
              href="/markets"
              data-landing-final-primary-cta
              data-site-preserve-dark-text=""
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-b from-white to-[#d2d6df] text-[#3a3a3a] text-base rounded-[8px] hover:opacity-90 transition-opacity tracking-[-0.32px]"
            >
              Launch Terminal
            </Link>
            <Link
              href="/markets?tab=signals"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 border border-white text-[#f2f2f2] text-base rounded-[8px] hover:bg-white/10 transition-colors tracking-[-0.32px]"
            >
              Signals
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
