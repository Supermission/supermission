'use client';

import React from 'react';

type WalletData = {
  address: string;
  chain: string;
  ensName?: string | null;
  nativeBalance?: string;
  transactionCount?: number;
  tokenCount?: number;
  fetchedAt?: string;
};

type AIProfile = {
  walletType?: string;
  riskScore?: number;
  activityLevel?: string;
  estimatedPortfolioUsd?: string;
  profile?: {
    summary?: string;
    characteristics?: string[];
    likelyBehavior?: string;
    notablePatterns?: string[];
  };
  defiActivity?: {
    isDefiUser?: boolean;
    estimatedProtocols?: string[];
    activityPatterns?: string;
  };
  warnings?: string[];
  recommendations?: string[];
};

type WalletResultData = {
  walletData?: WalletData;
  aiProfile?: AIProfile | null;
  profiledAt?: string;
  analyzedAt?: string;
};

function shortAddr(addr?: string) {
  if (!addr) return '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function riskBadge(score: number) {
  if (score >= 75) return { label: 'HIGH', cls: 'bg-red-700 text-white' };
  if (score >= 45) return { label: 'MED', cls: 'bg-amber-600 text-white' };
  return { label: 'LOW', cls: 'bg-green-700 text-white' };
}

export function WalletResultPanel({ data, title }: { data: any; title: string }) {
  const payload: WalletResultData | null =
    data?.walletData || data?.aiProfile ? (data as WalletResultData) :
    data?.data?.walletData ? (data.data as WalletResultData) :
    null;

  if (!payload?.walletData) return null;

  const w = payload.walletData;
  const p = payload.aiProfile || undefined;
  const risk = typeof p?.riskScore === 'number' ? p.riskScore : null;
  const rb = risk != null ? riskBadge(risk) : null;

  return (
    <div className="bg-white border border-[#e5e7eb] p-4 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)] rounded-[12px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[#3a3a3a]">{title}</div>
          <div className="font-mono text-[10px] text-[#6b7280] mt-1">
            {w.ensName ? w.ensName : shortAddr(w.address)} · {String(w.chain || '').toUpperCase()}
          </div>
        </div>
        {rb ? (
          <div className="text-right">
            <div className="text-[11px] font-semibold text-[#6b7280] mb-1">Risk</div>
            <span className={`px-2 py-0.5 font-mono text-[9px] font-bold rounded-md ${rb.cls}`}>{rb.label} {risk}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="border border-[#e5e7eb] p-2 rounded-[12px]">
          <div className="text-[11px] font-semibold text-[#6b7280]">Balance</div>
          <div className="font-mono text-[11px] font-bold text-[#3a3a3a]">{w.nativeBalance ? `${w.nativeBalance} ETH` : '-'}</div>
        </div>
        <div className="border border-[#e5e7eb] p-2 rounded-[12px]">
          <div className="text-[11px] font-semibold text-[#6b7280]">Tx Count</div>
          <div className="font-mono text-[11px] font-bold text-[#3a3a3a]">{typeof w.transactionCount === 'number' ? w.transactionCount : '-'}</div>
        </div>
        <div className="border border-[#e5e7eb] p-2 rounded-[12px]">
          <div className="text-[11px] font-semibold text-[#6b7280]">Tokens</div>
          <div className="font-mono text-[11px] font-bold text-[#3a3a3a]">{typeof w.tokenCount === 'number' ? w.tokenCount : '-'}</div>
        </div>
        <div className="border border-[#e5e7eb] p-2 rounded-[12px]">
          <div className="text-[11px] font-semibold text-[#6b7280]">Activity</div>
          <div className="font-mono text-[11px] font-bold text-[#3a3a3a]">{p?.activityLevel || '-'}</div>
        </div>
      </div>

      {p?.profile?.summary ? (
        <div className="mt-3 border border-[#e5e7eb] p-3 rounded-[12px]">
          <div className="text-[11px] font-semibold text-[#6b7280] mb-1">Summary</div>
          <div className="text-[12px] leading-relaxed text-[#3a3a3a]">{p.profile.summary}</div>
        </div>
      ) : null}

      {(p?.warnings?.length || p?.recommendations?.length) ? (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="border border-[#e5e7eb] p-3 rounded-[12px]">
            <div className="text-[11px] font-semibold text-[#6b7280] mb-1">Warnings</div>
            <ul className="text-[11px] text-[#3a3a3a] list-disc pl-4 space-y-1">
              {(p?.warnings || []).slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
          <div className="border border-[#e5e7eb] p-3 rounded-[12px]">
            <div className="text-[11px] font-semibold text-[#6b7280] mb-1">Recommendations</div>
            <ul className="text-[11px] text-[#3a3a3a] list-disc pl-4 space-y-1">
              {(p?.recommendations || []).slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

