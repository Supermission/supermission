import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface ProbabilityBarProps {
  yesPercent: number;
  noPercent: number;
  isYesRecommended: boolean;
  isLive?: boolean;
}

export function ProbabilityBar({
  yesPercent,
  noPercent,
  isYesRecommended,
  isLive
}: ProbabilityBarProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#6b7280]">Odds</span>
        {isLive && (
          <span className="flex items-center gap-1 text-[9px] font-semibold text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div className="relative h-5 overflow-hidden bg-black/10 flex border border-[#e5e7eb] rounded-md">
        <motion.div
          className={`h-full ${isYesRecommended ? 'bg-black' : 'bg-black/20'}`}
          initial={{ width: 0 }}
          animate={{ width: `${yesPercent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
        <motion.div
          className={`h-full ${!isYesRecommended ? 'bg-black' : 'bg-black/20'}`}
          initial={{ width: 0 }}
          animate={{ width: `${noPercent}%` }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
        />
      </div>
      <div className="flex justify-between text-[11px] font-mono font-bold">
        <span className={isYesRecommended ? 'text-green-700' : 'text-black/40'}>YES {yesPercent}%</span>
        <span className={!isYesRecommended ? 'text-red-700' : 'text-black/40'}>NO {noPercent}%</span>
      </div>
    </div>
  );
}

interface Insight {
  stat: string;
  source: string;
  summary: string;
}

interface InsightItemProps {
  insight: Insight;
}

export function InsightItem({ insight }: InsightItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasMeaningfulStat = insight.stat && /[\d%$]/.test(insight.stat);
  const displayStat = hasMeaningfulStat
    ? insight.stat
    : insight.summary.toUpperCase();

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-baseline gap-2 min-w-0 flex-1">
          <span className="font-mono text-sm font-black text-[#3a3a3a] leading-tight">{displayStat}</span>
          <span className="text-[9px] font-semibold text-[#6b7280] flex-shrink-0">{insight.source}</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-black/40 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <p className="font-mono text-[11px] text-black/70 leading-snug mt-1.5 pl-0.5">
          {insight.summary}
        </p>
      </motion.div>
    </div>
  );
}

interface KeyInsightsSectionProps {
  deal: any;
}

export function KeyInsightsSection({ deal }: KeyInsightsSectionProps) {
  const hasInsights = (deal.parsed_insights && deal.parsed_insights.length > 0) ||
    (deal.key_findings && deal.key_findings.length > 0);

  if (!hasInsights) return null;

  return (
    <div className="border-t border-[#e5e7eb] bg-white">
      <div className="px-5 py-2 bg-white border-b border-[#e5e7eb]">
        <span className="text-[11px] font-semibold text-[#6b7280]">Key Insights</span>
      </div>
      {deal?.parsed_insights?.length > 0 ? (
        <div className="divide-y divide-black/10">
          {deal.parsed_insights.slice(0, 3).map((insight: Insight, i: number) => (
            <InsightItem key={i} insight={insight} />
          ))}
        </div>
      ) : deal?.key_findings?.length > 0 ? (
        <div className="px-5 py-4 space-y-1.5">
          {deal.key_findings.slice(0, 3).map((finding: string, i: number) => (
            <p key={i} className="font-mono text-[11px] text-black/70 leading-snug">
              • {truncateText(finding, 75)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace === -1) return truncated + '...';
  return truncated.slice(0, lastSpace) + '...';
}