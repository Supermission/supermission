'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`w-9 h-9 flex items-center justify-center border border-[#e7e9eb] rounded-[8px] hover:bg-[#f1f3f4] transition-all text-[#6b7280] ${
        copied ? 'bg-[#0aa545] border-[#0aa545] text-white' : ''
      }`}
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}
