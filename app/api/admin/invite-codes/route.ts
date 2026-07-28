import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';

// Unambiguous character set for code generation (no O/0, I/1, etc.)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `SUPER-${result}`;
}

/** GET – list all invite codes with usage stats */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from('invite_codes')
    .select('id, code, created_by, max_uses, current_uses, expires_at, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch invite codes:', error);
    return NextResponse.json({ error: 'Failed to fetch invite codes' }, { status: 500 });
  }

  return NextResponse.json({ codes: data ?? [] });
}

/** POST – generate new invite codes */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { count = 1, maxUses = 1, expiresAt } = await req.json();

  const numCodes = Math.min(Math.max(1, count), 100); // cap at 100

  const codes = Array.from({ length: numCodes }, () => ({
    code: generateCode(),
    created_by: auth.email,
    max_uses: maxUses ?? null,
    expires_at: expiresAt || null,
  }));

  const { data, error } = await supabaseAdmin
    .from('invite_codes')
    .insert(codes)
    .select('id, code, max_uses, expires_at, created_at');

  if (error) {
    console.error('Failed to create invite codes:', error);
    return NextResponse.json({ error: 'Failed to create invite codes' }, { status: 500 });
  }

  return NextResponse.json({ success: true, codes: data ?? [] });
}

/** DELETE – deactivate a code */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { codeId } = await req.json();

  if (!codeId || typeof codeId !== 'string') {
    return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('invite_codes')
    .update({ is_active: false })
    .eq('id', codeId);

  if (error) {
    console.error('Failed to deactivate invite code:', error);
    return NextResponse.json({ error: 'Failed to deactivate code' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
