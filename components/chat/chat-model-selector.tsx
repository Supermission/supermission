'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useChatStore } from '@/lib/store/chat';
import { CHAT_MODELS, type ChatModel } from '@/lib/ai/chat-models';

export function ChatModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModelId = useChatStore((state) => {
    const sessionId = state.currentSessionId;
    if (!sessionId) return 'default';
    return state.sessions[sessionId]?.selectedModelId || 'default';
  });
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);

  const selectedModel = CHAT_MODELS.find((m) => m.id === selectedModelId) ?? CHAT_MODELS[0];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (model: ChatModel) => {
    setSelectedModel(model.id);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Compact trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xs font-mono"
        title="Select AI Model"
      >
        {selectedModel.logo ? (
          <Image src={selectedModel.logo} alt={selectedModel.name} className="w-4 h-4 object-contain" width={16} height={16} unoptimized />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
        <span className="hidden sm:inline text-xs truncate max-w-[80px]">{selectedModel.name}</span>
        <svg
          className={`w-2.5 h-2.5 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - Brutalist theme */}
      {isOpen && (
        <div className="fixed sm:absolute bottom-20 sm:bottom-full left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 sm:right-auto sm:mb-2 w-[240px] sm:w-56 bg-white border border-[#e5e7eb] z-[9999] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)] rounded-[12px]">
          {/* Header */}
          <div className="px-3 py-2 sm:px-3 sm:py-1.5 bg-white border-b border-[#e5e7eb] rounded-t-[12px]">
            <span className="text-[11px] sm:text-[11px] font-semibold text-[#6b7280]">
              Select Model
            </span>
          </div>

          {/* Model list */}
          <div className="max-h-[280px] sm:max-h-[240px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {CHAT_MODELS.map((model) => {
              const isActive = model.id === selectedModel.id;
              return (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={`w-full px-3 py-2.5 sm:px-3 sm:py-2 text-left transition-colors flex items-center gap-2.5 sm:gap-2 border-b border-[#e5e7eb] last:border-b-0 ${
                    isActive
                      ? 'bg-[#f8fafc] text-[#3a3a3a]'
                      : 'hover:bg-[#f7f7f7]'
                  }`}
                >
                  {/* Icon/Logo */}
                  <div
                    className={`w-6 h-6 sm:w-5 sm:h-5 border rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'border-[#e5e7eb] bg-white' : 'border-[#e5e7eb] bg-[#f8fafc]'
                    }`}
                  >
                    {model.logo ? (
                      <Image src={model.logo} alt={model.name} className="w-4 h-4 sm:w-3.5 sm:h-3.5 object-contain" width={16} height={16} unoptimized />
                    ) : (
                      <span className="font-mono text-[10px] sm:text-[8px] font-bold">{model.icon}</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] sm:text-[10px] font-semibold text-[#3a3a3a] block leading-tight">
                      {model.name}
                    </span>
                    <span
                      className={`text-[9px] sm:text-[8px] mt-0.5 block ${
                        isActive ? 'text-[#6b7280]' : 'text-[#6b7280]'
                      }`}
                    >
                      {model.provider}
                    </span>
                  </div>
                  {/* Check mark */}
                  {isActive && (
                    <div className="w-5 h-5 sm:w-4 sm:h-4 bg-[#f8fafc] border border-[#e5e7eb] rounded flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-[#3a3a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
