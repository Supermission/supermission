'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { AnimatedBeam } from '@/components/ui/animated-beam';

const ease = [0.16, 1, 0.3, 1] as const;
const fontBricolage = { fontFamily: 'Bricolage Grotesque, var(--font-bricolage), sans-serif' };

/* ── Mini agent card used in step 3 ── */
function MiniAgentCard({ name, desc, img }: { name: string; desc: string; img: string }) {
  return (
    <div data-landing-flow-mini-card className="bg-[#fafbfc] border border-[#e7e9eb] flex flex-col items-start overflow-clip rounded-[8px] shadow-[0px_0px_4px_0px_rgba(0,0,0,0.08)] w-full">
      <div className="bg-[#f5f5f5] overflow-clip relative shrink-0 w-full h-[50px] flex items-center justify-center">
        <Image alt="" className="w-[30px] h-[30px] object-contain" src={img} width={30} height={30} />
      </div>
      <div className="p-2 flex flex-col gap-[2px] w-full">
        <p className="font-bold text-[10px] text-[#1a1a1a]" style={fontBricolage}>{name}</p>
        <p className="font-normal text-[5px] leading-[7px] text-[#48484b]" style={fontBricolage}>{desc}</p>
      </div>
    </div>
  );
}

/* ── Circle anchor for beam endpoints ── */
function CircleAnchor({ refProp, className }: { refProp: React.RefObject<HTMLDivElement | null>; className?: string }) {
  return <div ref={refProp} className={`z-10 flex h-3 w-3 items-center justify-center rounded-full border-2 border-[#e7e9eb] bg-white ${className ?? ''}`}><div className="h-1.5 w-1.5 rounded-full bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b]" /></div>;
}

/* ── Mobile flow diagram (normal document flow) ── */
function FlowDiagramMobile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} data-landing-flow-card className="relative bg-white border border-[#e7e9eb] overflow-clip rounded-[8px] shadow-[0px_4px_0px_0px_rgba(0,0,0,0.1)]">
      <div className="bg-[#fafafa] rounded-[8px] mx-2 -mt-1 px-4 pt-14 pb-6 flex flex-col items-center">
        {/* Step 1 */}
        <p className="font-semibold text-[11px] text-black mb-1.5" style={fontBricolage}>1. ASK ANYTHING</p>
        <div className="bg-white border-[1.5px] border-[#f1f3f4] rounded-full w-full px-4 py-3 text-center">
          <p className="font-normal text-[14px] sm:text-[16px] text-black truncate" style={fontBricolage}>
            Find safest yield on Base with low risk.
          </p>
        </div>
        <div className="my-3 flex justify-center"><CircleAnchor refProp={step1Ref} /></div>

        {/* Step 2 */}
        <p className="font-semibold text-[11px] text-black mb-2" style={fontBricolage}>2. AGENT WORKS</p>
        <div className="flex flex-col items-center gap-2 mb-1">
          <div className="w-[60px] h-[60px]">
            <Image alt="" className="w-full h-full" src="/landing/flow-intent-analyzer.svg" width={60} height={60} />
          </div>
          <p className="font-semibold text-[22px] text-black leading-none" style={fontBricolage}>Intent Analyzer</p>
          <p className="font-normal text-[16px] text-[#48484b] leading-none" style={fontBricolage}>Parse &bull; Score &bull; Match</p>
        </div>
        <div className="my-3 flex justify-center"><CircleAnchor refProp={step2Ref} /></div>

        {/* Step 3 */}
        <p className="font-semibold text-[11px] text-black mb-3" style={fontBricolage}>3. EXECUTE ONCHAIN</p>
        <div className="flex justify-center mb-3"><CircleAnchor refProp={step3Ref} /></div>

        {/* Agent cards row */}
        <div className="flex gap-2 w-full">
          <div className="relative flex-1 min-w-0">
            <div ref={card1Ref} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
            <MiniAgentCard name="Defi Yields" desc="Scan 1000+ pools across all chains for the best APY with risk analysis." img="/landing/flow-agent-defi.png" />
          </div>
          <div className="relative flex-1 min-w-0">
            <div ref={card2Ref} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
            <MiniAgentCard name="Wallet Intelligence" desc="Comprehensive multi-chain wallet analysis with NFT tracking, DeFi positions, and security" img="/landing/flow-agent-wallet.png" />
          </div>
          <div className="relative flex-1 min-w-0">
            <div ref={card3Ref} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
            <MiniAgentCard name="Token Research" desc="Security audit, holder analysis, liquidity check, risk score." img="/landing/flow-agent-token.png" />
          </div>
        </div>
      </div>

      {/* Beams */}
      <AnimatedBeam containerRef={containerRef} fromRef={step1Ref} toRef={step2Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" duration={3} />
      <AnimatedBeam containerRef={containerRef} fromRef={step2Ref} toRef={step3Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" duration={3} delay={0.5} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={card1Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" duration={3} delay={1} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={card2Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" duration={3} delay={1.2} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={card3Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" duration={3} delay={1.4} />
    </div>
  );
}

/* ── Desktop flow diagram (absolute positioned, pixel-perfect from Figma) ── */
function FlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const defiRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      data-landing-flow-card
      className="bg-white border border-[#e7e9eb] overflow-clip relative rounded-[8px] shadow-[0px_4px_0px_0px_rgba(0,0,0,0.1)]"
      style={{ width: 581, height: 620 }}
    >
      {/* Background panel */}
      <div className="absolute bg-[#fafafa] rounded-[8px]" style={{ left: 14, top: -5, width: 553, height: 635 }} />

      {/* Step 1: ASK ANYTHING */}
      <div className="absolute flex flex-col gap-[6px] items-center" style={{ left: 41, top: 65, width: 508 }}>
        <div className="bg-[#fafafa] flex items-center justify-center p-[4px]">
          <p className="font-semibold text-[12px] text-black whitespace-nowrap" style={fontBricolage}>
            1. ASK ANYTHING
          </p>
        </div>
        <div
          className="bg-white border-[1.716px] border-[#f1f3f4] overflow-clip relative rounded-[80.662px] w-full"
          style={{ height: 60.068 }}
        >
          <p
            className="absolute font-normal leading-none text-[24.027px] text-black whitespace-nowrap"
            style={{ ...fontBricolage, left: 'calc(50% - 217.96px)', top: 'calc(50% - 12.87px)' }}
          >
            Find safest yield on Base with low risk.
          </p>
        </div>
      </div>

      {/* Beam anchor: below Step 1 */}
      <div className="absolute flex justify-center" style={{ left: 289, top: 148 }}>
        <CircleAnchor refProp={step1Ref} />
      </div>

      {/* Step 2 label: AGENT WORKS */}
      <div className="absolute bg-[#fafafa] flex items-center justify-center p-[4px]" style={{ left: 233, top: 177 }}>
        <p className="font-semibold text-[12px] text-black whitespace-nowrap" style={fontBricolage}>
          2. AGENT WORKS
        </p>
      </div>

      {/* Intent Analyzer icon */}
      <div className="absolute" style={{ left: 255.53, top: 202.55, width: 78.946, height: 78.946 }}>
        <div className="absolute" style={{ inset: '-26.09%' }}>
          <Image alt="" className="block max-w-none size-full" src="/landing/flow-intent-analyzer.svg" width={120} height={120} />
        </div>
      </div>

      {/* Intent Analyzer text */}
      <div
        className="absolute bg-[#fafafa] flex flex-col gap-[12px] items-start leading-none"
        style={{ left: 193.74, top: 298.66, width: 204 }}
      >
        <p className="font-semibold text-[27.459px] text-black w-full" style={fontBricolage}>
          Intent Analyzer
        </p>
        <p className="font-normal text-[20.595px] text-[#48484b] w-full" style={fontBricolage}>
          Parse &bull; Score &bull; Match
        </p>
      </div>

      {/* Beam anchor: below Intent Analyzer */}
      <div className="absolute flex justify-center" style={{ left: 289, top: 357 }}>
        <CircleAnchor refProp={analyzerRef} />
      </div>

      {/* Step 3 label: EXECUTE ONCHAIN */}
      <div className="absolute bg-[#fafafa] flex items-center justify-center p-[4px] z-10" style={{ left: 220, top: 375 }}>
        <p className="font-semibold text-[12px] text-black whitespace-nowrap" style={fontBricolage}>
          3. EXECUTE ONCHAIN
        </p>
      </div>

      {/* Beam anchor: below Step 3 */}
      <div className="absolute flex justify-center" style={{ left: 289, top: 410 }}>
        <CircleAnchor refProp={step3Ref} />
      </div>

      {/* Agent card: Defi Yields */}
      <div
        data-landing-flow-mini-card
        className="absolute bg-[#fafbfc] border-[0.3px] border-[#e7e9eb] flex flex-col items-start overflow-clip rounded-[8px] shadow-[0px_0px_4.444px_0px_rgba(0,0,0,0.08)]"
        style={{ left: 87, top: 439, width: 125 }}
      >
        {/* Beam anchor at top-center of card */}
        <div ref={defiRef} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
        <div className="bg-[#f5f5f5] overflow-clip relative shrink-0 w-full" style={{ height: 50.06 }}>
          <div
            className="-translate-x-1/2 -translate-y-1/2 absolute"
            style={{ left: 'calc(50% + 0.15px)', top: 'calc(50% + 0.15px)', width: 29.976, height: 29.976 }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <Image alt="" className="absolute max-w-none" style={{ left: '-29.5%', top: '-29.5%', width: '159.01%', height: '159.01%' }} src="/landing/flow-agent-defi.png" width={48} height={48} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-center shrink-0 w-full" style={{ gap: 5.995, padding: '7.194px 9.592px 9.592px' }}>
          <div className="flex flex-col items-start shrink-0 w-full" style={{ gap: 1.199 }}>
            <p className="font-bold shrink-0 text-[#1a1a1a] text-center whitespace-nowrap" style={{ ...fontBricolage, fontSize: 9.592, lineHeight: '9.592px', letterSpacing: 0.024 }}>
              Defi Yields
            </p>
            <p className="font-normal shrink-0 text-[#48484b] w-full" style={{ ...fontBricolage, fontSize: 4.796, lineHeight: '7.194px', letterSpacing: 0.012 }}>
              Scan 1000+ pools across all chains for the best APY with risk analysis.
            </p>
          </div>
        </div>
      </div>

      {/* Agent card: Wallet Intelligence */}
      <div
        data-landing-flow-mini-card
        className="absolute bg-[#fafbfc] border-[0.293px] border-[#e7e9eb] flex flex-col items-start overflow-clip rounded-[8px] shadow-[0px_0px_4.338px_0px_rgba(0,0,0,0.08)]"
        style={{ left: 228, top: 439, width: 125 }}
      >
        {/* Beam anchor at top-center of card */}
        <div ref={walletRef} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
        <div className="bg-[#f5f5f5] overflow-clip relative shrink-0 w-full" style={{ height: 48.859 }}>
          <div
            className="-translate-x-1/2 -translate-y-1/2 absolute"
            style={{ left: 'calc(50% + 0.15px)', top: 'calc(50% + 0.15px)', width: 36.863, height: 36.863 }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <Image alt="" className="absolute max-w-none" style={{ left: '-33.87%', top: '-33.87%', width: '167.74%', height: '167.74%' }} src="/landing/flow-agent-wallet.png" width={62} height={62} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-center shrink-0 w-full" style={{ gap: 5.851, padding: '7.022px 9.362px 9.362px' }}>
          <div className="flex flex-col items-start shrink-0 w-full" style={{ gap: 1.17 }}>
            <p className="font-bold shrink-0 text-[#1a1a1a] text-center whitespace-nowrap" style={{ ...fontBricolage, fontSize: 9.362, lineHeight: '9.362px', letterSpacing: 0.0234 }}>
              Wallet Intelligence
            </p>
            <p className="font-normal shrink-0 text-[#48484b] w-full" style={{ ...fontBricolage, fontSize: 4.681, lineHeight: '7.022px', letterSpacing: 0.0117 }}>
              Comprehensive multi-chain wallet analysis with NFT tracking, DeFi positions, and security
            </p>
          </div>
        </div>
      </div>

      {/* Agent card: Token Research */}
      <div
        data-landing-flow-mini-card
        className="absolute bg-[#fafbfc] border-[0.293px] border-[#e7e9eb] flex flex-col items-start overflow-clip rounded-[8px] shadow-[0px_0px_4.338px_0px_rgba(0,0,0,0.08)]"
        style={{ left: 369, top: 439, width: 125 }}
      >
        {/* Beam anchor at top-center of card */}
        <div ref={tokenRef} className="absolute left-1/2 -translate-x-1/2 -top-0.5 w-1 h-1" />
        <div className="bg-[#f5f5f5] overflow-clip relative shrink-0 w-full" style={{ height: 48.859 }}>
          <div
            className="-translate-x-1/2 -translate-y-1/2 absolute"
            style={{ left: 'calc(50% + 3.65px)', top: 'calc(50% + 1.57px)', width: 31.304, height: 36 }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <Image alt="" className="absolute max-w-none" style={{ left: '-30%', top: '-19.57%', width: '160%', height: '139.13%' }} src="/landing/flow-agent-token.png" width={50} height={50} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-center shrink-0 w-full" style={{ gap: 5.851, padding: '7.022px 9.362px 9.362px' }}>
          <div className="flex flex-col items-start shrink-0 w-full" style={{ gap: 1.17 }}>
            <p className="font-bold shrink-0 text-[#1a1a1a] text-center whitespace-nowrap" style={{ ...fontBricolage, fontSize: 9.362, lineHeight: '9.362px', letterSpacing: 0.0234 }}>
              Token Research
            </p>
            <p className="font-normal shrink-0 text-[#48484b] w-full" style={{ ...fontBricolage, fontSize: 4.681, lineHeight: '7.022px', letterSpacing: 0.0117 }}>
              Security audit, holder analysis, liquidity check, risk score.
            </p>
          </div>
        </div>
      </div>

      {/* Animated beams replacing static SVG connectors */}
      <AnimatedBeam containerRef={containerRef} fromRef={step1Ref} toRef={analyzerRef} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" pathColor="#d9dbdd" pathWidth={2.5} duration={3} />
      <AnimatedBeam containerRef={containerRef} fromRef={analyzerRef} toRef={step3Ref} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" pathColor="#d9dbdd" pathWidth={2.5} duration={3} delay={0.5} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={defiRef} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" pathColor="#d9dbdd" pathWidth={2.5} duration={3} delay={1.0} curvature={-20} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={walletRef} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" pathColor="#d9dbdd" pathWidth={2.5} duration={3} delay={1.2} curvature={0} />
      <AnimatedBeam containerRef={containerRef} fromRef={step3Ref} toRef={tokenRef} gradientStartColor="#1a1a1a" gradientStopColor="#6b7280" pathColor="#d9dbdd" pathWidth={2.5} duration={3} delay={1.4} curvature={-20} />
    </div>
  );
}

export function TheFlowSection() {
  return (
    <section id="how-it-works" className="bg-white py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: text */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease }}
            >
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 bg-[#f1f3f4] rounded-[43px] px-5 py-2.5 mb-6">
                <Image data-site-badge-icon="true" src="/landing/flow-badge-icon.svg" alt="" className="w-7 h-7" width={28} height={28} />
                <span
                  className="text-[20px] font-medium text-[#3a3a3a]"
                  style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}
                >
                  How It Works
                </span>
              </div>

              <h2
                className="text-[36px] sm:text-[48px] md:text-[64px] font-bold text-[#3a3a3a] tracking-[-1.28px] leading-[1.2] mb-6"
                style={fontBricolage}
              >
                From Intent to Execution in Seconds
              </h2>

              <p
                className="text-[16px] sm:text-[20px] text-[#48484b] tracking-[-0.4px] leading-[1.35] max-w-md whitespace-pre-line"
                style={fontBricolage}
              >
                {'Describe what you need in plain language.\nSupermission routes your request to the best agent, executes on-chain, and delivers results, all in one message.'}
              </p>
            </motion.div>

            {/* Right: flow diagram */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15, ease }}
            >
              <div className="sm:hidden">
                <FlowDiagramMobile />
              </div>
              <div className="hidden sm:block">
                <FlowDiagram />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
