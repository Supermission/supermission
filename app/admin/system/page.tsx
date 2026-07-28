'use client';

import { useEffect, useState } from 'react';

interface SystemData {
  webhooks: {
    total: number;
    byStatus: Record<string, number>;
    deliveryRate: number;
    avgAttempts: number;
    dlqSize: number;
    recentFailures: Array<{
      eventType: string;
      errorMessage: string;
      attempts: number;
      createdAt: string;
    }>;
  };
  x402Pipeline: {
    total: number;
    byStatus: Record<string, number>;
    successRate: number;
    totalVolume: number;
    volume24h: number;
    recentFailed: Array<{
      id: string;
      status: string;
      amount: number;
      token: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  chat: {
    totalSessions: number;
    totalMessages: number;
    sessions24h: number;
    uniqueUsers: number;
    avgMessagesPerSession: number;
    byAgent: Array<{ agentId: string; sessions: number }>;
  };
  endpointHealth: {
    checksLast24h: number;
    successRate: number;
    avgResponseTime: number;
    slowestEndpoints: Array<{ agentId: string; url: string; avgResponseTime: number }>;
    failingEndpoints: Array<{ agentId: string; url: string; failureCount: number; lastFailure: string | null }>;
  };
  defi: {
    totalActivities: number;
    activities24h: number;
    totalVolumeUsd: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  };
  dailyActivity: Array<{
    date: string;
    webhooks: number;
    x402Payments: number;
    chatSessions: number;
    healthChecks: number;
  }>;
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] animate-pulse">
      <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
      <div className="h-7 bg-gray-100 rounded w-16" />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-5 bg-gray-50 rounded" />
        ))}
      </div>
    </div>
  );
}

function SkeletonBars() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)] animate-pulse">
      <div className="h-3 bg-gray-100 rounded w-32 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 bg-gray-50 rounded" />
        ))}
      </div>
    </div>
  );
}

function StatusBars({
  title,
  data,
  colorMap,
}: {
  title: string;
  data: Record<string, number>;
  colorMap: Record<string, string>;
}) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </p>

      {entries.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No data
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, count]) => {
            const pct = (count / total) * 100;
            const color = colorMap[key] || 'bg-gray-300';
            return (
              <div key={key}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono truncate max-w-[200px]">{key}</span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">
                    {count} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentBars({ data }: { data: Array<{ agentId: string; sessions: number }> }) {
  const total = data.reduce((s, d) => s + d.sessions, 0) || 1;
  const colors = ['bg-violet-400', 'bg-blue-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400'];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Chat Sessions by Agent
      </p>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No data
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((d, i) => {
            const pct = (d.sessions / total) * 100;
            return (
              <div key={d.agentId}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono truncate max-w-[200px]">{d.agentId}</span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">
                    {d.sessions} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div
                    className={`h-full rounded-full ${colors[i % colors.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatUsd(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/system/overview')
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
        <h1 className="text-xl font-bold text-[#1a1a1a]">System Health</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Webhooks, x402 payments, chat sessions, endpoint health, and DeFi activity
        </p>
      </div>

      {/* Overview Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Webhook Delivery Rate</p>
            <p className={`text-2xl font-bold ${data.webhooks.deliveryRate < 95 ? 'text-red-600' : 'text-[#1a1a1a]'}`}>
              {data.webhooks.deliveryRate}%
            </p>
            <p className="text-[11px] text-gray-400 mt-1">{data.webhooks.total} total deliveries</p>
          </div>

          <div className={`bg-white border rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] ${data.webhooks.dlqSize > 0 ? 'border-amber-300' : 'border-[#e5e7eb]'}`}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">DLQ Size</p>
            <p className={`text-2xl font-bold ${data.webhooks.dlqSize > 0 ? 'text-amber-600' : 'text-[#1a1a1a]'}`}>
              {data.webhooks.dlqSize}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Avg {data.webhooks.avgAttempts} attempts</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">x402 Success Rate</p>
            <p className={`text-2xl font-bold ${data.x402Pipeline.successRate < 95 ? 'text-red-600' : 'text-[#1a1a1a]'}`}>
              {data.x402Pipeline.successRate}%
            </p>
            <p className="text-[11px] text-gray-400 mt-1">{data.x402Pipeline.total} total payments</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">x402 Volume 24h</p>
            <p className="text-2xl font-bold text-[#1a1a1a]">{formatUsd(data.x402Pipeline.volume24h)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{formatUsd(data.x402Pipeline.totalVolume)} total</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Chat Sessions 24h</p>
            <p className="text-2xl font-bold text-[#1a1a1a]">{data.chat.sessions24h}</p>
            <p className="text-[11px] text-gray-400 mt-1">{data.chat.totalSessions} total sessions</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Unique Chat Users</p>
            <p className="text-2xl font-bold text-[#1a1a1a]">{data.chat.uniqueUsers}</p>
            <p className="text-[11px] text-gray-400 mt-1">{data.chat.avgMessagesPerSession} msgs/session</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Health Check Success</p>
            <p className={`text-2xl font-bold ${data.endpointHealth.successRate < 95 ? 'text-red-600' : 'text-[#1a1a1a]'}`}>
              {data.endpointHealth.successRate}%
            </p>
            <p className="text-[11px] text-gray-400 mt-1">{data.endpointHealth.checksLast24h} checks (24h)</p>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Avg Response Time</p>
            <p className="text-2xl font-bold text-[#1a1a1a]">{data.endpointHealth.avgResponseTime}ms</p>
          </div>
        </div>
      ) : null}

      {/* 3-column row: Webhook / x402 / Chat status bars */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SkeletonBars />
          <SkeletonBars />
          <SkeletonBars />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusBars
            title="Webhook Status Distribution"
            data={data.webhooks.byStatus}
            colorMap={{
              pending: 'bg-amber-300',
              delivered: 'bg-emerald-400',
              failed: 'bg-red-400',
              retrying: 'bg-blue-400',
            }}
          />
          <StatusBars
            title="x402 Pipeline Status"
            data={data.x402Pipeline.byStatus}
            colorMap={{
              pending: 'bg-amber-300',
              signing: 'bg-blue-400',
              completed: 'bg-emerald-400',
              failed: 'bg-red-400',
              expired: 'bg-gray-400',
            }}
          />
          <AgentBars data={data.chat.byAgent} />
        </div>
      ) : null}

      {/* 2-column row: Slowest + Failing endpoints */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonTable rows={5} />
          <SkeletonTable rows={5} />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Slowest Endpoints
            </p>
            {data.endpointHealth.slowestEndpoints.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">No data</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="pb-2">Agent ID</th>
                      <th className="pb-2">URL</th>
                      <th className="pb-2 text-right">Avg Response (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.endpointHealth.slowestEndpoints.map((ep, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 font-mono text-gray-600 truncate max-w-[120px]" title={ep.agentId}>{ep.agentId}</td>
                        <td className="py-2 font-mono text-gray-500 truncate max-w-[200px]" title={ep.url}>{ep.url}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-gray-700">{ep.avgResponseTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Failing Endpoints
            </p>
            {data.endpointHealth.failingEndpoints.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">No failures</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="pb-2">Agent ID</th>
                      <th className="pb-2">URL</th>
                      <th className="pb-2 text-right">Failures</th>
                      <th className="pb-2 text-right">Last Failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.endpointHealth.failingEndpoints.map((ep, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 font-mono text-gray-600 truncate max-w-[120px]" title={ep.agentId}>{ep.agentId}</td>
                        <td className="py-2 font-mono text-gray-500 truncate max-w-[180px]" title={ep.url}>{ep.url}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-red-600">{ep.failureCount}</td>
                        <td className="py-2 text-right text-gray-400">{ep.lastFailure ? formatDate(ep.lastFailure) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* DeFi Activity */}
      {loading ? (
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-3">DeFi Activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : data ? (
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-3">DeFi Activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Activities</p>
              <p className="text-2xl font-bold text-[#1a1a1a]">{data.defi.totalActivities}</p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Activities (24h)</p>
              <p className="text-2xl font-bold text-[#1a1a1a]">{data.defi.activities24h}</p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Volume</p>
              <p className="text-2xl font-bold text-[#1a1a1a]">{formatUsd(data.defi.totalVolumeUsd)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <StatusBars
              title="DeFi by Type"
              data={data.defi.byType}
              colorMap={{
                swap: 'bg-blue-400',
                bridge: 'bg-violet-400',
                stake: 'bg-emerald-400',
                unstake: 'bg-amber-400',
                deposit: 'bg-cyan-400',
                withdraw: 'bg-rose-400',
              }}
            />
            <StatusBars
              title="DeFi by Status"
              data={data.defi.byStatus}
              colorMap={{
                completed: 'bg-emerald-400',
                pending: 'bg-amber-300',
                failed: 'bg-red-400',
                confirmed: 'bg-blue-400',
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Recent Webhook Failures */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Webhook Failures</h2>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : data && data.webhooks.recentFailures.length > 0 ? (
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-2">Event Type</th>
                  <th className="pb-2">Error Message</th>
                  <th className="pb-2 text-right">Attempts</th>
                  <th className="pb-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.webhooks.recentFailures.map((f, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-600">{f.eventType}</td>
                    <td className="py-2 text-gray-500 truncate max-w-[300px]" title={f.errorMessage}>{f.errorMessage}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-gray-700">{f.attempts}</td>
                    <td className="py-2 text-right text-gray-400">{formatDate(f.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="h-20 flex items-center justify-center text-[13px] text-gray-300">No recent failures</div>
          </div>
        )}
      </div>

      {/* Recent Failed x402 Payments */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Failed x402 Payments</h2>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : data && data.x402Pipeline.recentFailed.length > 0 ? (
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Token</th>
                  <th className="pb-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.x402Pipeline.recentFailed.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-600 truncate max-w-[120px]" title={p.id}>{p.id}</td>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-gray-700">{p.amount}</td>
                    <td className="py-2 font-mono text-gray-500">{p.token}</td>
                    <td className="py-2 text-right text-gray-400">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="h-20 flex items-center justify-center text-[13px] text-gray-300">No recent failures</div>
          </div>
        )}
      </div>
    </div>
  );
}
