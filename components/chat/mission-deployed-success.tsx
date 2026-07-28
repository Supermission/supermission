'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface MissionDeployedSuccessProps {
  data: {
    missionId: string;
    missionNumber?: number; // Sequential mission number for the user (1, 2, 3...)
    agents: Array<{
      agentId?: string;
      name: string;
      capability: string;
      payment: number;
    }>;
    totalCost: number;
    requirementsUrl: string;
  };
}

interface AgentExecution {
  agent_id: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  deliverable_uri?: string;
  error_message?: string;
}

export function MissionDeployedSuccess({ data }: MissionDeployedSuccessProps) {
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [allComplete, setAllComplete] = useState(false);

  // Poll mission status - fast polling (1.5s) for responsive UX
  useEffect(() => {
    if (!isPolling) return;

    const pollMissionStatus = async () => {
      try {
        const response = await fetch(`/api/missions/${data.missionId}`);
        if (response.ok) {
          const missionData = await response.json();
          const fetchedExecutions = missionData.executions || [];

          // Deduplicate executions by agent_id, keeping the latest one for each agent
          const executionsByAgent = new Map<string, AgentExecution>();
          for (const exec of fetchedExecutions) {
            const existing = executionsByAgent.get(exec.agent_id);
            // Keep the execution with a "better" status (completed > executing > pending > failed)
            // or the more recent one if statuses are equal
            if (!existing ||
                exec.status === 'completed' ||
                (exec.status === 'executing' && existing.status !== 'completed')) {
              executionsByAgent.set(exec.agent_id, exec);
            }
          }
          const deduplicatedExecutions = Array.from(executionsByAgent.values());
          setExecutions(deduplicatedExecutions);

          // Check if all agents in the mission have completed (based on data.agents)
          const agentIds = data.agents.map(a => a.agentId).filter(Boolean);
          const completedAgentIds = deduplicatedExecutions
            .filter((e: AgentExecution) => e.status === 'completed' || e.status === 'failed')
            .map(e => e.agent_id);

          const allAgentsComplete = agentIds.length > 0 &&
            agentIds.every(id => completedAgentIds.includes(id!));

          if (allAgentsComplete && !allComplete) {
            setAllComplete(true);
            setIsPolling(false);

            const successCount = deduplicatedExecutions.filter((e: AgentExecution) => e.status === 'completed').length;
            toast.success(`All agents completed! ${successCount}/${data.agents.length} successful`);
          }
        }
      } catch (error) {
        console.error('[Mission Status] Poll error:', error);
      }
    };

    // Poll immediately
    pollMissionStatus();

    // Poll every 1.5 seconds for faster feedback
    const interval = setInterval(pollMissionStatus, 1500);

    return () => clearInterval(interval);
  }, [data.missionId, data.agents, isPolling, allComplete]);

  // Get execution status for a specific agent
  const getAgentExecution = (agentId: string) => {
    return executions.find(e => e.agent_id === agentId);
  };

  return (
    <div className="border border-[#e5e7eb] bg-white rounded-[12px] max-w-2xl">
      {/* Header */}
      <div className={`border-b border-[#e5e7eb] p-2 rounded-t-[12px] ${allComplete ? 'bg-green-600' : 'bg-blue-600'} text-white`}>
        <div className="flex items-center gap-2">
          {allComplete ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          <h3 className="text-[11px] font-semibold">
            {allComplete ? 'Mission Completed' : 'Mission Executing'}
          </h3>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Mission ID Card */}
        <div className="border border-[#e5e7eb] bg-white rounded-[12px]">
          <div className="border-b border-[#e5e7eb] p-2 bg-white text-[#3a3a3a] rounded-t-[12px]">
            <p className="text-[11px] font-semibold text-[#6b7280]">Mission</p>
          </div>
          <div className="p-2">
            <p className="font-black text-lg">#{data.missionNumber ?? data.missionId.replace('mission_', '').slice(0, 8)}</p>
          </div>
        </div>

        {/* Selected Agents Card with Real-time Status - Horizontal Layout */}
        <div className="border border-[#e5e7eb] bg-white rounded-[12px]">
          <div className="border-b border-[#e5e7eb] p-2 bg-white text-[#3a3a3a] rounded-t-[12px]">
            <p className="text-[11px] font-semibold text-[#6b7280]">Agents - Live Status</p>
          </div>
          <div className="p-2 flex gap-2 flex-wrap md:flex-nowrap md:overflow-x-auto scrollbar-hide">
            {data.agents.map((agent, index) => {
              const execution = agent.agentId ? getAgentExecution(agent.agentId) : null;
              const status = execution?.status || 'pending';

              return (
                <div key={index} className="border border-[#e5e7eb] p-2 bg-[#f8fafc] rounded-[12px] flex-shrink-0 w-[240px]">
                  <div className="flex flex-col h-full">
                    {/* Agent Name & Capability */}
                    <div className="mb-2">
                      <p className="font-bold text-xs mb-0.5">{agent.name}</p>
                      <p className="text-[11px] font-semibold text-[#6b7280]">{agent.capability.replace(/-/g, ' ')}</p>
                    </div>

                    {/* Price */}
                    <div className="font-black text-xs mb-2">${agent.payment} USDC</div>

                    {/* Status Badge */}
                    <div className="mt-auto">
                      <div className="border-t border-[#e5e7eb] pt-2 mb-2">
                        <span className="text-[11px] font-semibold text-[#6b7280] block mb-1">Status</span>
                        <span className={`px-2 py-1 font-bold text-[9px] border rounded-md block text-center ${
                          status === 'completed'
                            ? 'bg-green-500 text-white border-green-500'
                            : status === 'executing'
                            ? 'bg-yellow-500 text-white border-yellow-500'
                            : status === 'failed'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-blue-500 text-white border-blue-500'
                        }`}>
                          {status === 'pending' && (
                            <span className="flex items-center justify-center gap-1">
                              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              PENDING
                            </span>
                          )}
                          {status === 'executing' && (
                            <span className="flex items-center justify-center gap-1">
                              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              EXECUTING
                            </span>
                          )}
                          {status === 'completed' && 'COMPLETED'}
                          {status === 'failed' && 'FAILED'}
                        </span>
                      </div>

                      {/* Deliverable Link */}
                      {execution?.deliverable_uri && (
                        <div className="mt-2 pt-2 border-t border-[#e5e7eb]">
                          <a
                            href={execution.deliverable_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] hover:underline text-blue-600 flex items-center justify-center gap-1"
                          >
                            <span>View</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}

                      {/* Error Message */}
                      {execution?.error_message && (
                        <div className="mt-2 pt-2 border-t border-[#e5e7eb]">
                          <p className="font-mono text-[8px] text-red-600 break-words">
                            Error: {execution.error_message}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total Cost Card */}
        <div className="border border-[#e5e7eb] bg-[#f8fafc] text-[#3a3a3a] p-3 rounded-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#6b7280]">
              Total Cost:
            </span>
            <span className="font-black text-lg">
              ${data.totalCost} USDC
            </span>
          </div>
        </div>

        {/* IPFS Link Card */}
        <div className="border border-[#e5e7eb] bg-white rounded-[12px]">
          <div className="border-b border-[#e5e7eb] p-2 bg-white text-[#3a3a3a] rounded-t-[12px]">
            <p className="text-[11px] font-semibold text-[#6b7280]">Requirements</p>
          </div>
          <div className="p-2">
            <a
              href={data.requirementsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] hover:underline flex items-center gap-1.5 text-blue-600"
            >
              <span>View on IPFS</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Progress Info */}
        <div className={`border border-[#e5e7eb] p-2 rounded-[12px] ${allComplete ? 'bg-green-50' : 'bg-blue-50'}`}>
          <div className="flex items-start gap-2">
            <div className={`w-4 h-4 border rounded ${allComplete ? 'border-green-500 bg-green-500' : 'border-blue-500'} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              {allComplete ? (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] leading-relaxed text-[#6b7280]">
                {allComplete ? (
                  <>
                    <strong className="text-green-600">Mission Complete!</strong> All agents have finished their work. Review deliverables above and track progress on the mission page.
                  </>
                ) : (
                  <>
                    <strong className="text-blue-600">Agents Working:</strong> {executions.filter(e => e.status === 'completed').length}/{data.agents.length} agents completed. Updates refresh every 3 seconds.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link href="/dashboard" className="flex-1">
            <Button className="w-full h-9 text-[10px]">
              GO TO DASHBOARD
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
