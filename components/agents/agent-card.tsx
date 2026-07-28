'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
export interface RecommendedAgent {
  id: string;
  agentId: string;
  name: string;
  address: string;
  capabilities: string[];
  reputation: {
    score: number;
    stars: number;
    reviewCount: number;
    successRate: number;
  };
  pricing?: {
    perTask?: number;
    perMessage?: number;
    hourlyRate?: number;
  };
  availability: 'available' | 'busy' | 'offline';
}

interface AgentCardProps {
  agent: RecommendedAgent;
  onSelect: (agent: RecommendedAgent) => void;
  selected?: boolean;
}

export const AgentCard = React.memo(function AgentCard({ agent, onSelect, selected = false }: AgentCardProps) {
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const getAvailabilityColor = (availability: string) => {
    if (availability === 'available') return 'bg-green-500 text-white';
    if (availability === 'busy') return 'bg-yellow-500 text-black';
    return 'bg-gray-500 text-white';
  };

  return (
    <div
      className={`border border-black p-4 transition-all duration-200 ${
        selected ? 'bg-black text-white' : 'bg-[#f5f5f5] hover:bg-black hover:text-white'
      } group cursor-pointer`}
    >
      {/* Line 1: Name + Availability + Score */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-sm uppercase truncate">{agent.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="font-mono text-[10px] font-bold">{agent.reputation.score}</span>
          <span className={`${getAvailabilityColor(agent.availability)} w-2 h-2 flex-shrink-0`} title={agent.availability}></span>
        </div>
      </div>

      {/* Line 2: Stats Bar */}
      <div className="font-mono text-[10px] opacity-60 group-hover:opacity-90 mb-3 flex items-center gap-2 transition-opacity">
        <span>★ {agent.reputation.stars.toFixed(1)}</span>
        <span>•</span>
        <span>{agent.reputation.reviewCount} REVIEWS</span>
        <span>•</span>
        <span>{agent.reputation.successRate}%</span>
      </div>

      {/* Line 3: Capabilities */}
      <div className="flex items-center gap-1 flex-wrap mb-3 min-h-[20px]">
        {agent.capabilities.slice(0, 3).map((cap) => (
          <span
            key={cap}
            className={`font-mono text-[9px] px-1.5 py-0.5 border transition-all ${
              selected
                ? 'border-white opacity-70'
                : 'border-black group-hover:border-white opacity-40 group-hover:opacity-80'
            } uppercase`}
          >
            {cap.replace(/-/g, ' ')}
          </span>
        ))}
        {agent.capabilities.length > 3 && (
          <span className="font-mono text-[9px] opacity-30 group-hover:opacity-60 transition-opacity">
            +{agent.capabilities.length - 3}
          </span>
        )}
      </div>

      {/* Line 4: Price */}
      <div className="mb-4">
        <div className="font-mono text-xs font-black">
          {agent.pricing?.perTask && `$${agent.pricing.perTask} / TASK`}
          {agent.pricing?.perMessage && `$${agent.pricing.perMessage} / MSG`}
          {agent.pricing?.hourlyRate && `$${agent.pricing.hourlyRate} / HR`}
        </div>
      </div>

      {/* Divider */}
      <div className={`border-t mb-3 transition-colors ${
        selected ? 'border-white/20' : 'border-black/20 group-hover:border-white/20'
      }`}></div>

      {/* Address */}
      <div className="mb-3">
        <div className="font-mono text-[9px] opacity-40 group-hover:opacity-60 mb-1 uppercase transition-opacity">
          Address
        </div>
        <div className={`font-mono text-[10px] px-2 py-1.5 text-center transition-all ${
          selected
            ? 'bg-white text-black'
            : 'bg-black text-white group-hover:bg-white group-hover:text-black'
        }`}>
          {formatAddress(agent.address)}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Link href={`/agents/${agent.agentId}`} className="flex-1" onClick={(e) => e.stopPropagation()}>
          <button
            aria-label={`View details for ${agent.name}`}
            className={`w-full h-8 border font-mono text-[10px] font-bold uppercase transition-all ${
              selected
                ? 'border-white text-white hover:bg-white hover:text-black'
                : 'border-black group-hover:border-white hover:bg-blue-500 hover:border-blue-500 hover:text-white'
            }`}
          >
            VIEW
          </button>
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(agent);
          }}
          aria-label={selected ? `${agent.name} is selected` : `Select ${agent.name}`}
          aria-pressed={selected}
          className={`flex-1 h-8 font-mono text-[10px] font-bold uppercase transition-all ${
            selected
              ? 'bg-white text-black border border-white hover:bg-gray-200'
              : 'bg-black text-white border border-black group-hover:bg-green-500 group-hover:border-green-500'
          }`}
        >
          {selected ? 'SELECTED' : 'SELECT'}
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if agent ID or selected state changes
  return prevProps.agent.agentId === nextProps.agent.agentId &&
         prevProps.selected === nextProps.selected;
});
