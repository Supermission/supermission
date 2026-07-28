'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, RotateCcw } from 'lucide-react';

const FONT = 'var(--font-bricolage), Bricolage Grotesque, sans-serif';

/* ───────────────────────── Shared building blocks ───────────────────────── */

function Tag({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[12px] font-semibold tracking-wider ${
        dark ? 'bg-black text-white' : 'bg-[#ececec] text-black'
      }`}
    >
      {children}
    </span>
  );
}

function SlideTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[44px] sm:text-[56px] font-black uppercase tracking-tight leading-none text-black">
      {children}
    </h2>
  );
}

/* ──────────────────────────────── Slide 1 ──────────────────────────────── */

function SlideCover() {
  return (
    <div
      className="w-full h-full flex items-center relative"
      style={{
        background:
          'radial-gradient(ellipse at 75% 60%, #4a4a4a 0%, #1a1a1a 35%, #0a0a0a 70%, #000000 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-12 sm:px-20">
        <div className="flex items-center gap-5 sm:gap-7">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="shrink-0 opacity-80">
            <rect x="6" y="6" width="52" height="52" stroke="#bdbdbd" strokeWidth="2" />
            <rect x="14" y="14" width="36" height="36" stroke="#9a9a9a" strokeWidth="2" />
            <rect x="22" y="22" width="20" height="20" fill="#7a7a7a" />
          </svg>
          <h1 className="text-[58px] sm:text-[88px] font-black tracking-tight text-white leading-none">
            SUPERMISSION
          </h1>
        </div>

        <p className="mt-6 ml-1 text-[20px] sm:text-[26px] text-white/90 max-w-[640px] leading-tight">
          The AI-powered DeFi terminal. One interface for every trade.
        </p>
        <div className="mt-3 ml-1 h-[2px] w-9 bg-white/40" />

        <div className="mt-12 ml-1">
          <span className="inline-block border border-white/30 px-5 py-2.5 text-[12px] tracking-[0.2em] text-white/90 font-semibold">
            SUPERMISSION.FUN
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 2 ──────────────────────────────── */

function ProblemCard({
  num,
  title,
  body,
  dark,
}: {
  num: string;
  title: string;
  body: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col w-full max-w-[260px] aspect-[1/2.4] p-5 ${
        dark ? 'bg-[#1a1a1a] text-white' : 'bg-[#e9e9e9] text-black'
      }`}
    >
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-current" />
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[64px] font-light tabular-nums tracking-tight">{num}</span>
      </div>
      <div>
        <h3 className="text-[22px] font-bold leading-tight tracking-tight">{title}</h3>
        <p
          className={`mt-3 text-[12.5px] leading-snug ${
            dark ? 'text-white/70' : 'text-black/65'
          }`}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function SlideProblem() {
  return (
    <div className="w-full h-full bg-white px-12 py-12 flex items-center">
      <div className="flex w-full gap-12">
        <div className="w-[300px] shrink-0">
          <SlideTitle>PROBLEM</SlideTitle>
          <p className="mt-7 text-[15px] text-black/70 leading-relaxed max-w-[280px]">
            $100B locked in DeFi. 97% of wallet holders have never touched a yield farm, traded
            perps, or RWAs at a single time with much efficiency.
          </p>
          <div className="mt-5 h-[2px] w-9 bg-black" />
        </div>

        <div className="flex-1 flex justify-end gap-6 items-center">
          <ProblemCard
            num="01"
            title="100+ apps to execute one strategy"
            body="Swap on Uniswap, lend on Aave, LP on another, check yields on a third. A simple yield strategy touches 4 apps and 12 clicks."
            dark
          />
          <ProblemCard
            num="02"
            title="$2.8B lost to yield decay yearly"
            body="The best opportunities disappear in minutes. No human can scan 1,000+ pools across 7 protocols in real-time. Alpha goes to bots, retail loses."
          />
          <ProblemCard
            num="03"
            title="$1.7B drained from user errors"
            body="Wrong contract? Wrong chain? Approve a malicious spender? One mistake = drained wallet. Fear of execution keeps $60B+ sidelined in wallets."
            dark
          />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 3 ──────────────────────────────── */

function SolutionCard({
  title,
  body,
  footer,
  art,
  dark,
}: {
  title: string;
  body: string;
  footer: string;
  art: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex flex-col h-full p-7 ${
        dark ? 'bg-[#0d0d0d] text-white' : 'bg-[#ececec] text-black'
      }`}
    >
      <h3 className="text-[28px] font-bold tracking-tight">{title}</h3>
      <p className={`mt-3 text-[13px] leading-snug ${dark ? 'text-white/70' : 'text-black/65'}`}>
        {body}
      </p>
      <div className="flex-1 flex items-center justify-center my-6">{art}</div>
      <p className={`text-[12px] leading-snug ${dark ? 'text-white/55' : 'text-black/55'}`}>
        {footer}
      </p>
    </div>
  );
}

function CandlesArt() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" fill="none">
      {[
        { x: 30, body: [40, 70], wickTop: 20, wickBot: 90 },
        { x: 70, body: [60, 95], wickTop: 35, wickBot: 105 },
        { x: 110, body: [28, 80], wickTop: 8, wickBot: 95 },
        { x: 150, body: [22, 65], wickTop: 4, wickBot: 80 },
      ].map((c) => (
        <g key={c.x}>
          <line x1={c.x} x2={c.x} y1={c.wickTop} y2={c.wickBot} stroke="#fff" strokeWidth="1.5" />
          <rect x={c.x - 12} y={c.body[0]} width="24" height={c.body[1] - c.body[0]} fill="#fff" stroke="#666" />
        </g>
      ))}
    </svg>
  );
}

function CoinsArt() {
  return (
    <svg width="180" height="120" viewBox="0 0 180 120" fill="none">
      <ellipse cx="65" cy="80" rx="42" ry="14" fill="#1a1a1a" />
      <ellipse cx="65" cy="74" rx="42" ry="14" fill="#2a2a2a" stroke="#555" />
      <ellipse cx="120" cy="55" rx="40" ry="13" fill="#0d0d0d" transform="rotate(-25 120 55)" />
      <ellipse cx="120" cy="50" rx="40" ry="13" fill="#222" stroke="#555" transform="rotate(-25 120 50)" />
    </svg>
  );
}

function NetworkArt() {
  const center = { x: 100, y: 60 };
  const nodes = [
    { x: 40, y: 25 }, { x: 100, y: 15 }, { x: 160, y: 25 },
    { x: 25, y: 60 }, { x: 175, y: 60 },
    { x: 45, y: 100 }, { x: 100, y: 110 }, { x: 155, y: 100 },
    { x: 70, y: 35 }, { x: 130, y: 35 },
  ];
  return (
    <svg width="200" height="125" viewBox="0 0 200 125" fill="none">
      {nodes.map((n, i) => (
        <line key={i} x1={center.x} y1={center.y} x2={n.x} y2={n.y} stroke="#888" strokeWidth="1.5" />
      ))}
      {nodes.map((n, i) => (
        <circle key={`c${i}`} cx={n.x} cy={n.y} r="6" fill="#1a1a1a" />
      ))}
      <circle cx={center.x} cy={center.y} r="9" fill="#1a1a1a" />
    </svg>
  );
}

function SlideSolution() {
  return (
    <div className="w-full h-full bg-[#fafafa] px-12 py-10 flex flex-col">
      <div>
        <SlideTitle>SOLUTION</SlideTitle>
        <p className="mt-3 text-[15px] tracking-[0.18em] uppercase text-black/55">
          From intent to onchain execution
        </p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-6 flex-1">
        <SolutionCard
          dark
          title="TRADE"
          body="Swap any token, bridge any chain, provide liquidity — all from one chat."
          footer="Powered by LI.FI (40+ chains), Uniswap V3 LP, real-time quotes."
          art={<CandlesArt />}
        />
        <SolutionCard
          title="EARN"
          body="Deposit into Morpho, Aave, Compound, or LP into Uniswap pools. One command."
          footer="AI scans 1,000+ yield pools. Picks the best. You click confirm in place of this confirmation and actual executions in a simplified way with autonomous tracking and alerts."
          art={<CoinsArt />}
        />
        <SolutionCard
          title="ANALYZE"
          body="Token research, contract audits, wallet intelligence, prediction markets."
          footer="Risk scores, holder analysis, honeypot detection, portfolio tracking — all within a simplified view and stats."
          art={<NetworkArt />}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 4 ──────────────────────────────── */

function ProductRow({
  emoji,
  title,
  sub,
  dark,
}: {
  emoji: string;
  title: string;
  sub: string;
  dark?: boolean;
}) {
  return (
    <div className={`p-4 ${dark ? 'bg-[#1a1a1a] text-white' : 'bg-[#f0f0f0] text-black'}`}>
      <div className="flex items-center gap-2 text-[16px] font-semibold">
        <span aria-hidden>{emoji}</span>
        <span>{title}</span>
      </div>
      <p className={`mt-1.5 text-[12px] ${dark ? 'text-white/60' : 'text-black/55'}`}>{sub}</p>
    </div>
  );
}

function SlideProduct() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex flex-col">
      <SlideTitle>PRODUCT</SlideTitle>

      <div className="mt-10 flex items-stretch gap-8 flex-1">
        <div className="flex-1 border border-black/15 p-5">
          <h3 className="text-[24px] font-semibold mb-4">Execute</h3>
          <div className="flex flex-col gap-2.5">
            <ProductRow emoji="🪙" title="Token swaps" sub="Best route, 40+ chains via LI.FI aggregation" dark />
            <ProductRow emoji="🦄" title="Uniswap V3 LP" sub="Add / remove liquidity, range optimization" />
          </div>
        </div>

        <div className="flex-1 border border-black/15 p-5">
          <h3 className="text-[24px] font-semibold mb-4">Earn</h3>
          <div className="flex flex-col gap-2.5">
            <ProductRow emoji="🦋" title="Morpho Lending" sub="Curated MetaMorpho vaults" />
            <ProductRow emoji="👻" title="Aave V3 & Compound" sub="One-click USDC lending" dark />
          </div>
        </div>

        <div className="flex-1 border border-black/15 p-5 bg-[#0d0d0d] text-white">
          <h3 className="text-[24px] font-semibold mb-4">Analyze</h3>
          <div className="flex flex-col gap-2.5">
            <ProductRow emoji="🔍" title="Token Research" sub="Risk scores, honeypot detection" />
            <ProductRow emoji="📊" title="Prediction Markets" sub="AI confidence signals" />
            <div className="p-4 bg-[#1a1a1a] text-white border border-white/10">
              <div className="flex items-center gap-2 text-[16px] font-semibold">
                <span aria-hidden>📁</span>
                <span>Wallet Intelligence</span>
              </div>
              <p className="mt-1.5 text-[12px] text-white/60">Portfolio, positions, security</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 5 ──────────────────────────────── */

function MarketGrid() {
  const rows = 11;
  const cols = 6;
  const cells: { tier: 'tam' | 'sam' | 'som' }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let tier: 'tam' | 'sam' | 'som' = 'tam';
      if (r < 4) tier = 'tam';
      else if (r === 4) tier = c < 4 ? 'tam' : 'sam';
      else if (r < 9) tier = 'sam';
      else if (r === 9) tier = c < 2 ? 'som' : 'sam';
      else tier = 'som';
      cells.push({ tier });
    }
  }
  return (
    <div className="grid grid-cols-6 gap-2">
      {cells.map((cell, i) => (
        <div
          key={i}
          className={
            cell.tier === 'tam'
              ? 'w-9 h-9 bg-black'
              : cell.tier === 'som'
                ? 'w-9 h-9 bg-[#1a1a1a]'
                : 'w-9 h-9 bg-[#e8e8e8]'
          }
        />
      ))}
    </div>
  );
}

function MarketObservation({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <Tag dark={n !== 2}>{n}</Tag>
      <h4 className="mt-3 text-[15px] font-bold text-black">{title}</h4>
      <p className="mt-2 text-[13px] text-black/65 leading-snug">{body}</p>
      <div className="mt-4 h-[1px] bg-black/10" />
    </div>
  );
}

function SlideMarket() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex">
      <div className="w-[280px] flex flex-col justify-between shrink-0">
        <SlideTitle>MARKET</SlideTitle>
        <p className="text-[26px] leading-tight text-black max-w-[260px] font-medium">
          The AI-DeFi terminal layer doesn&apos;t exist yet. We&apos;re building it.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center px-8 relative">
        <div className="relative">
          <MarketGrid />
          <div className="absolute -right-44 top-0 w-40">
            <Tag dark>$47.1B</Tag>
            <p className="mt-1 text-[13px] font-bold text-black">TAM</p>
            <p className="mt-2 text-[12px] text-black/60 leading-snug">DeFi + AI Agent market by 2030</p>
          </div>
          <div className="absolute -right-44 top-[180px] w-40">
            <Tag>$8B+</Tag>
            <p className="mt-1 text-[13px] font-bold text-black">SAM</p>
            <p className="mt-2 text-[12px] text-black/60 leading-snug">
              DeFi aggregation + yield optimization + trading tools
            </p>
          </div>
          <div className="absolute -right-44 bottom-0 w-40">
            <Tag>Supermission</Tag>
            <p className="mt-1 text-[13px] font-bold text-black">SOM</p>
            <p className="mt-2 text-[12px] text-black/60 leading-snug">
              AI-first DeFi terminal for Base, Polygon and Robinhood Chain users
            </p>
          </div>
        </div>
      </div>

      <div className="w-[260px] flex flex-col gap-5 shrink-0">
        <MarketObservation
          n={1}
          title="AI meets DeFi"
          body="AI agents managing $5B+ in DeFi TVL by 2027. The interface layer is the bottleneck."
        />
        <MarketObservation
          n={2}
          title="Stablecoin explosion"
          body="USDC circulation at all-time highs. Base is the fastest-growing L2 with 10M+ weekly transactions."
        />
        <MarketObservation
          n={3}
          title="Wallet abstraction"
          body="Email-to-wallet onboarding removes the last friction barrier. 1-click from signup to first trade."
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 6 ──────────────────────────────── */

function MetricBlock({
  label,
  value,
  dark,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div className={`p-6 ${dark ? 'bg-[#0d0d0d] text-white' : 'bg-[#ececec] text-black'}`}>
      <p className={`text-[11px] uppercase tracking-wider font-semibold ${dark ? 'text-white/60' : 'text-black/55'}`}>
        {label}
      </p>
      <div className={`mt-1 h-[1px] w-full ${dark ? 'bg-white/15' : 'bg-black/15'}`} />
      <p className="mt-6 text-[56px] font-bold tabular-nums leading-none">{value}</p>
    </div>
  );
}

function RevenueEngine({
  title,
  sub,
  liveLabel,
  liveText,
  compareLabel,
  compareText,
}: {
  title: string;
  sub: string;
  liveLabel: string;
  liveText: string;
  compareLabel: string;
  compareText: string;
}) {
  return (
    <div className="border border-black/10">
      <div className="bg-[#0d0d0d] text-white px-5 py-3.5">
        <p className="text-[15px] font-bold uppercase tracking-wide">{title}</p>
        <p className="text-[11px] text-white/65 mt-0.5">{sub}</p>
      </div>
      <div className="bg-white p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[14px] font-semibold">{liveLabel}</p>
          <p className="text-[10px] uppercase tracking-wider text-black/55 mt-1">{liveText}</p>
        </div>
        <div>
          <p className="text-[14px] font-semibold">{compareLabel}</p>
          <p className="text-[10px] uppercase tracking-wider text-black/55 mt-1">{compareText}</p>
        </div>
      </div>
    </div>
  );
}

function SlideBusinessModel() {
  return (
    <div className="w-full h-full flex">
      <div className="flex-1 bg-white px-10 py-10 flex flex-col">
        <SlideTitle>BUSINESS MODEL</SlideTitle>
        <p className="mt-2 text-[13px] uppercase tracking-[0.16em] text-black/55">
          Today at scale (100K agents)
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 flex-1">
          <MetricBlock label="Revenue / Interaction" value="$0.08" dark />
          <MetricBlock label="Revenue / Cost Ratio" value="75x" />
          <MetricBlock label="Cost to Serve" value="$0.015" />
          <MetricBlock label="Gross Margin at Scale" value="~50%" dark />
        </div>
      </div>

      <div className="w-[480px] bg-white border-l border-black/10 flex flex-col">
        <div className="bg-[#0d0d0d] text-white px-6 py-3">
          <p className="text-[12px] uppercase tracking-[0.18em]">Three revenue engines</p>
        </div>
        <div className="flex-1 px-6 py-6 flex flex-col gap-5">
          <RevenueEngine
            title="Agent Economy Fees"
            sub="2-5% on every agent transaction"
            liveLabel="Live"
            liveText="Marketplace, missions, competitions"
            compareLabel="Comparable"
            compareText="Upwork at 20% — we're 4× cheaper"
          />
          <RevenueEngine
            title="Prediction Market Revenue"
            sub="2-5% on every agent transaction"
            liveLabel="Live"
            liveText="Leagues Arena, 112 articles / 6 sources, AI signals"
            compareLabel="Comparable"
            compareText="Bloomberg terminal for prediction markets"
          />
          <RevenueEngine
            title="x402 Protocol Fees"
            sub="Relayer margin + compute escrow"
            liveLabel="Live"
            liveText="Gasless USDC, ERC-8004 identity"
            compareLabel="Moat"
            compareText="Agents can't switch without losing payment infra"
          />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 7 ──────────────────────────────── */

function ArchBlock({
  title,
  lines,
  dark,
}: {
  title: string;
  lines: string[];
  dark?: boolean;
}) {
  return (
    <div
      className={`flex-1 px-4 py-4 min-w-[170px] ${
        dark ? 'bg-[#0d0d0d] text-white' : 'bg-[#ececec] text-black'
      }`}
    >
      <h4 className="text-[15px] font-bold tracking-tight">{title}</h4>
      <div className={`mt-2 space-y-0.5 text-[12px] ${dark ? 'text-white/65' : 'text-black/65'}`}>
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  );
}

function SlideHowItWorks() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex flex-col">
      <div className="flex items-end gap-6">
        <SlideTitle>HOW IT WORKS</SlideTitle>
        <div className="h-12 w-px bg-black/30" />
        <p className="text-[13px] tracking-[0.16em] uppercase text-black/65 mb-1">
          The system matches your intent to the agent built for it
        </p>
      </div>

      <div className="mt-10 flex-1 flex flex-col">
        <div className="bg-[#ececec] text-center py-5">
          <p className="text-[20px] font-bold">USER INTENT</p>
          <p className="text-[14px] text-black/60">(Natural Language)</p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="w-[80px] shrink-0 text-[11px] text-black/55 font-mono">Agents</span>
          <div className="flex-1 flex gap-3">
            <ArchBlock dark title="ORACLE" lines={['Signals', 'Sentiment', 'Prediction Markets']} />
            <ArchBlock title="DELPHI" lines={['DeFi Execution', 'Swaps', 'LP / Yield']} />
            <ArchBlock dark title="SECURO" lines={['Security + Audits', 'Risk, Honeypot,', 'Contracts']} />
            <div className="flex-1 border border-dashed border-black/40 p-4 flex flex-col items-center justify-center text-black/55 min-w-[170px]">
              <span className="text-2xl">+</span>
              <p className="text-[12px] font-semibold mt-1">MORE AGENTS</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-[80px] shrink-0 text-[11px] text-black/55 font-mono">Terminals</span>
          <div className="flex-1 flex gap-3">
            <ArchBlock dark title="PREDICTION MARKET" lines={['Polymarket', 'Confidence']} />
            <ArchBlock title="TRADING" lines={['Swaps, LP,', 'Lending']} />
            <ArchBlock dark title="DASHBOARD" lines={['Analytics', 'Risk Overview']} />
            <ArchBlock title="PORTFOLIO" lines={['Position', 'Security']} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-[80px] shrink-0 text-[11px] text-black/55 font-mono">Settlement</span>
          <div className="flex-1 bg-[#ececec] py-3.5 text-center">
            <p className="text-[15px] font-bold tracking-wider">
              BASE &nbsp;&nbsp;&middot;&nbsp;&nbsp; POLYGON &nbsp;&nbsp;&middot;&nbsp;&nbsp; ROBINHOOD CHAIN &nbsp;&nbsp;&middot;&nbsp;&nbsp; ETHEREUM &nbsp;&nbsp;&middot;&nbsp;&nbsp; HYPERLIQUID
            </p>
          </div>
        </div>

        <p className="mt-6 text-[13px] text-black/60">
          Permissionless architecture — new agents and terminals ship without breaking the system.
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 8 ──────────────────────────────── */

function TractionCell({
  value,
  label,
  bg,
  text = 'text-black',
}: {
  value: string;
  label: string;
  bg: string;
  text?: string;
}) {
  return (
    <div className={`flex flex-col justify-end p-7 ${bg} ${text}`}>
      <p className="text-[44px] font-black leading-none tracking-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.16em] mt-2 opacity-70">{label}</p>
    </div>
  );
}

function SlideTraction() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex">
      <div className="w-[260px] flex flex-col justify-between shrink-0">
        <SlideTitle>TRACTION</SlideTitle>
        <p className="text-[13px] text-black/55 italic max-w-[220px]">
          Complete DeFi terminal on mainnet — swaps, LP, lending, yields, perps, predictions.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
        <TractionCell value="3,200+" label="On-chain transactions executed" bg="bg-white border border-black/10" />
        <TractionCell value="850+" label="Wallets connected" bg="bg-[#ececec]" />
        <TractionCell value="$240K+" label="Trading volume processed" bg="bg-white border border-black/10" />
        <TractionCell value="5+" label="AI agents live on mainnet" bg="bg-[#0d0d0d]" text="text-white" />
        <TractionCell value="10+" label="DeFi protocols integrated" bg="bg-[#1a1a1a]" text="text-white" />
        <TractionCell value="$50,000+" label="Community raised via early adopters" bg="bg-[#0d0d0d]" text="text-white" />

        <div className="col-span-3 flex items-center justify-around pt-4 text-[12px] text-black/55 font-mono">
          <span>Aave V3</span>
          <span>Hyperliquid</span>
          <span>LI.FI</span>
          <span>Polymarket</span>
          <span>DefiLlama</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 9 ──────────────────────────────── */

function RoadmapColumn({
  phase,
  date,
  bullets,
  dark,
}: {
  phase: string;
  date: string;
  bullets: string[];
  dark?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className={`px-4 py-3 mb-6 flex items-center justify-between text-[14px] font-semibold ${
          dark ? 'bg-[#0d0d0d] text-white' : 'bg-[#ececec] text-black'
        }`}
      >
        <span>|</span>
        <span className="tracking-tight">{phase}</span>
        <span>|</span>
      </div>
      <p className="text-[13px] font-mono text-black/65 mb-5">{date}</p>
      <ul className="space-y-3">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2 text-[13px] leading-snug text-black">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlideRoadmap() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex flex-col">
      <SlideTitle>ROADMAP</SlideTitle>
      <p className="mt-2 text-[14px] text-black/65">From trading agents to agent economy protocol</p>

      <div className="mt-8 flex-1 flex gap-10">
        <RoadmapColumn
          dark
          phase="TRADING AGENTS"
          date="NOW — Q2 '26"
          bullets={[
            '6 live agents (Oracle, Delphi, Securo…)',
            'Prediction Markets — Binary, USDC-settled',
            'x402 micropayments native',
            'Base + Polygon + Robinhood Chain mainnet live',
            'Gasless execution + Privy auth',
            'ERC-8004 agent identity live',
          ]}
        />
        <RoadmapColumn
          phase="FULL-STACK MARKETS"
          date="Q2 – Q3 '26"
          bullets={[
            'Perpetuals via Hyperliquid integration',
            'RWA exposures — tokenized equities (Dinari)',
            'Stock index perps (S&P 500, NIFTY)',
            'Cross-chain LP (Solana, Arbitrum)',
            'Stripe MPP integration (Fiat + Stablecoin)',
            'Mobile app + Chat to trade',
          ]}
        />
        <RoadmapColumn
          phase="AGENT ECONOMY"
          date="Q3 '26 — TGE"
          bullets={[
            'Agent SDK — 3rd party agents join',
            'Agent Marketplace — Hire, Rate, Pay',
            'Compete Mode — Agents vs Agent arenas',
            'Reputation Staking (ERC-800)',
            'DEX launch + Token on Base',
            '10–15% float, fee sharing for holders',
          ]}
        />
        <RoadmapColumn
          phase="THE PROTOCOL"
          date="Q4 '26"
          bullets={[
            '50+ Agents via SDK',
            'Agent-to-Agent Commerce (A2A)',
            'Cross-Protocol Reputation Portability',
            'Institutional API + Compliance Layer',
            '10,000+ MAU / $500K+ GMV monthly',
            'Seed Raise → Series A path',
          ]}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 10 ──────────────────────────────── */

type CellState = 'check' | 'partial' | 'cross';

function CellIcon({ s }: { s: CellState }) {
  if (s === 'check') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 bg-[#0d0d0d] text-white text-[12px]">
        ✓
      </span>
    );
  }
  if (s === 'cross') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 border border-black/30 text-black/70 text-[12px]">
        ✕
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 border border-black/30 text-black/70 text-[12px]">
      ~
    </span>
  );
}

function LandscapeRow({
  name,
  cells,
  emphasized,
}: {
  name: string;
  cells: { state: CellState; note: string }[];
  emphasized?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_repeat(5,1fr)] items-start gap-3 py-4 border-b border-dashed border-black/20">
      <div className={`text-[13px] font-bold uppercase tracking-tight ${emphasized ? 'text-black' : 'text-black/80'}`}>
        {name}
      </div>
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <CellIcon s={c.state} />
          <p className="text-[10.5px] text-black/60 leading-tight">{c.note}</p>
        </div>
      ))}
    </div>
  );
}

function SlideLandscape() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex">
      <div className="w-[280px] shrink-0 flex flex-col">
        <SlideTitle>LANDSCAPE</SlideTitle>
        <p className="mt-7 text-[13.5px] text-black/65 leading-relaxed">
          68% of new DeFi protocols in Q1 2026 ship with an AI agent. 60-80% of crypto trading
          volume is already AI-driven. But the infrastructure is fragmented — agents analyze on
          one platform, trade on another, earn on a third, with no portable identity.
        </p>
        <div className="mt-4 h-[2px] w-9 bg-black" />

        <div className="mt-7 flex items-center gap-2 text-[12px] uppercase tracking-wider font-semibold">
          <span className="w-2.5 h-2.5 bg-black inline-block" /> Three observations
        </div>
        <ul className="mt-4 space-y-2 text-[14px] text-black">
          <li>• Virtuals Protocol</li>
          <li>• Olas</li>
          <li>• Hey Elsa</li>
        </ul>

        <p className="mt-auto text-[12px] text-black/55 italic">
          We built the cross-chain arena where it all converges — agents.
        </p>
      </div>

      <div className="flex-1 pl-8">
        <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-3 pb-3 border-b border-black/20">
          <div />
          {['AGENTIC TRADING', 'PREDICTION MARKET', 'AGENT IDENTITY', 'USDC SETTLEMENT', 'CROSS-CHAIN'].map((h) => (
            <div key={h} className="text-[11px] font-bold tracking-wider uppercase text-black">
              {h}
            </div>
          ))}
        </div>

        <LandscapeRow
          emphasized
          name="Supermission"
          cells={[
            { state: 'check', note: 'ORACLE DeFi yield scanner, multi-agent' },
            { state: 'check', note: 'Binary markets, USDC settlements' },
            { state: 'check', note: 'ERC-8004, portable reputation' },
            { state: 'check', note: 'x402 native, MPP coming soon' },
            { state: 'check', note: 'Base + Polygon + Robinhood Chain live, chain-agnostic' },
          ]}
        />
        <LandscapeRow
          name="Virtuals Protocol"
          cells={[
            { state: 'partial', note: 'Agents can trade, token speculative' },
            { state: 'cross', note: 'No prediction markets' },
            { state: 'partial', note: 'ERC-8183 evaluator agents, not portable' },
            { state: 'cross', note: 'Virtual token settlement, not USDC' },
            { state: 'partial', note: 'Base primary, expanding to Arbitrum / BNB' },
          ]}
        />
        <LandscapeRow
          name="Olas (Autonolas)"
          cells={[
            { state: 'partial', note: 'Polystrat: 1 agent, 1 platform' },
            { state: 'partial', note: 'Polymarkets only, single strategy' },
            { state: 'partial', note: 'ERC-8004 on Celo, early' },
            { state: 'cross', note: 'No native USDC settlement' },
            { state: 'partial', note: 'Multi-chain deploy, fragmented' },
          ]}
        />
        <LandscapeRow
          name="Hey Elsa"
          cells={[
            { state: 'check', note: 'Chat to trade, x402 API' },
            { state: 'cross', note: 'No prediction markets' },
            { state: 'cross', note: 'No agent identity standard' },
            { state: 'partial', note: 'USDC + ELSA token, Base only' },
            { state: 'cross', note: 'Base only EVM read across 15 chains' },
          ]}
        />
        <LandscapeRow
          name="aixbt"
          cells={[
            { state: 'cross', note: 'Intelligence only, no execution' },
            { state: 'cross', note: 'No prediction markets' },
            { state: 'cross', note: 'No identity layers' },
            { state: 'cross', note: 'No payments' },
            { state: 'cross', note: 'Base only Virtuals ecosystem' },
          ]}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 11 ──────────────────────────────── */

function TeamCard({
  name,
  role,
  body,
  handle,
  photoTone,
}: {
  name: string;
  role: string;
  body: React.ReactNode;
  handle: string;
  photoTone: 'dark' | 'light';
}) {
  return (
    <div className="flex-1 border border-black/15 flex flex-col">
      <div
        className={`aspect-[4/3] ${photoTone === 'dark' ? 'bg-[#0d0d0d]' : 'bg-[#ececec]'}`}
        aria-hidden
      />
      <div className="p-6 flex-1 flex flex-col">
        <h3 className="text-[24px] font-bold leading-tight">{name}</h3>
        <p className="text-[13px] uppercase tracking-wider text-black/65 mt-1">{role}</p>
        <div className="mt-4 text-[12.5px] text-black/65 leading-snug space-y-3 flex-1">{body}</div>
        <div className="mt-4 self-end inline-flex items-center gap-1.5 bg-[#0d0d0d] text-white text-[11px] px-2.5 py-1 font-mono">
          <span>𝕏</span> <span>{handle}</span>
        </div>
      </div>
    </div>
  );
}

function SlideTeam() {
  return (
    <div className="w-full h-full bg-white px-12 py-10 flex flex-col">
      <SlideTitle>TEAM</SlideTitle>
      <p className="mt-2 text-[13px] uppercase tracking-[0.16em] text-black/55">
        Solo-built a live DeFi terminal. Now scaling the team.
      </p>

      <div className="mt-8 flex gap-6 flex-1">
        <TeamCard
          photoTone="dark"
          name="Divyanshu Urmaliya"
          role="Founder & CEO"
          body={
            <>
              <p>
                Solo-built entire product end-to-end: 8 AI agents, 7 DeFi protocol integrations,
                smart contracts, payments. $0 raised.
              </p>
              <p>
                3+ years in crypto: DeFi tooling, trading bots, autonomous agents, shipped multiple
                products on mainnet.
              </p>
              <p>3,200+ on-chain transactions processed, 850+ wallets onboarded, before any fundraise.</p>
            </>
          }
          handle="@divyanshueth"
        />
        <TeamCard
          photoTone="light"
          name="Tanmay Jain"
          role="AI Engineer"
          body={
            <>
              <p>AI/ML pipelines & agent orchestration.</p>
              <p>Model fine-tuning & interface optimization.</p>
            </>
          }
          handle="@TanmayJain5114"
        />
        <TeamCard
          photoTone="light"
          name="Arko Roy"
          role="Fullstack Developer"
          body={
            <>
              <p>End-to-end product engineering.</p>
              <p>Smart contract & frontend integration.</p>
            </>
          }
          handle="@notarkoroy"
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Slide 12 ──────────────────────────────── */

function AskItem({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <span className="inline-flex items-center justify-center w-6 h-6 bg-[#0d0d0d] text-white text-[12px] font-bold">
        {n}
      </span>
      <p className="mt-3 text-[15px] font-bold text-black">{title}</p>
      <p className="mt-1 text-[13px] text-black/65 leading-snug">{body}</p>
    </div>
  );
}

function SlideAsk() {
  return (
    <div className="w-full h-full flex">
      <div className="flex-1 bg-white px-10 py-10 flex flex-col">
        <div className="flex items-center gap-6">
          <SlideTitle>THE ASK</SlideTitle>
          <div className="h-12 w-px bg-black/30" />
          <p className="text-[28px] font-semibold text-black">$1M Pre-Seed @ $9M FDV</p>
        </div>

        <div className="mt-10 flex-1 flex items-center gap-10">
          <div className="relative w-[420px] h-[420px]">
            <div className="absolute top-0 left-0 w-[260px] h-[200px] bg-[#0d0d0d] text-white p-5">
              <p className="text-[36px] font-bold">40%</p>
              <p className="text-[15px]">Engineering</p>
            </div>
            <div className="absolute top-[200px] left-0 w-[260px] h-[100px] bg-[#1a1a1a] text-white p-5">
              <p className="text-[28px] font-bold">20%</p>
              <p className="text-[14px]">Liquidity</p>
            </div>
            <div className="absolute top-[300px] left-0 w-[140px] h-[80px] bg-[#bbbbbb] text-black p-4">
              <p className="text-[22px] font-bold">15%</p>
              <p className="text-[12px]">Operations</p>
            </div>
            <div className="absolute top-[300px] left-[140px] w-[120px] h-[80px] bg-[#7a7a7a] text-white p-4">
              <p className="text-[22px] font-bold">15%</p>
              <p className="text-[12px]">Community</p>
            </div>
            <div className="absolute top-[380px] left-0 w-[260px] h-[40px] bg-[#dadada] text-black px-4 py-2">
              <p className="text-[16px] font-bold inline">10% </p>
              <span className="text-[13px]">Legal & Audit</span>
            </div>
          </div>

          <div className="flex-1 grid grid-rows-4 gap-5 max-w-[360px]">
            <AskItem n={1} title="Agent SDK" body="Third-party agents build on our distribution." />
            <AskItem n={2} title="10,000+ MAU" body="Open access + growth marketing." />
            <AskItem
              n={3}
              title="TGE on Base DEX (Q3 2026)"
              body="Token holders earn from revenue."
            />
            <AskItem
              n={4}
              title="TGE on Base DEX (Q3 2026)"
              body="Token holders earn from revenue."
            />
          </div>
        </div>
      </div>

      <div
        className="w-[420px] flex items-center justify-center"
        style={{
          background:
            'radial-gradient(ellipse at 70% 60%, #4a4a4a 0%, #1a1a1a 35%, #0a0a0a 70%, #000000 100%)',
        }}
      >
        <div className="text-center">
          <p className="text-[44px] font-black text-white tracking-tight leading-none">
            SUPERMISSION
          </p>
          <p className="mt-3 text-[14px] text-white/70 font-mono">supermission.fun</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Deck shell ───────────────────────────── */

const SLIDES: { key: string; render: () => React.ReactNode }[] = [
  { key: 'cover', render: () => <SlideCover /> },
  { key: 'problem', render: () => <SlideProblem /> },
  { key: 'solution', render: () => <SlideSolution /> },
  { key: 'product', render: () => <SlideProduct /> },
  { key: 'market', render: () => <SlideMarket /> },
  { key: 'business', render: () => <SlideBusinessModel /> },
  { key: 'how', render: () => <SlideHowItWorks /> },
  { key: 'traction', render: () => <SlideTraction /> },
  { key: 'roadmap', render: () => <SlideRoadmap /> },
  { key: 'landscape', render: () => <SlideLandscape /> },
  { key: 'team', render: () => <SlideTeam /> },
  { key: 'ask', render: () => <SlideAsk /> },
];

export function PitchDeck() {
  const [current, setCurrent] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportLayerRef = useRef<HTMLDivElement>(null);

  const next = useCallback(() => setCurrent((c) => Math.min(c + 1, SLIDES.length - 1)), []);
  const prev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') setCurrent(0);
      else if (e.key === 'End') setCurrent(SLIDES.length - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev]);

  const handleDownload = useCallback(async () => {
    if (!exportLayerRef.current || exporting) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const layer = exportLayerRef.current;
      const slideEls = Array.from(
        layer.querySelectorAll<HTMLElement>('[data-deck-export-slide]'),
      );

      const pageW = 297;
      const pageH = 167;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageW, pageH] });

      for (let i = 0; i < slideEls.length; i++) {
        const el = slideEls[i];
        const canvas = await html2canvas(el, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: el.scrollWidth,
          windowHeight: el.scrollHeight,
        });
        const img = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, pageW, pageH);
      }
      pdf.save('supermission-pitch-deck.pdf');
    } catch (err) {
      console.error('[Deck PDF export] failed:', err);
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return (
    <div className="w-full" style={{ fontFamily: FONT }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div
          className="relative w-full overflow-hidden border border-black/10 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
          style={{ aspectRatio: '16 / 9' }}
        >
          <div className="absolute inset-0">{SLIDES[current].render()}</div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCurrent(0)}
            disabled={current === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-black/15 text-[12px] font-semibold text-black hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
            aria-label="Restart deck"
          >
            <RotateCcw size={14} />
            Restart
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={current === 0}
              className="inline-flex items-center justify-center w-9 h-9 border border-black/15 text-black hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
              aria-label="Previous slide"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[12px] font-mono text-black/65 tabular-nums w-16 text-center">
              {current + 1} / {SLIDES.length}
            </span>
            <button
              type="button"
              onClick={next}
              disabled={current === SLIDES.length - 1}
              className="inline-flex items-center justify-center w-9 h-9 border border-black/15 text-black hover:bg-black hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
              aria-label="Next slide"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-black text-white text-[12px] font-semibold hover:bg-black/85 transition-colors disabled:opacity-60"
          >
            <Download size={14} />
            {exporting ? 'Building PDF…' : 'Download PDF'}
          </button>
        </div>

        <p className="mt-2 text-[11px] text-black/45 text-center">
          ← / → to navigate · Space for next · Home / End to jump
        </p>
      </div>

      {/* Hidden export layer — every slide rendered at full 1280×720 so html2canvas
          can capture each one regardless of which is currently visible. Pinned far
          off-screen so it never affects the page. */}
      <div
        ref={exportLayerRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {SLIDES.map((s) => (
          <div
            key={`export-${s.key}`}
            data-deck-export-slide
            style={{ width: 1280, height: 720, fontFamily: FONT, position: 'relative' }}
          >
            {s.render()}
          </div>
        ))}
      </div>
    </div>
  );
}
