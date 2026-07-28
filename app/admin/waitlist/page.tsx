'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { WaitlistTable, WaitlistEntry } from '@/components/admin/waitlist/WaitlistTable';
import { InviteCodesTable, InviteCode } from '@/components/admin/waitlist/InviteCodesTable';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || '';

export default function AdminWaitlistPage() {
  const [tab, setTab] = useState<'users' | 'codes'>('users');

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [generateLoading, setGenerateLoading] = useState(false);

  const fetchEntries = useCallback(() => {
    fetch('/api/admin/waitlist')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(console.error)
      .finally(() => setLoadingEntries(false));
  }, []);

  const fetchCodes = useCallback(() => {
    fetch('/api/admin/invite-codes')
      .then((r) => r.json())
      .then((d) => setCodes(d.codes ?? []))
      .catch(console.error)
      .finally(() => setLoadingCodes(false));
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchCodes();
  }, [fetchEntries, fetchCodes]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;

    const client = createClient(supabaseUrl, supabaseAnonKey);
    const channel = client
      .channel('admin-waitlist')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waitlist' },
        () => fetchEntries()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invite_codes' },
        () => fetchCodes()
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [fetchEntries, fetchCodes]);

  const handleAction = async (email: string, action: 'approve' | 'reject') => {
    setActionLoading(email);
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      if (res.ok) {
        if (action === 'reject') {
          setEntries((prev) => prev.filter((e) => e.email !== email));
        } else {
          setEntries((prev) =>
            prev.map((e) =>
              e.email === email
                ? { ...e, status: 'approved', approved_at: new Date().toISOString() }
                : e
            )
          );
        }
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = async (emails: string[]) => {
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, action: 'approve' }),
      });
      if (res.ok) {
        setEntries((prev) =>
          prev.map((e) =>
            emails.includes(e.email)
              ? { ...e, status: 'approved', approved_at: new Date().toISOString() }
              : e
          )
        );
      }
    } catch (err) {
      console.error('Bulk approve failed:', err);
    }
  };

  const handleGenerate = async (count: number, maxUses: number, expiresAt: string | null) => {
    setGenerateLoading(true);
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, maxUses, expiresAt }),
      });
      if (res.ok) {
        fetchCodes();
      }
    } catch (err) {
      console.error('Generate codes failed:', err);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleDeactivate = async (codeId: string) => {
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId }),
      });
      if (res.ok) {
        setCodes((prev) => prev.map((c) => (c.id === codeId ? { ...c, is_active: false } : c)));
      }
    } catch (err) {
      console.error('Deactivate code failed:', err);
    }
  };

  const pending = entries.filter((e) => e.status === 'pending').length;
  const activeCodes = codes.filter((c) => c.is_active).length;

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Waitlist</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Manage waitlist signups and invite codes
          {!loadingEntries && pending > 0 && (
            <span className="ml-2 text-amber-600 font-mono text-[11px] font-semibold">
              {pending} pending
            </span>
          )}
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 border border-[#e5e7eb] rounded-[10px] p-1 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`text-[12px] font-semibold px-4 py-1.5 rounded-[8px] transition-all ${
            tab === 'users' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          Users ({entries.length})
        </button>
        <button
          onClick={() => setTab('codes')}
          className={`text-[12px] font-semibold px-4 py-1.5 rounded-[8px] transition-all ${
            tab === 'codes' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          Invite Codes ({activeCodes})
        </button>
      </div>

      {tab === 'users' ? (
        <WaitlistTable
          entries={entries}
          loading={loadingEntries}
          onAction={handleAction}
          onBulkApprove={handleBulkApprove}
          actionLoading={actionLoading}
        />
      ) : (
        <InviteCodesTable
          codes={codes}
          loading={loadingCodes}
          onGenerate={handleGenerate}
          onDeactivate={handleDeactivate}
          generateLoading={generateLoading}
        />
      )}
    </div>
  );
}
