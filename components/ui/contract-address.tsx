'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { Copy, Check, ExternalLink } from 'lucide-react';

const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  42161: 'https://arbiscan.io',
  43114: 'https://snowtrace.io',
};

export function shortAddress(a: string | undefined | null): string {
  if (!a || a.length < 12) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface ContractAddressProps {
  address: string;
  chainId: number;
  /** Short contextual label rendered before the address, e.g. "Router", "Vault", "Pool". */
  label?: string;
  className?: string;
}

/**
 * Inline checksummed contract address with copy + explorer affordances.
 * Use in transaction cards so users can verify which contract their signature goes to.
 */
export function ContractAddress({ address, chainId, label, className = '' }: ContractAddressProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const checksummed = useMemo(
    () => (address && isAddress(address) ? getAddress(address) : null),
    [address],
  );
  const explorer = useMemo(() => EXPLORER_URLS[chainId] || 'https://etherscan.io', [chainId]);

  if (!checksummed) return null;

  const short = shortAddress(checksummed);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(checksummed);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied — silent
    }
  };

  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-[#9ca3af] ${className}`}>
      {label && <span className="text-[#9ca3af]">{label}:</span>}
      <span className="font-mono tabular-nums text-[#6b7280]" title={checksummed}>
        {short}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="p-0.5 rounded hover:bg-[#f0f0f0] transition-colors text-[#9ca3af] hover:text-[#1a1a1a]"
        aria-label={copied ? 'Copied' : 'Copy address'}
        title={copied ? 'Copied' : 'Copy address'}
      >
        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      </button>
      <a
        href={`${explorer}/address/${checksummed}`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-0.5 rounded hover:bg-[#f0f0f0] transition-colors text-[#9ca3af] hover:text-[#1a1a1a]"
        aria-label="View on block explorer"
        title="View on block explorer"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
