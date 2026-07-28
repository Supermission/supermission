import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * RORO scheduled/automated strategies CRUD. Owner-scoped via x-verified-wallet.
 * conditions/action are typed JSONB (see runner in lib/server/jobs/roro-strategies.ts).
 * Default require_approval=true → the runner PROPOSES (notifies) rather than auto-trades.
 */
const MAX_STRATEGIES = 20;

function owner(request: NextRequest): string | null {
  return request.headers.get('x-verified-wallet')?.split(',')[0]?.toLowerCase() || null;
}

function computeNextRun(schedule: any): string | null {
  // Minimal: schedule.every_minutes → next_run_at. Absent → run each cron tick.
  const mins = Number(schedule?.every_minutes);
  if (Number.isFinite(mins) && mins > 0) return new Date(Date.now() + mins * 60_000).toISOString();
  return new Date().toISOString();
}

export async function GET(request: NextRequest) {
  const addr = owner(request);
  if (!addr) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  const { data, error } = await (supabaseAdmin as any)
    .from('roro_strategies').select('*').eq('owner_address', addr).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategies: data || [] });
}

export async function POST(request: NextRequest) {
  const addr = owner(request);
  if (!addr) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body?.strategy_name || !body?.conditions || !body?.action) {
    return NextResponse.json({ error: 'strategy_name, conditions, action are required' }, { status: 400 });
  }
  const { count } = await (supabaseAdmin as any)
    .from('roro_strategies').select('id', { count: 'exact', head: true }).eq('owner_address', addr).eq('is_active', true);
  if ((count ?? 0) >= MAX_STRATEGIES) {
    return NextResponse.json({ error: `Max ${MAX_STRATEGIES} active strategies` }, { status: 400 });
  }
  const { data, error } = await (supabaseAdmin as any).from('roro_strategies').insert({
    owner_address: addr,
    strategy_name: String(body.strategy_name).slice(0, 120),
    conditions: body.conditions,
    action: body.action,
    require_approval: body.require_approval !== false, // default true (safe)
    is_active: true,
    next_run_at: computeNextRun(body.schedule),
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategy: data });
}

export async function PUT(request: NextRequest) {
  const addr = owner(request);
  if (!addr) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['strategy_name', 'conditions', 'action', 'require_approval', 'is_active'] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { data, error } = await (supabaseAdmin as any)
    .from('roro_strategies').update(patch).eq('id', body.id).eq('owner_address', addr).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategy: data });
}

export async function DELETE(request: NextRequest) {
  const addr = owner(request);
  if (!addr) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await (supabaseAdmin as any)
    .from('roro_strategies').delete().eq('id', id).eq('owner_address', addr);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
