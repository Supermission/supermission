'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// Genesis: 2026-07-18 18:30:00 UTC. Month is 0-indexed (6 = July).
const LAUNCH_MS = Date.UTC(2026, 6, 18, 18, 30, 0);

const ease = [0.16, 1, 0.3, 1] as const;

// Shared premium card — authored in light hex so globals.css `.dark.site-theme-scope`
// auto-remaps it to dark. bg-white → #141414, border-[#e5e7eb] → rgba(255,255,255,0.08).
const CARD =
  'rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]';

/* ------------------------------- Countdown ------------------------------- */

function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return { mounted: false, launched: false, parts: null as null | { d: string; h: string; m: string; s: string } };

  const diff = Math.max(0, target - now);
  const total = Math.floor(diff / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    mounted: true,
    launched: target - now <= 0,
    parts: {
      d: pad(Math.floor(total / 86400)),
      h: pad(Math.floor((total % 86400) / 3600)),
      m: pad(Math.floor((total % 3600) / 60)),
      s: pad(total % 60),
    },
  };
}

function CountdownCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-mono tabular-nums text-4xl sm:text-6xl md:text-7xl font-semibold leading-none text-[#1a1a1a]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
      <span className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-[#9ca3af] mt-3 sm:mt-4 uppercase">
        {label}
      </span>
    </div>
  );
}

function Colon() {
  return (
    <span className="font-mono text-3xl sm:text-5xl md:text-6xl leading-none text-[#d1d5db] -mt-1 sm:-mt-2 select-none">
      :
    </span>
  );
}

/* --------------------------------- Data ---------------------------------- */

const AGENTS = [
  { name: 'DELPHI', avatar: '/avatars/delphi.svg', desc: 'DeFi execution — swaps, lending, yields, liquidity, all through chat.' },
  { name: 'ORACLE', avatar: '/avatars/oracle.svg', desc: 'Prediction markets — live signals, whale flow, and direct trades on Polymarket.' },
  { name: 'SECURO', avatar: '/avatars/securo.svg', desc: 'Security — contract audits and scam detection before you ever commit funds.' },
  { name: 'HYPERION', avatar: '/avatars/hyperion.svg', desc: 'Perpetuals — long, short, funding rates and leverage with an AI desk.' },
];

const STATS = [
  { value: '400+', label: 'Beta Users' },
  { value: '12,000+', label: 'Trades Executed' },
  { value: '$50K+', label: 'Trading Volume' },
  { value: '5,387', label: 'AI Signals' },
  { value: '3,000+', label: 'Community' },
  { value: '8 mo', label: 'Live in Production' },
];

const PARTNERS = ['Privy', 'Ethereum Foundation', 'QuickNode', 'Covalent'];

const SAFETY = [
  'Only ever trust the contract address from the official channels below.',
  'We will never DM you first — and no one on the team will ask for your keys.',
  'Verify everything on-chain before you trust it. Never trust, always check.',
];

// $MISSION token — the only official contract address (Robinhood Chain, 4663).
const CA = '0xD374595B39069A56Ee5Da6592f9252D366e53482';
const CA_EXPLORER = 'https://robinhoodchain.blockscout.com/address/' + CA;

// Where to buy / trade / track $MISSION — Virtuals is the primary buy (Genesis pool).
const BUY_VENUES = [
  { label: 'Virtuals', sub: 'Genesis pool · fair launch', href: 'https://app.virtuals.io/virtuals/115318' },
  { label: 'GMGN', sub: 'Trade & track live', href: 'https://gmgn.ai/robinhood/token/' + CA.toLowerCase() },
  { label: 'DexScreener', sub: 'Chart & liquidity', href: 'https://dexscreener.com/robinhood/0x41c27d6d535fdca1336c86243df8e04067a71a74' },
];

const LINKS = [
  { label: 'Contract', value: CA.slice(0, 6) + '…' + CA.slice(-4), href: CA_EXPLORER },
  { label: 'GMGN', value: 'gmgn.ai', href: 'https://gmgn.ai/robinhood/token/' + CA.toLowerCase() },
  { label: 'Virtuals', value: 'app.virtuals.io', href: 'https://app.virtuals.io/virtuals/115318' },
  { label: 'DexScreener', value: 'dexscreener.com', href: 'https://dexscreener.com/robinhood/0x41c27d6d535fdca1336c86243df8e04067a71a74' },
  { label: 'Website', value: 'supermission.fun', href: 'https://supermission.fun' },
  { label: 'X', value: '@missiondotfun', href: 'https://x.com/missiondotfun' },
  { label: 'Telegram', value: 't.me/supermissiondotfun', href: 'https://t.me/supermissiondotfun' },
  { label: 'Docs', value: 'docs.supermission.fun', href: 'https://docs.supermission.fun' },
  { label: 'FAQ', value: 'supermission.fun/faq', href: 'https://supermission.fun/faq' },
  { label: 'Blog', value: 'supermission.fun/blog', href: 'https://supermission.fun/blog' },
];

const SHARE_TEXT = `$MISSION is LIVE on Robinhood Chain.

A fair Community Pool via Virtuals — no prebuy, no team allocation, fees to holders. 8 months of real product behind it.

CA: ${CA}`;

const SHARE_INTENT =
  'https://twitter.com/intent/tweet?text=' +
  encodeURIComponent(SHARE_TEXT) +
  '&url=' +
  encodeURIComponent('https://supermission.fun/mission') +
  '&hashtags=MISSION,Supermission';

/* ------------------------------ Primitives ------------------------------- */

function SectionHead({ index, label, title, desc }: { index: string; label: string; title: string; desc?: string }) {
  return (
    <>
      <div className="inline-flex items-center gap-2 rounded-full bg-[#f5f3f0] px-3.5 py-1.5">
        <span className="font-mono text-[10px] tracking-[0.2em] text-[#9ca3af]">{index}</span>
        <span className="h-1 w-1 rounded-full bg-[#1a1a1a]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#48484b]">{label}</span>
      </div>
      <h2
        className="mt-5 text-[26px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.08] text-[#1a1a1a]"
        style={{ fontFamily: FONT }}
      >
        {title}
      </h2>
      {desc && (
        <p className="mt-3 text-[15px] sm:text-base leading-relaxed text-[#48484b]" style={{ fontFamily: FONT }}>
          {desc}
        </p>
      )}
    </>
  );
}

function Block({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease }}
      className={`mt-20 sm:mt-28 ${className}`}
    >
      {children}
    </motion.section>
  );
}

function PrimaryBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
      style={{ fontFamily: FONT }}
    >
      {children}
    </a>
  );
}

function GhostBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#e5e7eb] px-5 py-3 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5f3f0]"
      style={{ fontFamily: FONT }}
    >
      {children}
    </a>
  );
}

function CopyAddress() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (navigator?.clipboard) navigator.clipboard.writeText(CA).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6b7280]">
          $MISSION · Robinhood Chain
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
        >
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-2.5 w-full rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3 text-left transition-colors hover:border-[#d1d5db]"
      >
        <span className="font-mono text-[12px] sm:text-[14px] font-medium leading-snug text-[#1a1a1a] break-all">{CA}</span>
      </button>
    </div>
  );
}

// Buy $MISSION — one primary CTA that opens all three venues as options.
function BuyDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] px-5 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ fontFamily: FONT }}
      >
        Buy $MISSION
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease }}
            className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0px_12px_40px_rgba(0,0,0,0.14)]"
          >
            {BUY_VENUES.map((v, i) => (
              <a
                key={v.label}
                href={v.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={`group flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#f5f3f0] ${i < BUY_VENUES.length - 1 ? 'border-b border-[#e5e7eb]' : ''}`}
              >
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>{v.label}</span>
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#9ca3af]">{v.sub}</span>
                </span>
                <span className="font-mono text-[13px] text-[#9ca3af] transition-colors group-hover:text-[#1a1a1a]">↗</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Per-link logo. Real brand assets where we have them; a clean lettered monogram
// fallback for the ones with no logo file in-repo yet (GMGN, Virtuals, DexScreener).
function LinkLogo({ label }: { label: string }) {
  const cls = 'h-5 w-5 shrink-0';
  if (label === 'X') {
    return (
      <svg viewBox="0 0 24 24" className={`${cls} text-[#1a1a1a]`} fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (label === 'Telegram') {
    return (
      <svg viewBox="0 0 24 24" className={`${cls} text-[#229ED9]`} fill="currentColor" aria-hidden="true">
        <path d="M21.94 4.9l-3.02 14.23c-.22 1-.82 1.24-1.66.77l-4.6-3.39-2.22 2.14c-.25.24-.45.45-.92.45l.33-4.66 8.48-7.66c.37-.33-.08-.51-.57-.19L7.24 13.03 2.7 11.6c-.99-.3-1-.98.21-1.45l17.72-6.83c.82-.3 1.54.19 1.31 1.58z" />
      </svg>
    );
  }
  // Brand logos with their own background → rounded app-icon tile.
  const IMG: Record<string, string> = {
    Contract: '/tokens/chain-robinhood.png',
    Website: '/logo-blue.jpg',
    GMGN: '/social/gmgn.png',
    Virtuals: '/social/virtuals.png',
    DexScreener: '/social/dexscreener.jpg',
  };
  if (IMG[label]) {
    return <Image src={IMG[label]} alt="" width={20} height={20} className={`${cls} rounded-[5px] object-cover`} />;
  }
  // Custom line icons for our own doc pages (match the navbar dropdown icon language).
  const line = `${cls} text-[#48484b]`;
  if (label === 'Docs') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={line} aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    );
  }
  if (label === 'FAQ') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={line} aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1 .8-1 1.6M12 16.4h.01" />
      </svg>
    );
  }
  if (label === 'Blog') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={line} aria-hidden="true">
        <path d="M5 5h14M5 10h14M5 15h9M5 20h6" />
      </svg>
    );
  }
  // fallback monogram (should not hit now that all labels are covered)
  return (
    <span className={`${cls} flex items-center justify-center rounded-[6px] bg-[#f5f3f0] font-mono text-[11px] font-bold text-[#48484b]`}>
      {label.charAt(0)}
    </span>
  );
}

/* -------------------------------- Page ----------------------------------- */

export function MissionReveal() {
  const { mounted, launched, parts } = useCountdown(LAUNCH_MS);

  return (
    <div className="relative">
      <div className="mx-auto max-w-3xl px-5 sm:px-6 pt-16 pb-28 sm:pt-24 sm:pb-36">
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-[#f5f3f0] px-3.5 py-1.5">
            <Image src="/tokens/chain-robinhood.png" alt="" width={15} height={15} className="rounded-[4px]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#48484b]">
              Robinhood Chain
            </span>
          </div>
          <h1
            className="mt-7 text-6xl sm:text-8xl md:text-9xl font-bold tracking-[-0.03em] leading-[0.9] text-[#1a1a1a]"
            style={{ fontFamily: FONT }}
          >
            <span className="text-[#c8c5c0]">$</span>MISSION
          </h1>
          <p
            className="mx-auto mt-7 max-w-md text-base sm:text-lg leading-relaxed text-[#48484b]"
            style={{ fontFamily: FONT }}
          >
            The AI trading terminal that&apos;s been live for eight months. Now it has a token — launched fair, owned by the people who use it.
          </p>
          <div className="mt-8 flex justify-center">
            <PrimaryBtn href={SHARE_INTENT}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share the launch
            </PrimaryBtn>
          </div>
        </motion.div>

        {/* ── Launch card — status + contract + buy, all in one ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.16 }}
          className={`${CARD} relative z-20 mt-12 sm:mt-14`}
        >
          {/* status / countdown */}
          <div className="px-5 pt-8 pb-7 text-center sm:px-8 sm:pt-10">
            <div className="mb-7 flex items-center justify-center gap-3 sm:mb-8">
              <span className="h-px w-8 bg-[#e5e7eb]" />
              <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.35em] uppercase text-[#6b7280]">
                {launched ? 'Status · Live' : 'Time to Genesis'}
              </span>
              <span className="h-px w-8 bg-[#e5e7eb]" />
            </div>

            <div className="flex min-h-[64px] items-center justify-center sm:min-h-[88px]">
              {launched ? (
                <span className="font-mono text-2xl sm:text-4xl tracking-[0.15em] text-[#1a1a1a]">
                  THE MISSION IS LIVE
                </span>
              ) : mounted && parts ? (
                <div className="flex items-start justify-center gap-2.5 sm:gap-5">
                  <CountdownCell value={parts.d} label="Days" />
                  <Colon />
                  <CountdownCell value={parts.h} label="Hrs" />
                  <Colon />
                  <CountdownCell value={parts.m} label="Min" />
                  <Colon />
                  <CountdownCell value={parts.s} label="Sec" />
                </div>
              ) : (
                <span className="font-mono text-4xl sm:text-6xl md:text-7xl font-semibold text-[#e5e7eb] select-none">
                  00 : 00 : 00 : 00
                </span>
              )}
            </div>

            <p className="mt-6 font-mono text-[10px] sm:text-[11px] tracking-[0.25em] uppercase text-[#6b7280] sm:mt-7">
              {launched ? 'Live on Robinhood Chain' : 'Genesis · 18:30 UTC · 18 Jul 2026'}
            </p>
          </div>

          {/* contract + buy */}
          <div className="border-t border-[#e5e7eb] px-5 py-6 sm:px-8 sm:py-7">
            <CopyAddress />
            <div className="mt-4">
              <BuyDropdown />
            </div>
          </div>
        </motion.div>

        {/* ── 01 · The Terminal ── */}
        <Block>
          <SectionHead
            index="01"
            label="The Terminal"
            title="One terminal, four agents."
            desc="Each does one job, and has been doing it for real people every day."
          />
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {AGENTS.map((a) => (
              <div key={a.name} className={`${CARD} flex items-start gap-4 p-4 sm:p-5`}>
                <Image src={a.avatar} alt={a.name} width={40} height={40} className="shrink-0 rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 font-mono text-[11px] tracking-[0.2em] text-[#6b7280]">{a.name}</div>
                  <p className="text-[14px] leading-relaxed text-[#48484b]" style={{ fontFamily: FONT }}>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>

        {/* ── 02 · The Receipts ── */}
        <Block>
          <SectionHead
            index="02"
            label="The Receipts"
            title="Proof, not promises."
            desc="Real, on-chain, and earned over eight months — before there was ever a token to sell you."
          />
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.label} className={`${CARD} flex flex-col px-4 py-5 sm:px-5 sm:py-6`}>
                <span className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold leading-none text-[#1a1a1a]">
                  {s.value}
                </span>
                <span className="mt-2.5 font-mono text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-[#6b7280]">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </Block>

        {/* ── 03 · Built With ── */}
        <Block>
          <SectionHead index="03" label="Built With" title="Standing on real infrastructure." />
          <div className="mt-7 flex flex-wrap gap-2.5">
            {PARTNERS.map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded-full border border-[#e5e7eb] px-4 py-2 font-mono text-[11px] sm:text-xs tracking-[0.12em] uppercase text-[#48484b]"
              >
                {p}
              </span>
            ))}
          </div>
        </Block>

        {/* ── 04 · Stay Safe ── */}
        <Block>
          <SectionHead index="04" label="Stay Safe" title="Never trust, always check." />
          <div className={`${CARD} mt-7 overflow-hidden`}>
            {SAFETY.map((s, i) => (
              <div
                key={i}
                className={`flex gap-4 px-5 py-4 ${i < SAFETY.length - 1 ? 'border-b border-[#e5e7eb]' : ''}`}
              >
                <span className="shrink-0 pt-0.5 font-mono text-[11px] tracking-[0.2em] text-[#9ca3af]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="min-w-0 flex-1 text-[14px] sm:text-[15px] leading-relaxed text-[#48484b]" style={{ fontFamily: FONT }}>
                  {s}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-[#6b7280]">
              Official links only
            </span>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-3.5 py-3 transition-colors hover:border-[#d1d5db] hover:bg-[#f5f3f0]"
                >
                  <LinkLogo label={l.label} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10px] tracking-[0.16em] uppercase text-[#9ca3af]">{l.label}</span>
                    <span className="block truncate font-mono text-[12px] text-[#48484b] transition-colors group-hover:text-[#1a1a1a]">{l.value}</span>
                  </span>
                  <span className="font-mono text-[12px] text-[#c8c5c0] transition-colors group-hover:text-[#1a1a1a]">↗</span>
                </a>
              ))}
            </div>
          </div>
        </Block>

        {/* ── Closing ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease }}
          className="mt-24 text-center sm:mt-28"
        >
          <p className="text-lg sm:text-xl font-medium leading-relaxed text-[#1a1a1a]" style={{ fontFamily: FONT }}>
            The receipts are public. Now the upside is too.
          </p>
          <div className="mt-7 flex justify-center">
            <GhostBtn href="https://t.me/supermissiondotfun">Join the community ↗</GhostBtn>
          </div>
          <p className="mt-10 font-mono text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-[#9ca3af]">
            Product first. Proof second. Token last.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
