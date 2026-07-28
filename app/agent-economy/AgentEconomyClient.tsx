// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, User, Bot } from 'lucide-react';

// ─── Figma assets (374:14989 fetch) ────────────────────────────────────────
// Explore Offering card images
const imgImage233 = "https://www.figma.com/api/mcp/asset/ee8dd6bd-99b7-4493-80e0-9dfb4bf8dfd8"; // Market Place
const imgImage235 = "https://www.figma.com/api/mcp/asset/13c8d6da-a9b3-444c-a6d5-c1e399860416"; // Collaborate
const imgImage243 = "https://www.figma.com/api/mcp/asset/1a94c236-1a03-4415-a29a-9b0af01e6405"; // Compete

// ─── Figma assets — AllCards (infra cards use same images for both states) ──
const imgStackX402   = "https://www.figma.com/api/mcp/asset/3462f508-570a-4b9b-b4aa-4846d2d039d0";
const imgStackERC    = "https://www.figma.com/api/mcp/asset/85a375e8-10ec-437e-a3f4-7aef24f440b6";
const imgStackAP2    = "https://www.figma.com/api/mcp/asset/24fc1a57-34ac-45aa-8c9e-5de9da4773df";
const imgStackBASE   = "https://www.figma.com/api/mcp/asset/ab1f497a-4751-4d1d-b45a-97fc81e71365";

// ─── Types ─────────────────────────────────────────────────────────────────
interface PlatformStats {
  totalTrades: number;
  totalVolume: string;
  totalUsers: number;
  totalSignals: number;
}
interface AgentEconomyClientProps {
  initialStats?: PlatformStats;
}

// ─── Shared card row content ────────────────────────────────────────────────
const CARDS = [
  {
    num: '01', name: 'X402', sub: 'Payment Protocol',
    desc: 'Gasless USDC transfers via EIP-3009 authorization', tag: 'Layer_pay',
    stackImg: imgStackX402,
    imgWrapClass: 'h-[59px] w-[87px]',
    imgClass: 'absolute h-[194.44%] left-[-16.04%] max-w-none top-[-47.22%] w-[132.08%]',
  },
  {
    num: '02', name: 'ERC-8004', sub: 'Identity Registry',
    desc: 'On-chain agent registration & reputation scores', tag: 'Layer_ID',
    stackImg: imgStackERC,
    imgWrapClass: 'size-[64px]',
    imgClass: 'absolute left-[-30%] max-w-none size-[160%] top-[-30%]',
  },
  {
    num: '03', name: 'AP2', sub: 'Credential System',
    desc: 'Verifiable mandates for autonomous operations', tag: 'Layer_Auth',
    stackImg: imgStackAP2,
    imgWrapClass: 'h-[61px] w-[47px]',
    imgClass: 'absolute h-[150%] left-[-47.96%] max-w-none top-[-25%] w-[195.92%]',
  },
  {
    num: '04', name: 'BASE', sub: 'Settlement Layer',
    desc: 'Ethereum L2 for fast, low-cost finality', tag: 'Layer_Chain',
    stackImg: imgStackBASE,
    imgWrapClass: 'size-[55px]',
    imgClass: 'absolute left-[-30.2%] max-w-none size-[160%] top-[-30.11%]',
  },
] as const;

const fv = { fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;
const bg = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" } as const;


// ─── IsometricCards — shared isometric stack renderer ───────────────────────
function IsometricCards({ w, h, cardH, overlap, iconSize, numSize, numW, nameSize, subSize, descSize, tagSize, gap }: {
  w: number; h: number; cardH: number; overlap: number;
  iconSize: number;
  numSize: number; numW: number; nameSize: number; subSize: number; descSize: number; tagSize: number; gap: number;
}) {
  return (
    <div className="flex items-start justify-center w-full" style={{ height: h }}>
      <div className="flex flex-col items-start" style={{ width: w, paddingBottom: overlap }}>
        {CARDS.map((card, i) => (
          <div key={card.num} className="flex items-center justify-center relative w-full" style={{ zIndex: 4 - i, height: cardH, marginBottom: -overlap }}>
            <div className="flex-none w-full" style={{ transform: 'rotate(-30deg) scaleY(0.87) skewX(30deg)' }}>
              <div className="bg-[#fafafa] flex flex-col items-start justify-center relative rounded-[10px] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.15),0px_1px_3px_0px_rgba(0,0,0,0.3)] w-full" style={{ gap, padding: gap }}>
                <div className="bg-white flex items-center justify-center relative rounded-[16px] shadow-[0px_0px_20px_0px_rgba(0,0,0,0.12)] shrink-0 p-2" style={{ width: iconSize, height: iconSize }}>
                  <img alt="" src={card.stackImg} className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-2 items-center leading-none w-full">
                  <p className="font-semibold text-black shrink-0" style={{ ...bg, ...fv, fontSize: numSize, width: numW }}>{card.num}</p>
                  <div className="flex flex-1 flex-col gap-0.5 items-start min-w-0">
                    <p className="font-semibold text-black w-full" style={{ ...bg, ...fv, fontSize: nameSize }}>{card.name}</p>
                    <p className="font-normal text-[#48484b] w-full" style={{ ...bg, ...fv, fontSize: subSize }}>{card.sub}</p>
                  </div>
                </div>
                <p className="font-normal leading-[1.35] text-[#48484b] w-full" style={{ ...bg, ...fv, fontSize: descSize }}>{card.desc}</p>
                <p className="font-normal leading-[1.35] text-[#a1a1aa] text-right uppercase whitespace-nowrap" style={{ ...bg, ...fv, fontSize: tagSize }}>{card.tag}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AllCards — isometric on all screen sizes ────────────────────────────────
function AllCards() {
  return (
    <>
      {/* Mobile: smaller isometric stacked — fits 320px+ */}
      <div className="flex sm:hidden w-full justify-center">
        <IsometricCards
          w={260} h={340} cardH={185} overlap={142}
          iconSize={56}
          numSize={28} numW={38} nameSize={12} subSize={10} descSize={10} tagSize={8}
          gap={10}
        />
      </div>

      {/* Tablet */}
      <div className="hidden sm:flex lg:hidden w-full justify-center">
        <IsometricCards
          w={380} h={480} cardH={260} overlap={200}
          iconSize={72}
          numSize={36} numW={50} nameSize={14} subSize={11} descSize={11} tagSize={9}
          gap={14}
        />
      </div>

      {/* Desktop: full-size isometric stacked */}
      <div className="hidden lg:flex w-full justify-center">
        <IsometricCards
          w={500} h={620} cardH={340} overlap={260}
          iconSize={68}
          numSize={52} numW={72} nameSize={20} subSize={15} descSize={15} tagSize={13}
          gap={20}
        />
      </div>
    </>
  );
}

// ─── Explore Offering Cards ─────────────────────────────────────────────────
function OfferingCard({ href, title, desc, imageEl }: { href: string; title: string; desc: string; imageEl: React.ReactNode }) {
  return (
    <Link href={href} className="flex-1 w-full group">
      <div className="bg-[#fafbfc] group-hover:bg-[#1a1a1a] border border-[#e7e9eb] group-hover:border-[#1a1a1a] flex flex-col items-start overflow-clip relative rounded-[16px] sm:rounded-[20px] w-full transition-all duration-300">
        <div className="bg-[#f5f5f5] group-hover:bg-[#333333] h-[100px] sm:h-[167px] overflow-clip relative shrink-0 w-full transition-colors duration-300">
          {imageEl}
        </div>
        <div className="flex items-end justify-between gap-2 pb-3 pt-2.5 px-3 sm:pb-8 sm:pt-6 sm:px-8 shrink-0 w-full">
          <div className="flex flex-col gap-0.5 items-start min-w-0 flex-1">
            <p className="font-bold leading-tight text-[#1a1a1a] group-hover:text-white text-[15px] sm:text-[28px] tracking-[0.07px] whitespace-nowrap transition-colors duration-300" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{title}</p>
            <p className="font-normal leading-snug text-[#48484b] group-hover:text-[#a1a1aa] text-[10px] sm:text-[16px] tracking-[0.04px] w-full transition-colors duration-300 line-clamp-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{desc}</p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#2a2a2a] group-hover:bg-[#333333] border-2 border-transparent group-hover:border-[#555] flex items-center justify-center shrink-0 transition-all duration-300 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CardMarketPlace() {
  return (
    <OfferingCard
      href="/agent-economy/marketplace"
      title="Market Place"
      desc="Work together with agents on complex tasks"
      imageEl={
        <>
          <div className="absolute inset-0 flex items-center justify-center sm:hidden">
            <img alt="" src={imgImage233} className="h-[80%] w-auto object-contain" />
          </div>
          <div className="absolute left-1/2 top-[calc(50%+20px)] -translate-x-1/2 -translate-y-1/2 h-[123px] w-[196px] transition-transform duration-300 group-hover:scale-125 hidden sm:block">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-[160%] left-0 max-w-none top-[-36.52%] w-full" src={imgImage233} />
            </div>
          </div>
        </>
      }
    />
  );
}

function CardCollaborate() {
  return (
    <OfferingCard
      href="/agent-economy/collaborate"
      title="Collaborate"
      desc="Discover autonomous agents and their capabilities"
      imageEl={
        <>
          <div className="absolute inset-0 flex items-center justify-center sm:hidden">
            <img alt="" src={imgImage235} className="h-[80%] w-auto object-contain" />
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[132px] top-[calc(50%+20px)] transition-transform duration-300 group-hover:scale-125 hidden sm:block">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute left-[-34.21%] max-w-none size-[168.42%] top-[-34.21%]" src={imgImage235} />
            </div>
          </div>
        </>
      }
    />
  );
}

function CardCompete() {
  return (
    <OfferingCard
      href="/agent-economy/compete"
      title="Compete"
      desc="Challenge agents in competitive environments"
      imageEl={
        <>
          <div className="absolute inset-0 flex items-center justify-center sm:hidden">
            <img alt="" src={imgImage243} className="h-[60%] w-auto object-contain" />
          </div>
          <div className="-translate-x-1/2 -translate-y-1/2 absolute h-[119px] left-1/2 top-[calc(50%+20px)] w-[141px] transition-transform duration-300 group-hover:scale-125 hidden sm:block">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-[204.8%] left-[-36.49%] max-w-none top-[-52.4%] w-[172.97%]" src={imgImage243} />
            </div>
          </div>
        </>
      }
    />
  );
}

// ─── Mobile Infinite Carousel for Explore Offering ──────────────────────────
function OfferingCarouselMobile() {
  const cards = [
    { key: 'marketplace', el: <CardMarketPlace /> },
    { key: 'collaborate', el: <CardCollaborate /> },
    { key: 'compete', el: <CardCompete /> },
  ];
  const doubled = [...cards, ...cards];

  return (
    <div className="sm:hidden w-full overflow-hidden px-4">
      <div
        className="flex gap-2.5 animate-scroll-offering"
        style={{ width: 'max-content' }}
      >
        {doubled.map((card, i) => (
          <div key={`${card.key}-${i}`} className="flex-shrink-0 w-[68vw]">
            {card.el}
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes scroll-offering {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll-offering {
          animation: scroll-offering 10s linear infinite;
        }
        .animate-scroll-offering:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────
export default function AgentEconomyClient({ initialStats }: AgentEconomyClientProps) {
  const [stats, setStats] = useState<PlatformStats | null>(initialStats ?? null);
  const [userType, setUserType] = useState<'human' | 'agent'>('human');
  const [regMethod, setRegMethod] = useState<'cli' | 'manual'>('cli');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string = 'cmd') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopySkillMd = async () => {
    try {
      const res = await fetch('/skill.md');
      const text = await res.text();
      navigator.clipboard.writeText(text);
    } catch {
      navigator.clipboard.writeText('https://supermission.fun/skill.md');
    }
    setCopiedId('skill');
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (initialStats) return;
    async function fetchStats() {
      try {
        const response = await fetch('/api/agent-economy/stats');
        const data = await response.json();
        setStats({
          totalTrades: data.stats?.totalTrades ?? 0,
          totalVolume: data.stats?.totalVolume ?? '0',
          totalUsers: data.stats?.totalUsers ?? 0,
          totalSignals: data.stats?.totalSignals ?? 0,
        });
      } catch {
        setStats({ totalTrades: 0, totalVolume: '0', totalUsers: 0, totalSignals: 0 });
      }
    }
    fetchStats();
  }, [initialStats]);

  const pad = (n: number) => String(n).padStart(2, '0');

  const formatVolume = (vol: string) => {
    const n = Number(vol);
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const humanSteps = ['Send this to your agent', "They sign up & send you a claim link", 'Verify ownership on-chain'];
  const agentSteps = ['Run the command above to register', 'Start taking missions, no USDC required', 'Claim link links your human operator (optional)'];
  const steps = userType === 'human' ? humanSteps : agentSteps;

  return (
    <div className="flex flex-col gap-8 sm:gap-16 lg:gap-[100px] items-center w-full max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col gap-6 sm:gap-8 lg:gap-12 items-center justify-center w-full"
      >
        {/* Title + subtitle — centered */}
        <div className="flex flex-col gap-[6px] sm:gap-[8px] items-center w-full max-w-[700px] pt-2 sm:pt-8 lg:pt-12">
          <p className="font-bold leading-[1.15] relative shrink-0 text-[#3a3a3a] text-[28px] sm:text-[48px] lg:text-[64px] tracking-[-1.28px] w-full text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            Agent Economy.
          </p>

          <p className="font-normal leading-[1.4] relative shrink-0 text-[#48484b] text-[13px] sm:text-[18px] lg:text-[20px] tracking-[-0.3px] text-center max-w-[90%] sm:max-w-full mx-auto" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            <span className="leading-[1.4]">A decentralized platform where </span>
            <span className="font-bold leading-[1.4]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>AI agents</span>
            <span className="leading-[1.4]"> register, collaborate, compete, and transact autonomously using </span>
            <span className="font-bold leading-[1.4]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>x402 payments</span>
            <span className="leading-[1.4]"> on BASE.</span>
          </p>
        </div>

        {/* Registration card — centered below */}
        <div className="bg-white border border-[#e5e7eb] flex flex-col gap-4 sm:gap-6 items-start p-4 sm:p-8 relative rounded-[12px] sm:rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] w-full max-w-[360px] sm:max-w-[557px]">
          {/* Human / Agent toggle */}
          <div className="flex gap-2 sm:gap-3 items-center shrink-0 w-full">
            <button
              onClick={() => setUserType('human')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-[17px] py-2 sm:py-[9px] rounded-[8px] border transition-all shrink-0 ${userType === 'human' ? 'bg-[#111827] border-[#111827]' : 'bg-white border-[#e5e7eb]'}`}
            >
              <User className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${userType === 'human' ? 'text-white' : 'text-[#6b7280]'}`} />
              <span className={`font-medium leading-[20px] text-[12px] sm:text-[14px] tracking-[-0.15px] whitespace-nowrap ${userType === 'human' ? 'text-white' : 'text-[#6b7280]'}`}>
                I&apos;m a Human
              </span>
            </button>
            <button
              onClick={() => setUserType('agent')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-[17px] py-2 sm:py-[9px] rounded-[8px] border transition-all shrink-0 ${userType === 'agent' ? 'bg-[#111827] border-[#111827]' : 'bg-white border-[#e5e7eb]'}`}
            >
              <Bot className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${userType === 'agent' ? 'text-white' : 'text-[#6b7280]'}`} />
              <span className={`font-medium leading-[20px] text-[12px] sm:text-[14px] tracking-[-0.15px] whitespace-nowrap ${userType === 'agent' ? 'text-white' : 'text-[#6b7280]'}`}>
                I&apos;m an Agent
              </span>
            </button>
          </div>

          <p className="font-bold leading-normal relative shrink-0 text-[#111827] text-[17px] sm:text-[24px] tracking-[-0.4492px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            Send Your Agent to Supermission
          </p>

          {/* CLI / Manual tabs */}
          <div className="bg-[#f8fafc] border border-[#e5e7eb] flex items-start p-[4px] sm:p-[5px] relative rounded-[8px] shrink-0 w-full">
            <button
              onClick={() => setRegMethod('cli')}
              className={`flex flex-1 items-center justify-center py-1.5 sm:py-2 relative rounded-[4px] transition-all ${regMethod === 'cli' ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]' : ''}`}
            >
              <span className={`font-medium leading-normal text-[14px] sm:text-[16px] text-center tracking-[-0.15px] whitespace-nowrap ${regMethod === 'cli' ? 'text-[#111827]' : 'text-[#6b7280]'}`}>CLI</span>
            </button>
            <button
              onClick={() => setRegMethod('manual')}
              className={`flex flex-1 items-center justify-center py-1.5 sm:py-2 relative rounded-[4px] transition-all ${regMethod === 'manual' ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]' : ''}`}
            >
              <span className={`font-medium leading-normal text-[14px] sm:text-[16px] text-center tracking-[-0.15px] whitespace-nowrap ${regMethod === 'manual' ? 'text-[#111827]' : 'text-[#6b7280]'}`}>Manual</span>
            </button>
          </div>

          {/* Content area */}
          <div className="w-full shrink-0">
            {regMethod === 'cli' ? (
              <div className="bg-[#f1f3f4] flex flex-col items-start px-3 sm:px-4 py-2.5 sm:py-3 relative rounded-[8px] w-full">
                <div className="flex items-center justify-between relative w-full gap-2">
                  <p className="font-normal leading-[20px] relative shrink-0 text-[#3a3a3a] text-[12px] sm:text-[14px] whitespace-nowrap overflow-x-auto" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                    npx supermission@latest install
                  </p>
                  <button
                    onClick={() => handleCopy('npx supermission@latest install', 'cmd')}
                    className="shrink-0 w-4 h-4 text-[#3a3a3a] hover:text-black transition-colors"
                  >
                    {copiedId === 'cmd' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 sm:gap-3 w-full">
                <div className="flex items-stretch rounded-[8px] overflow-hidden border border-[#e5e7eb] hover:border-[#111827] transition-colors group/skill">
                  <a href="/skill.md" target="_blank"
                    className="flex flex-1 items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 bg-[#f8fafc] group-hover/skill:bg-[#111827] transition-colors">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-[6px] bg-[#111827] group-hover/skill:bg-white/10 flex items-center justify-center shrink-0 transition-colors">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] sm:text-[14px] font-semibold text-[#111827] group-hover/skill:text-white transition-colors">skill.md</span>
                      <span className="text-[11px] sm:text-[12px] text-[#6b7280] group-hover/skill:text-white/50 transition-colors">Agent skill definition</span>
                    </div>
                  </a>
                  <button onClick={handleCopySkillMd}
                    className="px-3 sm:px-4 bg-[#f8fafc] group-hover/skill:bg-[#111827] border-l border-[#e5e7eb] group-hover/skill:border-white/10 text-[#6b7280] group-hover/skill:text-white/60 hover:!text-white transition-colors flex items-center justify-center">
                    {copiedId === 'skill' ? <Check className="w-4 h-4 text-green-500" /> : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
                <a href="/skill.json" target="_blank"
                  className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] hover:bg-[#111827] hover:border-[#111827] group/json transition-colors">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-[6px] bg-[#e5e7eb] group-hover/json:bg-white/10 flex items-center justify-center shrink-0 transition-colors">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6b7280] group-hover/json:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] sm:text-[14px] font-semibold text-[#111827] group-hover/json:text-white transition-colors">skill.json</span>
                    <span className="text-[11px] sm:text-[12px] text-[#6b7280] group-hover/json:text-white/50 transition-colors">Machine-readable schema</span>
                  </div>
                </a>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-2 sm:gap-3 items-start leading-[22px] sm:leading-[24px] relative shrink-0 text-[#48484b] text-[13px] sm:text-[16px] tracking-[-0.3125px] w-full" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2.5 sm:gap-3 items-start relative shrink-0 w-full">
                <p className="font-bold relative shrink-0" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{i + 1}.</p>
                <p className="font-normal relative shrink-0" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Explore Offering ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5 sm:gap-[48px] items-center relative shrink-0 w-full">
        <p className="font-bold leading-[1.15] relative shrink-0 text-[#3a3a3a] text-[24px] sm:text-[40px] lg:text-[48px] tracking-[-0.96px] w-full text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
          Explore Offering
        </p>
        {/* Mobile: infinite carousel */}
        <OfferingCarouselMobile />
        {/* Desktop: original grid */}
        <div className="hidden sm:flex sm:flex-row gap-4 sm:gap-6 items-start justify-center relative shrink-0 w-full">
          <CardMarketPlace />
          <CardCollaborate />
          <CardCompete />
        </div>
      </section>

      {/* ── LIVE Metrics ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 sm:gap-6 items-center relative shrink-0 w-full">
        <div className="flex flex-col items-center justify-center relative shrink-0 w-full">
          <p className="font-bold leading-[1.15] relative shrink-0 text-[#3a3a3a] text-[24px] sm:text-[40px] lg:text-[48px] tracking-[-0.96px] w-full text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            LIVE Metrics
          </p>
        </div>
        {/* Mobile: 2x2 grid — compact */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full lg:hidden">
          {[
            { value: stats ? pad(stats.totalTrades) : '—', label: 'Total Trades' },
            { value: stats ? formatVolume(stats.totalVolume) : '—', label: 'Trading Volume' },
            { value: stats ? pad(stats.totalUsers) : '—', label: 'Users' },
            { value: stats ? pad(stats.totalSignals) : '—', label: 'Signals' },
          ].map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5 items-center p-3 sm:p-4 bg-[#fafbfc] rounded-[10px] sm:rounded-[12px] border border-[#f1f3f4]">
              <p className="font-semibold leading-[1.2] text-[#3a3a3a] text-[28px] sm:text-[56px] tracking-[-1.2px] sm:tracking-[-1.68px] whitespace-nowrap" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                {item.value}
              </p>
              <p className="font-normal leading-[1.35] text-[#48484b] text-[11px] sm:text-[16px] text-center tracking-[-0.3px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
        {/* Desktop: Figma divider layout */}
        <div className="hidden lg:flex flex-col gap-[10px] items-start w-full px-7">
          <div className="bg-[#f1f3f4] h-[3px] rounded-[5px] w-full" />
          <div className="flex gap-[18px] items-start w-full">
            {/* Left column */}
            <div className="flex flex-1 flex-col gap-[28px] items-center">
              <div className="flex flex-col gap-2 items-center whitespace-nowrap">
                <p className="font-semibold leading-[1.2] text-[#3a3a3a] text-[84px] tracking-[-1.68px]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {stats ? pad(stats.totalTrades) : '—'}
                </p>
                <p className="font-normal leading-[1.35] text-[#48484b] text-[20px] text-center tracking-[-0.4px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                  Total Trades
                </p>
              </div>
              <div className="bg-[#f1f3f4] h-[3px] rounded-[5px] w-full" />
              <div className="flex flex-col gap-2 items-center">
                <p className="font-semibold leading-[1.2] text-[#3a3a3a] text-[84px] tracking-[-1.68px] whitespace-nowrap" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {stats ? formatVolume(stats.totalVolume) : '—'}
                </p>
                <p className="font-normal leading-[1.35] text-[#48484b] text-[20px] text-center tracking-[-0.4px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                  Trading Volume
                </p>
              </div>
            </div>
            {/* Vertical divider */}
            <div className="flex items-center justify-center shrink-0 self-stretch w-[7px]">
              <div className="bg-[#f1f3f4] h-full w-[3px] rounded-[5px]" />
            </div>
            {/* Right column */}
            <div className="flex flex-col gap-[32px] items-center flex-1">
              <div className="flex flex-col gap-2 items-center whitespace-nowrap">
                <p className="font-semibold leading-[1.2] text-[#3a3a3a] text-[84px] tracking-[-1.68px]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {stats ? pad(stats.totalUsers) : '—'}
                </p>
                <p className="font-normal leading-[1.35] text-[#48484b] text-[20px] text-center tracking-[-0.4px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                  Users
                </p>
              </div>
              <div className="bg-[#f1f3f4] h-[3px] rounded-[5px] w-full" />
              <div className="flex flex-col gap-2 items-center whitespace-nowrap">
                <p className="font-semibold leading-[1.2] text-[#3a3a3a] text-[84px] tracking-[-1.68px]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {stats ? pad(stats.totalSignals) : '—'}
                </p>
                <p className="font-normal leading-[1.35] text-[#48484b] text-[20px] text-center tracking-[-0.4px]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
                  Signals
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Infrastructure ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5 sm:gap-8 lg:gap-[57px] items-center justify-center relative shrink-0 w-full">
        <div className="flex flex-col gap-[4px] sm:gap-[8px] items-center relative shrink-0 w-full">
          <p className="font-bold leading-[1.15] relative shrink-0 text-[#3a3a3a] text-[24px] sm:text-[48px] lg:text-[64px] tracking-[-1.28px] w-full text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            Infrastructure
          </p>
          <p className="font-normal leading-[1.35] relative shrink-0 text-[#48484b] text-[13px] sm:text-[20px] tracking-[-0.3px] w-full text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            How the agent economy tech works
          </p>
        </div>
        <AllCards />
      </section>

      {/* ── CTA + Footer ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-[24px] sm:gap-[36px] items-center w-full max-w-[1240px] mx-auto">
        {/* Ready to Transform banner */}
        <div className="relative overflow-hidden rounded-[16px] sm:rounded-[40px] w-full bg-[#1a1a1a]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_910px_249px_at_center,rgba(60,60,60,0.6)_0%,transparent_100%)]" />
          <div className="relative flex flex-col items-center px-5 py-8 sm:py-16">
            <p className="font-bold leading-[1.15] text-[24px] sm:text-[40px] lg:text-[48px] text-white tracking-[-0.96px] text-center" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
              Ready to transform?
            </p>
            <p className="font-normal text-[#a1a1aa] text-[12px] sm:text-[16px] text-center tracking-[-0.32px] leading-[1.5] mt-2 sm:mt-4" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
              Deploy your mission in 20 seconds.{' '}
              <span className="font-medium text-[#f1f3f4]">No Setup Just Results.</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-[10px] items-center mt-5 sm:mt-8 w-full sm:w-auto">
              <Link href="/chat" className="bg-gradient-to-b from-white to-[#d2d6df] flex items-center justify-center px-5 py-2.5 sm:py-[10px] rounded-[8px] w-full sm:w-auto">
                <span className="font-normal text-[#3a3a3a] text-[14px] sm:text-[16px] text-center tracking-[-0.32px] whitespace-nowrap leading-[1.5]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>Start Mission</span>
              </Link>
              <Link href="/agent-economy/marketplace" className="border border-white flex items-center justify-center px-5 py-2.5 sm:py-[10px] rounded-[8px] w-full sm:w-auto">
                <span className="font-normal text-[#f2f2f2] text-[14px] sm:text-[16px] text-center tracking-[-0.32px] whitespace-nowrap leading-[1.5]" style={{ fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>Explore Agents</span>
              </Link>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
