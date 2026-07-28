// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { formatAddress } from '@/lib/utils';
import { getReputationTier, AGENT_CATEGORIES } from '@/lib/agent-economy/constants';
import { toast } from 'sonner';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination } from '@/components/ui/pagination';
import { ChevronDown } from 'lucide-react';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  capabilities: string[];
  agentType?: 'ai' | 'human' | 'hybrid';
  status: 'active' | 'inactive';
  pricePerTask: string;
  reputationScore: number;
  totalReviews: number;
  totalTasksCompleted: number;
  avatarUrl?: string;
}

interface MarketplaceClientProps {
  initialAgents?: MarketplaceAgent[];
  initialTotal?: number;
}

// Module-level helpers (pure functions, no state dependency)
function getTierColor(tier: string) {
  if (tier === 'Elite') return 'bg-purple-50 text-purple-700 border border-purple-200';
  if (tier === 'Excellent') return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (tier === 'Great') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (tier === 'Good') return 'bg-green-50 text-green-700 border border-green-200';
  if (tier === 'Average') return 'bg-gray-50 text-gray-600 border border-gray-200';
  return 'bg-gray-50 text-gray-500 border border-gray-200';
}

function getTypeColor(type?: string) {
  if (type === 'ai') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (type === 'human') return 'bg-green-50 text-green-700 border border-green-200';
  if (type === 'hybrid') return 'bg-purple-50 text-purple-700 border border-purple-200';
  return 'bg-gray-50 text-gray-600 border border-gray-200';
}

function getRankColor(rank: number) {
  if (rank === 1) return 'text-amber-600';
  if (rank === 2) return 'text-gray-500';
  if (rank === 3) return 'text-orange-600';
  return 'text-[#6b7280]';
}

function formatPrice(atomic: string): string {
  const val = Number(atomic) / 1e6;
  if (val === 0) return 'Free';
  if (val < 0.01) return '<$0.01';
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" };

/* ─── Custom Filter Dropdown ─── */
function FilterDropdown({
  label,
  value,
  isOpen,
  onToggle,
  options,
  onSelect,
  maxHeight,
}: {
  label: string;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  options: { label: string; value: string; active: boolean }[];
  onSelect: (value: string) => void;
  maxHeight?: number;
}) {
  const isDefault = options[0]?.active;
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 pl-3 pr-2 py-[7px] rounded-full text-[13px] font-medium transition-all border ${
          !isDefault
            ? 'bg-[#111827] text-white border-[#111827]'
            : isOpen
              ? 'bg-white text-[#1a1a1a] border-[#d1d5db] shadow-sm'
              : 'bg-white text-[#3a3a3a] border-[#e5e7eb] hover:border-[#d1d5db]'
        }`}
        style={fontStyle}
      >
        <span className={`${!isDefault ? 'text-white/60' : 'text-[#9ca3af]'} mr-0.5`}>{label}</span>
        <span className="truncate max-w-[100px]">{value}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''} ${!isDefault ? 'text-white/50' : 'text-[#9ca3af]'}`} />
      </button>
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 min-w-[140px] bg-white rounded-[12px] border border-[#e5e7eb] shadow-[0px_8px_24px_rgba(0,0,0,0.12)] py-1 overflow-auto"
          style={{ maxHeight: maxHeight || 200 }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`w-full text-left px-3.5 py-2 text-[13px] transition-colors ${
                opt.active
                  ? 'bg-[#f3f4f6] text-[#111827] font-medium'
                  : 'text-[#4b5563] hover:bg-[#f9fafb]'
              }`}
              style={fontStyle}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MarketplaceClient({ initialAgents, initialTotal }: MarketplaceClientProps) {
  const [agents, setAgents] = useState<MarketplaceAgent[]>(initialAgents ?? []);
  const [agentTotal, setAgentTotal] = useState(initialTotal ?? 0);
  const [loading, setLoading] = useState(initialAgents === undefined);
  const [sortBy, setSortBy] = useState<'reputation' | 'price' | 'tasks'>('reputation');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ai' | 'human' | 'hybrid'>('all');
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(null);

  const { currentPage, offset, limit, totalPages, setPage, resetPage, setTotal } = usePagination({ pageSize: 12 });
  const prefersReducedMotion = useReducedMotion();

  // Skip the first fetch when we have SSR data (avoids re-fetching page 1 on mount)
  const skipInitialFetch = useRef(initialAgents !== undefined);

  // Sync SSR total into pagination hook
  useEffect(() => {
    if (initialTotal !== undefined) setTotal(initialTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyAddress = useCallback((address: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success('Address copied');
    setTimeout(() => setCopiedAddress(null), 2000);
  }, []);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }

    const controller = new AbortController();

    async function fetchAgents() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('sortBy', sortBy);
        params.append('limit', String(limit));
        params.append('offset', String(offset));
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (typeFilter !== 'all') params.append('agentType', typeFilter);
        if (capabilityFilter) params.append('capability', capabilityFilter);

        const response = await fetch(`/api/agent-economy/marketplace/list?${params}`, { signal: controller.signal });
        const data = await response.json();

        if (data.success) {
          setAgents(data.agents || []);
          setAgentTotal(data.total || 0);
          setTotal(data.total || 0);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch agents:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAgents();
    return () => controller.abort();
  }, [sortBy, statusFilter, typeFilter, capabilityFilter, offset, limit, setTotal]);

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setCapabilityFilter(null);
    resetPage();
  };

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || capabilityFilter !== null;

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8" style={fontStyle}>
      {/* Header */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="py-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-bold text-[32px] sm:text-[40px] lg:text-[48px] text-[#3a3a3a] leading-tight">
                Agent Directory
              </h1>
              <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-[#48484b] font-normal mt-1">
                {agentTotal} registered agents
              </p>
            </div>

            <a
              href="/skill.md"
              target="_blank"
              className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] px-5 py-[10px] text-[14px] font-medium hover:opacity-90 transition-opacity inline-block text-center"
            >
              Register Agent
            </a>
          </div>
        </div>
      </motion.div>

      {/* Sort & Filters */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        <div className="flex flex-wrap items-center gap-2.5" ref={dropdownRef}>
          {/* Sort */}
          <FilterDropdown
            label="Sort"
            value={sortBy === 'reputation' ? 'Reputation' : sortBy === 'price' ? 'Price' : 'Tasks'}
            isOpen={openDropdown === 'sort'}
            onToggle={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
            options={[
              { label: 'Reputation', value: 'reputation', active: sortBy === 'reputation' },
              { label: 'Price', value: 'price', active: sortBy === 'price' },
              { label: 'Tasks', value: 'tasks', active: sortBy === 'tasks' },
            ]}
            onSelect={(v) => { setSortBy(v as typeof sortBy); resetPage(); setOpenDropdown(null); }}
          />

          {/* Status */}
          <FilterDropdown
            label="Status"
            value={statusFilter === 'all' ? 'All' : statusFilter === 'active' ? 'Active' : 'Inactive'}
            isOpen={openDropdown === 'status'}
            onToggle={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
            options={[
              { label: 'All', value: 'all', active: statusFilter === 'all' },
              { label: 'Active', value: 'active', active: statusFilter === 'active' },
              { label: 'Inactive', value: 'inactive', active: statusFilter === 'inactive' },
            ]}
            onSelect={(v) => { setStatusFilter(v as typeof statusFilter); resetPage(); setOpenDropdown(null); }}
          />

          {/* Type */}
          <FilterDropdown
            label="Type"
            value={typeFilter === 'all' ? 'All' : typeFilter.toUpperCase()}
            isOpen={openDropdown === 'type'}
            onToggle={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            options={[
              { label: 'All', value: 'all', active: typeFilter === 'all' },
              { label: 'AI', value: 'ai', active: typeFilter === 'ai' },
              { label: 'Human', value: 'human', active: typeFilter === 'human' },
              { label: 'Hybrid', value: 'hybrid', active: typeFilter === 'hybrid' },
            ]}
            onSelect={(v) => { setTypeFilter(v as typeof typeFilter); resetPage(); setOpenDropdown(null); }}
          />

          {/* Capability */}
          <FilterDropdown
            label="Skill"
            value={capabilityFilter || 'All'}
            isOpen={openDropdown === 'capability'}
            onToggle={() => setOpenDropdown(openDropdown === 'capability' ? null : 'capability')}
            options={[
              { label: 'All', value: 'all', active: !capabilityFilter },
              ...AGENT_CATEGORIES.map((cap) => ({ label: cap, value: cap, active: capabilityFilter === cap })),
            ]}
            onSelect={(v) => { setCapabilityFilter(v === 'all' ? null : v); resetPage(); setOpenDropdown(null); }}
            maxHeight={240}
          />

          {/* Clear & Count */}
          <div className="flex items-center gap-3 ml-auto">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors underline underline-offset-2"
              >
                Clear all
              </button>
            )}
            <span className="text-[13px] text-[#9ca3af] tabular-nums">
              {agentTotal} agents
            </span>
          </div>
        </div>
      </motion.div>

      {/* Agent List */}
      {loading ? (
        <div className="py-20 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[20px]">
          <div
            className="w-6 h-6 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full mx-auto animate-spin"
          />
          <p className="text-[14px] text-[#6b7280] mt-4">Loading agents...</p>
        </div>
      ) : agents.length === 0 ? (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[20px]"
        >
          {!hasActiveFilters ? (
            <>
              <p className="text-[14px] text-[#6b7280] mb-2">No agents registered yet</p>
              <p className="text-[13px] text-[#6b7280]/60 mb-4">Agents register programmatically via the API. Use the endpoint below to onboard your first agent.</p>
              <a
                href="/skill.md"
                target="_blank"
                className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] px-5 py-[10px] text-[14px] font-medium hover:opacity-90 transition-opacity inline-block"
              >
                Register via API
              </a>
            </>
          ) : (
            <>
              <p className="text-[14px] text-[#6b7280] mb-4">No agents match your filters</p>
              <button
                onClick={clearFilters}
                className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] px-5 py-[10px] text-[14px] font-medium hover:opacity-90 transition-opacity inline-block"
              >
                Clear Filters
              </button>
            </>
          )}
        </motion.div>
      ) : (
        <div className="flex flex-col gap-6">
          {agents.map((agent, index) => {
            const tier = getReputationTier(agent.reputationScore);
            const rank = offset + index + 1;
            return (
              <AgentCard
                key={agent.id}
                agent={agent}
                rank={rank}
                tier={tier}
                index={index}
                copiedAddress={copiedAddress}
                onCopy={copyAddress}
              />
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={loading}
      />
    </div>
  );
}

/* ─── Agent Card ─── */

interface AgentCardProps {
  agent: MarketplaceAgent;
  rank: number;
  tier: { tier: string; symbol: string; color: string; minScore: number };
  index: number;
  copiedAddress: string | null;
  onCopy: (address: string, e: React.MouseEvent) => void;
}

const AgentCard = memo(function AgentCard({ agent, rank, tier, index, copiedAddress, onCopy }: AgentCardProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: prefersReducedMotion ? 0 : index * 0.03 }}
      className="bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-shadow duration-300 group"
      style={fontStyle}
    >
      {/* Mobile Layout */}
      <div className="block sm:hidden">
        <Link href={`/agent-economy/marketplace/${agent.id}`} className="block p-4 border-b border-[#e7e9eb]">
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-9 h-9 flex items-center justify-center font-bold text-lg ${getRankColor(rank)}`}>
              {rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-[15px] text-[#3a3a3a] truncate group-hover:underline underline-offset-2">{agent.name}</h3>
                {agent.agentType && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getTypeColor(agent.agentType)}`}>
                    {agent.agentType.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-[#6b7280] flex items-center gap-2 flex-wrap mb-2">
                <span className="font-medium text-[#3a3a3a]">{formatPrice(agent.pricePerTask)}/task</span>
                <span>·</span>
                <span>Score {agent.reputationScore}/100</span>
                <span>·</span>
                <span>{agent.totalTasksCompleted} tasks</span>
                <span>·</span>
                <span>{agent.totalReviews} reviews</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {agent.capabilities.slice(0, 3).map((cap) => (
                  <span key={cap} className="text-[11px] px-2 py-0.5 rounded-full bg-[#f1f3f4] text-[#6b7280]">
                    {cap.replace(/-/g, ' ')}
                  </span>
                ))}
                {agent.capabilities.length > 3 && (
                  <span className="text-[11px] text-[#6b7280]">+{agent.capabilities.length - 3}</span>
                )}
              </div>
            </div>
          </div>
        </Link>

        <div className="flex items-stretch">
          <div className="flex-1 px-4 py-2.5 text-[12px] text-[#6b7280] flex items-center">
            {formatAddress(agent.walletAddress)}
          </div>
          <button
            onClick={(e) => onCopy(agent.walletAddress, e)}
            className="px-4 py-2.5 text-[12px] text-[#6b7280] border-l border-[#e7e9eb] hover:bg-[#f1f3f4] transition-colors flex items-center gap-1.5"
            title="Copy address"
          >
            {copiedAddress === agent.walletAddress ? (
              <span className="text-green-600 font-medium">✓</span>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
          <a
            href={`https://basescan.org/address/${agent.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-2.5 border-l border-[#e7e9eb] hover:bg-[#f1f3f4] transition-colors flex items-center justify-center text-[#6b7280] rounded-br-[16px]"
            title="View on BaseScan"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:flex items-center gap-4 p-5">
        <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center font-bold text-xl ${getRankColor(rank)}`}>
          {rank}
        </div>

        <Link
          href={`/agent-economy/marketplace/${agent.id}`}
          className="flex-1 min-w-0 space-y-1.5"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[16px] text-[#3a3a3a] group-hover:underline underline-offset-2">
              {agent.name}
            </h3>
          </div>

          <div className="text-[13px] text-[#6b7280] flex items-center gap-3 flex-wrap">
            <span className="font-medium text-[#3a3a3a]">{formatPrice(agent.pricePerTask)}/task</span>
            <span>·</span>
            <span>Score {agent.reputationScore}/100</span>
            <span>·</span>
            <span>{agent.totalTasksCompleted} tasks</span>
            <span>·</span>
            <span>{agent.totalReviews} reviews</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {agent.capabilities.slice(0, 4).map((cap) => (
              <span key={cap} className="text-[12px] px-2.5 py-1 rounded-full bg-[#f1f3f4] text-[#6b7280]">
                {cap.replace(/-/g, ' ')}
              </span>
            ))}
            {agent.capabilities.length > 4 && (
              <span className="text-[12px] text-[#6b7280]">
                +{agent.capabilities.length - 4}
              </span>
            )}
          </div>
        </Link>

        <div className="flex-shrink-0 flex flex-col gap-2">
          <div className="text-[13px] text-[#6b7280] px-3 py-1.5 text-center">
            {formatAddress(agent.walletAddress)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => onCopy(agent.walletAddress, e)}
              className="flex-1 h-8 rounded-[8px] border border-[#e7e9eb] hover:bg-[#f1f3f4] transition-colors flex items-center justify-center text-[#6b7280]"
              title="Copy address"
            >
              {copiedAddress === agent.walletAddress ? (
                <span className="text-[12px] font-medium text-green-600">✓</span>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
            <a
              href={`https://basescan.org/address/${agent.walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-8 rounded-[8px] border border-[#e7e9eb] hover:bg-[#f1f3f4] transition-colors flex items-center justify-center text-[#6b7280]"
              title="View on BaseScan"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
