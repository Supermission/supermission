'use client';

import { useEffect, useState } from 'react';
import { UsersOverviewCards } from '@/components/admin/users/UsersOverviewCards';
import { WaitlistFunnel } from '@/components/admin/users/WaitlistFunnel';
import { UserJourneyFunnel } from '@/components/admin/users/UserJourneyFunnel';
import { LoginChart } from '@/components/admin/users/LoginChart';
import { RecentLoginsTable } from '@/components/admin/users/RecentLoginsTable';
import { ComplianceTable } from '@/components/admin/users/ComplianceTable';

interface UsersData {
  overview: {
    totalUsers: number;
    totalWallets: number;
    logins24h: number;
    logins7d: number;
    totalLogins: number;
  };
  waitlistFunnel: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    approvalRate: number;
  };
  userJourney: {
    waitlisted: number;
    approved: number;
    loggedIn: number;
    traded: number;
    activeTraders: number;
    totalTraders: number;
  };
  compliance: {
    totalScreenings: number;
    pass: number;
    fail: number;
    error: number;
    blockedAddresses: string[];
  };
  dailyLogins: Array<{ date: string; count: number }>;
  recentLogins: Array<{
    email: string;
    walletCount: number;
    waitlistStatus: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
  }>;
  recentScreenings: Array<{
    address: string;
    chain: string;
    riskLevel: string | null;
    riskScore: number | null;
    flags: string[] | null;
    isBlocked: boolean;
    result: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Users & Auth</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Login activity, user journey, waitlist funnel, wallet mappings, and compliance screenings
        </p>
      </div>

      <UsersOverviewCards data={data?.overview ?? null} loading={loading} />

      {/* User Journey + Waitlist Funnel + Login Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <UserJourneyFunnel data={data?.userJourney ?? null} loading={loading} />
        </div>
        <div>
          <WaitlistFunnel data={data?.waitlistFunnel ?? null} loading={loading} />
        </div>
        <div>
          <LoginChart data={data?.dailyLogins ?? []} loading={loading} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Logins</h2>
        <RecentLoginsTable logins={data?.recentLogins ?? []} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">
          Compliance Screenings
          {data?.compliance && data.compliance.blockedAddresses.length > 0 && (
            <span className="ml-2 text-[11px] font-mono text-red-500">
              {data.compliance.blockedAddresses.length} blocked
            </span>
          )}
        </h2>
        <ComplianceTable screenings={data?.recentScreenings ?? []} loading={loading} />
      </div>
    </div>
  );
}
