'use client';

interface HookStatusCardProps {
  hookAddress: string;
  templateName: string;
  chainId: number;
  status: 'active' | 'pending' | 'failed';
  txHash?: string;
  deployedAt?: string;
}

const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io/address/',
  8453: 'https://basescan.org/address/',
  137: 'https://polygonscan.com/address/',
};

export function HookStatusCard({
  hookAddress,
  templateName,
  chainId,
  status,
  txHash,
  deployedAt,
}: HookStatusCardProps) {
  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{templateName}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 border rounded-[8px] ${
          status === 'active' ? 'border-green-500 text-green-700 bg-green-50' :
          status === 'pending' ? 'border-amber-500 text-amber-700 bg-amber-50' :
          'border-red-500 text-red-700 bg-red-50'
        }`} style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          {status}
        </span>
      </div>
      <p className="font-mono text-[10px] text-[#6b7280] break-all mb-2">{hookAddress}</p>
      {deployedAt && (
        <p className="text-[10px] text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{new Date(deployedAt).toLocaleDateString()}</p>
      )}
      {hookAddress && (
        <a
          href={`${EXPLORER_URLS[chainId] || EXPLORER_URLS[8453]}${hookAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] underline text-[#6b7280] hover:text-black"
        >
          View on explorer
        </a>
      )}
    </div>
  );
}
