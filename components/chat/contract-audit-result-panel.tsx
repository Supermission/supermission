'use client';

import { generateMarkdownReport, generateAIMarkdownSection } from '@/lib/new-agents/contractAudit/helpers/reportGenerator';
import { ContractAuditResponse, AuditFinding, IssueSeverity, RiskLevel, AuditRecommendation, AIAuditReport } from '@/lib/new-agents/contractAudit/types';
import React, { useState, useEffect } from 'react';

interface ContractAuditResultData extends ContractAuditResponse {
  aiReport?: AIAuditReport | null;
}

// Severity configuration with visual hierarchy
function getSeverityConfig(severity: IssueSeverity) {
  switch (severity) {
    case 'CRITICAL': return {
      bg: 'bg-red-600',
      text: 'text-white',
      border: 'border-l-red-600',
      dot: 'bg-red-600',
      label: 'CRITICAL',
      glow: 'shadow-[0_0_8px_rgba(220,38,38,0.4)]'
    };
    case 'HIGH': return {
      bg: 'bg-orange-500',
      text: 'text-white',
      border: 'border-l-orange-500',
      dot: 'bg-orange-500',
      label: 'HIGH',
      glow: 'shadow-[0_0_8px_rgba(249,115,22,0.3)]'
    };
    case 'MEDIUM': return {
      bg: 'bg-amber-400',
      text: 'text-[#3a3a3a]',
      border: 'border-l-amber-400',
      dot: 'bg-amber-400',
      label: 'MEDIUM',
      glow: ''
    };
    case 'LOW': return {
      bg: 'bg-sky-500',
      text: 'text-white',
      border: 'border-l-sky-500',
      dot: 'bg-sky-500',
      label: 'LOW',
      glow: ''
    };
    case 'INFORMATIONAL': return {
      bg: 'bg-slate-300',
      text: 'text-slate-700',
      border: 'border-l-slate-300',
      dot: 'bg-slate-400',
      label: 'INFO',
      glow: ''
    };
    default: return {
      bg: 'bg-slate-300',
      text: 'text-slate-700',
      border: 'border-l-slate-300',
      dot: 'bg-slate-400',
      label: 'INFO',
      glow: ''
    };
  }
}

function getRiskStyle(level?: RiskLevel | string) {
  switch (level) {
    case 'LOW': return 'bg-emerald-600 text-white';
    case 'MEDIUM': return 'bg-amber-500 text-[#3a3a3a]';
    case 'HIGH': return 'bg-orange-500 text-white';
    case 'CRITICAL': return 'bg-red-600 text-white';
    default: return 'bg-slate-400 text-white';
  }
}

function getRecStyle(rec?: AuditRecommendation) {
  switch (rec) {
    case 'SAFE': return 'bg-emerald-600 text-white';
    case 'CAUTION': return 'bg-amber-500 text-[#3a3a3a]';
    case 'WARNING': return 'bg-orange-500 text-white';
    case 'AVOID': return 'bg-red-600 text-white';
    default: return 'bg-slate-500 text-white';
  }
}

// Circular score gauge with animation - color based on risk level
function ScoreGauge({ score, riskLevel, size = 'md' }: { score: number; riskLevel?: RiskLevel | string; size?: 'sm' | 'md' }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Color based on risk level, not score
  const getColor = () => {
    switch (riskLevel) {
      case 'LOW': return { stroke: '#059669', text: 'text-emerald-600' };
      case 'MEDIUM': return { stroke: '#d97706', text: 'text-amber-600' };
      case 'HIGH': return { stroke: '#ea580c', text: 'text-orange-500' };
      case 'CRITICAL': return { stroke: '#dc2626', text: 'text-red-600' };
      default: return { stroke: '#6b7280', text: 'text-slate-500' };
    }
  };

  const colors = getColor();
  const dimensions = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  const fontSize = size === 'sm' ? 'text-sm' : 'text-lg';

  return (
    <div className={`relative ${dimensions}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-mono font-black ${fontSize} ${colors.text}`}>
        {clampedScore}
      </div>
    </div>
  );
}

// Code snippet with line numbers
function CodeSnippet({ code, line }: { code: string; line?: number }) {
  if (!code) return null;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] overflow-hidden rounded-[8px]">
      <div className="flex">
        {line && (
          <div className="px-3 py-2 bg-[#161b22] border-r border-[#30363d] select-none">
            <span className="font-mono text-[10px] text-[#484f58]">{line}</span>
          </div>
        )}
        <pre className="flex-1 px-3 py-2 font-mono text-[10px] text-[#c9d1d9] overflow-x-auto whitespace-pre-wrap break-all">
          {code}
        </pre>
      </div>
    </div>
  );
}

// Individual finding card
function FindingCard({
  finding,
  isExpanded,
  onToggle
}: {
  finding: AuditFinding;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = getSeverityConfig(finding.severity);

  return (
    <div className={`border-l-4 ${config.border} bg-white border border-l-0 border-[#e5e7eb]/60 rounded-[12px] ${config.glow}`}>
      <button
        onClick={onToggle}
        className="w-full text-left group"
      >
        <div className="p-3 hover:bg-[#f7f7f7] transition-colors">
          <div className="flex items-start gap-3">
            {/* Severity badge */}
            <span className={`shrink-0 px-2 py-1 font-mono text-[10px] font-black tracking-wide rounded-[6px] ${config.bg} ${config.text}`}>
              {config.label}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-bold text-[#3a3a3a] leading-tight pr-2">
                  {finding.title}
                </h4>
                <div className="flex items-center gap-2 shrink-0">
                  {finding.location?.line && (
                    <span className="font-mono text-[10px] text-[#3a3a3a]/40 bg-[#f8fafc] px-1.5 py-0.5 rounded-[4px]">
                      L:{finding.location.line}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-[#3a3a3a]/30 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="text-[11px] text-[#3a3a3a]/60 mt-1.5 leading-relaxed">
                {finding.description}
              </p>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[#e5e7eb]/60">
          {/* Code block */}
          {finding.location?.code && (
            <div className="p-3 bg-[#f8fafc]">
              <CodeSnippet code={finding.location.code} line={finding.location.line} />
            </div>
          )}

          {/* Recommendation */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-[#3a3a3a]/50">
                Recommended Fix
              </span>
            </div>
            <p className="text-[11px] text-[#3a3a3a]/70 leading-relaxed pl-7">
              {finding.recommendation}
            </p>
          </div>

          {/* Reference IDs */}
          {(finding.swcId || finding.cweId) && (
            <div className="px-3 pb-3 flex gap-2">
              {finding.swcId && (
                <span className="font-mono text-[9px] text-[#3a3a3a]/50 bg-[#f8fafc] px-2 py-1 border border-[#e5e7eb]/60 rounded-[4px]">
                  {finding.swcId}
                </span>
              )}
              {finding.cweId && (
                <span className="font-mono text-[9px] text-[#3a3a3a]/50 bg-[#f8fafc] px-2 py-1 border border-[#e5e7eb]/60 rounded-[4px]">
                  {finding.cweId}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stat card component
function StatCard({ label, value, color, subtext }: { label: string; value: number | string; color?: string; subtext?: string }) {
  return (
    <div className="border border-[#e5e7eb] p-3 bg-white rounded-[12px]">
      <div className="text-[9px] text-[#3a3a3a]/50 font-bold">{label}</div>
      <div className={`font-mono text-xl font-black mt-0.5 ${color || 'text-[#3a3a3a]'}`}>{value}</div>
      {subtext && <div className="font-mono text-[9px] text-[#3a3a3a]/40 mt-0.5">{subtext}</div>}
    </div>
  );
}

interface DexMarketData {
  buys24h: number;
  sells24h: number;
  volume24h: number;
  priceChange24h: number;
}

export function ContractAuditResultPanel({ data }: { data: ContractAuditResultData | null }) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'all' | 'critical' | 'security' | 'gas' | 'compliance'>('all');
  const [marketData, setMarketData] = useState<DexMarketData | null>(null);

  useEffect(() => {
    const address = (data as any)?.contractAddress as string | undefined;
    if (!address) return;
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
      .then(r => r.json())
      .then((json) => {
        const pair = json?.pairs?.[0];
        if (!pair) return;
        const txns = pair.txns?.h24;
        if (txns) {
          setMarketData({
            buys24h: txns.buys || 0,
            sells24h: txns.sells || 0,
            volume24h: pair.volume?.h24 || 0,
            priceChange24h: pair.priceChange?.h24 || 0,
          });
        }
      })
      .catch(() => {});
  }, [(data as any)?.contractAddress]);

  if (!data) return null;

  const { metadata, verdict, findings, ozCompliance, gasReport, analyzedAt, aiReport } = data;

  // Filter findings based on active view
  const getFilteredFindings = () => {
    switch (activeView) {
      case 'critical':
        return findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      case 'security':
        return findings.filter(f => f.category === 'SECURITY' || f.category === 'DEFI_RISK');
      case 'gas':
        return findings.filter(f => f.category === 'GAS_OPTIMIZATION');
      case 'compliance':
        return findings.filter(f => f.category === 'OZ_COMPLIANCE' || f.category === 'TOKEN_COMPLIANCE');
      default:
        return findings;
    }
  };

  const filteredFindings = getFilteredFindings();
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;
  const mediumCount = findings.filter(f => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter(f => f.severity === 'LOW').length;

  const handleDownloadReport = () => {
    if (!data) return;
    let report = generateMarkdownReport(data);
    if (aiReport) {
      report += generateAIMarkdownSection(aiReport);
    }
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name || 'contract'}-audit-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .audit-panel-scroll::-webkit-scrollbar { display: none; }
      `}} />
      <div className="w-full max-w-lg bg-[#fafafa] border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
      {/* Header Section */}
      <div className="bg-white border-b border-[#e5e7eb]">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Contract Info */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-[#3a3a3a] rounded-[12px] flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-base text-[#3a3a3a] tracking-tight">
                    {metadata.name || 'Contract'}
                  </h2>
                  {metadata.pragmaVersion && (
                    <span className="font-mono text-[10px] text-[#3a3a3a]/40 font-bold bg-[#f8fafc] px-1.5 py-0.5 rounded-[4px]">
                      v{metadata.pragmaVersion}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#3a3a3a]/50 mt-1 flex items-center gap-2">
                  <span className="font-mono">{metadata.functionCount} functions</span>
                  <span className="text-[#3a3a3a]/30">&middot;</span>
                  <span className="font-mono">{metadata.lineCount} lines</span>
                  {aiReport && (
                    <>
                      <span className="text-[#3a3a3a]/30">&middot;</span>
                      <span className="text-emerald-600 font-bold">AI Enhanced</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownloadReport}
              className="p-2 hover:bg-[#f7f7f7] border border-[#e5e7eb] rounded-[8px] transition-all shrink-0"
              title="Download Report"
            >
              <svg className="w-5 h-5 text-[#3a3a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Score & Verdict Bar */}
        <div className="px-4 pb-4 flex items-center gap-4">
          <ScoreGauge score={verdict.auditScore} riskLevel={verdict.overall} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1.5 text-[11px] font-black rounded-[6px] ${getRiskStyle(verdict.overall)}`}>
                {verdict.overall} Risk
              </span>
              <span className={`px-3 py-1.5 text-[11px] font-black rounded-[6px] ${getRecStyle(verdict.recommendation)}`}>
                {verdict.recommendation}
              </span>
            </div>
            {verdict.summary && (
              <p className="text-[10px] text-[#3a3a3a]/50 mt-2 leading-relaxed line-clamp-2">
                {verdict.summary}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary Section */}
      {aiReport?.executiveSummary && aiReport.executiveSummary !== 'AI analysis unavailable. Review the automated findings below.' && (
        <div className="border-b border-[#e5e7eb] bg-gradient-to-r from-emerald-50 to-white">
          <div className="px-4 py-2 border-b border-[#e5e7eb]/60 flex items-center gap-2">
            <div className="w-4 h-4 bg-emerald-600 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <span className="text-[10px] font-bold text-emerald-700">
              AI Analysis Summary
            </span>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-[#3a3a3a]/70 leading-relaxed">
              {aiReport.executiveSummary}
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="p-4 border-b border-[#e5e7eb] bg-white">
        <div className="grid grid-cols-4 gap-2">
          <StatCard
            label="Critical"
            value={criticalCount}
            color={criticalCount > 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <StatCard
            label="High"
            value={highCount}
            color={highCount > 0 ? 'text-orange-500' : 'text-emerald-600'}
          />
          <StatCard
            label="Medium"
            value={mediumCount}
            color={mediumCount > 0 ? 'text-amber-500' : 'text-emerald-600'}
          />
          <StatCard
            label="Low"
            value={lowCount}
            color={lowCount > 0 ? 'text-sky-500' : 'text-emerald-600'}
          />
        </div>
      </div>

      {/* Buy/Sell Volume */}
      {marketData && (marketData.buys24h > 0 || marketData.sells24h > 0) && (() => {
        const total = marketData.buys24h + marketData.sells24h;
        const buyPct = total > 0 ? (marketData.buys24h / total) * 100 : 50;
        const sellPct = 100 - buyPct;
        const fmtVol = marketData.volume24h >= 1e6
          ? `$${(marketData.volume24h / 1e6).toFixed(2)}M`
          : marketData.volume24h >= 1e3
          ? `$${(marketData.volume24h / 1e3).toFixed(1)}K`
          : `$${marketData.volume24h.toFixed(0)}`;
        return (
          <div className="px-4 py-3 border-b border-[#e5e7eb] bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">24h Trading Activity</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[#6b7280]">Vol {fmtVol}</span>
                <span className={`text-[10px] font-semibold ${marketData.priceChange24h >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {marketData.priceChange24h >= 0 ? '+' : ''}{marketData.priceChange24h.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex gap-1 h-5 rounded-[4px] overflow-hidden">
              <div className="bg-emerald-500/90 flex items-center justify-center" style={{ width: `${buyPct}%` }}>
                <span className="text-[9px] font-bold text-white tabular-nums px-1">{buyPct >= 20 ? `${marketData.buys24h.toLocaleString()} buys` : ''}</span>
              </div>
              <div className="bg-red-500/90 flex items-center justify-center" style={{ width: `${sellPct}%` }}>
                <span className="text-[9px] font-bold text-white tabular-nums px-1">{sellPct >= 20 ? `${marketData.sells24h.toLocaleString()} sells` : ''}</span>
              </div>
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] font-medium text-emerald-600">{marketData.buys24h.toLocaleString()} buys ({buyPct.toFixed(0)}%)</span>
              <span className="text-[10px] font-medium text-red-500">{marketData.sells24h.toLocaleString()} sells ({sellPct.toFixed(0)}%)</span>
            </div>
          </div>
        );
      })()}

      {/* Filter Tabs */}
      <div className="flex border-b border-[#e5e7eb] bg-white">
        {[
          { key: 'all', label: 'All', count: findings.length },
          { key: 'critical', label: 'Critical', count: criticalCount + highCount },
          { key: 'security', label: 'Security', count: findings.filter(f => f.category === 'SECURITY' || f.category === 'DEFI_RISK').length },
          { key: 'gas', label: 'Gas', count: findings.filter(f => f.category === 'GAS_OPTIMIZATION').length },
          { key: 'compliance', label: 'Compliance', count: findings.filter(f => f.category === 'OZ_COMPLIANCE' || f.category === 'TOKEN_COMPLIANCE').length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key as typeof activeView)}
            className={`flex-1 py-3 px-2 text-[10px] font-bold transition-all border-r border-[#e5e7eb] last:border-r-0 ${
              activeView === tab.key
                ? 'bg-[#3a3a3a] text-white'
                : 'text-[#3a3a3a]/60 hover:text-[#3a3a3a] hover:bg-[#f7f7f7]'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`ml-1 ${activeView === tab.key ? 'text-white/60' : 'text-[#3a3a3a]/40'}`}>
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Findings List */}
      <div className="audit-panel-scroll md:max-h-[400px] md:overflow-y-auto bg-[#fafafa]" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="p-3 space-y-2">
          {filteredFindings.length === 0 ? (
            <div className="py-12 text-center bg-white border border-dashed border-[#e5e7eb] rounded-[12px]">
              <div className="w-12 h-12 mx-auto mb-3 bg-emerald-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-[#3a3a3a]/50 font-bold">
                No issues in this category
              </span>
            </div>
          ) : (
            filteredFindings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                isExpanded={expandedFinding === finding.id}
                onToggle={() => setExpandedFinding(expandedFinding === finding.id ? null : finding.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* AI Recommendations */}
      {aiReport && aiReport.securityRecommendations && aiReport.securityRecommendations.length > 0 &&
       aiReport.securityRecommendations[0] !== 'Review automated security findings' && (
        <div className="border-t border-[#e5e7eb]">
          <div className="px-4 py-3 bg-white text-[#3a3a3a] border-b border-[#e5e7eb] flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#3a3a3a]">
              AI Recommendations
            </span>
            <span className="font-mono text-[9px] text-[#3a3a3a]/50">
              {aiReport.securityRecommendations.length} items
            </span>
          </div>
          <div className="audit-panel-scroll bg-white md:max-h-[200px] md:overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="p-4 space-y-3">
              {aiReport.securityRecommendations.slice(0, 5).map((rec, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 bg-[#3a3a3a] text-white font-mono text-[10px] font-bold flex items-center justify-center rounded-full">
                    {i + 1}
                  </span>
                  <p className="text-[11px] text-[#3a3a3a]/70 leading-relaxed flex-1">
                    {rec}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#e5e7eb] flex justify-between items-center bg-white">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#3a3a3a]/50 font-bold">
            Audit Complete
          </span>
          {aiReport?.generatedBy && (
            <span className="font-mono text-[9px] text-[#3a3a3a]/40 bg-[#f8fafc] px-1.5 py-0.5 rounded-[4px]">
              via {aiReport.generatedBy.split('/').pop()}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-[#3a3a3a]/40">
          {new Date(analyzedAt).toLocaleDateString('en-GB')}
        </span>
      </div>
    </div>
    </>
  );
}
