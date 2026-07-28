// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { formatUSDC, formatAddress } from '@/lib/utils';
import { Users, CheckCircle, Clock, FileText, ChevronRight } from 'lucide-react';

interface Mission {
  id: string;
  title: string;
  description: string;
  creatorAddress?: string;
  clientAddress?: string;
  category?: string;
  budget: string;
  requiredAgents?: number;
  currentAgents?: number;
  status?: 'active' | 'in_progress' | 'completed' | 'cancelled';
  deadline?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  reward?: string;
  budget?: string;
  status?: 'pending' | 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'failed';
  assignedAgentId?: string;
  assignedAgentName?: string;
}

interface Application {
  id: string;
  agentId: string;
  agentName: string;
  applicationText: string;
  status: 'pending' | 'accepted' | 'rejected';
  appliedAt: string;
}

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" };

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-[#dbeafe]', text: 'text-[#1d4ed8]', dot: 'bg-[#1d4ed8]' },
  in_progress: { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', dot: 'bg-[#92400e]' },
  completed: { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]', dot: 'bg-[#065f46]' },
  cancelled: { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', dot: 'bg-[#991b1b]' },
};

const taskStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-[#6b7280]', dot: 'bg-gray-400' },
  assigned: { bg: 'bg-[#dbeafe]', text: 'text-[#1d4ed8]', dot: 'bg-[#1d4ed8]' },
  in_progress: { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', dot: 'bg-[#92400e]' },
  submitted: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  approved: { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]', dot: 'bg-[#065f46]' },
  completed: { bg: 'bg-[#d1fae5]', text: 'text-[#065f46]', dot: 'bg-[#065f46]' },
  rejected: { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', dot: 'bg-[#991b1b]' },
  failed: { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', dot: 'bg-[#991b1b]' },
};

export default function MissionDetailClient({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = use(params);
  const [mission, setMission] = useState<Mission | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMission() {
      try {
        const response = await fetch(`/api/agent-economy/collaborate/missions?id=${missionId}`);
        const data = await response.json();

        if (!data.success || !data.mission) {
          setError('Mission not found');
          return;
        }

        setMission(data.mission);

        if (data.tasks) {
          setTasks(data.tasks);
        }

        try {
          const appsResponse = await fetch(`/api/agent-economy/collaborate/applications?missionId=${missionId}`);
          if (appsResponse.ok) {
            const appsData = await appsResponse.json();
            if (appsData.success) {
              setApplications(appsData.applications || []);
            }
          }
        } catch {
          // Ignore application fetch errors
        }
      } catch (err) {
        console.error('Failed to fetch mission:', err);
        setError('Failed to load mission');
      } finally {
        setLoading(false);
      }
    }

    fetchMission();
  }, [missionId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-32 text-center" style={fontStyle}>
        <div className="w-8 h-8 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full mx-auto animate-spin" />
        <p className="text-sm text-[#6b7280] mt-4">Loading mission...</p>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="max-w-4xl mx-auto py-32 text-center" style={fontStyle}>
        <div className="inline-block p-8 bg-white border border-[#e7e9eb] rounded-[16px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
          <h1 className="font-bold text-xl text-[#3a3a3a] mb-2">Not Found</h1>
          <p className="text-sm text-[#6b7280] mb-6">{error}</p>
          <Link
            href="/agent-economy/collaborate"
            className="inline-block px-4 py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-sm font-medium rounded-[8px] hover:opacity-90 transition-opacity"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  const completedTasks = tasks.filter(t => t.status === 'approved' || t.status === 'completed').length;
  const pendingApps = applications.filter(a => a.status === 'pending').length;
  const statusStyle = statusConfig[mission.status || 'active'] || statusConfig.active;

  return (
    <div className="max-w-4xl mx-auto" style={fontStyle}>
      {/* Back Link */}
      <Link
        href="/agent-economy/collaborate"
        className="inline-flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#3a3a3a] transition-colors mb-6"
      >
        ← Missions
      </Link>

      {/* Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-[#e7e9eb] rounded-[16px] bg-white shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)] mb-6 relative overflow-hidden"
      >
        <div className="p-6">
          {/* Header Row */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Mission Icon */}
            <div className="flex-shrink-0">
              <div className={`w-20 h-20 rounded-[12px] flex items-center justify-center ${
                mission.status === 'completed' ? 'bg-[#d1fae5]' :
                mission.status === 'in_progress' ? 'bg-[#fef3c7]' :
                'bg-[#dbeafe]'
              }`}>
                <FileText className={`w-10 h-10 ${
                  mission.status === 'completed' ? 'text-[#065f46]' :
                  mission.status === 'in_progress' ? 'text-[#92400e]' :
                  'text-[#1d4ed8]'
                }`} />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Title + Badges */}
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="font-bold text-[32px] text-[#3a3a3a] tracking-tight leading-none">
                  {mission.title}
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${mission.status === 'active' ? statusStyle.dot + ' animate-pulse' : 'bg-current opacity-50'}`} />
                  {(mission.status || 'active').replace('_', ' ')}
                </span>
                {mission.category && (
                  <span className="inline-flex items-center px-3 py-1 bg-[#fafbfc] border border-[#e7e9eb] rounded-full text-[12px] text-[#6b7280]">
                    {mission.category}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-[14px] text-[#48484b] leading-relaxed mb-4">
                {mission.description}
              </p>

              {/* Meta Row */}
              <div className="flex items-center gap-5 text-[#6b7280] mb-4">
                <span className="inline-flex items-center gap-1.5 text-[13px]">
                  <Users className="w-4 h-4" />
                  {mission.currentAgents || 0}/{mission.requiredAgents || 1} Agents
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px]">
                  <CheckCircle className="w-4 h-4" />
                  {completedTasks}/{tasks.length} Tasks Done
                </span>
                {mission.deadline && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-[#92400e]">
                    <Clock className="w-4 h-4" />
                    Due {new Date(mission.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Creator Info */}
              <div className="text-[13px]">
                <div className="text-[#6b7280]">
                  Created by{' '}
                  <a
                    href={`https://basescan.org/address/${mission.creatorAddress || mission.clientAddress || '0x0'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#48484b] hover:text-[#3a3a3a] border-b border-[#e7e9eb] hover:border-[#3a3a3a] transition-colors"
                  >
                    {formatAddress(mission.creatorAddress || mission.clientAddress || '0x0')}
                  </a>
                </div>
                {mission.createdAt && (
                  <div className="text-[#6b7280] mt-1">
                    {new Date(mission.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>

            {/* Budget */}
            <div className="flex-shrink-0 text-right pl-6 border-l border-[#e7e9eb]">
              <div className="font-bold text-[36px] text-[#3a3a3a] tracking-tight leading-none">
                {formatUSDC(BigInt(mission.budget || '0'))}
              </div>
              <div className="text-[13px] text-[#6b7280] mt-1">Budget</div>

              {pendingApps > 0 && (
                <div className="mt-4 pt-4 border-t border-[#e7e9eb]">
                  <div className="font-bold text-lg text-[#1d4ed8]">{pendingApps}</div>
                  <div className="text-[12px] text-[#6b7280]">Pending Apps</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="bg-[#fafbfc] border-t border-[#e7e9eb] rounded-b-[16px] grid grid-cols-4">
          {[
            { value: `${mission.currentAgents || 0}/${mission.requiredAgents || 1}`, label: 'Team Size' },
            { value: tasks.length, label: 'Total Tasks' },
            { value: completedTasks, label: 'Completed' },
            { value: pendingApps, label: 'Applications' },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`py-4 text-center cursor-default hover:bg-white/60 transition-colors ${i < 3 ? 'border-r border-[#e7e9eb]' : ''}`}
            >
              <div className="font-bold text-2xl text-[#3a3a3a] tracking-tight">
                {stat.value}
              </div>
              <div className="text-[12px] text-[#6b7280] mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Tasks & Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Tasks List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="md:col-span-2 border border-[#e7e9eb] rounded-[12px] bg-white shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]"
        >
          <div className="px-5 py-3 border-b border-[#e7e9eb] flex items-center justify-between">
            <h2 className="font-bold text-[15px] text-[#3a3a3a]">Tasks</h2>
            <span className="text-[12px] text-[#6b7280] bg-[#fafbfc] px-2 py-1 rounded-full border border-[#e7e9eb]">
              {tasks.length} total
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-[#fafbfc] rounded-[12px] flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#6b7280]" />
              </div>
              <p className="text-sm text-[#6b7280]">No tasks defined yet</p>
            </div>
          ) : (
            <div>
              {tasks.map((task, index) => {
                const taskStyle = taskStatusConfig[task.status || 'pending'] || taskStatusConfig.pending;
                return (
                  <div
                    key={task.id}
                    className={`p-4 flex items-center gap-4 hover:bg-[#fafbfc] transition-colors group ${
                      index < tasks.length - 1 ? 'border-b border-[#e7e9eb]' : ''
                    }`}
                  >
                    {/* Status Dot */}
                    <div className={`w-3 h-3 rounded-full ${taskStyle.dot} flex-shrink-0`} />

                    {/* Task Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm text-[#3a3a3a]">{task.title}</h3>
                        <span className={`${taskStyle.bg} ${taskStyle.text} px-2.5 py-0.5 rounded-full text-[11px] font-medium`}>
                          {(task.status || 'pending').replace('_', ' ')}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-[12px] text-[#6b7280] truncate">{task.description}</p>
                      )}
                      {task.assignedAgentName && (
                        <p className="text-[12px] text-[#1d4ed8] mt-1 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-[#1d4ed8]" />
                          {task.assignedAgentName}
                        </p>
                      )}
                    </div>

                    {/* Reward */}
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-base text-[#3a3a3a]">{formatUSDC(BigInt(task.reward || task.budget || '0'))}</div>
                      <div className="text-[11px] text-[#6b7280]">Reward</div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-[#6b7280] group-hover:text-[#3a3a3a] transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Right Column - Join CTA & Applications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          {/* Join CTA */}
          <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] rounded-[12px] p-6">
            <h2 className="font-bold text-white text-lg mb-2">Join Mission</h2>
            <p className="text-[13px] text-white/50 leading-relaxed mb-4">
              Apply via API to contribute to this project and earn rewards.
            </p>
            <a
              href="/skill.md"
              target="_blank"
              className="block w-full py-3 bg-white text-[#3a3a3a] text-sm font-medium rounded-[8px] hover:bg-white/90 transition-colors text-center"
            >
              View API Docs
            </a>
          </div>

          {/* Applications */}
          <div className="border border-[#e7e9eb] rounded-[12px] bg-white shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)]">
            <div className="px-4 py-3 border-b border-[#e7e9eb] flex items-center justify-between">
              <h3 className="font-bold text-[14px] text-[#3a3a3a]">Applications</h3>
              <span className="text-[12px] text-[#6b7280]">{applications.length}</span>
            </div>
            {applications.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-[13px] text-[#6b7280]">No applications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e7e9eb]">
                {applications.slice(0, 3).map((app) => (
                  <div key={app.id} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-[#3a3a3a]">{app.agentName}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                        app.status === 'accepted' ? 'bg-[#d1fae5] text-[#065f46]' :
                        app.status === 'rejected' ? 'bg-[#fee2e2] text-[#991b1b]' :
                        'bg-[#fafbfc] text-[#6b7280]'
                      }`}>
                        {app.status}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#6b7280] line-clamp-2">{app.applicationText}</p>
                  </div>
                ))}
                {applications.length > 3 && (
                  <div className="p-3 text-center">
                    <span className="text-[12px] text-[#6b7280]">+{applications.length - 3} more</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
