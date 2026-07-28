'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

const ease = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/*  Arc definitions – sizes & top offsets match the Figma frame        */
/*  Arc center is at y = 567 in a 1192 x 700 container                */
/* ------------------------------------------------------------------ */
const ARC_CENTER_Y = 567;
const arcs = [
  { n: 1, size: 246 },
  { n: 2, size: 364 },
  { n: 3, size: 480 },
  { n: 4, size: 624 },
  { n: 5, size: 746 },
  { n: 6, size: 886 },
  { n: 7, size: 1068 },
];

/* ------------------------------------------------------------------ */
/*  Bubble definitions – positions & inner crops from Figma exactly    */
/* ------------------------------------------------------------------ */
interface BubbleInner {
  width: number;
  height: number;
  left: number;
  top: number;
}

interface Bubble {
  id: string;
  src: string | null;
  alt: string;
  size: number;
  inner?: BubbleInner;
  left: string;
  top: string;
  delay: number;
  hideMobile?: boolean;
}

const bubbles: Bubble[] = [
  {
    id: 'center',
    src: '/landing/hero-bubble-center.png',
    alt: 'Center agent',
    size: 144,
    inner: { width: 81, height: 81, left: 31.5, top: 31.5 },
    left: 'calc(50% - 6px)',
    top: '495px',
    delay: 0,
  },
  {
    id: 'top-center',
    src: '/landing/hero-bubble-top-center.png',
    alt: 'Top center agent',
    size: 78,
    inner: { width: 113.574, height: 62, left: -18, top: 3 },
    left: 'calc(50% - 6px)',
    top: '346px',
    delay: 0.6,
  },
  {
    id: 'top',
    src: '/landing/hero-bubble-top.png',
    alt: 'Top agent',
    size: 78,
    inner: { width: 86, height: 86, left: 0, top: -8 },
    left: 'calc(50% - 6px)',
    top: '216px',
    delay: 0.8,
  },
  {
    id: 'left-mid',
    src: '/landing/hero-bubble-left-mid.png',
    alt: 'Bitcoin',
    size: 78,
    inner: { width: 62, height: 61, left: 4, top: 12 },
    left: 'calc(50% - 227px)',
    top: '417px',
    delay: 0,
  },
  {
    id: 'left-far',
    src: '/landing/hero-bubble-left-far.png',
    alt: 'Shield',
    size: 78,
    inner: { width: 48, height: 48, left: 15, top: 15 },
    left: 'calc(50% - 351px)',
    top: '385px',
    delay: 1.2,
    hideMobile: true,
  },
  {
    id: 'right-mid',
    src: '/landing/hero-bubble-right-mid.png',
    alt: 'Blockchain',
    size: 78,
    inner: { width: 64, height: 64, left: 7, top: 7 },
    left: 'calc(50% + 207px)',
    top: '417px',
    delay: 0.5,
  },
  {
    id: 'right-far',
    src: '/landing/hero-bubble-right-far.png',
    alt: 'Magnifier',
    size: 78,
    inner: { width: 54, height: 54, left: 12, top: 12 },
    left: 'calc(50% + 367px)',
    top: '463px',
    delay: 1.0,
    hideMobile: true,
  },
  {
    id: 'right-top',
    src: '/landing/hero-bubble-right-top.png',
    alt: 'Wallet',
    size: 78,
    inner: { width: 70.4, height: 55, left: 4, top: 11 },
    left: 'calc(50% + 176px)',
    top: '268px',
    delay: 1.5,
  },
  {
    id: 'left-top',
    src: '/landing/hero-bubble-left-top.png',
    alt: 'Crypto',
    size: 78,
    inner: { width: 83.606, height: 60.5, left: -6, top: 9 },
    left: 'calc(50% - 188px)',
    top: '268px',
    delay: 1.0,
  },
  {
    id: 'empty-left',
    src: null,
    alt: '',
    size: 78,
    left: 'calc(50% - 305px)',
    top: '600px',
    delay: 0.3,
    hideMobile: true,
  },
  {
    id: 'empty-right',
    src: null,
    alt: '',
    size: 78,
    left: 'calc(50% + 234px)',
    top: '583px',
    delay: 0.7,
  },
];

/* ------------------------------------------------------------------ */
/*  Single floating bubble                                            */
/* ------------------------------------------------------------------ */
function AgentBubble({ bubble }: { bubble: Bubble }) {
  const isBig = bubble.size === 144;
  const shadow = isBig
    ? '0px -2.25px 18px rgba(0,0,0,0.06)'
    : '0px 0px 16px rgba(0,0,0,0.08)';

  return (
    <motion.div
      className={`absolute -translate-x-1/2 rounded-full bg-white overflow-clip ${
        bubble.hideMobile ? 'hidden md:flex' : 'flex'
      }`}
      style={{
        width: bubble.size,
        height: bubble.size,
        left: bubble.left,
        top: bubble.top,
        boxShadow: shadow,
      }}
      animate={{ y: [0, -8, 0] }}
      transition={{
        duration: 3.5,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: bubble.delay,
      }}
    >
      {bubble.src && bubble.inner && (
        <Image
          src={bubble.src}
          alt={bubble.alt}
          className="absolute object-cover pointer-events-none max-w-none"
          style={{
            width: bubble.inner.width,
            height: bubble.inner.height,
            left: bubble.inner.left,
            top: bubble.inner.top,
          }}
          width={Math.round(bubble.inner.width)}
          height={Math.round(bubble.inner.height)}
        />
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Arcs + Bubbles container                                          */
/* ------------------------------------------------------------------ */
function ConcentricArcs() {
  return (
    <div
      className="relative w-full overflow-hidden mx-auto"
      style={{ height: 700, maxWidth: 1192 }}
    >
      {/* Arcs -- concentric circles, centered at y=567 */}
      {arcs.map(({ n, size }) => (
        <svg
          key={n}
          className={`absolute left-1/2 -translate-x-1/2 pointer-events-none ${
            n >= 6 ? 'hidden md:block' : ''
          }`}
          style={{
            width: size,
            height: size,
            top: ARC_CENTER_Y - size / 2,
          }}
          viewBox={`0 0 ${size} ${size}`}
          fill="none"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 2}
            stroke="#c8c8c8"
            strokeWidth="2"
            opacity="0.5"
          />
        </svg>
      ))}

      {/* Bubbles */}
      {bubbles.map((b) => (
        <AgentBubble key={b.id} bubble={b} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile-scaled wrapper for the arc container                       */
/* ------------------------------------------------------------------ */
function ResponsiveArcs() {
  return (
    <>
      {/* Desktop: render at native size */}
      <div className="hidden md:block">
        <ConcentricArcs />
      </div>

      {/* Mobile / tablet: scale down to fit */}
      <div className="block md:hidden overflow-hidden" style={{ height: 400 }}>
        <div
          className="origin-top"
          style={{
            transform: 'scale(0.58)',
            width: 1192,
            marginLeft: 'calc(50% - 596px)',
          }}
        >
          <ConcentricArcs />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Section                                                       */
/* ------------------------------------------------------------------ */
export function HeroSection() {
  const { ready, authenticated } = usePrivy();
  const isSignedIn = ready && authenticated;

  return (
    <section data-hero className="relative bg-white pt-12 sm:pt-20 pb-0 overflow-hidden">
      {/* AI-hand-reaches-human-hand — bottom of the hero. The video's background
          is baked to #141414 (the dark hero colour) so it's seamless. Shown in
          dark mode only; hidden in light. 71MB gif → ~650KB keyed mp4. */}
      {/* Hands reaching, anchored to the bottom of the hero. The hero itself stays
          theme-aware (white in light, #141414 in dark), so we swap the clip: the
          light version has a white background that blends into the light hero, the
          dark version a #141414 background for the dark hero. Only one shows. */}
      <div aria-hidden data-hero-hands-light className="pointer-events-none absolute inset-x-0 bottom-0 z-0">
        <video src="/landing/hero-hands-light.mp4" autoPlay loop muted playsInline preload="auto" className="w-full h-auto block" />
      </div>
      <div aria-hidden data-hero-hands-dark className="pointer-events-none absolute inset-x-0 bottom-0 z-0">
        <video src="/landing/hero-hands-dark.mp4" autoPlay loop muted playsInline preload="auto" className="w-full h-auto block" />
      </div>
      <div className="relative z-10 container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* Public beta announcement badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0, ease }}
            className="flex justify-center mb-6"
          >
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-[#d1d5db] bg-[#f5f5f5] text-[14px] font-semibold text-[#1a1a1a] tracking-[-0.28px] hover:border-[#3a3a3a] hover:bg-[#ebebeb] hover:shadow-md hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
              style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="hidden sm:inline">Now Open to Public Beta</span>
              <span className="sm:hidden">Public Beta</span>

              <svg className="w-4 h-4 text-[#3a3a3a] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease }}
            className="text-[36px] sm:text-[52px] md:text-[64px] font-bold text-[#3a3a3a] tracking-[-1.28px] leading-[1.2] mb-6"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            The Agentic Trading Terminal
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease }}
            className="text-[16px] sm:text-[20px] text-[#48484b] tracking-[-0.4px] max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            Stop trading alone. Supermission deploys AI agents that research tokens, trade prediction markets, find yields, and audit contracts
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-12 sm:mb-16"
          >
            <Link
              href="/markets"
              data-landing-primary-cta
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white font-medium text-base rounded-[8px] hover:opacity-90 transition-all duration-200"
            >
              Launch Terminal
            </Link>
            <a
              href="#how-it-works"
              data-landing-secondary-cta
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 border border-[#1a1a1a] text-[#1a1a1a] font-medium text-base rounded-[8px] hover:bg-[#f5f5f5] transition-all duration-200"
            >
              How It Works
            </a>
          </motion.div>
        </div>
      </div>

    </section>
  );
}
