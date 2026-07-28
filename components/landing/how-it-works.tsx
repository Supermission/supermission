'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const agents = [
  {
    id: "01",
    title: "Token Research",
    description: "Security audit, holder analysis, liquidity check, risk score.",
    stats: { time: "1s", price: "$0.1", rating: "4.7/5" },
    try: 'Is $PEPE safe?'
  },
  {
    id: "02",
    title: "Prediction Markets",
    description: "Find markets, check odds, place trades on Polymarket.",
    stats: { time: "2s", price: "$0.1", rating: "4.9/5" },
    try: 'Buy YES on Trump'
  },
  {
    id: "03",
    title: "Contract Audit",
    description: "Analyze Solidity contracts for security vulnerabilities, gas optimization, and best practices.",
    stats: { time: "3s", price: "$0.1", rating: "4.8/5" },
    try: 'Audit VulnerableBank.sol'
  },
  {
    id: "04",
    title: "Image Generation",
    description: "Generate images from text prompts using AI with prompt enhancement.",
    stats: { time: "4s", price: "$0.08", rating: "4.9/5" },
    try: 'Cyberpunk city'
  },
  {
    id: "05",
    title: "DeFi Yields",
    description: "Scan 1000+ pools across all chains for the best APY with risk analysis.",
    stats: { time: "2s", price: "$0.10", rating: "4.8/5" },
    try: 'Best yields on Base'
  },
  {
    id: "06",
    title: "Wallet Intelligence",
    description: "Comprehensive multi-chain wallet analysis with NFT tracking, DeFi positions, and security assessment.",
    stats: { time: "4s", price: "$0.15", rating: "4.9/5" },
    try: 'Analyze vitalik.eth'
  },
];

// Combine agents multiple times to ensure seamless infinite scrolling even on large screens
const CAROUSEL_ITEMS = [...agents, ...agents, ...agents, ...agents, ...agents, ...agents, ...agents, ...agents];

export function HowItWorks() {
  return (
    <section className="bg-white border-t-2 border-black py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-7xl mx-auto">

          {/* The Flow - Top */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
              <span className="font-mono text-xs tracking-widest">THE FLOW</span>
            </div>

            {/* Mobile: Triangle layout */}
            <div className="flex flex-col items-center gap-4 sm:hidden">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="font-sans text-2xl font-black tracking-tight"
              >
                Ask anything
              </motion.p>
              <div className="flex gap-8 justify-center">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="font-sans text-2xl font-black tracking-tight text-black/40"
                >
                  Agent works
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 }}
                  className="font-sans text-2xl font-black tracking-tight"
                >
                  Execute onchain
                </motion.p>
              </div>
            </div>

            {/* Desktop: Horizontal layout with arrows */}
            <div className="hidden sm:flex sm:items-center gap-6">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="font-sans text-3xl md:text-4xl font-black tracking-tight"
              >
                Ask anything
              </motion.p>
              <span className="text-2xl">→</span>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="font-sans text-3xl md:text-4xl font-black tracking-tight text-black/40"
              >
                Agent works
              </motion.p>
              <span className="text-2xl">→</span>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="font-sans text-3xl md:text-4xl font-black tracking-tight"
              >
                Execute onchain
              </motion.p>
            </div>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-6"
          >
            <h2 className="font-sans text-2xl sm:text-3xl font-black uppercase tracking-tight">
              OUR AGENTS
            </h2>
          </motion.div>

          {/* Agents - Carousel */}
          <div className="w-full overflow-hidden mask-fade-sides relative">
            {/* Subtle fade masks */}
            <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-r from-white/70 to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-l from-white/70 to-transparent z-10 pointer-events-none" />

            <div className="flex w-max animate-scroll hover:[animation-play-state:paused] py-4">
              {CAROUSEL_ITEMS.map((agent, index) => (
                <Link
                  key={`${agent.id}-${index}`}
                  href={`/defai?prompt=${encodeURIComponent(agent.try)}`}
                  className="block w-[240px] sm:w-[320px] mx-2 sm:mx-3 flex-shrink-0 border-2 border-black p-4 sm:p-5 bg-white hover:bg-neutral-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono text-xs font-bold bg-black text-white px-2 py-1 transition-transform group-hover:scale-110">{agent.id}</span>
                    <h3 className="font-sans text-lg font-black uppercase text-black group-hover:underline underline-offset-4 decoration-2">{agent.title}</h3>
                  </div>
                  <p className="font-mono text-sm text-black mb-4 h-[40px] leading-tight opacity-80">
                    {agent.description}
                  </p>
                  <div className="flex gap-4 sm:gap-6 mb-4 border-t border-black pt-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold opacity-60">AVG TIME</p>
                      <p className="font-mono text-sm font-black">{agent.stats.time}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] font-bold opacity-60">PRICING</p>
                      <p className="font-mono text-sm font-black">{agent.stats.price}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] font-bold opacity-60">RATING</p>
                      <p className="font-mono text-sm font-black">{agent.stats.rating}</p>
                    </div>
                  </div>
                  <p className="font-mono text-xs border-t border-black pt-3 text-black">
                    <span className="font-bold">TRY:</span> &quot;{agent.try}&quot;
                  </p>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
