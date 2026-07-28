'use client';

import { motion } from 'framer-motion';

export function BlogHero() {
  return (
    <section className="border-b border-[#e5e7eb] bg-white py-8 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.9] mb-6 text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Blog
            </h1>

            <p className="text-sm sm:text-base text-[#6b7280] max-w-xl mx-auto leading-relaxed" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Exploring the future of AI agents, decentralized infrastructure, and the tools shaping autonomous systems.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
