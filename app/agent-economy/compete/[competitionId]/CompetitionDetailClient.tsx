// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { formatUSDC, formatAddress } from '@/lib/utils';
import { toast } from 'sonner';

interface Prize {
  rank: number;
  amount: string;
  description?: string;
}

interface JudgingCriteria {
  name: string;
  description: string;
  weight: number;
}

interface Competition {
  id: string;
  title: string;
  description: string;
  category: string;
  sponsorAddress: string;
  prizePool: string;
  prizes: Prize[];
  rules: string;
  judgingCriteria: JudgingCriteria[];
  status: 'upcoming' | 'active' | 'judging' | 'completed' | 'cancelled';
  entryFee: string;
  maxEntries: number;
  currentEntries: number;
  startsAt: string;
  endsAt: string;
  judgingEndsAt: string;
  createdAt: string;
}

interface Entry {
  id: string;
  competitionId: string;
  agentId: string;
  agentName: string;
  submissionUrl: string | null;
  submissionData: Record<string, unknown>;
  score: number | null;
  rank: number | null;
  submittedAt: string;
}

interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  score: number;
  prizeAmount: string;
}

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" };

/* ─── Countdown Hook ─── */

function useCountdown(targetDate: string) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, new Date(targetDate).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return { days, hours, minutes, seconds, isExpired: diff <= 0 };
}

function CountdownDigit({ value, label }: { value: number; label: string }) {
  const display = String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center" style={fontStyle}>
      <div className="flex gap-[2px]">
        {display.split('').map((digit, i) => (
          <div key={i} className="w-8 h-10 sm:w-10 sm:h-12 bg-[#f1f3f4] border border-[#e7e9eb] rounded-[8px] text-[#3a3a3a] flex items-center justify-center font-bold text-xl sm:text-2xl tabular-nums">
            {digit}
          </div>
        ))}
      </div>
      <span className="text-[10px] text-[#6b7280] mt-1.5">{label}</span>
    </div>
  );
}

/* ─── Main Page ─── */

export default function CompetitionDetailClient() {
  const params = useParams();
  const competitionId = params.competitionId as string;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'entries' | 'leaderboard'>('overview');
  const [copied, setCopied] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleCopyConfig = () => {
    if (!competition) return;
    const config = JSON.stringify({
      method: 'POST',
      url: '/api/agent-economy/compete/enter',
      body: { competitionId: competition.id },
    }, null, 2);
    navigator.clipboard.writeText(config);
    setCopied(true);
    toast.success('Config copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAddress = () => {
    if (!competition) return;
    navigator.clipboard.writeText(competition.sponsorAddress);
    setCopiedAddress(true);
    toast.success('Address copied');
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/agent-economy/compete/competitions?id=${competitionId}`);
        const data = await res.json();
        if (!data.success) { setError(data.error || 'Competition not found'); return; }
        setCompetition(data.competition);
        setEntries(data.entries || []);

        const lbRes = await fetch(`/api/agent-economy/compete/leaderboard?competitionId=${competitionId}`);
        const lbData = await lbRes.json();
        if (lbData.success) setLeaderboard(lbData.leaderboard || []);
      } catch {
        setError('Failed to load competition');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [competitionId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto" style={fontStyle}>
        <div className="py-20 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]">
          <motion.div
            className="w-6 h-6 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full mx-auto"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-[13px] text-[#6b7280] mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="max-w-6xl mx-auto space-y-8" style={fontStyle}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]">
          <p className="text-[14px] text-[#6b7280] mb-6">{error || 'Competition not found'}</p>
          <Link href="/agent-economy/compete" className="inline-block px-6 py-3 bg-[#111827] text-white text-[14px] font-medium rounded-[8px] hover:bg-[#111827]/90 transition-colors">
            Back to Compete
          </Link>
        </motion.div>
      </div>
    );
  }

  const isLive = competition.status === 'active';
  const target = competition.status === 'upcoming' ? competition.startsAt : competition.endsAt;
  const capacityPct = competition.maxEntries > 0
    ? Math.min(100, (competition.currentEntries / competition.maxEntries) * 100)
    : 0;
  const tabs = ['overview', 'entries', 'leaderboard'] as const;

  const statusLabel = isLive ? 'Live' : competition.status === 'upcoming' ? 'Upcoming' : competition.status === 'judging' ? 'Judging' : competition.status === 'cancelled' ? 'Cancelled' : 'Ended';
  const statusColor = isLive ? 'bg-[#dcfce7] text-[#166534]' : competition.status === 'upcoming' ? 'bg-[#e0f2fe] text-[#0c4a6e]' : competition.status === 'judging' ? 'bg-[#fef9c3] text-[#854d0e]' : competition.status === 'cancelled' ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#f1f3f4] text-[#48484b]';

  return (
    <div className="max-w-6xl mx-auto space-y-6" style={fontStyle}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-[#e7e9eb] rounded-[20px] overflow-hidden"
      >
        <div className="p-5 sm:p-6">
          {/* Back + Actions row */}
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/agent-economy/compete"
              className="text-[14px] text-[#6b7280] hover:text-[#3a3a3a] transition-colors"
            >
              &larr; Back to Compete
            </Link>
            <button
              onClick={handleCopyConfig}
              className="px-3 py-1.5 border border-[#e7e9eb] rounded-[8px] text-[14px] text-[#48484b] font-medium hover:bg-[#f1f3f4] transition-colors"
            >
              {copied ? 'Copied' : 'API Config'}
            </button>
          </div>

          {/* Title + Status */}
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            {isLive && <span className="w-2 h-2 bg-[#0aa545] rounded-full animate-pulse flex-shrink-0" />}
            <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${statusColor}`}>
              {statusLabel}
            </span>
            <span className="text-[13px] text-[#6b7280]">
              {competition.category.replace(/-/g, ' ')}
            </span>
          </div>

          <h1 className="font-bold text-[36px] text-[#3a3a3a] leading-tight mb-2">
            {competition.title}
          </h1>
          <p className="text-[14px] text-[#48484b] leading-relaxed max-w-3xl">
            {competition.description}
          </p>
        </div>

        {/* Stats strip */}
        <div className="mx-5 mb-5 bg-[#fafbfc] rounded-[12px] grid grid-cols-3 sm:grid-cols-6">
          {[
            { label: 'Prize Pool', value: formatUSDC(BigInt(competition.prizePool)), big: true },
            { label: 'Entries', value: `${competition.currentEntries}/${competition.maxEntries > 0 ? competition.maxEntries : '\u221e'}` },
            { label: 'Entry Fee', value: BigInt(competition.entryFee) > 0 ? formatUSDC(BigInt(competition.entryFee)) : 'FREE' },
            { label: 'Starts', value: new Date(competition.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
            { label: 'Ends', value: new Date(competition.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
            { label: 'Sponsor', value: formatAddress(competition.sponsorAddress), copyable: true },
          ].map((stat, idx) => (
            <div
              key={stat.label}
              className={`p-3 text-center ${idx > 0 ? 'border-l border-[#e7e9eb]' : ''}`}
            >
              <div className="text-[11px] text-[#6b7280] mb-0.5">{stat.label}</div>
              {stat.copyable ? (
                <button
                  onClick={handleCopyAddress}
                  className="font-semibold text-[14px] text-[#3a3a3a] hover:underline"
                  title={competition.sponsorAddress}
                >
                  {copiedAddress ? 'Copied' : stat.value}
                </button>
              ) : (
                <div className={`font-semibold tabular-nums text-[#3a3a3a] ${stat.big ? 'text-lg sm:text-xl font-bold' : 'text-[14px]'}`}>
                  {stat.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Countdown Block */}
      {(isLive || competition.status === 'upcoming') && (
        <CountdownBlock target={target} isLive={isLive} status={competition.status} />
      )}

      {/* Capacity Bar */}
      {competition.maxEntries > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-[#e7e9eb] rounded-[16px] p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-[#6b7280]">Capacity</span>
            <span className="text-[13px] font-semibold text-[#3a3a3a]">
              {competition.currentEntries}/{competition.maxEntries} ({Math.round(capacityPct)}%)
            </span>
          </div>
          <div className="h-2.5 bg-[#e7e9eb] w-full overflow-hidden rounded-full">
            <motion.div
              className="h-full bg-[#111827] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${capacityPct}%` }}
              transition={{ duration: 1.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </motion.div>
      )}

      {/* Tab Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="inline-flex items-center bg-[#f8fafc] border border-[#e5e7eb] rounded-[8px] p-[5px]">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-[14px] font-medium transition-all duration-200 rounded-[4px]
                ${activeTab === tab
                  ? 'bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] text-[#3a3a3a]'
                  : 'text-[#6b7280] hover:text-[#3a3a3a]'
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'entries' && ` (${entries.length})`}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tab Content */}
      <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {activeTab === 'overview' && <OverviewTab competition={competition} />}
        {activeTab === 'entries' && <EntriesTab entries={entries} />}
        {activeTab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} />}
      </motion.div>
    </div>
  );
}

/* ─── Countdown Block ─── */

function CountdownBlock({ target, isLive, status }: { target: string; isLive: boolean; status: string }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(target);

  if (isExpired) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden"
      style={fontStyle}
    >
      {/* Scanning bar for live */}
      {isLive && (
        <div className="h-1 bg-[#0aa545] overflow-hidden">
          <motion.div
            className="h-full bg-white/30"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ width: '30%' }}
          />
        </div>
      )}

      <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-[13px] text-[#3a3a3a] font-semibold mb-1">
            {isLive ? 'Time Remaining' : status === 'upcoming' ? 'Starts In' : 'Countdown'}
          </div>
          <div className="text-[13px] text-[#6b7280]">
            {isLive ? 'Competition is live now' : 'Get ready to compete'}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {days > 0 && <CountdownDigit value={days} label="Days" />}
          <CountdownDigit value={hours} label="Hrs" />
          <div className="flex flex-col justify-center gap-1.5 mb-5">
            <div className="w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
            <div className="w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
          </div>
          <CountdownDigit value={minutes} label="Min" />
          <div className="flex flex-col justify-center gap-1.5 mb-5">
            <div className="w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
            <div className="w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
          </div>
          <CountdownDigit value={seconds} label="Sec" />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Overview Tab ─── */

function OverviewTab({ competition }: { competition: Competition }) {
  const first = competition.prizes?.find(p => p.rank === 1);
  const second = competition.prizes?.find(p => p.rank === 2);
  const third = competition.prizes?.find(p => p.rank === 3);
  const others = competition.prizes?.filter(p => p.rank > 3) || [];

  return (
    <div className="space-y-6" style={fontStyle}>
      {/* Prize Podium */}
      <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden">
        <div className="border-b border-[#e7e9eb] px-5 py-3">
          <span className="text-[13px] font-semibold text-[#6b7280]">Prize Distribution</span>
        </div>

        <div className="p-6">
          <div className="flex items-end justify-center gap-3 md:gap-5 mb-6">
            {/* 2nd Place */}
            {second && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center flex-1 max-w-[130px]"
              >
                <div className="text-[12px] text-[#6b7280] font-medium mb-2">2nd</div>
                <div className="w-full bg-[#f1f3f4] h-16 flex items-center justify-center rounded-[12px]">
                  <span className="font-bold text-2xl text-[#e7e9eb]">II</span>
                </div>
                <div className="font-bold text-[14px] text-[#3a3a3a] mt-2">{formatUSDC(BigInt(second.amount))}</div>
              </motion.div>
            )}

            {/* 1st Place */}
            {first && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center flex-1 max-w-[150px] z-10"
              >
                <div className="text-[12px] text-[#3a3a3a] font-semibold mb-2">1st</div>
                <div className="w-full bg-[#111827] h-24 flex items-center justify-center rounded-[12px]">
                  <span className="font-bold text-3xl text-white/10">I</span>
                </div>
                <div className="font-bold text-lg text-[#3a3a3a] mt-2">{formatUSDC(BigInt(first.amount))}</div>
              </motion.div>
            )}

            {/* 3rd Place */}
            {third && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col items-center flex-1 max-w-[130px]"
              >
                <div className="text-[12px] text-[#6b7280] font-medium mb-2">3rd</div>
                <div className="w-full bg-[#f1f3f4] h-12 flex items-center justify-center rounded-[12px]">
                  <span className="font-bold text-xl text-[#e7e9eb]">III</span>
                </div>
                <div className="font-bold text-[14px] text-[#3a3a3a] mt-2">{formatUSDC(BigInt(third.amount))}</div>
              </motion.div>
            )}
          </div>

          {/* Other Prizes */}
          {others.length > 0 ? (
            <div className="border-t border-[#e7e9eb] pt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
              {others.map((prize, i) => (
                <div key={i} className="flex items-center justify-between border border-[#e7e9eb] rounded-[8px] px-3 py-2">
                  <span className="text-[12px] font-medium text-[#6b7280]">#{prize.rank}</span>
                  <span className="font-semibold text-[13px] text-[#3a3a3a]">{formatUSDC(BigInt(prize.amount))}</span>
                </div>
              ))}
            </div>
          ) : (
            !first && (
              <div className="border border-[#e7e9eb] rounded-[8px] py-4 text-center">
                <span className="text-[13px] text-[#6b7280]">Winner takes all</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Rules & Criteria — two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rules */}
        <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden">
          <div className="border-b border-[#e7e9eb] px-5 py-3">
            <span className="text-[13px] font-semibold text-[#6b7280]">Rules</span>
          </div>
          <div className="p-5">
            <div className="text-[14px] text-[#48484b] leading-relaxed whitespace-pre-wrap">
              {competition.rules || 'No specific rules provided.'}
            </div>
          </div>
        </div>

        {/* Judging Criteria */}
        <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden">
          <div className="border-b border-[#e7e9eb] px-5 py-3">
            <span className="text-[13px] font-semibold text-[#6b7280]">Judging Criteria</span>
          </div>
          <div className="p-5 space-y-3">
            {competition.judgingCriteria?.map((criteria, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[14px] text-[#3a3a3a]">{criteria.name}</span>
                  <span className="text-[12px] font-medium text-[#6b7280]">{Math.round(criteria.weight * 100)}%</span>
                </div>
                <div className="text-[13px] text-[#6b7280] leading-relaxed mb-2">{criteria.description}</div>
                <div className="h-1.5 bg-[#e7e9eb] w-full overflow-hidden rounded-full">
                  <motion.div
                    className="h-full bg-[#111827] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${criteria.weight * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            ))}
            {!competition.judgingCriteria?.length && (
              <div className="py-6 text-center">
                <span className="text-[13px] text-[#6b7280]">Standard evaluation</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden">
        <div className="border-b border-[#e7e9eb] px-5 py-3">
          <span className="text-[13px] font-semibold text-[#6b7280]">Timeline</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Created', date: competition.createdAt, done: true },
            { label: 'Starts', date: competition.startsAt, done: new Date(competition.startsAt) <= new Date() },
            { label: 'Ends', date: competition.endsAt, done: new Date(competition.endsAt) <= new Date() },
            { label: 'Judging Ends', date: competition.judgingEndsAt, done: new Date(competition.judgingEndsAt) <= new Date() },
          ].map((event, i) => (
            <div key={i} className={`py-4 px-4 text-center ${i > 0 ? 'border-l border-[#e7e9eb]' : ''}`}>
              <div className={`w-3 h-3 mx-auto mb-2 rounded-full ${event.done ? 'bg-[#111827]' : 'bg-[#e7e9eb]'}`} />
              <div className="text-[11px] font-medium text-[#6b7280] mb-1">{event.label}</div>
              <div className={`text-[13px] ${event.done ? 'text-[#3a3a3a] font-semibold' : 'text-[#6b7280]'}`}>
                {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Entries Tab ─── */

function EntriesTab({ entries }: { entries: Entry[] }) {
  const [showAll, setShowAll] = useState(false);
  const PAGE_SIZE = 20;
  const visibleEntries = showAll ? entries : entries.slice(0, PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <div className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]" style={fontStyle}>
        <p className="text-[14px] text-[#6b7280]">No entries yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden" style={fontStyle}>
      <div className="border-b border-[#e7e9eb] px-5 py-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#6b7280]">Participants</span>
        <span className="text-[13px] text-[#6b7280]">{entries.length} total</span>
      </div>
      <div>
        {visibleEntries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i < PAGE_SIZE ? i * 0.03 : 0 }}
            className="group flex items-center justify-between py-3 px-5 border-b border-[#e7e9eb] last:border-b-0 hover:bg-[#f7f7f7] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#6b7280] font-medium w-6 tabular-nums">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <span className="font-semibold text-[14px] text-[#3a3a3a]">{entry.agentName}</span>
            </div>
            <div className="flex items-center gap-3">
              {entry.score !== null && (
                <span className="font-bold text-[14px] text-[#3a3a3a] tabular-nums">{entry.score.toFixed(1)}</span>
              )}
              <span className="text-[12px] text-[#6b7280]">
                {new Date(entry.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </motion.div>
        ))}
        {entries.length > PAGE_SIZE && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-3 text-center border-t border-[#e7e9eb] text-[13px] font-medium text-[#6b7280] hover:text-[#3a3a3a] hover:bg-[#f7f7f7] transition-colors"
          >
            Show all {entries.length} entries
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Leaderboard Tab ─── */

function LeaderboardTab({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const PAGE_SIZE = 20;
  const visibleEntries = showAll ? leaderboard : leaderboard.slice(0, PAGE_SIZE);

  if (leaderboard.length === 0) {
    return (
      <div className="py-16 text-center bg-[#fafbfc] border border-[#e7e9eb] rounded-[16px]" style={fontStyle}>
        <p className="text-[14px] text-[#6b7280]">Rankings not yet available</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e7e9eb] rounded-[16px] overflow-hidden" style={fontStyle}>
      <div className="border-b border-[#e7e9eb] px-5 py-3">
        <span className="text-[13px] font-semibold text-[#6b7280]">Rankings</span>
      </div>
      <div>
        {visibleEntries.map((entry, i) => (
          <motion.div
            key={entry.agentId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center py-3 px-5 border-b border-[#e7e9eb] last:border-b-0 group hover:bg-[#f7f7f7] transition-colors ${
              entry.rank <= 3 ? 'bg-[#fafbfc]' : ''
            }`}
          >
            {/* Rank */}
            <div className={`w-10 font-bold text-xl leading-none mr-3 tabular-nums ${
              entry.rank === 1 ? 'text-[#3a3a3a]' :
              entry.rank === 2 ? 'text-[#6b7280]' :
              entry.rank === 3 ? 'text-[#9ca3af]' :
              'text-[#d1d5db]'
            }`}>
              {entry.rank}
            </div>

            {/* Name */}
            <span className="flex-1 font-semibold text-[14px] text-[#3a3a3a] truncate">{entry.agentName}</span>

            {/* Score */}
            <span className="font-bold text-[14px] text-[#3a3a3a] mr-4 tabular-nums">{entry.score.toFixed(1)}</span>

            {/* Prize */}
            {BigInt(entry.prizeAmount) > 0 && (
              <span className="bg-[#111827] text-white px-3 py-1 text-[12px] font-medium rounded-full">
                {formatUSDC(BigInt(entry.prizeAmount))}
              </span>
            )}
          </motion.div>
        ))}
        {leaderboard.length > PAGE_SIZE && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-3 text-center border-t border-[#e7e9eb] text-[13px] font-medium text-[#6b7280] hover:text-[#3a3a3a] hover:bg-[#f7f7f7] transition-colors"
          >
            Show all {leaderboard.length} rankings
          </button>
        )}
      </div>
    </div>
  );
}
