import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { sendEmail } from '@/lib/email/resend';
import { approvalWelcomeEmail, approvalWelcomeEmailText } from '@/lib/email/templates';

/** GET – list all waitlist entries */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from('waitlist')
    .select('id, email, status, created_at, approved_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch waitlist:', error);
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}

/** POST – approve or reject waitlist entries (single or bulk) */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { action } = body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
  }

  // Support both single email and bulk emails
  const rawEmails = Array.isArray(body.emails)
    ? body.emails
    : body.email
      ? [body.email]
      : [];

  const emails: string[] = [...new Set<string>(
    rawEmails
      .map((e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
      .filter((e: string) => e.length > 0 && e.includes('@'))
  )];

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Valid email(s) required' }, { status: 400 });
  }

  if (action === 'reject') {
    const { error } = await supabaseAdmin
      .from('waitlist')
      .update({ status: 'rejected' })
      .in('email', emails);

    if (error) {
      console.error('Failed to reject waitlist entries:', error);
      return NextResponse.json({ error: 'Failed to reject' }, { status: 500 });
    }

    return NextResponse.json({ success: true, emails, action });
  }

  // Approve
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('waitlist')
    .update({ status: 'approved', approved_at: now })
    .in('email', emails);

  if (error) {
    console.error('Failed to approve waitlist entries:', error);
    return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
  }

  // Send approval emails
  await Promise.all(
    emails.map((email) =>
      sendEmail(email, 'Welcome to Supermission!', approvalWelcomeEmail(), approvalWelcomeEmailText()).catch((err) =>
        console.error(`Failed to send approval email to ${email}:`, err)
      )
    )
  );

  return NextResponse.json({ success: true, emails, action });
}
