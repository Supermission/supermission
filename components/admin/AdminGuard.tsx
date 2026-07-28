'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { ready, authenticated, login } = usePrivy();
  const [status, setStatus] = useState<'checking' | 'authorized' | 'denied'>('checking');

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setStatus('denied');
      return;
    }

    let cancelled = false;

    fetch('/api/admin/verify', { cache: 'no-store' })
      .then((res) => {
        if (!cancelled) setStatus(res.ok ? 'authorized' : 'denied');
      })
      .catch(() => {
        if (!cancelled) setStatus('denied');
      });

    return () => { cancelled = true; };
  }, [ready, authenticated]);

  if (!ready || status === 'checking') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 mx-auto mb-3 border-2 border-gray-200 border-t-[#1a1a1a] rounded-full animate-spin" />
          <p className="text-sm text-gray-400 font-medium">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red-500">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Access Denied</h1>
          <p className="text-sm text-gray-500 mb-6">
            You don&apos;t have admin privileges. Contact the team if you believe this is an error.
          </p>
          {!authenticated && (
            <button
              onClick={() => login()}
              className="px-4 py-2 text-sm font-medium bg-[#1a1a1a] text-white rounded-[8px] hover:bg-[#3a3a3a] transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
