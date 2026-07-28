'use client';

import { motion } from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

const steps = [
  { num: '01', label: 'Describe', detail: 'Plain-language request → Intent Analyzer scores & matches agents' },
  { num: '02', label: 'Execute', detail: 'Specialized agents scan pools, analyze wallets, audit tokens' },
  { num: '03', label: 'Settle', detail: 'Results on-chain: swaps, liquidity, research, all in USDC on Base, Polygon & Robinhood Chain' },
];

export function DeepDiveSection() {
  return (
    <section className="bg-[#fafbfc] py-16 sm:py-24 px-4 sm:px-6 md:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ease }}
          className="text-center mb-14 sm:mb-20"
        >
          <h2 className="text-[32px] sm:text-[44px] md:text-[56px] font-bold text-[#1a1a1a] tracking-[-1.12px] leading-[1.08] mb-3">
            Under the Hood
          </h2>
          <p className="text-sm sm:text-base text-[#48484b] max-w-xl mx-auto">
            From your intent to on-chain settlement: three steps, autonomous agents, gasless payments.
          </p>
        </motion.div>

        {/* 3-Step Flow */}
        <div className="flex flex-col md:flex-row items-stretch gap-0">
          {steps.map((step, i) => (
            <div key={step.num} className="flex flex-col md:flex-row items-stretch flex-1">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease }}
                className="bg-white rounded-[16px] border border-[#e5e7eb] p-5 sm:p-6 flex-1"
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span
                    data-site-step-num=""
                    className="text-[28px] font-bold text-[#e5e7eb] leading-none"
                    style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}
                  >
                    {step.num}
                  </span>
                  <h3 className="text-lg font-bold text-[#1a1a1a] tracking-[-0.36px]">{step.label}</h3>
                </div>
                <p className="text-sm text-[#48484b] leading-relaxed">{step.detail}</p>
              </motion.div>

              {i < steps.length - 1 && (
                <div className="flex items-center justify-center py-2 md:py-0 md:px-3">
                  <svg data-site-step-arrow="" className="w-5 h-5 text-[#d1d5db] md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-4-4m4 4l4-4" />
                  </svg>
                  <svg data-site-step-arrow="" className="w-5 h-5 text-[#d1d5db] hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-4-4m4 4l-4 4" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
