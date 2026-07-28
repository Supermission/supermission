'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MissionCard } from '@/lib/utils/dashboard/types';
import { MissionCardComponent } from './MissionCard';

interface KanbanColumnProps {
  title: string;
  cards: MissionCard[];
  bgColor: string;
  statusColor: 'yellow' | 'green';
  textColor?: string;
  emptyMessage: string;
}

export function KanbanColumn({
  title,
  cards,
  bgColor,
  statusColor,
  textColor = 'text-black',
  emptyMessage,
}: KanbanColumnProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-black bg-[#f5f5f5]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full border-b border-black p-3 ${bgColor} md:cursor-default`}
      >
        <div className="flex items-center justify-between">
          <h2 className={`font-black text-sm uppercase ${textColor}`}>{title}</h2>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-xs ${textColor} ${
                statusColor === 'yellow'
                  ? 'bg-white/50 border-black/20'
                  : 'bg-white/20 border-white/30'
              } px-2 py-0.5 border`}
            >
              {cards.length}
            </span>
            <span className={`md:hidden ${textColor}`}>
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </span>
          </div>
        </div>
      </button>
      <div className={`${collapsed ? 'hidden' : 'block'} md:block p-4 space-y-3 min-h-[100px] md:min-h-[300px]`}>
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="font-mono text-xs opacity-40 uppercase">{emptyMessage}</p>
          </div>
        ) : (
          cards.map((card) => (
            <MissionCardComponent key={card.id} card={card} statusColor={statusColor} />
          ))
        )}
      </div>
    </div>
  );
}