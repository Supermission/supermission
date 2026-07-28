'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { SiteThemeScope } from '@/components/layout/SiteThemeScope';
import { HideScrollbar } from '@/components/landing/hide-scrollbar';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface FAQItem {
  q: string;
  a: string;
}

interface FAQCategory {
  title: string;
  icon: string;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    title: 'How It Works',
    icon: '01',
    items: [
      {
        q: 'What is Supermission?',
        a: 'Supermission is an AI-powered prediction market terminal. You trade on real-world event outcomes, politics, crypto, sports, finance, with AI agents that research markets, generate signals, and execute trades for you.',
      },
      {
        q: 'How do prediction markets work?',
        a: 'You buy shares in an outcome (YES or NO). Each share pays $1 if correct, $0 if wrong. The current price reflects the market\'s probability estimate. Buy YES at 30\u00A2 and if you\'re right, you profit 70\u00A2 per share.',
      },
      {
        q: 'What blockchain does Supermission use?',
        a: 'Supermission is multi-chain: your embedded wallet lives on Base, prediction market trading happens on Polygon (for Polymarket integration), and the platform is also live on Robinhood Chain — an Arbitrum-based Ethereum Layer 2 built for tokenized real-world assets. Supermission handles all cross-chain bridging automatically, so you never need to switch networks manually.',
      },
      {
        q: 'Do I need crypto experience?',
        a: 'No. Supermission creates a smart wallet for you on sign-up. You can fund it with USDC and start trading immediately. The AI agents handle the complexity, you just pick your positions.',
      },
    ],
  },
  {
    title: 'Trading',
    icon: '02',
    items: [
      {
        q: 'How do I place a trade?',
        a: 'Browse markets, click any market card, then hit the YES or NO button. Choose your amount from the presets or enter a custom amount, review the potential returns, and confirm. The trade executes in seconds.',
      },
      {
        q: 'What are market orders vs limit orders?',
        a: 'Market orders execute immediately at the current best price. Limit orders let you set your price and wait, they execute only when the market reaches your target. Use limit orders for better prices on less urgent trades.',
      },
      {
        q: 'What is the minimum trade amount?',
        a: 'Market orders start at $1. Limit orders require a minimum of 5 shares. There is no maximum, trade sizes are limited only by available liquidity.',
      },
      {
        q: 'How do I sell a position?',
        a: 'Go to your Portfolio tab, find the position card, and click "Sell". The system checks available liquidity and executes a FAK (Fill-And-Kill) order on the Polymarket orderbook. You can also ask the Oracle agent to sell for you.',
      },
      {
        q: 'What happens when a market resolves?',
        a: 'If you hold the winning outcome, your shares become redeemable for $1 each. A "Redeem Winnings" button appears on your position card. Click it to convert winning shares back to USDC.',
      },
    ],
  },
  {
    title: 'Wallet & Funds',
    icon: '03',
    items: [
      {
        q: 'How do I fund my wallet?',
        a: 'Your Supermission wallet accepts USDC on Base. You can send USDC from any exchange or wallet to your wallet address (shown in the top-right). The system automatically bridges funds to Polygon when you trade.',
      },
      {
        q: 'What tokens are supported?',
        a: 'USDC is the primary trading currency. Your wallet can hold ETH (for gas, though transactions are sponsored), USDC on Base, and USDC.e on Polygon. The platform handles all conversions.',
      },
      {
        q: 'How do I withdraw?',
        a: 'Go to your Dashboard wallet panel. You can send USDC to any external address on Base. Funds on Polygon (from trading) are automatically bridged back to Base when needed.',
      },
      {
        q: 'Are gas fees covered?',
        a: 'Yes. Supermission sponsors gas fees for all trading operations through Privy\'s smart wallet infrastructure. You never need to hold ETH for gas.',
      },
    ],
  },
  {
    title: 'AI Signals & Agents',
    icon: '04',
    items: [
      {
        q: 'What are AI Signals?',
        a: 'Signals are AI-generated trading insights. Our system analyzes market sentiment, momentum, and risk across all active markets. Each signal includes a confidence score, direction (bullish/bearish), and reasoning.',
      },
      {
        q: 'What is the Oracle agent?',
        a: 'Oracle is your AI trading assistant. It can research markets, analyze your portfolio, place trades, sell positions, and answer questions about any market. It has access to real-time data and can execute on your behalf.',
      },
      {
        q: 'How accurate are the signals?',
        a: 'Signal accuracy varies by market type and timeframe. Confidence scores reflect the AI\'s certainty, higher confidence signals historically perform better. Signals are research tools, not guarantees. Always do your own analysis.',
      },
      {
        q: 'What is Whale Intelligence?',
        a: 'Whale Intelligence shows you what the biggest holders in a market are doing: their positions, which side they\'re on (YES/NO), and how concentrated the top positions are. It helps you understand smart money sentiment.',
      },
      {
        q: 'What is the Hyperion agent?',
        a: 'Hyperion is your AI-powered perpetual trading agent. It lets you go long or short on crypto assets with leverage, monitors funding rates and open interest, and surfaces high-conviction perps setups. Access it at /perps.',
      },
    ],
  },
  {
    title: 'Security',
    icon: '05',
    items: [
      {
        q: 'Is my money safe?',
        a: 'Your funds are held in a Privy-managed embedded wallet, a non-custodial smart contract wallet. Supermission never has direct access to your private keys. All trades are signed by your wallet before execution.',
      },
      {
        q: 'What is the Contract Audit feature?',
        a: 'The Securo agent audits smart contracts before you interact with them. It flags risks, checks for known vulnerabilities, and verifies protocol safety. Available at /contract-audit.',
      },
      {
        q: 'How does authentication work?',
        a: 'Supermission uses Privy for authentication. You can sign in with email, Google, or an existing wallet. Your embedded wallet is created automatically and secured by Privy\'s MPC (Multi-Party Computation) infrastructure.',
      },
    ],
  },
  {
    title: 'Fees & Costs',
    icon: '06',
    items: [
      {
        q: 'What are the trading fees?',
        a: 'Supermission charges no platform fee on top of Polymarket\'s native fees.',
      },
      {
        q: 'Are there withdrawal fees?',
        a: 'No withdrawal fees from Supermission. Standard blockchain gas fees apply for on-chain transfers, but trading gas is sponsored by the platform.',
      },
      {
        q: 'What about bridging costs?',
        a: 'Cross-chain bridging (Base to Polygon) incurs a small fee from the bridge protocol. This is typically under $0.10 and is shown before you confirm any trade that requires bridging.',
      },
    ],
  },
];

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[#e5e7eb] last:border-b-0 transition-colors hover:bg-[#fafbfc] dark:hover:bg-white/[0.03]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span
          className={`text-[15px] sm:text-[16px] font-semibold pr-4 transition-colors ${isOpen ? 'text-[#1a1a1a]' : 'text-[#3a3a3a] group-hover:text-[#1a1a1a]'}`}
          style={{ fontFamily: FONT }}
        >
          {item.q}
        </span>
        <span className={`flex-shrink-0 w-6 h-6 rounded-full border border-[#e5e7eb] flex items-center justify-center transition-all ${isOpen ? 'bg-[#1a1a1a] border-[#1a1a1a]' : 'group-hover:border-[#9ca3af]'}`}>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-45 text-white' : 'text-[#9ca3af]'}`}
          >
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="text-[14px] sm:text-[15px] text-[#48484b] leading-relaxed pb-5">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <SiteThemeScope>
    <div className="min-h-screen bg-white" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
      <HideScrollbar />
      <Header rightExtra={<SiteThemeToggle />} hideSettings />

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 py-16 sm:py-24 pt-[96px] sm:pt-[112px]">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1
            className="text-[36px] sm:text-[48px] font-bold text-[#1a1a1a] tracking-tight leading-tight mb-4"
            style={{ fontFamily: FONT }}
          >
            FAQ
          </h1>
          <p className="text-[15px] sm:text-[16px] text-[#6b7280] leading-relaxed max-w-xl">
            Everything you need to know about trading on Supermission, from getting started to advanced strategies.
          </p>
        </motion.div>
      </div>

      {/* FAQ Categories */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 pb-24 space-y-12">
        {FAQ_DATA.map((category, catIdx) => (
          <motion.div
            key={category.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Category header */}
            <div className="flex items-center gap-3 mb-2">
              <span
                className="text-[11px] font-bold text-[#9ca3af] tabular-nums"
                style={{ fontFamily: FONT }}
              >
                {category.icon}
              </span>
              <h2
                className="text-[20px] sm:text-[24px] font-bold text-[#1a1a1a]"
                style={{ fontFamily: FONT }}
              >
                {category.title}
              </h2>
            </div>

            {/* Questions */}
            <div className="border-t border-[#e5e7eb]">
              {category.items.map((item, itemIdx) => {
                const key = `${catIdx}-${itemIdx}`;
                return (
                  <FAQAccordion
                    key={key}
                    item={item}
                    isOpen={openItems.has(key)}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Still have questions? */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center pt-8 border-t border-[#e5e7eb]"
        >
          <p className="text-[15px] text-[#6b7280] mb-4">Still have questions?</p>
          <Link
            href="/markets?tab=agent"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[14px] font-medium rounded-[10px] hover:opacity-90 transition-opacity"
            style={{ fontFamily: FONT }}
          >
            Ask the Oracle Agent
          </Link>
        </motion.div>
      </div>

      <Footer />
    </div>
    </SiteThemeScope>
  );
}
