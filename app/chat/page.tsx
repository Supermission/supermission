'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const MARKET_AGENTS = new Set(['prediction-market']);

function ChatRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const agent = searchParams?.get('agent');
    const prompt = searchParams?.get('prompt')?.toLowerCase() || '';

    // Route prediction-market related requests to /markets, everything else to /defai (DELPHI)
    if (agent && MARKET_AGENTS.has(agent) || prompt.includes('prediction') || prompt.includes('bet') || prompt.includes('polymarket')) {
      router.replace('/markets');
    } else {
      router.replace('/defai');
    }
  }, [router, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <p className="text-[14px] text-[#a1a1aa]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
        Redirecting...
      </p>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-white">
        <p className="text-[14px] text-[#a1a1aa]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
          Redirecting...
        </p>
      </div>
    }>
      <ChatRedirect />
    </Suspense>
  );
}
