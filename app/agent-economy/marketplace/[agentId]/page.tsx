// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUSDC, formatAddress } from '@/lib/utils';
import { getReputationTier } from '@/lib/agent-economy/constants';
import { toast } from 'sonner';
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Shield,
  Star,
  Wallet,
  Hash,
  Globe,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Layers,
  Trophy,
  BarChart3,
  Clock,
  Check,
} from 'lucide-react';

const font = {
  fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
} as const;

interface AgentDetails {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  cdpWalletAddress?: string;
  capabilities: string[];
  agentType: 'ai' | 'human' | 'hybrid';
  status: 'active' | 'inactive';
  pricePerTask: string;
  reputationScore: number;
  totalReviews: number;
  totalTasksCompleted: number;
  totalEarnings: string;
  avatarUrl?: string;
  endpointUrl?: string;
  erc8004AgentId?: string;
  verifiedOnChain?: boolean;
  onChainReputation?: number;
  createdAt: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewerAddress: string;
  createdAt: string;
}

export default function AgentProfilePage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<AgentDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgent() {
      try {
        const response = await fetch(`/api/agent-economy/marketplace/list?agentId=${agentId}`);
        const data = await response.json();

        if (!data.success || !data.agents?.length) {
          setError('Agent not found');
          return;
        }

        setAgent(data.agents[0]);

        const reviewsResponse = await fetch(`/api/agent-economy/marketplace/review?agentId=${agentId}`);
        const reviewsData = await reviewsResponse.json();
        if (reviewsData.success) {
          setReviews(reviewsData.reviews || []);
        }
      } catch (err) {
        console.error('Failed to fetch agent:', err);
        setError('Failed to load agent');
      } finally {
        setLoading(false);
      }
    }

    fetchAgent();
  }, [agentId]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center" style={font}>
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-8 h-8 rounded-full border-2 border-[#e5e7eb] border-t-[#111]"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-sm text-[#6b7280] tracking-[-0.28px]">Loading agent profile...</p>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center" style={font}>
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-12 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#fef2f2] flex items-center justify-center">
            <XCircle className="w-6 h-6 text-[#ef4444]" />
          </div>
          <h1 className="text-xl font-semibold text-[#111] tracking-[-0.4px] mb-2">Agent Not Found</h1>
          <p className="text-sm text-[#6b7280] mb-6">{error || 'This agent does not exist or has been removed.'}</p>
          <Link
            href="/agent-economy/marketplace"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#111] text-white rounded-lg text-sm font-medium tracking-[-0.28px] hover:bg-[#333] transition-colors"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const tier = getReputationTier(agent.reputationScore);

  const tierColor: Record<string, { bg: string; text: string; dot: string }> = {
    'Elite': { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
    'Excellent': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    'Great': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    'Good': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    'Average': { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
    'New': { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-300' },
  };

  const tc = tierColor[tier.tier] || tierColor['New'];

  const typeLabel = agent.agentType === 'ai' ? 'AI Agent' : agent.agentType === 'human' ? 'Human Agent' : 'Hybrid Agent';

  return (
    <div className="max-w-3xl mx-auto pb-16" style={font}>
      {/* Breadcrumb */}
      <Link
        href="/agent-economy/marketplace"
        className="inline-flex items-center gap-1.5 text-[13px] text-[#6b7280] hover:text-[#111] transition-colors mb-6 tracking-[-0.26px]"
      >
        <span>Agents</span>
        <span className="text-[#d1d5db]">/</span>
        <span className="text-[#111] font-medium">{agent.name}</span>
      </Link>

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white border border-[#e5e7eb] rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden mb-5"
      >
        {/* Top section with subtle gradient bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#111] via-[#444] to-[#888]" />

        <div className="p-6 sm:p-8">
          {/* Avatar + Name + Status row */}
          <div className="flex items-start gap-5 mb-6">
            <div className="relative flex-shrink-0">
              <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden bg-[#f5f3f0] border border-[#e8e4df]">
                {agent.avatarUrl ? (
                  <img src={agent.avatarUrl} alt={agent.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#f0ebe4] to-[#e8e4df]">
                    <span className="text-2xl font-bold text-[#8b7e6f]">{agent.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              {/* Status indicator */}
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-white ${agent.status === 'active' ? 'bg-[#22c55e]' : 'bg-[#d1d5db]'}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                <h1 className="text-[22px] font-semibold text-[#111] tracking-[-0.44px] leading-tight">
                  {agent.name}
                </h1>
                {agent.erc8004AgentId && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-[#16a34a]" />
                    <span className="text-[11px] font-medium text-[#16a34a] tracking-[-0.22px]">Verified</span>
                  </div>
                )}
              </div>

              <p className="text-[14px] text-[#6b7280] leading-[1.5] tracking-[-0.28px] mb-3">
                {agent.description}
              </p>

              {/* Tags row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium tracking-[-0.24px] ${tc.bg} ${tc.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
                  {tier.tier}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium tracking-[-0.24px] bg-[#f5f3f0] text-[#6b5e4f]">
                  {typeLabel}
                </span>
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-2.5 py-1 rounded-lg text-[12px] text-[#6b7280] bg-[#f9fafb] border border-[#f3f4f6] tracking-[-0.24px]"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#e5e7eb] rounded-xl overflow-hidden border border-[#e5e7eb]">
            {[
              { label: 'Price / Task', value: formatUSDC(BigInt(agent.pricePerTask)), icon: Wallet },
              { label: 'Tasks Done', value: agent.totalTasksCompleted.toString(), icon: Layers },
              { label: 'Reputation', value: agent.reputationScore.toString(), icon: Trophy },
              { label: 'Earned', value: formatUSDC(BigInt(agent.totalEarnings || '0')), icon: BarChart3 },
            ].map((stat) => (
              <div key={stat.label} className="bg-white px-4 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f9fafb] flex items-center justify-center flex-shrink-0">
                  <stat.icon className="w-4 h-4 text-[#9ca3af]" />
                </div>
                <div>
                  <div className="text-[16px] font-semibold text-[#111] tracking-[-0.32px] leading-tight">{stat.value}</div>
                  <div className="text-[11px] text-[#9ca3af] tracking-[-0.22px]">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Two-column: Addresses + CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.06 }}
        className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-5"
      >
        {/* Addresses */}
        <div className="md:col-span-3 bg-white border border-[#e5e7eb] rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#f3f4f6]">
            <h2 className="text-[14px] font-semibold text-[#111] tracking-[-0.28px]">Identity & Wallets</h2>
          </div>

          <div className="divide-y divide-[#f3f4f6]">
            {/* Payment Wallet */}
            {agent.cdpWalletAddress && (
              <AddressRow
                icon={<div className="w-2 h-2 rounded-full bg-[#22c55e]" />}
                iconBg="bg-[#f0fdf4]"
                label="X402 Payment"
                value={formatAddress(agent.cdpWalletAddress)}
                fullValue={agent.cdpWalletAddress}
                onCopy={() => copyToClipboard(agent.cdpWalletAddress!, 'cdp')}
                copied={copiedField === 'cdp'}
                scanUrl={`https://basescan.org/address/${agent.cdpWalletAddress}`}
              />
            )}

            {/* Registration Wallet */}
            <AddressRow
              icon={<div className="w-2 h-2 rounded-full bg-[#9ca3af]" />}
              iconBg="bg-[#f9fafb]"
              label={agent.cdpWalletAddress ? 'Registration' : 'Wallet'}
              value={formatAddress(agent.walletAddress)}
              fullValue={agent.walletAddress}
              onCopy={() => copyToClipboard(agent.walletAddress, 'wallet')}
              copied={copiedField === 'wallet'}
              scanUrl={`https://basescan.org/address/${agent.walletAddress}`}
            />

            {/* ERC-8004 */}
            {agent.erc8004AgentId && (
              <AddressRow
                icon={<Shield className="w-3.5 h-3.5 text-violet-500" />}
                iconBg="bg-violet-50"
                label="ERC-8004 Identity"
                value={`NFT #${agent.erc8004AgentId}`}
                extra={
                  agent.onChainReputation !== undefined && agent.onChainReputation > 0
                    ? `On-chain Rep: ${agent.onChainReputation}`
                    : undefined
                }
                scanUrl={`https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/${agent.erc8004AgentId}`}
              />
            )}

            {/* Endpoint */}
            {agent.endpointUrl && (
              <AddressRow
                icon={<Globe className="w-3.5 h-3.5 text-blue-500" />}
                iconBg="bg-blue-50"
                label="API Endpoint"
                value={agent.endpointUrl}
                fullValue={agent.endpointUrl}
                onCopy={() => copyToClipboard(agent.endpointUrl!, 'endpoint')}
                copied={copiedField === 'endpoint'}
                truncateValue
              />
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#f3f4f6] flex items-center justify-between">
            {agent.erc8004AgentId && (
              <a
                href={`https://basescan.org/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/${agent.erc8004AgentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-violet-600 hover:text-violet-800 font-medium tracking-[-0.24px] transition-colors"
              >
                ERC-8004 #{agent.erc8004AgentId}
                <ArrowUpRight className="w-3 h-3" />
              </a>
            )}
            <div className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] tracking-[-0.24px]">
              <Clock className="w-3 h-3" />
              Registered {new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Hire CTA */}
        <div className="md:col-span-2 bg-[#111] rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border border-white/[0.04]" />
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full border border-white/[0.06]" />

          <div className="relative z-10">
            <div className="mb-4">
              <span className="text-[12px] text-white/40 tracking-[-0.24px] font-medium">
                {agent.status === 'active' ? 'Ready to work' : 'Currently offline'}
              </span>
            </div>

            <div className="mb-1">
              <span className="text-[32px] font-semibold text-white tracking-[-0.64px] leading-none">
                {formatUSDC(BigInt(agent.pricePerTask))}
              </span>
            </div>
            <p className="text-[13px] text-white/40 tracking-[-0.26px] mb-6">
              USDC per task via X402
            </p>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[11px] text-white/20 tracking-[-0.22px]">{agent.totalReviews} reviews</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          </div>

          <a
            href="/skill.md"
            target="_blank"
            className="relative z-10 flex items-center justify-center gap-2 px-5 py-3 bg-white text-[#111] rounded-xl text-[14px] font-medium tracking-[-0.28px] hover:bg-white/90 transition-colors"
          >
            View API Docs
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </motion.div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="bg-white border border-[#e5e7eb] rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-[#f3f4f6] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#111] tracking-[-0.28px]">Reviews</h2>
            <span className="text-[12px] text-[#9ca3af] tabular-nums">{reviews.length}</span>
          </div>

          <div className="divide-y divide-[#f3f4f6]">
            {reviews.map((review) => (
              <div key={review.id}>
                <button
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#fafbfc] transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-[#e5e7eb]'}`}
                        />
                      ))}
                    </div>
                    <span className="text-[13px] text-[#6b7280] tracking-[-0.26px]">
                      {formatAddress(review.reviewerAddress)}
                    </span>
                    <span className="text-[12px] text-[#9ca3af] tracking-[-0.24px]">
                      {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#9ca3af] transition-transform duration-200 ${expandedReview === review.id ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {expandedReview === review.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4">
                        <div className="bg-[#f9fafb] p-4 rounded-xl border-l-2 border-[#e5e7eb]">
                          <p className="text-[13px] text-[#4b5563] leading-[1.6] tracking-[-0.26px]">{review.comment}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Address Row Component ─── */

function AddressRow({
  icon,
  iconBg,
  label,
  value,
  fullValue,
  extra,
  onCopy,
  copied,
  scanUrl,
  truncateValue,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  fullValue?: string;
  extra?: string;
  onCopy?: () => void;
  copied?: boolean;
  scanUrl?: string;
  truncateValue?: boolean;
}) {
  const font = {
    fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
  } as const;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5" style={font}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-[#9ca3af] tracking-[-0.22px] mb-0.5">{label}</div>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-medium text-[#111] tracking-[-0.26px] ${truncateValue ? 'truncate max-w-[220px] block' : ''}`}>
              {value}
            </span>
            {extra && (
              <span className="text-[11px] text-[#9ca3af] tracking-[-0.22px]">{extra}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onCopy && (
          <button
            onClick={onCopy}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
              copied
                ? 'bg-[#22c55e] border-[#22c55e] text-white'
                : 'border-[#e5e7eb] text-[#9ca3af] hover:border-[#111] hover:text-[#111]'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
        {scanUrl && (
          <a
            href={scanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#e5e7eb] text-[#9ca3af] hover:border-[#111] hover:text-[#111] transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
