// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination } from '@/components/ui/pagination';
import { BaseIcon } from '@/components/dashboard/shared/ChainIcons';

type TabType = 'x402' | 'erc8004';

interface Transaction {
  id: string;
  from_address: string;
  to_address: string;
  amount: string;
  token_address: string;
  tx_hash: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ERC8004Registration {
  id: string;
  erc8004_agent_id: number;
  chain_id: number;
  registry_address: string;
  global_agent_id: string;
  agent_uri: string | null;
  agent_wallet: string | null;
  registration_tx_hash: string;
  owner_address: string;
  on_chain_reputation_score: number;
  on_chain_review_count: number;
  created_at: string;
  agent_name: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'PENDING',
  completed: 'SETTLED',
  failed: 'FAILED',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#fef3c7] text-[#92400e]',
  completed: 'bg-[#d1fae5] text-[#065f46]',
  failed: 'bg-[#fee2e2] text-[#991b1b]',
};

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" };

function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUSDCAmount(amount: string): string {
  const value = Number(amount) / 1e6;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getTimeAgo(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('x402');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [registrations, setRegistrations] = useState<ERC8004Registration[]>([]);
  const [regTotal, setRegTotal] = useState(0);
  const [regLoading, setRegLoading] = useState(false);

  const txPagination = usePagination({ pageSize: 10 });
  const regPagination = usePagination({ pageSize: 10 });
  const prefersReducedMotion = useReducedMotion();

  // Fetch x402 transactions
  useEffect(() => {
    const controller = new AbortController();

    async function fetchTransactions() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('limit', String(txPagination.limit));
        params.append('offset', String(txPagination.offset));
        if (statusFilter) params.append('status', statusFilter);

        const response = await fetch(`/api/agent-economy/transactions?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (data.success) {
          setTransactions(data.transactions || []);
          setTxTotal(data.total || 0);
          txPagination.setTotal(data.total || 0);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTransactions();
    return () => controller.abort();
  }, [txPagination.offset, txPagination.limit, txPagination.setTotal, statusFilter]);

  // Fetch ERC-8004 registrations when tab is selected
  useEffect(() => {
    if (activeTab !== 'erc8004') return;

    const controller = new AbortController();

    async function fetchRegistrations() {
      setRegLoading(true);
      try {
        const params = new URLSearchParams();
        params.append('limit', String(regPagination.limit));
        params.append('offset', String(regPagination.offset));

        const response = await fetch(`/api/agent-economy/erc8004/registrations?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (data.success) {
          setRegistrations(data.registrations || []);
          setRegTotal(data.total || 0);
          regPagination.setTotal(data.total || 0);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch registrations:', error);
      } finally {
        setRegLoading(false);
      }
    }
    fetchRegistrations();
    return () => controller.abort();
  }, [activeTab, regPagination.offset, regPagination.limit, regPagination.setTotal]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const itemCount = activeTab === 'x402' ? txTotal : regTotal;

  // Calculate stats
  const recentCount = activeTab === 'x402'
    ? transactions.filter(tx => Date.now() - new Date(tx.created_at).getTime() < 3600000).length
    : registrations.filter(reg => Date.now() - new Date(reg.created_at).getTime() < 3600000).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8" style={fontStyle}>
      {/* Header */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="font-bold text-[48px] text-[#3a3a3a] leading-tight">
                  Transactions
                </h1>
                {recentCount > 0 && (
                  <span className="flex items-center gap-1.5 bg-[#d1fae5] text-[#065f46] px-2.5 py-1 text-[12px] font-semibold rounded-full">
                    <span className="w-1.5 h-1.5 bg-[#065f46] rounded-full animate-pulse" />
                    {recentCount} new
                  </span>
                )}
              </div>
              <p className="text-[20px] text-[#48484b] mt-1">
                {itemCount} {activeTab === 'x402' ? 'payments' : 'registrations'} on Base network
              </p>
            </div>

            <a
              href="https://basescan.org"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[14px] font-semibold rounded-[8px] hover:opacity-90 transition-opacity inline-block text-center"
            >
              View on Basescan
            </a>
          </div>
        </div>
      </motion.div>

      {/* Tab Switcher */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
        className="bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="bg-[#f8fafc] border border-[#e5e7eb] rounded-[8px] p-[5px] inline-flex">
            {(['x402', 'erc8004'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'x402') {
                    txPagination.resetPage();
                  } else {
                    regPagination.resetPage();
                  }
                }}
                className={`px-4 py-1.5 text-[14px] font-medium transition-colors duration-200 rounded-[4px]
                  ${activeTab === tab
                    ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] text-[#3a3a3a]'
                    : 'text-[#6b7280] hover:text-[#3a3a3a]'
                  }`}
              >
                {tab === 'x402' ? 'x402 Payments' : 'ERC-8004 Registry'}
              </button>
            ))}
          </div>

          <span className="text-[13px] text-[#6b7280]">
            {itemCount}
          </span>
        </div>

        {/* Status Filter for Mission Payments */}
        {activeTab === 'x402' && (
          <div className="flex items-center gap-2 pt-3 border-t border-[#e7e9eb]">
            <span className="text-[13px] text-[#6b7280] mr-1">Status:</span>
            <button
              onClick={() => {
                setStatusFilter(null);
                txPagination.resetPage();
              }}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-[8px] transition-colors duration-200
                ${!statusFilter
                  ? 'bg-[#111827] text-white'
                  : 'text-[#6b7280] hover:text-[#3a3a3a]'
                }`}
            >
              All
            </button>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setStatusFilter(key);
                  txPagination.resetPage();
                }}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-[8px] transition-colors duration-200
                  ${statusFilter === key
                    ? 'bg-[#111827] text-white'
                    : 'text-[#6b7280] hover:text-[#3a3a3a]'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* x402 Payments Tab */}
      {activeTab === 'x402' && (
        <>
          {loading ? (
            <div className="py-20 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]">
              <div className="w-8 h-8 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin mx-auto" />
              <p className="text-[14px] text-[#6b7280] mt-4">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]"
            >
              <p className="text-[15px] text-[#6b7280] mb-2">No transactions yet</p>
              <p className="text-[13px] text-[#6b7280]/60">
                Payments appear after on-chain settlement. Use the x402 payment API, see{' '}
                <a href="/skill.md" target="_blank" className="underline hover:text-[#3a3a3a]">skill.md</a> to send your first payment.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <TransactionCard tx={tx} copiedId={copiedId} onCopy={copyToClipboard} />
                </motion.div>
              ))}
            </div>
          )}

          <Pagination
            currentPage={txPagination.currentPage}
            totalPages={txPagination.totalPages}
            onPageChange={txPagination.setPage}
            isLoading={loading}
          />
        </>
      )}

      {/* ERC-8004 Registry Tab */}
      {activeTab === 'erc8004' && (
        <>
          {regLoading ? (
            <div className="py-20 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]">
              <div className="w-8 h-8 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin mx-auto" />
              <p className="text-[14px] text-[#6b7280] mt-4">Loading registrations...</p>
            </div>
          ) : registrations.length === 0 ? (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] relative overflow-hidden"
            >
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #3a3a3a 1px, transparent 0)', backgroundSize: '24px 24px' }} />
              <div className="relative">
                <div className="w-14 h-14 rounded-[14px] bg-white border border-[#e7e9eb] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.04)] mx-auto mb-4 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <p className="text-[15px] text-[#3a3a3a] font-semibold mb-1">No registrations yet</p>
                <p className="text-[13px] text-[#6b7280]/60 max-w-[280px] mx-auto">
                  ERC-8004 on-chain agent registrations will appear here once agents are registered on Base
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {registrations.map((reg, i) => (
                <motion.div
                  key={reg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <RegistrationCard reg={reg} copiedId={copiedId} onCopy={copyToClipboard} />
                </motion.div>
              ))}
            </div>
          )}

          <Pagination
            currentPage={regPagination.currentPage}
            totalPages={regPagination.totalPages}
            onPageChange={regPagination.setPage}
            isLoading={regLoading}
          />
        </>
      )}
    </div>
  );
}

/* ─── Transaction Card ─── */

function TransactionCard({
  tx,
  copiedId,
  onCopy,
}: {
  tx: Transaction;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const agentName = (tx.metadata as Record<string, string>)?.agent_name;
  const toAgentName = (tx.metadata as Record<string, string>)?.to_agent_name;
  const status = tx.status || (tx.tx_hash ? 'completed' : 'pending');
  const statusLabel = STATUS_LABELS[status] || status.toUpperCase();
  const statusColor = STATUS_COLORS[status] || 'bg-[#f3f4f6] text-[#6b7280]';
  const isRecent = Date.now() - new Date(tx.created_at).getTime() < 3600000;

  return (
    <div className="border border-[#e7e9eb] bg-white rounded-[16px] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200 group p-5">
      {/* Mobile Layout */}
      <div className="block lg:hidden">
        <div className="flex items-start justify-between pb-4 border-b border-[#e7e9eb]">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-[24px] text-[#3a3a3a]">{formatUSDCAmount(tx.amount)}</span>
              <span className="text-[12px] text-[#6b7280]">USDC</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-[#f3f4f6] text-[#3a3a3a] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                Mission
              </span>
              {isRecent && (
                <span className="bg-[#d1fae5] text-[#065f46] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                  New
                </span>
              )}
              <span className="text-[12px] text-[#6b7280]">
                {getTimeAgo(tx.created_at)}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <span className={`px-2.5 py-1 text-[12px] font-medium rounded-full block ${statusColor}`}>
              {status === 'completed' ? '✓ ' : ''}{statusLabel}
            </span>
          </div>
        </div>

        <div className="pt-3 space-y-2.5">
          <div className="flex justify-between items-start gap-2">
            <span className="text-[12px] text-[#6b7280] flex-shrink-0">From</span>
            <div className="flex flex-col items-end gap-0.5">
              <button
                onClick={() => onCopy(tx.from_address, `m-from-${tx.id}`)}
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
              >
                {copiedId === `m-from-${tx.id}` ? '✓ Copied' : formatAddress(tx.from_address)}
              </button>
              {agentName && (
                <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                  {agentName}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-start gap-2">
            <span className="text-[12px] text-[#6b7280] flex-shrink-0">To</span>
            <div className="flex flex-col items-end gap-0.5">
              <button
                onClick={() => onCopy(tx.to_address, `m-to-${tx.id}`)}
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
              >
                {copiedId === `m-to-${tx.id}` ? '✓ Copied' : formatAddress(tx.to_address)}
              </button>
              {toAgentName && (
                <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                  {toAgentName}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-[#e7e9eb]">
            <span className="text-[13px] text-[#6b7280]">{formatTimestamp(tx.created_at)}</span>
            {tx.tx_hash ? (
              <a
                href={`https://basescan.org/tx/${tx.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#3a3a3a] underline hover:opacity-70 font-medium"
              >
                View TX
              </a>
            ) : (
              <span className="text-[13px] text-[#6b7280]/40">No hash</span>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center gap-4">
        {/* Amount + Type */}
        <div className="w-40 flex-shrink-0 space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-[24px] text-[#3a3a3a]">{formatUSDCAmount(tx.amount)}</span>
            <span className="text-[12px] text-[#6b7280]">USDC</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="bg-[#f3f4f6] text-[#3a3a3a] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
              Mission
            </span>
            {isRecent && (
              <span className="bg-[#d1fae5] text-[#065f46] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                New
              </span>
            )}
          </div>
        </div>

        {/* From → To Flow */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#6b7280] w-10">From</span>
            <button
              onClick={() => onCopy(tx.from_address, `from-${tx.id}`)}
              className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
              title={tx.from_address}
            >
              {copiedId === `from-${tx.id}` ? '✓ Copied' : formatAddress(tx.from_address)}
            </button>
            {agentName && (
              <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                {agentName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#6b7280] w-10">To</span>
            <button
              onClick={() => onCopy(tx.to_address, `to-${tx.id}`)}
              className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
              title={tx.to_address}
            >
              {copiedId === `to-${tx.id}` ? '✓ Copied' : formatAddress(tx.to_address)}
            </button>
            {toAgentName && (
              <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                {toAgentName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-[#6b7280]">
            <span className="text-[13px]">{formatTimestamp(tx.created_at)}</span>
            <span>·</span>
            <span className="text-[13px]">{getTimeAgo(tx.created_at)}</span>
            {tx.tx_hash && (
              <>
                <span>·</span>
                <a
                  href={`https://basescan.org/tx/${tx.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[#3a3a3a] underline hover:opacity-70 font-medium"
                  title={tx.tx_hash}
                >
                  View TX
                </a>
              </>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex-shrink-0">
          <span className={`text-[12px] px-3 py-1.5 font-medium rounded-full ${statusColor}`}>
            {status === 'completed' ? '✓ ' : ''}{statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Registration Card ─── */

function ReputationRing({ score, size = 48, strokeWidth = 3.5 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const getColor = (s: number) => {
    if (s >= 90) return '#6d28d9';
    if (s >= 75) return '#1d4ed8';
    if (s >= 60) return '#065f46';
    if (s >= 40) return '#92400e';
    return '#9ca3af';
  };
  const color = getColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-[14px] text-[#3a3a3a] leading-none">{score}</span>
      </div>
    </div>
  );
}

function RegistrationCard({
  reg,
  copiedId,
  onCopy,
}: {
  reg: ERC8004Registration;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const isRecent = Date.now() - new Date(reg.created_at).getTime() < 3600000;
  const hasReputation = reg.on_chain_reputation_score > 0;
  const getReputationTier = (score: number) => {
    if (score >= 90) return { label: 'Elite', color: 'bg-[#ede9fe] text-[#6d28d9]', accent: '#6d28d9' };
    if (score >= 75) return { label: 'Excellent', color: 'bg-[#dbeafe] text-[#1d4ed8]', accent: '#1d4ed8' };
    if (score >= 60) return { label: 'Good', color: 'bg-[#d1fae5] text-[#065f46]', accent: '#065f46' };
    if (score >= 40) return { label: 'Average', color: 'bg-[#fef3c7] text-[#92400e]', accent: '#92400e' };
    return { label: 'New', color: 'bg-[#f3f4f6] text-[#6b7280]', accent: '#9ca3af' };
  };
  const tier = getReputationTier(reg.on_chain_reputation_score);

  return (
    <div
      className="border border-[#e7e9eb] bg-white rounded-[16px] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200 group overflow-hidden"
    >
      {/* Accent bar top */}
      <div
        className="h-[3px] w-full transition-opacity duration-200 opacity-60 group-hover:opacity-100"
        style={{ background: hasReputation ? `linear-gradient(90deg, ${tier.accent}, ${tier.accent}33)` : 'linear-gradient(90deg, #e5e7eb, transparent)' }}
      />

      <div className="p-5">
        {/* Mobile Layout */}
        <div className="block lg:hidden">
          <div className="flex items-start justify-between pb-4 border-b border-[#e7e9eb]">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-[#f3f4f6] flex items-center justify-center flex-shrink-0">
                  <span className="text-[14px] font-bold text-[#3a3a3a]">
                    {(reg.agent_name || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-[18px] text-[#3a3a3a] leading-tight">{reg.agent_name || 'Unknown Agent'}</h3>
                  <span className="text-[12px] text-[#6b7280]">{getTimeAgo(reg.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="bg-[#f3f4f6] text-[#3a3a3a] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                  #{reg.erc8004_agent_id}
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                  ERC-8004
                </span>
                {isRecent && (
                  <span className="bg-[#d1fae5] text-[#065f46] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                    New
                  </span>
                )}
                {hasReputation && (
                  <span className={`${tier.color} px-2.5 py-0.5 text-[12px] font-medium rounded-full`}>
                    {tier.label}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2.5">
              {hasReputation && (
                <ReputationRing score={reg.on_chain_reputation_score} size={44} strokeWidth={3} />
              )}
              <span className="inline-flex items-center gap-1.5 text-[12px] bg-[#dbeafe] text-[#1d4ed8] px-2.5 py-1 font-medium rounded-full">
                <BaseIcon size={14} />
                Base
              </span>
            </div>
          </div>

          <div className="pt-3 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-[#6b7280]">Owner</span>
              <button
                onClick={() => onCopy(reg.owner_address, `m-owner-${reg.id}`)}
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors font-mono"
              >
                {copiedId === `m-owner-${reg.id}` ? '✓ Copied' : formatAddress(reg.owner_address)}
              </button>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[12px] text-[#6b7280]">Registry</span>
              <a
                href={`https://basescan.org/address/${reg.registry_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors font-mono"
              >
                {formatAddress(reg.registry_address)}
              </a>
            </div>

            {reg.on_chain_review_count > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-[#6b7280]">Reviews</span>
                <span className="text-[13px] text-[#3a3a3a] font-medium">{reg.on_chain_review_count}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-[#e7e9eb]">
              <span className="text-[13px] text-[#6b7280]">{formatTimestamp(reg.created_at)}</span>
              <a
                href={`https://basescan.org/tx/${reg.registration_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#3a3a3a] underline hover:opacity-70 font-medium"
              >
                View TX
              </a>
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:flex items-center gap-5">
          {/* Agent Avatar + Name + ID */}
          <div className="w-56 flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-[10px] bg-[#f3f4f6] flex items-center justify-center flex-shrink-0 group-hover:bg-[#e7e9eb] transition-colors">
                <span className="text-[15px] font-bold text-[#3a3a3a]">
                  {(reg.agent_name || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-[18px] text-[#3a3a3a] leading-tight truncate group-hover:underline underline-offset-2">
                  {reg.agent_name || 'Unknown Agent'}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap ml-[52px]">
              <span className="bg-[#f3f4f6] text-[#3a3a3a] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                #{reg.erc8004_agent_id}
              </span>
              <span className="text-[11px] px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280] rounded-full">
                ERC-8004
              </span>
              {isRecent && (
                <span className="bg-[#d1fae5] text-[#065f46] px-2.5 py-0.5 text-[12px] font-medium rounded-full">
                  New
                </span>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[#6b7280] w-14">Owner</span>
              <button
                onClick={() => onCopy(reg.owner_address, `owner-${reg.id}`)}
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors font-mono"
                title={reg.owner_address}
              >
                {copiedId === `owner-${reg.id}` ? '✓ Copied' : formatAddress(reg.owner_address)}
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[#6b7280] w-14">Registry</span>
              <a
                href={`https://basescan.org/address/${reg.registry_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors font-mono"
                title={reg.registry_address}
              >
                {formatAddress(reg.registry_address)}
              </a>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[#6b7280]">
              <span className="text-[13px]">{formatTimestamp(reg.created_at)}</span>
              <span>·</span>
              <span className="text-[13px]">{getTimeAgo(reg.created_at)}</span>
              {reg.on_chain_review_count > 0 && (
                <>
                  <span>·</span>
                  <span className="text-[13px]">{reg.on_chain_review_count} review{reg.on_chain_review_count !== 1 ? 's' : ''}</span>
                </>
              )}
              <span>·</span>
              <a
                href={`https://basescan.org/tx/${reg.registration_tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#3a3a3a] underline hover:opacity-70 font-medium"
                title={reg.registration_tx_hash}
              >
                View TX
              </a>
            </div>
          </div>

          {/* Reputation Ring + Chain Badge */}
          <div className="flex-shrink-0 flex items-center gap-4">
            {hasReputation && (
              <div className="flex items-center gap-2.5">
                <ReputationRing score={reg.on_chain_reputation_score} />
                <div>
                  <span className={`${tier.color} px-2.5 py-0.5 text-[12px] font-medium rounded-full inline-block`}>
                    {tier.label}
                  </span>
                </div>
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 text-[12px] bg-[#dbeafe] text-[#1d4ed8] px-3 py-1.5 font-medium rounded-full">
              <BaseIcon size={14} />
              Base
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
