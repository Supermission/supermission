import { supabaseAdmin } from '@/lib/supabase/client';
import { getValidAccessToken } from '@/lib/robinhood/store';
import { RobinhoodMcpClient, mcpResultToText } from '@/lib/robinhood/mcp-client';

export interface RoroStrategyResult {
  durationMs: number;
  evaluated: number;
  triggered: number;
  proposed: number;
  placed: number;
  errors: number;
}

/** Best-effort: pull the first plausible price number out of an MCP quote payload. */
function extractPrice(text: string): number | null {
  const m = text.match(/(?:"?(?:last|price|last_trade_price|mark)"?\s*[:=]\s*"?)(\d+(?:\.\d+)?)/i) || text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function conditionMet(cond: any, price: number | null): boolean {
  const type = cond?.type;
  if (type === 'always' || type === 'scheduled') return true;
  if (price == null) return false;
  const target = Number(cond?.price);
  if (!Number.isFinite(target)) return false;
  if (type === 'price_below') return price <= target;
  if (type === 'price_above') return price >= target;
  return false;
}

async function notify(owner: string, message: string) {
  try {
    await (supabaseAdmin as any).from('alert_notifications').insert({
      user_address: owner, message, is_read: false, created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[roro-strategies] notify failed:', err?.message);
  }
}

function nextRun(): string {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

/**
 * Evaluate due RORO strategies. Safe by default: when require_approval is true
 * the strategy PROPOSES a trade (in-app notification) instead of placing it.
 */
export async function runRoroStrategies(): Promise<RoroStrategyResult> {
  const t = Date.now();
  const res: RoroStrategyResult = { durationMs: 0, evaluated: 0, triggered: 0, proposed: 0, placed: 0, errors: 0 };

  const { data: due, error } = await (supabaseAdmin as any)
    .from('roro_strategies').select('*')
    .eq('is_active', true)
    .lte('next_run_at', new Date().toISOString())
    .limit(200);
  if (error) { console.error('[roro-strategies] load failed:', error.message); res.durationMs = Date.now() - t; return res; }

  for (const s of due || []) {
    res.evaluated++;
    try {
      const owner = s.owner_address as string;
      const symbol = String(s.action?.symbol || s.conditions?.symbol || '').toUpperCase();
      if (!symbol) { res.errors++; continue; }

      const token = await getValidAccessToken(owner);
      if (!token) { await notify(owner, `RORO strategy "${s.strategy_name}" skipped — Robinhood disconnected. Reconnect to resume.`); continue; }
      const client = new RobinhoodMcpClient(token);

      let price: number | null = null;
      if (s.conditions?.type && s.conditions.type !== 'always' && s.conditions.type !== 'scheduled') {
        try { price = extractPrice(mcpResultToText(await client.callTool('get_equity_quotes', { symbols: [symbol] }))); } catch { /* price stays null */ }
      }

      if (!conditionMet(s.conditions, price)) continue;
      res.triggered++;

      const orderArgs: Record<string, any> = { symbol, side: s.action?.side, order_type: s.action?.order_type || 'market' };
      if (s.action?.quantity != null) orderArgs.quantity = s.action.quantity;
      if (s.action?.amount_dollars != null) orderArgs.amount_dollars = s.action.amount_dollars;
      if (s.action?.limit_price != null) orderArgs.limit_price = s.action.limit_price;
      if (s.action?.time_in_force) orderArgs.time_in_force = s.action.time_in_force;
      const summary = `${orderArgs.side} ${orderArgs.quantity ?? ('$' + orderArgs.amount_dollars)} ${symbol} (${orderArgs.order_type})`;

      if (s.require_approval) {
        await notify(owner, `RORO strategy "${s.strategy_name}" wants to ${summary}. Open RORO to approve.`);
        res.proposed++;
      } else {
        try {
          const r = await client.callTool('place_equity_order', orderArgs);
          await notify(owner, `RORO auto-executed "${s.strategy_name}": ${summary}. ${mcpResultToText(r).slice(0, 200)}`);
          res.placed++;
        } catch (err: any) {
          await notify(owner, `RORO strategy "${s.strategy_name}" failed to place ${summary}: ${err?.message || 'error'}`);
          res.errors++;
        }
      }

      await (supabaseAdmin as any).from('roro_strategies').update({
        triggers_count: (s.triggers_count || 0) + 1,
        last_triggered_at: new Date().toISOString(),
        next_run_at: nextRun(),
        updated_at: new Date().toISOString(),
      }).eq('id', s.id);
    } catch (err: any) {
      console.error('[roro-strategies] strategy error:', err?.message);
      res.errors++;
    }
  }

  res.durationMs = Date.now() - t;
  console.log(`[roro-strategies] evaluated=${res.evaluated} triggered=${res.triggered} proposed=${res.proposed} placed=${res.placed} errors=${res.errors} in ${res.durationMs}ms`);
  return res;
}
