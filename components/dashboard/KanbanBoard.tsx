import { useMemo } from 'react';
import { MissionCard } from '@/lib/utils/dashboard/types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  cards: MissionCard[];
}

export function KanbanBoard({ cards }: KanbanBoardProps) {
  const executingCards = useMemo(
    () => cards.filter((c) => c.status === 'executing' || c.status === 'pending'),
    [cards]
  );

  const completedCards = useMemo(
    () => cards.filter((c) => c.status === 'completed'),
    [cards]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <KanbanColumn
        title="EXECUTING"
        cards={executingCards}
        bgColor="bg-amber-400"
        statusColor="yellow"
        textColor="text-black"
        emptyMessage="NO EXECUTING MISSIONS"
      />
      <KanbanColumn
        title="COMPLETE"
        cards={completedCards}
        bgColor="bg-emerald-500"
        statusColor="green"
        textColor="text-white"
        emptyMessage="NO COMPLETED MISSIONS"
      />
    </div>
  );
}