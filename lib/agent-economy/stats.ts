import { supabaseAdmin } from '@/lib/supabase/client';

export interface PlatformStats {
  totalTrades: number;
  totalVolume: string;
  totalUsers: number;
  totalSignals: number;
}

const EMPTY_STATS: PlatformStats = { totalTrades: 0, totalVolume: '0', totalUsers: 0, totalSignals: 0 };

async function fetchPlatformStats(): Promise<PlatformStats> {
  const [tradesRes, walletsRes, signalsRes] = await Promise.all([
    supabaseAdmin.from('trade_history').select('amount'),
    supabaseAdmin.from('user_wallets').select('email'),
    supabaseAdmin.from('market_signals').select('id', { count: 'exact', head: true }),
  ]);

  const tradeRows = tradesRes.data || [];
  const totalVolume = tradeRows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const uniqueEmails = new Set((walletsRes.data || []).map((w: any) => w.email)).size;

  return {
    totalTrades: tradeRows.length,
    totalVolume: totalVolume.toFixed(2),
    totalUsers: uniqueEmails,
    totalSignals: signalsRes.count || 0,
  };
}

/**
 * Platform stats for the marketing page. The page itself is ISR-cached
 * (`revalidate = 60`), but regeneration still awaits this — so we hard-cap it
 * with a timeout: a slow/offline DB must never block the landing page render.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const timeout = new Promise<PlatformStats>((resolve) => setTimeout(() => resolve(EMPTY_STATS), 1_500));
    return await Promise.race([fetchPlatformStats(), timeout]);
  } catch {
    return EMPTY_STATS;
  }
}
