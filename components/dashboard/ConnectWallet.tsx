import { Header } from '@/components/layout/header';

export function ConnectWallet() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="border border-[#e5e7eb] rounded-[16px] p-8 bg-white text-center max-w-md shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <h2 className="font-black text-xl uppercase mb-4" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>CONNECT WALLET</h2>
          <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
            Please connect your wallet to view your dashboard
          </p>
        </div>
      </div>
    </div>
  );
}