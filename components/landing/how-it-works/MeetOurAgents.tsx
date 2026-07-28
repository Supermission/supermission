'use client';

import { motion } from 'framer-motion';
import { useRef, useState, useEffect, useCallback } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;

const agents = [
  {
    badge: 'DeFi Execution',
    name: 'DELPHI',
    headline: 'The sharpest DeFi mind on Base, Polygon & Robinhood Chain.',
    body: "You type. DELPHI executes. Swaps, lending, liquidity positions, yield strategies — resolved, optimized, and settled on-chain in seconds. No tabs to juggle. No gas headaches. No protocol expertise required. DELPHI handles complexity that most DeFi power users still do manually, and it does it faster and with more precision than they ever could. There is no more capable on-chain execution agent available to retail today. Full stop.",
    tag: 'Intent in. Transaction out.',
    ytId: 'p8DJMaqJDAA',
  },
  {
    badge: 'Smart Contract Security',
    name: 'SECURO',
    headline: 'The audit no one else can do this fast.',
    body: "SECURO performs what used to take a security firm days — reentrancy checks, access control analysis, gas optimization review, OpenZeppelin compliance — in the time it takes to send a message. Paste a contract address. Get a comprehensive security breakdown that most developers couldn't produce without hours of manual review. SECURO doesn't miss things. It was built specifically so you don't have to trust that a contract is safe — you can know.",
    tag: 'Audit-grade. Zero wait.',
    ytId: 'CR_VrqNQTlw', // ← replace with your video ID
  },
  {
    badge: 'Prediction Markets',
    name: 'ORACLE',
    headline: 'The edge most traders don\'t have.',
    body: "ORACLE lives at the intersection of real-world events and on-chain markets. It surfaces prediction market opportunities, analyzes position risk, and gives you the market intelligence needed to trade with conviction — not instinct. The kind of research overlay that institutional desks pay for, available in a single message. Whether you're hunting alpha or managing exposure, ORACLE sees the markets more clearly than any tool you've used before.",
    tag: 'Markets. Intelligence. Edge.',
    ytId: 'Oveuye731sc',
  },
  {
    badge: 'Perpetual Trading',
    name: 'HYPERION',
    headline: 'Perps trading with AI precision.',
    body: "HYPERION brings institutional-grade perpetual trading to your fingertips. Long, short, manage leverage — executed with the speed and precision of an on-chain trading desk. HYPERION monitors funding rates, tracks open interest, and surfaces the highest-conviction perps setups across markets. Whether you're hedging a DeFi position or trading pure momentum, HYPERION gives you the edge that discretionary traders spend years building. AI-native. Always on. Zero excuses.",
    tag: 'Long. Short. Dominate.',
    ytId: '4FzlESuz4aY',
  },
];

/**
 * AgentVideo — premium "lite" YouTube embed.
 *
 * The naked YouTube iframe leaks the YouTube brand, control bar, and the
 * "Watch on YouTube" hover overlay, which looks out of place on a landing
 * page. This component:
 *
 * 1. Shows a muted background-loop of the demo, no controls, no branding,
 *    no keyboard/fullscreen/captions (stripped via URL params + the
 *    youtube-nocookie domain).
 * 2. Overlays a transparent pointer-events:none layer on the iframe so
 *    YouTube's cursor-change and chrome never surface to the user.
 * 3. A click-through overlay on top captures clicks → toggles play/pause.
 * 4. Intersection observer auto-plays when in view, pauses when out.
 * 5. A custom play-state pill appears on hover so users get an explicit
 *    affordance without any YouTube UI.
 */
function AgentVideo({ ytId, name, index }: { ytId: string; name: string; index: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const sendCommand = useCallback((cmd: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: cmd }),
      '*',
    );
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Play when in view and not user-paused, pause otherwise. Hover no longer
  // pauses — users can still pause explicitly via the click overlay.
  useEffect(() => {
    if (isInView && !isPaused) {
      sendCommand('playVideo');
    } else {
      sendCommand('pauseVideo');
    }
  }, [isInView, isPaused, sendCommand]);

  const togglePlay = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // URL params that hide every piece of YouTube chrome: no control bar,
  // no keyboard shortcuts, no fullscreen, no captions, no related videos,
  // no annotations, no title bar. We keep the plain `youtube.com` domain
  // because `youtube-nocookie.com` is frequently blocked by privacy
  // extensions, which produces chrome-error:// iframes.
  const src =
    `https://www.youtube.com/embed/${ytId}`
    + `?autoplay=1&mute=1&loop=1&playlist=${ytId}`
    + `&controls=0&disablekb=1&fs=0&rel=0&modestbranding=1`
    + `&iv_load_policy=3&showinfo=0&cc_load_policy=0&playsinline=1`
    + `&enablejsapi=1`;

  return (
    <motion.div
      ref={wrapperRef}
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay: 0.2 + index * 0.05, duration: 0.7, ease }}
      data-site-agent-card=""
      className="relative rounded-[18px] overflow-hidden shadow-[0px_8px_32px_rgba(0,0,0,0.1)] border border-[#e5e7eb] bg-black"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          ref={iframeRef}
          src={src}
          title={`${name} demo`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="absolute inset-0 w-full h-full pointer-events-none"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Click-through layer — catches clicks for play/pause without
            letting any YouTube chrome surface under the cursor. */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPaused ? `Play ${name} demo` : `Pause ${name} demo`}
          className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
        />

        {/* Premium play/pause pill — appears on hover or when paused. Uses
            inline styles because the site dark scope inverts `bg-white/95`
            to near-black, which would make this pill disappear. */}
        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${
            isHovered || isPaused ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.6)',
            }}
          >
            {isPaused ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#111">
                <path d="M8 5.14v13.72L19 12z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#111">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </div>
        </div>

        {/* Thin gradient vignette — softens edges, hides any residual
            iframe artifacts at the corners */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 85%, rgba(0,0,0,0.08) 100%)',
          }}
        />
      </div>
    </motion.div>
  );
}

function AgentRow({ agent, index }: { agent: (typeof agents)[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay: 0.1 + index * 0.05, duration: 0.7, ease }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center"
    >
      {/* LEFT — text */}
      <div className="flex flex-col gap-5">
        {/* Badge */}
        <div
          data-site-agent-badge=""
          className="inline-flex items-center w-fit gap-2 bg-[#f0f0ee] rounded-full px-3.5 py-1.5"
        >
          <span
            data-site-agent-dot=""
            className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a] flex-shrink-0"
          />
          <span
            className="text-[11px] font-semibold text-[#48484b] uppercase tracking-[0.08em]"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            {agent.badge}
          </span>
        </div>

        {/* Agent name */}
        <h3
          className="text-[32px] sm:text-[40px] font-bold text-[#1a1a1a] tracking-[-0.8px] leading-[1.05]"
          style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
        >
          {agent.name}
        </h3>

        {/* Headline — the confident hook */}
        <p
          className="text-[20px] sm:text-[22px] font-semibold text-[#1a1a1a] tracking-[-0.44px] leading-[1.2]"
          style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
        >
          {agent.headline}
        </p>

        {/* Body — overconfident but grounded */}
        <p
          className="text-[14px] sm:text-[15px] text-[#48484b] leading-[1.65]"
          style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
        >
          {agent.body}
        </p>

        {/* Tag line */}
        <div className="flex items-center gap-3 pt-1">
          <div
            data-site-agent-bar=""
            className="w-8 h-[2px] bg-[#1a1a1a] rounded-full flex-shrink-0"
          />
          <span
            className="text-[13px] font-semibold text-[#1a1a1a] tracking-[-0.26px]"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            {agent.tag}
          </span>
        </div>
      </div>

      {/* RIGHT — video */}
      <AgentVideo ytId={agent.ytId} name={agent.name} index={index} />
    </motion.div>
  );
}

export function MeetOurAgents() {
  return (
    <section className="bg-white py-16 sm:py-24 px-4 sm:px-6 md:px-8 border-t border-[#ebebeb]">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ ease }}
          className="text-center mb-14 sm:mb-20"
        >
          <h2
            className="text-[28px] sm:text-[36px] md:text-[44px] font-bold text-[#1a1a1a] tracking-[-0.88px] leading-[1.1] mb-3"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            Meet Our Agents
          </h2>
          <p
            className="text-sm sm:text-base text-[#48484b] max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}
          >
            Four world-class specialists. Each built to be the best at exactly one thing.
          </p>
        </motion.div>

        {/* Agent rows */}
        <div className="flex flex-col gap-16 sm:gap-24">
          {agents.map((agent, i) => (
            <AgentRow key={agent.name} agent={agent} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
