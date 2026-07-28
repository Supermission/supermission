'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';
import { useDefiStore } from '@/lib/store/defi';
import { getHookTemplatesForChain, type HookTemplate } from '@/lib/uniswap/hooks/hook-templates';
import { HookConfigModal } from './HookConfigModal';

const TYPE_LABELS: Record<string, string> = {
  twap: 'TWAP',
  limit_order: 'Limit Order',
  dynamic_fee: 'Dynamic Fee',
};

export function HookTemplateList() {
  const activeChainId = useDefiStore((s) => s.activeChainId);
  const templates = getHookTemplatesForChain(activeChainId);
  const [selectedTemplate, setSelectedTemplate] = useState<HookTemplate | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-amber-500" />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Hook Templates</h3>
      </div>

      {templates.length === 0 ? (
        <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-8 text-center">
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>No hook templates available for this chain.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border border-[#e5e7eb] rounded-[16px] bg-white p-4 hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 bg-amber-100 border border-amber-300 rounded-[8px]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {TYPE_LABELS[template.type] || template.type}
                </span>
                <span className="font-mono text-[10px] text-[#6b7280]">${template.x402Fee}</span>
              </div>
              <h4 className="text-sm font-bold mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{template.name}</h4>
              <p className="text-[10px] text-[#6b7280] mb-3 line-clamp-3" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{template.description}</p>
              <button
                onClick={() => setSelectedTemplate(template)}
                className="w-full py-2 border border-[#e5e7eb] rounded-[8px] text-[10px] font-bold uppercase tracking-wider hover:bg-[#f7f7f7] transition-colors"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Configure & Deploy
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <HookConfigModal
          template={selectedTemplate}
          chainId={activeChainId}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
    </div>
  );
}
