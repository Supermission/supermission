import { create } from 'zustand';

export type AgentStatus = 'unknown' | 'ok' | 'error';
export type AgentId = 'delphi' | 'oracle' | 'securo' | 'hyperion' | 'roro';

interface AgentStatusState {
  statuses: Record<AgentId, AgentStatus>;
  setStatus: (agent: AgentId, status: AgentStatus) => void;
}

export const useAgentStatusStore = create<AgentStatusState>((set) => ({
  statuses: { delphi: 'unknown', oracle: 'unknown', securo: 'unknown', hyperion: 'unknown', roro: 'unknown' },
  setStatus: (agent, status) =>
    set(s => ({ statuses: { ...s.statuses, [agent]: status } })),
}));
