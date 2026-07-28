'use client';

import { ArrowRightLeft, Layers, BarChart3, Landmark, type LucideIcon } from 'lucide-react';
import { useDefiStore, type DeFiSubTab } from '@/lib/store/defi';

const SUB_TABS: { id: DeFiSubTab; label: string; Icon: LucideIcon }[] = [
  { id: 'swap', label: 'Swap', Icon: ArrowRightLeft },
  { id: 'pools', label: 'Pools', Icon: Layers },
  { id: 'lend', label: 'Lend', Icon: Landmark },
];

export function DeFiSubTabs() {
  const activeSubTab = useDefiStore((s) => s.activeSubTab);
  const setActiveSubTab = useDefiStore((s) => s.setActiveSubTab);

  return (
    <div className="inline-flex items-center bg-[#f8fafc] border border-[#e5e7eb] rounded-[8px] p-[5px] mb-6">
      {SUB_TABS.map(({ id, label, Icon }) => {
        const active = activeSubTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveSubTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-[4px] ${
              active
                ? 'bg-white text-[#3a3a3a] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]'
                : 'text-[#6b7280] hover:text-[#3a3a3a]'
            }`}
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
