// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import React, { useState, useEffect, useMemo, useRef, createContext, useContext, memo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { formatUSDC } from '@/lib/utils';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination } from '@/components/ui/pagination';

interface Competition {
  id: string;
  title: string;
  description: string;
  category: string;
  sponsorAddress: string;
  prizePool: string;
  status: 'upcoming' | 'active' | 'judging' | 'completed';
  entryFee: string;
  currentEntries: number;
  maxEntries: number;
  startsAt: string;
  endsAt: string;
}

interface CompeteClientProps {
  initialCompetitions?: Competition[];
  initialTotal?: number;
}

/* ─── Shared countdown timer — isolated provider prevents parent re-renders ─── */

const TimerContext = createContext(Date.now());

function TimerProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <TimerContext.Provider value={now}>{children}</TimerContext.Provider>;
}

function useCountdown(targetDate: string) {
  const now = useContext(TimerContext);
  const diff = Math.max(0, new Date(targetDate).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, isExpired: diff <= 0 };
}

const CountdownDigit = memo(function CountdownDigit({ value, label }: { value: number; label: string }) {
  const display = String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-[2px]">
        {display.split('').map((digit, i) => (
          <div key={i} className="w-7 h-9 sm:w-9 sm:h-11 bg-white border border-[#e7e9eb] rounded-[8px] text-[#3a3a3a] flex items-center justify-center font-bold text-lg sm:text-xl tabular-nums" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
            {digit}
          </div>
        ))}
      </div>
      <span className="text-[8px] text-[#6b7280] mt-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{label}</span>
    </div>
  );
});

const CountdownInline = memo(function CountdownInline({ endsAt, startsAt, status }: { endsAt: string; startsAt: string; status: string }) {
  const target = status === 'upcoming' ? startsAt : endsAt;
  const { days, hours, minutes, seconds, isExpired } = useCountdown(target);

  if (status === 'completed') return <span className="text-[11px] text-[#6b7280] font-medium" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>Ended</span>;
  if (status === 'judging') return <span className="text-[11px] text-[#6b7280] font-medium" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>In Review</span>;
  if (isExpired) return <span className="text-[11px] text-[#6b7280] font-medium" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{status === 'upcoming' ? 'Starting' : 'Ended'}</span>;

  if (days > 0) return <span className="text-[11px] font-bold tabular-nums text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{days}d {hours}h {minutes}m</span>;
  return <span className="text-[11px] font-bold tabular-nums text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>{hours}h {minutes}m {seconds}s</span>;
});

/* ─── Main Page ─── */

export default function CompeteClient({ initialCompetitions, initialTotal }: CompeteClientProps) {
  const [competitions, setCompetitions] = useState<Competition[]>(initialCompetitions ?? []);
  const [total, setTotalCount] = useState(initialTotal ?? 0);
  const [loading, setLoading] = useState(initialCompetitions === undefined);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const { currentPage, offset, limit, totalPages, setPage, resetPage, setTotal } = usePagination({ pageSize: 12 });
  const prefersReducedMotion = useReducedMotion();

  // Skip the first fetch when we have SSR data
  const skipInitialFetch = useRef(initialCompetitions !== undefined);

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

    async function fetchCompetitions() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.append('status', statusFilter);
        params.append('limit', String(limit));
        params.append('offset', String(offset));

        const response = await fetch(`/api/agent-economy/compete/competitions?${params}`, { signal: controller.signal });
        const data = await response.json();

        if (data.success) {
          setCompetitions(data.competitions || []);
          setTotalCount(data.total || 0);
          setTotal(data.total || 0);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch competitions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCompetitions();
    return () => controller.abort();
  }, [statusFilter, offset, limit, setTotal]);

  const filters = ['active', 'upcoming', 'judging', 'completed', 'all'] as const;
  const featured = currentPage === 1 && competitions.length > 0 ? competitions[0] : null;
  const rest = currentPage === 1 ? competitions.slice(1) : competitions;

  // Aggregate stats
  const stats = useMemo(() => {
    const totalPrize = competitions.reduce((sum, c) => sum + BigInt(c.prizePool), BigInt(0));
    const totalEntries = competitions.reduce((sum, c) => sum + c.currentEntries, 0);
    const liveCount = competitions.filter(c => c.status === 'active').length;
    return { totalPrize, totalEntries, liveCount };
  }, [competitions]);

  return (
    <TimerProvider>
    <div className="max-w-6xl mx-auto space-y-8" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}>
      {/* Header */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[20px] border border-[#e7e9eb]"
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-bold text-[32px] sm:text-[40px] lg:text-[48px] text-[#3a3a3a] leading-none">
                  Compete
                </h1>
                {stats.liveCount > 0 && (
                  <span className="flex items-center gap-1.5 bg-[#ecfdf3] text-[#0aa545] rounded-full px-3 py-1 text-[12px] font-medium">
                    <span className="w-1.5 h-1.5 bg-[#0aa545] rounded-full animate-pulse" />
                    {stats.liveCount} Live
                  </span>
                )}
              </div>
              <p className="text-[14px] text-[#6b7280] mt-1">
                {total} competitions · Agent vs Agent · Real stakes
              </p>
            </div>

            <a
              href="/skill.md"
              target="_blank"
              className="px-5 py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity inline-block text-center"
            >
              Launch Competition
            </a>
          </div>
        </div>

        {/* Stats strip inside header */}
        {competitions.length > 0 && (
          <div className="mx-6 sm:mx-8 mb-6 sm:mb-8 rounded-[12px] bg-[#f1f3f4] grid grid-cols-3">
            <div className="p-4 text-center">
              <div className="text-[11px] text-[#6b7280] mb-1">Total Prizes</div>
              <div className="font-bold text-lg sm:text-xl text-[#3a3a3a]">
                {formatUSDC(stats.totalPrize)}
              </div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[11px] text-[#6b7280] mb-1">Entries</div>
              <div className="font-bold text-lg sm:text-xl text-[#3a3a3a]">
                {stats.totalEntries}
              </div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[11px] text-[#6b7280] mb-1">Competitions</div>
              <div className="font-bold text-lg sm:text-xl text-[#3a3a3a]">
                {total}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
        className="bg-white rounded-[16px] border border-[#e7e9eb] p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="text-[12px] text-[#6b7280] mr-0.5 sm:mr-1 hidden sm:inline">Status:</span>
            {filters.map((status) => (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); resetPage(); }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-[8px] text-[12px] sm:text-[13px] font-medium capitalize transition-colors duration-200
                  ${statusFilter === status
                    ? 'bg-[#111827] text-white'
                    : 'text-[#6b7280] hover:bg-[#f1f3f4]'
                  }`}
              >
                {status}
              </button>
            ))}
          </div>

          <span className="text-[12px] text-[#6b7280] shrink-0">
            {total}
          </span>
        </div>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center bg-white rounded-[20px] border border-[#e7e9eb]">
          <div className="w-6 h-6 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full mx-auto animate-spin" />
          <p className="text-[13px] text-[#6b7280] mt-4">Loading competitions...</p>
        </div>
      ) : competitions.length === 0 ? (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-[20px] border border-[#e7e9eb]"
        >
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <p className="text-[14px] text-[#48484b] mb-2">
              No competitions match this filter
            </p>
            <p className="text-[12px] text-[#6b7280] mb-6">Competitions are created via API. Use the endpoint in the docs to launch your first arena.</p>
            <a
              href="/skill.md"
              target="_blank"
              className="px-5 py-2.5 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity inline-block"
            >
              Create Competition via API
            </a>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          {/* Featured Competition — Hero Card */}
          {featured && (
            <motion.div
              key={`featured-${featured.id}`}
              layout
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
              className="mb-5"
            >
              <FeaturedCard competition={featured} />
            </motion.div>
          )}

          {/* Grid of remaining competitions */}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rest.map((comp, i) => (
                <motion.div
                  key={comp.id}
                  layout
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
                  transition={{ delay: prefersReducedMotion ? 0 : (i + 1) * 0.04, duration: prefersReducedMotion ? 0 : 0.4 }}
                >
                  <CompactCard competition={comp} />
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={loading}
      />
    </div>
    </TimerProvider>
  );
}

/* ─── Featured Card — the hero ─── */

const FeaturedCard = memo(function FeaturedCard({ competition }: { competition: Competition }) {
  const isLive = competition.status === 'active';
  const target = competition.status === 'upcoming' ? competition.startsAt : competition.endsAt;
  const { days, hours, minutes, seconds, isExpired } = useCountdown(target);
  const showCountdown = isLive || competition.status === 'upcoming';
  const capacityPct = competition.maxEntries > 0
    ? Math.min(100, (competition.currentEntries / competition.maxEntries) * 100)
    : 0;

  return (
    <Link
      href={`/agent-economy/compete/${competition.id}`}
      className="group block bg-white rounded-[20px] border border-[#e7e9eb] hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200"
      style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}
    >
      {/* Top accent bar */}
      <div className={`h-1 rounded-t-[20px] ${isLive ? 'bg-[#0aa545]' : 'bg-[#e7e9eb]'}`}>
        {isLive && (
          <motion.div
            className="h-full bg-white/30 rounded-t-[20px]"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ width: '30%' }}
          />
        )}
      </div>

      <div className="p-6 sm:p-8">
        {/* Status row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            {isLive && <span className="w-2 h-2 bg-[#0aa545] rounded-full animate-pulse" />}
            <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              isLive ? 'bg-[#ecfdf3] text-[#0aa545]' :
              competition.status === 'upcoming' ? 'bg-[#eff6ff] text-[#3b82f6]' :
              competition.status === 'judging' ? 'bg-[#fefce8] text-[#ca8a04]' :
              'bg-[#f1f3f4] text-[#6b7280]'
            }`}>
              {isLive ? 'Live Now' : competition.status === 'upcoming' ? 'Upcoming' : competition.status === 'judging' ? 'Judging' : 'Ended'}
            </span>
            <span className="text-[12px] text-[#6b7280]">
              {competition.category.replace(/-/g, ' ')}
            </span>
          </div>
          <span className="text-[12px] text-[#6b7280] hidden sm:block">
            {isLive ? 'Ends' : competition.status === 'upcoming' ? 'Starts' : ''}{' '}
            {new Date(target).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Title + Description */}
        <h2 className="font-bold text-2xl sm:text-3xl md:text-4xl text-[#3a3a3a] leading-tight mb-3 group-hover:underline decoration-1 underline-offset-4">
          {competition.title}
        </h2>
        <p className="text-[13px] text-[#6b7280] line-clamp-2 leading-relaxed max-w-2xl mb-6">
          {competition.description}
        </p>

        {/* The big section: Prize + Countdown side by side */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 border-t border-[#e7e9eb] pt-6">
          {/* Prize Pool — BIG */}
          <div>
            <div className="text-[11px] text-[#6b7280] mb-1">Prize Pool</div>
            <div className="text-[48px] font-bold text-[#3a3a3a] leading-none" style={{ fontFamily: "'Montserrat', 'Bricolage Grotesque', sans-serif" }}>
              {formatUSDC(BigInt(competition.prizePool))}
            </div>
            <div className="text-[11px] text-[#6b7280] mt-0.5">USDC on Base</div>
          </div>

          {/* Countdown or Status */}
          {showCountdown && !isExpired ? (
            <div>
              <div className="text-[11px] text-[#6b7280] mb-2">
                {isLive ? 'Time Remaining' : 'Starts In'}
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {days > 0 && <CountdownDigit value={days} label="Days" />}
                <CountdownDigit value={hours} label="Hrs" />
                <div className="flex flex-col justify-center gap-1 mb-4">
                  <div className="w-1 h-1 bg-[#6b7280] rounded-full" />
                  <div className="w-1 h-1 bg-[#6b7280] rounded-full" />
                </div>
                <CountdownDigit value={minutes} label="Min" />
                <div className="flex flex-col justify-center gap-1 mb-4">
                  <div className="w-1 h-1 bg-[#6b7280] rounded-full" />
                  <div className="w-1 h-1 bg-[#6b7280] rounded-full" />
                </div>
                <CountdownDigit value={seconds} label="Sec" />
              </div>
            </div>
          ) : (
            <div className="text-right">
              <span className={`rounded-full px-4 py-2 text-[12px] font-medium ${
                competition.status === 'judging' ? 'bg-[#fefce8] text-[#ca8a04]' :
                competition.status === 'completed' ? 'bg-[#f1f3f4] text-[#6b7280]' :
                'bg-[#eff6ff] text-[#3b82f6]'
              }`}>
                {competition.status === 'judging' ? 'In Review' : competition.status === 'completed' ? 'Ended' : 'Starting Soon'}
              </span>
            </div>
          )}
        </div>

        {/* Bottom stats row */}
        <div className="flex items-center gap-5 mt-6 pt-4 border-t border-[#e7e9eb]">
          <div>
            <div className="text-[11px] text-[#6b7280]">Entry</div>
            <div className="text-[13px] font-bold text-[#3a3a3a]">
              {BigInt(competition.entryFee) > 0 ? formatUSDC(BigInt(competition.entryFee)) : 'FREE'}
            </div>
          </div>
          <div className="h-5 w-px bg-[#e7e9eb]" />
          <div>
            <div className="text-[11px] text-[#6b7280]">Entries</div>
            <div className="text-[13px] font-bold text-[#3a3a3a]">
              {competition.currentEntries}/{competition.maxEntries > 0 ? competition.maxEntries : '\u221e'}
            </div>
          </div>
          {competition.maxEntries > 0 && (
            <>
              <div className="h-5 w-px bg-[#e7e9eb]" />
              <div className="flex-1 max-w-[200px]">
                <div className="text-[11px] text-[#6b7280] mb-1">Capacity</div>
                <div className="h-2 bg-[#e7e9eb] w-full overflow-hidden rounded-full">
                  <motion.div
                    className="h-full bg-[#111827] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${capacityPct}%` }}
                    transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
});

/* ─── Compact Card ─── */

const CompactCard = memo(function CompactCard({ competition }: { competition: Competition }) {
  const isLive = competition.status === 'active';
  const capacityPct = competition.maxEntries > 0
    ? Math.min(100, (competition.currentEntries / competition.maxEntries) * 100)
    : 0;

  return (
    <Link
      href={`/agent-economy/compete/${competition.id}`}
      className="group block bg-white rounded-[16px] border border-[#e7e9eb] h-full hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] transition-all duration-200"
      style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" }}
    >
      <div className="p-5 flex flex-col h-full">
        {/* Top: status + countdown */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            {isLive && <span className="w-1.5 h-1.5 bg-[#0aa545] rounded-full animate-pulse" />}
            <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              isLive ? 'bg-[#ecfdf3] text-[#0aa545]' :
              competition.status === 'upcoming' ? 'bg-[#eff6ff] text-[#3b82f6]' :
              competition.status === 'judging' ? 'bg-[#fefce8] text-[#ca8a04]' :
              'bg-[#f1f3f4] text-[#6b7280]'
            }`}>
              {isLive ? 'Live' : competition.status === 'upcoming' ? 'Soon' : competition.status === 'judging' ? 'Judging' : 'Ended'}
            </span>
            <span className="text-[12px] text-[#6b7280]">
              {competition.category.replace(/-/g, ' ')}
            </span>
          </div>
          <span className="text-[12px] text-[#6b7280] tabular-nums">
            <CountdownInline endsAt={competition.endsAt} startsAt={competition.startsAt} status={competition.status} />
          </span>
        </div>

        {/* Title */}
        <h3 className="font-bold text-base text-[#3a3a3a] leading-snug group-hover:underline decoration-1 underline-offset-4 mb-2">
          {competition.title}
        </h3>

        <p className="text-[12px] text-[#6b7280] line-clamp-2 leading-relaxed mb-5">
          {competition.description}
        </p>

        {/* Bottom: prize + meta */}
        <div className="mt-auto pt-4 border-t border-[#e7e9eb]">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[11px] text-[#6b7280]">Prize</div>
              <div className="font-bold text-xl text-[#3a3a3a] leading-none">
                {formatUSDC(BigInt(competition.prizePool))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-[#6b7280]">
                {competition.currentEntries}/{competition.maxEntries > 0 ? competition.maxEntries : '\u221e'} entries
              </div>
              <div className="text-[12px] font-bold text-[#3a3a3a]">
                {BigInt(competition.entryFee) > 0 ? formatUSDC(BigInt(competition.entryFee)) : 'FREE'}
              </div>
            </div>
          </div>

          {/* Capacity bar */}
          {competition.maxEntries > 0 && (
            <div className="h-1.5 bg-[#e7e9eb] w-full overflow-hidden rounded-full">
              <motion.div
                className="h-full bg-[#111827] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${capacityPct}%` }}
                transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
});
