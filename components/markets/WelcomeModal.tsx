'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  ChartCandlestick,
  Radio,
  Bot,
  Shield,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';

const font = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const STEPS = [
  {
    id: 'markets',
    icon: ChartCandlestick,
    avatar: '/avatars/prediction-markets.svg',
    label: 'Prediction Markets',
    subtitle: 'Trade on real-world outcomes',
    title: 'Trade Prediction Markets',
    description:
      'Browse and trade on real-world outcomes across politics, sports, crypto, and culture. See live odds, volume, and liquidity — all in one unified terminal. Markets are sourced from top platforms like Polymarket, Kalshi, and more.',
    highlights: ['Live odds & volume tracking', 'Multi-platform aggregation', 'One-click trading'],
    video: '/pmarket.mp4',
    poster: '/posters/pmarket.jpg',
  },
  {
    id: 'signals',
    icon: Radio,
    avatar: '/avatars/ai-signals.svg',
    label: 'AI Signals',
    subtitle: 'AI-powered alpha, real-time',
    title: 'Real-time AI Signals',
    description:
      'Get AI-powered trading signals that analyse whale movements, sentiment shifts, and on-chain data to surface high-conviction opportunities before the crowd.',
    highlights: ['Whale movement detection', 'Sentiment analysis', 'On-chain data insights'],
    video: '/signals.mp4',
    poster: '/posters/signals.jpg',
  },
  {
    id: 'agent',
    icon: Bot,
    avatar: '/avatars/oracle-agent.svg',
    label: 'ORACLE Agent',
    subtitle: 'Your autonomous AI trader',
    title: 'Meet ORACLE',
    description:
      'Oracle is your own autonomous AI trading agent. It monitors markets 24/7, executes strategies, and manages positions — so you can trade smarter, not harder. Set it up once and let it work for you.',
    highlights: ['24/7 autonomous monitoring', 'Auto-execute strategies', 'Smart position management'],
    video: '/oracle.mp4',
    poster: '/posters/oracle.jpg',
  },
  {
    id: 'defai',
    icon: Sparkles,
    avatar: '/avatars/delphi-defi.svg',
    label: 'Delphi / DeFAI',
    subtitle: 'AI-powered DeFi intelligence',
    title: 'Delphi — DeFAI Terminal',
    description:
      'Delphi is your AI-powered DeFi command center. Ask questions in natural language, get real-time insights on protocols, yields, and token flows. Powered by on-chain data and large language models working together.',
    highlights: ['Natural language queries', 'Real-time DeFi insights', 'Protocol & yield analysis'],
    video: '/delphi.mp4',
    poster: '/posters/delphi.jpg',
  },
  {
    id: 'security',
    icon: Shield,
    avatar: '/avatars/security-audit.svg',
    label: 'Security',
    subtitle: 'Smart contract auditing',
    title: 'Smart Contract Security',
    description:
      'Audit any smart contract with AI-powered vulnerability detection. Get detailed security reports, risk scores, and remediation suggestions — all within seconds. Protect your assets before you deploy or interact with a contract.',
    highlights: ['AI vulnerability detection', 'Instant security reports', 'Risk scoring & remediation'],
    video: '/securo.mp4',
    poster: '/posters/securo.jpg',
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    avatar: '/avatars/dashboard-portfolio.svg',
    label: 'Dashboard',
    subtitle: 'Your portfolio command center',
    title: 'Your Dashboard',
    description:
      'Track all your positions, P&L, and activity in one place. The dashboard gives you a real-time overview of your portfolio, open trades, signal performance, and agent activity — everything you need at a glance.',
    highlights: ['Real-time P&L tracking', 'Position & trade history', 'Signal & agent performance'],
    image: '/dashboard.png',
  },
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  const [step, setStep] = useState(0);
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);

  // Lock body scroll while the modal is open
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 ${marketsDarkMode ? 'dark markets-theme-scope' : ''}`}
        style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-white rounded-[20px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] w-full max-w-[1140px] max-h-[90vh] overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-[#f5f5f5] hover:bg-[#ebebeb] transition-colors text-[#6b7280] hover:text-[#3a3a3a]"
          >
            <X size={16} />
          </button>

          <div className="flex flex-col lg:flex-row max-h-[90vh]">
            {/* ── Left panel ── */}
            <div className="lg:w-[340px] flex-shrink-0 p-7 sm:p-8 flex flex-col" style={{ fontFamily: font }}>
              {/* Logo + Welcome */}
              <div className="mb-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="relative w-8 h-8 flex-shrink-0" data-welcome-modal-logo>
                    <Image src="/new.png" alt="Supermission" fill className="object-contain" priority />
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1a1a] tracking-tight leading-none">
                    Supermission
                  </span>
                </div>
                <h1 className="text-[26px] font-bold text-[#1a1a1a] tracking-[-0.56px] leading-[1.15]">
                  Welcome aboard!
                </h1>
                <p className="text-[14px] text-[#8a8a8a] mt-1.5 leading-[1.5] tracking-[-0.15px]">
                  Here&apos;s everything you can do on Supermission.
                </p>
              </div>

              {/* Step list — scrollable */}
              <div className="flex flex-col gap-1 flex-1 overflow-y-auto pr-1 -mr-1">
                {STEPS.map((s, i) => {
                  const active = i === step;
                  const completed = i < step;
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStep(i)}
                      className={`group relative flex items-center gap-3 px-3.5 py-3 rounded-[12px] text-left transition-all duration-200 ${
                        active
                          ? 'bg-[#f7f7f7] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                          : 'hover:bg-[#fafafa]'
                      }`}
                    >
                      {/* Active indicator bar */}
                      {active && (
                        <motion.div
                          layoutId="step-indicator"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#1a1a1a]"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}

                      {/* Avatar */}
                      <div
                        className={`w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-all duration-200 overflow-hidden ${
                          active
                            ? 'shadow-[0_2px_8px_rgba(0,0,0,0.15)] ring-2 ring-[#1a1a1a]'
                            : completed
                            ? 'opacity-70'
                            : 'opacity-50 group-hover:opacity-80'
                        }`}
                      >
                        <Image src={s.avatar} alt={s.label} width={32} height={32} />
                      </div>

                      {/* Text */}
                      <div className="flex flex-col gap-0 min-w-0">
                        <span
                          className={`text-[13px] font-semibold tracking-[-0.14px] transition-colors leading-[1.3] ${
                            active ? 'text-[#1a1a1a]' : completed ? 'text-[#6b7280]' : 'text-[#9ca3af] group-hover:text-[#6b7280]'
                          }`}
                        >
                          {s.label}
                        </span>
                        <span
                          className={`text-[11px] tracking-[-0.12px] transition-colors leading-[1.4] ${
                            active ? 'text-[#8a8a8a]' : 'text-[#c8c8c8] group-hover:text-[#b0b0b0]'
                          }`}
                        >
                          {s.subtitle}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Step counter + progress */}
              <div className="flex items-center gap-2 mt-4 mb-3">
                <span className="text-[11px] font-semibold text-[#b0b0b0] tracking-wider uppercase">
                  {step + 1} / {STEPS.length}
                </span>
                <div className="flex-1 h-[2px] bg-[#f0f0f0] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#1a1a1a] rounded-full"
                    initial={false}
                    animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-2.5 pt-4 border-t border-[#f0f0f0]">
                <button
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="h-[40px] px-4 rounded-[10px] border border-[#e5e7eb] text-[13px] font-semibold text-[#6b7280] hover:bg-[#f7f7f7] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                  style={{ fontFamily: font }}
                >
                  <ChevronLeft size={13} />
                  Back
                </button>
                <button
                  onClick={() => {
                    if (isLast) {
                      onClose();
                    } else {
                      setStep(step + 1);
                    }
                  }}
                  className="flex-1 h-[40px] rounded-[10px] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                  style={{ fontFamily: font }}
                >
                  {isLast ? 'Get Started' : 'Next'}
                  {!isLast && <ChevronRight size={13} />}
                </button>
              </div>
            </div>

            {/* ── Right panel — content + video ── */}
            <div className="flex-1 bg-[#fafbfc] border-t lg:border-t-0 lg:border-l border-[#f0f0f0] p-7 sm:p-10 flex flex-col justify-center min-h-[480px] overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col gap-5"
                >
                  <div style={{ fontFamily: font }}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-[10px] overflow-hidden flex-shrink-0">
                        <Image src={current.avatar} alt={current.label} width={36} height={36} />
                      </div>
                      <h2 className="text-[24px] font-bold text-[#1a1a1a] tracking-[-0.48px] leading-[1.2]">
                        {current.title}
                      </h2>
                    </div>
                    <p className="text-[14px] text-[#6b7280] leading-[1.6] tracking-[-0.14px] max-w-[520px]">
                      {current.description}
                    </p>
                  </div>

                  {/* Highlights */}
                  {current.highlights && (
                    <div className="flex flex-wrap gap-2">
                      {current.highlights.map((h) => (
                        <span
                          key={h}
                          data-welcome-modal-highlight
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f0f0] text-[12px] font-medium text-[#4b5563] tracking-[-0.12px]"
                        >
                          <span className="w-1 h-1 rounded-full bg-[#1a1a1a]" />
                          {h}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Video, image, or placeholder */}
                  {current.video ? (
                    <div className="rounded-[12px] overflow-hidden border border-[#e5e7eb] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] relative" style={{ aspectRatio: '16/9' }}>
                      <video
                        key={current.video}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        poster={'poster' in current ? (current.poster as string) : undefined}
                        className="absolute inset-0 w-full h-full object-cover block"
                        src={current.video}
                      />
                    </div>
                  ) : ('image' in current && current.image) ? (
                    <div className="rounded-[12px] overflow-hidden border border-[#e5e7eb] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                      <Image
                        src={current.image as string}
                        alt={current.title}
                        width={720}
                        height={450}
                        priority
                        className="w-full h-auto block"
                      />
                    </div>
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-[#d4d4d4] bg-[#f7f7f7] flex items-center justify-center min-h-[240px]">
                      <div className="text-center" style={{ fontFamily: font }}>
                        <Image src={current.avatar} alt={current.label} width={48} height={48} className="mx-auto mb-3 rounded-[8px]" />
                        <p className="text-[13px] text-[#b0b0b0] font-medium">Video coming soon</p>
                      </div>
                    </div>
                  )}

                  {/* Step dots */}
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    {STEPS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setStep(i)}
                        className={`rounded-full transition-all duration-300 ${
                          i === step
                            ? 'w-5 h-1.5 bg-[#3a3a3a]'
                            : 'w-1.5 h-1.5 bg-[#d4d4d4] hover:bg-[#b0b0b0]'
                        }`}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
