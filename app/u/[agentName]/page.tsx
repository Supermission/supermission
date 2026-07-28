'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ExternalLink, Copy, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const fontStyle = { fontFamily: "'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;

const XLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface AgentProfile {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  cdpWalletAddress: string | null;
  capabilities: string[];
  agentType: string;
  status: string;
  pricePerTask: string;
  reputationScore: number;
  totalReviews: number;
  totalTasksCompleted: number;
  totalEarnings: string;
  erc8004AgentId: string | null;
  verifiedOnChain: boolean;
  endpointUrl: string | null;
  createdAt: string;
  claim: { status: string; claimedBy: string | null } | null;
}

export default function AgentProfilePage({ params }: { params: Promise<{ agentName: string }> }) {
  const { agentName } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents/by-name/${encodeURIComponent(agentName)}`);
        const data = await res.json();
        if (!data.success) {
          setError(data.error || 'Agent not found');
        } else {
          setAgent(data.agent);
        }
      } catch {
        setError('Failed to load agent');
      } finally {
        setIsLoading(false);
      }
    }
    fetchAgent();
  }, [agentName]);

  if (isLoading) {
    return (
      <div className="py-20 text-center border border-[#e7e9eb] bg-[#fafbfc] rounded-[20px] mx-4 sm:mx-6 md:mx-8 my-8 sm:my-12" style={fontStyle}>
        <div className="w-6 h-6 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin mx-auto" />
        <p className="text-[13px] text-[#6b7280] mt-4">Loading agent...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="px-4 sm:px-6 md:px-8 py-8 sm:py-12" style={fontStyle}>
        <div className="max-w-lg mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-white border border-[#e7e9eb] rounded-[20px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-6 py-4">
                <h2 className="font-bold text-[16px] text-red-700">Agent Not Found</h2>
              </div>
              <div className="p-6">
                <p className="text-[14px] text-[#48484b] leading-relaxed">{error || 'No agent with this name exists.'}</p>
                <button onClick={() => router.push('/')} className="mt-6 px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[14px] font-medium rounded-[8px] hover:opacity-90 transition-opacity">
                  Go Home
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const reputationTier = agent.reputationScore >= 80 ? 'Expert' :
    agent.reputationScore >= 60 ? 'Proficient' :
    agent.reputationScore >= 40 ? 'Intermediate' : 'Beginner';

  const priceUSDC = (parseInt(agent.pricePerTask) / 1e6).toFixed(2);
  const walletAddr = agent.cdpWalletAddress || agent.walletAddress;

  return (
    <div className="px-4 sm:px-6 md:px-8 py-8 sm:py-12 pb-12 sm:pb-8 max-w-7xl mx-auto" style={fontStyle}>
      <div className="max-w-2xl mx-auto space-y-6">

          {/* Claim badge */}
          {agent.claim && agent.claim.status === 'claimed' && agent.claim.claimedBy && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <a
                href={`https://x.com/${agent.claim.claimedBy}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#e7e9eb] rounded-full hover:bg-[#f1f3f4] transition-colors"
              >
                <XLogo className="w-3 h-3 text-[#3a3a3a]" />
                <span className="text-[13px] font-medium text-[#3a3a3a]">@{agent.claim.claimedBy}</span>
              </a>
            </motion.div>
          )}

          {/* Hero: Name + Status + Description */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                {/* Status Badge */}
                <div className={`inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-[12px] font-medium ${
                  agent.status === 'active'
                    ? 'bg-[#d1fae5] text-[#065f46]'
                    : 'bg-[#f1f3f4] text-[#6b7280]'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-[#0aa545] animate-pulse' : 'bg-[#6b7280]'}`} />
                  {agent.status === 'active' ? 'Active' : agent.status}
                  {agent.verifiedOnChain && ' · On-Chain'}
                </div>

                <h1 className="text-[36px] sm:text-[42px] font-bold text-[#111827] leading-tight">
                  {agent.name}
                </h1>
                <p className="text-[13px] text-[#6b7280] mt-1">{agent.agentType} Agent</p>
              </div>

              {agent.claim && !agent.claim.claimedBy && (
                <div className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-1.5 border border-yellow-300 bg-yellow-50 rounded-full">
                  <span className="text-[12px] font-medium text-yellow-700">Unclaimed</span>
                </div>
              )}
            </div>

            <p className="text-[14px] text-[#48484b] leading-relaxed mt-3 max-w-lg">{agent.description}</p>
          </motion.div>

          {/* Stats Grid */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] overflow-hidden shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
              <div className="grid grid-cols-4 gap-0">
                {[
                  { label: 'Reputation', value: agent.reputationScore, sub: reputationTier },
                  { label: 'Reviews', value: agent.totalReviews, sub: null },
                  { label: 'Tasks Done', value: agent.totalTasksCompleted, sub: null },
                  { label: 'Rate', value: `$${priceUSDC}`, sub: 'USDC' },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className={`p-4 sm:p-5 ${i < 3 ? 'border-r border-[#e7e9eb]' : ''}`}
                  >
                    <span className="text-[11px] text-[#6b7280] block mb-2">
                      {stat.label}
                    </span>
                    <span className="text-[24px] sm:text-[28px] font-bold tabular-nums text-[#111827]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {stat.value}
                    </span>
                    {stat.sub && (
                      <span className="text-[11px] text-[#6b7280] mt-1 block">
                        {stat.sub}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Capabilities + On-Chain in two columns */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          >
            {/* Capabilities */}
            <div>
              <p className="text-[13px] font-medium text-[#6b7280] mb-3">Capabilities</p>
              <div className="flex flex-wrap gap-2">
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-3 py-1.5 border border-[#e7e9eb] bg-white rounded-full text-[12px] font-medium text-[#48484b] hover:bg-[#f1f3f4] transition-colors cursor-default"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* On-Chain Identity */}
            <div>
              <p className="text-[13px] font-medium text-[#6b7280] mb-3">On-Chain</p>
              <div className="bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] p-4 space-y-3 relative overflow-hidden shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
                <span className="absolute right-2 top-1 text-[50px] font-bold leading-none text-[#e7e9eb]/50 select-none pointer-events-none">0x</span>

                {agent.erc8004AgentId && (
                  <div>
                    <p className="text-[11px] text-[#6b7280] mb-1">ERC-8004 NFT</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-[#3a3a3a]">#{agent.erc8004AgentId}</span>
                      <span className="text-[11px] font-medium text-[#0aa545]">Verified</span>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] text-[#6b7280] mb-1">Wallet</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#48484b] truncate flex-1">{walletAddr}</span>
                    <button
                      onClick={() => handleCopy(walletAddr, 'wallet')}
                      className={`w-7 h-7 border border-[#e7e9eb] rounded-[6px] flex items-center justify-center hover:bg-[#f1f3f4] transition-colors flex-shrink-0 ${copiedId === 'wallet' ? 'bg-[#0aa545] border-[#0aa545] text-white' : 'text-[#6b7280]'}`}
                    >
                      {copiedId === 'wallet' ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                    <a
                      href={`https://basescan.org/address/${walletAddr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-7 h-7 border border-[#e7e9eb] rounded-[6px] flex items-center justify-center hover:bg-[#f1f3f4] transition-colors flex-shrink-0 text-[#6b7280]"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <div>
                    <p className="text-[11px] text-[#6b7280]">Registered</p>
                    <p className="text-[13px] font-medium text-[#3a3a3a]">{new Date(agent.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#6b7280]">Status</p>
                    <p className="text-[13px] font-medium text-[#3a3a3a]">{agent.verifiedOnChain ? 'Verified' : 'Pending'}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Back to Marketplace */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <button
              onClick={() => router.push('/')}
              className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 border border-[#e7e9eb] bg-white rounded-[12px] text-[14px] font-medium text-[#3a3a3a] hover:bg-[#f1f3f4] hover:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)] transition-all duration-200"
            >
              Back to Home
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

        </div>
    </div>
  );
}
