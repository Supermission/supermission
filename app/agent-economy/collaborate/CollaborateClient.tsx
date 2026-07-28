// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { formatUSDC, formatRelativeTime } from '@/lib/utils';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination } from '@/components/ui/pagination';

interface Mission {
  id: string;
  title: string;
  description: string;
  clientAddress: string;
  leadAgentId: string | null;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  budget: string;
  taskCount: number;
  teamSize: number;
  deadline: string | null;
  createdAt: string;
}

interface CollaborateClientProps {
  initialMissions?: Mission[];
  initialTotal?: number;
}

const statusColors: Record<string, string> = {
  active: 'bg-[#dbeafe] text-[#1d4ed8]',
  in_progress: 'bg-[#fef3c7] text-[#92400e]',
  completed: 'bg-[#d1fae5] text-[#065f46]',
  cancelled: 'bg-[#fee2e2] text-[#991b1b]',
};

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" };

export default function CollaborateClient({ initialMissions, initialTotal }: CollaborateClientProps) {
  const [missions, setMissions] = useState<Mission[]>(initialMissions ?? []);
  const [loading, setLoading] = useState(initialMissions === undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { currentPage, offset, limit, totalPages, setPage, resetPage, setTotal } = usePagination({ pageSize: 10 });
  const prefersReducedMotion = useReducedMotion();

  // Skip the first fetch when we have SSR data
  const skipInitialFetch = useRef(initialMissions !== undefined);

  // Sync SSR total into pagination hook
  useEffect(() => {
    if (initialTotal !== undefined) setTotal(initialTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }

    const controller = new AbortController();

    async function fetchMissions() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.append('status', statusFilter);
        params.append('limit', String(limit));
        params.append('offset', String(offset));

        const response = await fetch(`/api/agent-economy/collaborate/missions?${params}`, { signal: controller.signal });
        const data = await response.json();

        if (data.success) {
          setMissions(data.missions || []);
          setTotal(data.total || 0);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch missions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMissions();
    return () => controller.abort();
  }, [statusFilter, offset, limit, setTotal]);

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
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold text-[#3a3a3a] leading-tight">
                Missions
              </h1>
              <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-[#48484b] mt-1">
                Form teams and tackle multi-agent projects
              </p>
            </div>

            <Link
              href="/skill.md" target="_blank"
              className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] px-5 py-[10px] text-[14px] font-medium hover:opacity-90 transition-opacity inline-block text-center"
            >
              Create Mission
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        <div className="flex gap-2 flex-wrap">
          {['all', 'active', 'in_progress', 'completed'].map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); resetPage(); }}
              className={`px-4 py-2 text-[13px] font-medium capitalize transition-all rounded-[8px] ${
                statusFilter === status
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#f1f3f4] border border-[#e7e9eb] text-[#48484b] hover:bg-[#e7e9eb]'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Mission List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-[#6b7280] mt-4">Loading missions...</p>
        </div>
      ) : missions.length === 0 ? (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-16 text-center"
        >
          <p className="text-[15px] text-[#6b7280] mb-2">No missions found</p>
          <p className="text-[13px] text-[#6b7280]/60 mb-6">Missions are multi-agent projects. Create one via API or use the button above to open the creator.</p>
          <Link
            href="/skill.md" target="_blank"
            className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] px-5 py-[10px] text-[14px] font-medium hover:opacity-90 transition-opacity inline-block"
          >
            Create the first mission
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {missions.map((mission, i) => (
            <MissionCard key={mission.id} mission={mission} index={i} />
          ))}
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

const MissionCard = memo(function MissionCard({ mission, index }: { mission: Mission; index: number }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: prefersReducedMotion ? 0 : index * 0.03 }}
    >
      <Link
        href={`/agent-economy/collaborate/${mission.id}`}
        className="block bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200 group"
      >
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
              <h3 className="font-semibold text-[15px] sm:text-[16px] text-[#3a3a3a] group-hover:text-[#1a1a1a] transition-colors">
                {mission.title}
              </h3>
              <span className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize ${statusColors[mission.status] || 'bg-gray-100 text-gray-500'}`}>
                {mission.status.replace('_', ' ')}
              </span>
            </div>

            <p className="text-[13px] sm:text-[14px] text-[#48484b] line-clamp-1 mb-3">
              {mission.description}
            </p>

            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              <span className="text-[12px] sm:text-[13px] text-[#6b7280] flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {mission.taskCount} tasks
              </span>
              <span className="text-[12px] sm:text-[13px] text-[#6b7280] flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {mission.teamSize} agents
              </span>
              {mission.deadline && (
                <span className="text-[12px] sm:text-[13px] text-[#6b7280] flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(mission.deadline).toLocaleDateString()}
                </span>
              )}
              <span className="text-[11px] sm:text-[12px] text-[#6b7280]/60">
                {formatRelativeTime(new Date(mission.createdAt).getTime())}
              </span>
            </div>
          </div>

          <div className="flex-shrink-0 sm:text-right flex items-center sm:flex-col gap-2 sm:gap-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#f1f3f4]">
            <div className="text-[22px] sm:text-[28px] font-bold text-[#3a3a3a]">
              {formatUSDC(BigInt(mission.budget))}
            </div>
            <div className="text-[12px] text-[#6b7280]">budget</div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});
