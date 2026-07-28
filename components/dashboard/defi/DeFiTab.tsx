'use client';

import { useDefiStore } from '@/lib/store/defi';
import { DeFiSubTabs } from './DeFiSubTabs';
import { SwapPanel } from './SwapPanel';
import { PoolsPanel } from './PoolsPanel';
import { LendPanel } from './LendPanel';
import { DeFiAgentFloatingButton } from './DeFiAgentFloatingButton';

export function DeFiTab() {
  const activeSubTab = useDefiStore((s) => s.activeSubTab);

  return (
    <div className="flex flex-col items-center">
      <DeFiSubTabs />

      <div className={`w-full ${activeSubTab === 'pools' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {activeSubTab === 'swap' && <SwapPanel />}
        {activeSubTab === 'pools' && <PoolsPanel />}
        {activeSubTab === 'lend' && <LendPanel />}
      </div>

      <DeFiAgentFloatingButton />
    </div>
  );
}
