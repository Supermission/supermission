'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HookTemplate } from '@/lib/uniswap/hooks/hook-templates';
import { useUniswapHooks } from '@/lib/hooks/use-uniswap-hooks';
import { SwapProgress } from './SwapProgress';
import type { SupportedChainId } from '@/lib/uniswap/types';

interface HookConfigModalProps {
  template: HookTemplate;
  chainId: SupportedChainId;
  onClose: () => void;
}

export function HookConfigModal({ template, chainId, onClose }: HookConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    template.configSchema.forEach((field) => {
      if (field.defaultValue !== undefined) defaults[field.key] = field.defaultValue;
    });
    return defaults;
  });

  const { deploy, progress, isDeploying } = useUniswapHooks();
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    // Validate required fields
    for (const field of template.configSchema) {
      if (field.required && !config[field.key]) {
        setError(`${field.label} is required`);
        return;
      }
    }
    setError(null);

    try {
      await deploy(template, config, chainId);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={!isDeploying ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-sm font-bold uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              {template.name}
            </span>
            {!isDeploying && (
              <button onClick={onClose} className="hover:bg-[#f7f7f7] p-1 transition-colors rounded-[8px]">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="p-4 space-y-4">
            <p className="text-xs text-black/60" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{template.description}</p>

            {/* Config fields */}
            {template.configSchema.map((field) => (
              <div key={field.key}>
                <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  {field.label} {field.required && '*'}
                </label>
                {field.description && (
                  <p className="text-[9px] text-[#6b7280] mb-1" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{field.description}</p>
                )}
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={String(config[field.key] || '')}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.label}
                  className="w-full mt-1 px-3 py-2 border border-[#e5e7eb] rounded-[8px] font-mono text-xs focus:outline-none"
                />
              </div>
            ))}

            {/* Fee notice */}
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-[8px]">
              <p className="text-[10px] text-amber-700 text-center" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Deployment fee: ${template.x402Fee} USDC
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-[8px]">
                <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                <p className="text-[10px] text-red-700" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{error}</p>
              </div>
            )}

            {/* Deploy button */}
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="w-full py-3.5 bg-amber-500 text-white rounded-[8px] text-sm font-bold uppercase tracking-wider hover:bg-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {isDeploying ? 'Deploying...' : 'Deploy Hook'}
            </button>

            {/* Progress */}
            {progress.step !== 'idle' && (
              <div className="border-t border-[#e5e7eb] pt-3">
                <p className="text-xs" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{progress.message}</p>
                {progress.hookAddress && (
                  <p className="font-mono text-[10px] text-[#6b7280] mt-1">
                    Hook: {progress.hookAddress}
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
