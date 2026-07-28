'use client';

import { useEffect, useState } from 'react';

interface AgentOverviewData {
  agents: {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    platformAgents: number;
    availableAgents: number;
    avgRating: number;
    topEarners: Array<{ id: string; name: string; earnings: number; jobs: number; rating: number }>;
    recentAgents: Array<any>;
  };
  missions: {
    total: number;
    byStatus: Record<string, number>;
    totalBudget: number;
    avgBudget: number;
    recentMissions: Array<{
      id: string;
      title: string;
      status: string;
      budget: number;
      requiredAgents: number;
      currentAgents: number;
      creatorAddress: string;
      createdAt: string;
      deadline: string | null;
    }>;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    completionRate: number;
    totalRewards: number;
  };
  disputes: {
    total: number;
    open: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    recentDisputes: Array<{
      id: string;
      dispute_type: string;
      status: string;
      filed_by_agent_id: string;
      filed_against_agent_id: string;
      created_at: string;
    }>;
  };
  competitions: {
    total: number;
    byStatus: Record<string, number>;
    totalPrizePool: number;
  };
  health: {
    agentsChecked: number;
    healthyAgents: number;
    unhealthyAgents: number;
    avgResponseTime: number;
    recentFailures: Array<{
      agent_id: string;
      status_code: number;
      response_time_ms: number;
      created_at: string;
    }>;
  };
  applications: {
    total: number;
    byStatus: Record<string, number>;
    acceptanceRate: number;
  };
}

const cardClass = 'bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]';
const labelClass = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wider';
const valueClass = 'text-2xl font-bold text-[#1a1a1a]';
const sectionHeader = 'text-sm font-bold text-gray-600 mb-3';

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (['active', 'approved', 'accepted', 'healthy', 'completed', 'resolved'].includes(s)) return 'bg-emerald-50 text-emerald-600';
  if (['pending', 'upcoming', 'assigned', 'submitted', 'under_review', 'judging'].includes(s)) return 'bg-amber-50 text-amber-600';
  if (['in_progress'].includes(s)) return 'bg-blue-50 text-blue-600';
  if (['inactive', 'cancelled', 'rejected', 'dismissed', 'expired', 'withdrawn', 'suspended', 'unhealthy', 'failed'].includes(s)) return 'bg-red-50 text-red-600';
  if (['open', 'escalated'].includes(s)) return 'bg-orange-50 text-orange-600';
  return 'bg-gray-50 text-gray-600';
}

function barColor(key: string): string {
  const k = key.toLowerCase();
  if (['ai', 'active', 'approved', 'completed', 'resolved', 'accepted'].includes(k)) return 'bg-emerald-400';
  if (['human', 'in_progress', 'assigned', 'submitted', 'under_review'].includes(k)) return 'bg-blue-400';
  if (['hybrid', 'pending', 'upcoming', 'judging'].includes(k)) return 'bg-amber-400';
  if (['cancelled', 'rejected', 'dismissed', 'suspended', 'expired', 'withdrawn'].includes(k)) return 'bg-red-300';
  if (['inactive', 'open', 'escalated'].includes(k)) return 'bg-orange-400';
  return 'bg-gray-300';
}

function SkeletonCard() {
  return (
    <div className={`${cardClass} animate-pulse`}>
      <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
      <div className="h-7 bg-gray-100 rounded w-16" />
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className={`${cardClass} animate-pulse h-full`}>
      <div className="h-3 bg-gray-100 rounded w-32 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 bg-gray-50 rounded" />
        ))}
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className={`${cardClass} animate-pulse`}>
      <div className="h-3 bg-gray-100 rounded w-40 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-5 bg-gray-50 rounded" />
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ title, data, loading }: { title: string; data: Record<string, number>; loading: boolean }) {
  if (loading) return <SkeletonBars />;

  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  const entries = Object.entries(data).filter(([, v]) => v > 0);

  return (
    <div className={`${cardClass} h-full`}>
      <p className={`${labelClass} mb-4`}>{title}</p>
      {entries.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No data</div>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, count]) => {
            const pct = (count / total) * 100;
            return (
              <div key={key}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono">{key.replace(/_/g, ' ')}</span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">{count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full ${barColor(key)}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminAgentsPage() {
  const [data, setData] = useState<AgentOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/agents/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Agent Economy</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Agents, missions, tasks, disputes, competitions, and marketplace health
        </p>
      </div>

      {/* Overview Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className={cardClass}>
            <p className={labelClass}>Total Agents</p>
            <p className={`${valueClass} mt-1`}>{data?.agents.total ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Active Agents</p>
            <p className={`${valueClass} mt-1`}>{data?.agents.byStatus.active ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Available</p>
            <p className={`${valueClass} mt-1`}>{data?.agents.availableAgents ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Platform Agents</p>
            <p className={`${valueClass} mt-1`}>{data?.agents.platformAgents ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Avg Rating</p>
            <p className={`${valueClass} mt-1`}>{data?.agents.avgRating ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Total Missions</p>
            <p className={`${valueClass} mt-1`}>{data?.missions.total ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Open Disputes</p>
            <p className={`${valueClass} mt-1`}>{data?.disputes.open ?? 0}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Total Prize Pool</p>
            <p className={`${valueClass} mt-1`}>${data?.competitions.totalPrizePool ?? 0}</p>
          </div>
        </div>
      )}

      {/* 3-column distribution row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HorizontalBars title="Agent Type Distribution" data={data?.agents.byType ?? {}} loading={loading} />
        <HorizontalBars title="Mission Status Distribution" data={data?.missions.byStatus ?? {}} loading={loading} />
        <div>
          {loading ? (
            <SkeletonBars />
          ) : (
            <div className={`${cardClass} h-full`}>
              <p className={`${labelClass} mb-2`}>Task Status Distribution</p>
              <p className="text-[11px] text-gray-400 mb-3">
                Completion rate: <span className="font-semibold text-emerald-600">{data?.tasks.completionRate ?? 0}%</span>
                {' '} | Total rewards: <span className="font-semibold text-[#1a1a1a]">${data?.tasks.totalRewards ?? 0}</span>
              </p>
              {(() => {
                const taskData = data?.tasks.byStatus ?? {};
                const total = Object.values(taskData).reduce((s, v) => s + v, 0) || 1;
                const entries = Object.entries(taskData).filter(([, v]) => v > 0);
                return entries.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">No data</div>
                ) : (
                  <div className="space-y-3">
                    {entries.map(([key, count]) => {
                      const pct = (count / total) * 100;
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="text-gray-600 font-mono">{key.replace(/_/g, ' ')}</span>
                            <span className="text-gray-400 font-mono tabular-nums ml-2">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full">
                            <div className={`h-full rounded-full ${barColor(key)}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 2-column row: Top Earners + Recent Missions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Earning Agents */}
        {loading ? (
          <SkeletonTable rows={6} />
        ) : (
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Top Earning Agents</p>
            {(data?.agents.topEarners ?? []).length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No agents yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                      <th className="pb-2">Name</th>
                      <th className="pb-2 text-right">Earnings</th>
                      <th className="pb-2 text-right">Jobs</th>
                      <th className="pb-2 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.agents.topEarners ?? []).map((agent) => (
                      <tr key={agent.id} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700 font-medium truncate max-w-[160px]" title={agent.name}>{agent.name}</td>
                        <td className="py-2 text-right text-gray-600 font-mono tabular-nums">${agent.earnings.toFixed(2)}</td>
                        <td className="py-2 text-right text-gray-600 font-mono tabular-nums">{agent.jobs}</td>
                        <td className="py-2 text-right text-gray-600 font-mono tabular-nums">{agent.rating.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recent Missions */}
        {loading ? (
          <SkeletonTable rows={6} />
        ) : (
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Recent Missions</p>
            {(data?.missions.recentMissions ?? []).length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No missions yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                      <th className="pb-2">Title</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Budget</th>
                      <th className="pb-2 text-right">Agents</th>
                      <th className="pb-2 text-right">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.missions.recentMissions ?? []).slice(0, 10).map((m) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700 font-medium truncate max-w-[160px]" title={m.title}>{m.title}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(m.status)}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="py-2 text-right text-gray-600 font-mono tabular-nums">${m.budget.toFixed(2)}</td>
                        <td className="py-2 text-right text-gray-600 font-mono tabular-nums">{m.currentAgents}/{m.requiredAgents}</td>
                        <td className="py-2 text-right text-gray-500">{formatDate(m.deadline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disputes Section */}
      <div>
        <h2 className={sectionHeader}>Disputes</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loading ? (
            <>
              <SkeletonBars />
              <SkeletonTable rows={5} />
            </>
          ) : (
            <>
              <HorizontalBars title="Disputes by Type" data={data?.disputes.byType ?? {}} loading={false} />
              <div className={cardClass}>
                <p className={`${labelClass} mb-3`}>Recent Disputes</p>
                {(data?.disputes.recentDisputes ?? []).length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No disputes</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2">Filed By</th>
                          <th className="pb-2">Against</th>
                          <th className="pb-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.disputes.recentDisputes ?? []).map((d) => (
                          <tr key={d.id} className="border-b border-gray-50">
                            <td className="py-2 text-gray-700 font-mono">{(d.dispute_type || '').replace(/_/g, ' ')}</td>
                            <td className="py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(d.status)}`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="py-2 text-gray-500 font-mono">{truncateAddr(d.filed_by_agent_id)}</td>
                            <td className="py-2 text-gray-500 font-mono">{truncateAddr(d.filed_against_agent_id)}</td>
                            <td className="py-2 text-right text-gray-500">{formatDate(d.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Health Section */}
      <div>
        <h2 className={sectionHeader}>Endpoint Health</h2>
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className={cardClass}>
                <p className={labelClass}>Agents Checked</p>
                <p className={`${valueClass} mt-1`}>{data?.health.agentsChecked ?? 0}</p>
              </div>
              <div className={cardClass}>
                <p className={labelClass}>Healthy</p>
                <p className={`${valueClass} mt-1 text-emerald-600`}>{data?.health.healthyAgents ?? 0}</p>
              </div>
              <div className={cardClass}>
                <p className={labelClass}>Unhealthy</p>
                <p className={`${valueClass} mt-1 text-red-500`}>{data?.health.unhealthyAgents ?? 0}</p>
              </div>
              <div className={cardClass}>
                <p className={labelClass}>Avg Response Time</p>
                <p className={`${valueClass} mt-1`}>{data?.health.avgResponseTime ?? 0}<span className="text-sm text-gray-400 ml-1">ms</span></p>
              </div>
            </div>

            {(data?.health.recentFailures ?? []).length > 0 && (
              <div className={cardClass}>
                <p className={`${labelClass} mb-3`}>Recent Health Failures</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                        <th className="pb-2">Agent ID</th>
                        <th className="pb-2 text-right">Status Code</th>
                        <th className="pb-2 text-right">Response Time</th>
                        <th className="pb-2 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.health.recentFailures ?? []).slice(0, 10).map((f, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 text-gray-700 font-mono">{truncateAddr(f.agent_id)}</td>
                          <td className="py-2 text-right text-gray-600 font-mono tabular-nums">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600">
                              {f.status_code || 'N/A'}
                            </span>
                          </td>
                          <td className="py-2 text-right text-gray-600 font-mono tabular-nums">{f.response_time_ms}ms</td>
                          <td className="py-2 text-right text-gray-500">{formatDate(f.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Applications Section */}
      <div>
        <h2 className={sectionHeader}>Applications</h2>
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SkeletonCard />
            <SkeletonBars />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={cardClass}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={labelClass}>Total Applications</p>
                  <p className={`${valueClass} mt-1`}>{data?.applications.total ?? 0}</p>
                </div>
                <div>
                  <p className={labelClass}>Acceptance Rate</p>
                  <p className={`${valueClass} mt-1`}>{data?.applications.acceptanceRate ?? 0}<span className="text-sm text-gray-400 ml-1">%</span></p>
                </div>
              </div>
            </div>
            <HorizontalBars title="Application Status Breakdown" data={data?.applications.byStatus ?? {}} loading={false} />
          </div>
        )}
      </div>
    </div>
  );
}
