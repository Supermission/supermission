/**
 * POST /api/agents/claim — Claim an agent by posting a tweet
 * GET  /api/agents/claim?token=xxx — Check claim status
 *
 * No auth required (public claim endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';


/**
 * Extract X/Twitter handle from a tweet URL.
 * Handles: twitter.com, x.com, mobile.twitter.com
 */
function extractXHandle(tweetUrl: string): string | null {
  try {
    const url = new URL(tweetUrl);
    const hostname = url.hostname.replace('www.', '').replace('mobile.', '');
    if (hostname !== 'twitter.com' && hostname !== 'x.com') return null;

    // URL format: https://x.com/<handle>/status/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 1) {
      return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify a tweet exists and contains the verification code via Twitter's oembed API.
 * Returns { verified, authorHandle, error? }
 */
async function verifyTweet(
  tweetUrl: string,
  verificationCode: string
): Promise<{ verified: boolean; authorHandle?: string; error?: string }> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        return { verified: false, error: 'Tweet not found. Make sure the tweet exists and is public.' };
      }
      return { verified: false, error: `Failed to verify tweet (status ${res.status})` };
    }

    const data = await res.json() as { html?: string; author_name?: string; author_url?: string };

    // Extract author handle from author_url (e.g. "https://twitter.com/handle")
    let authorHandle: string | undefined;
    if (data.author_url) {
      const authorPath = new URL(data.author_url).pathname.split('/').filter(Boolean);
      if (authorPath.length >= 1) {
        authorHandle = authorPath[0].toLowerCase();
      }
    }

    // Check that the tweet HTML contains the verification code
    const html = data.html || '';
    if (!html.toLowerCase().includes(verificationCode.toLowerCase())) {
      return {
        verified: false,
        authorHandle,
        error: `Tweet does not contain the verification code "${verificationCode}". Please include it in your tweet.`,
      };
    }

    return { verified: true, authorHandle };
  } catch (err) {
    console.error('[claim] Tweet verification error:', err);
    return { verified: false, error: 'Could not verify tweet. Please try again.' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimToken, tweetUrl } = body;

    if (!claimToken) {
      return NextResponse.json(
        { success: false, error: 'claimToken is required' },
        { status: 400 }
      );
    }
    if (!tweetUrl) {
      return NextResponse.json(
        { success: false, error: 'tweetUrl is required' },
        { status: 400 }
      );
    }

    // Validate tweet URL
    const handle = extractXHandle(tweetUrl);
    if (!handle) {
      return NextResponse.json(
        { success: false, error: 'Invalid tweet URL. Must be a twitter.com or x.com URL.' },
        { status: 400 }
      );
    }

    // Look up claim
    const { data: claim, error: fetchError } = await supabaseAdmin
      .from('agent_claims')
      .select('*, marketplace_agents(agent_name)')
      .eq('claim_token', claimToken)
      .single();

    if (fetchError || !claim) {
      return NextResponse.json(
        { success: false, error: 'Claim not found' },
        { status: 404 }
      );
    }

    if (claim.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Claim is already ${claim.status}` },
        { status: 400 }
      );
    }

    // Check expiry
    if (claim.expires_at && new Date(claim.expires_at) < new Date()) {
      await supabaseAdmin
        .from('agent_claims')
        .update({ status: 'expired' })
        .eq('id', claim.id);

      return NextResponse.json(
        { success: false, error: 'Claim has expired' },
        { status: 400 }
      );
    }

    // Verify the tweet actually exists and contains the verification code
    const verification = await verifyTweet(tweetUrl, claim.verification_code);
    if (!verification.verified) {
      return NextResponse.json(
        { success: false, error: verification.error || 'Tweet verification failed' },
        { status: 400 }
      );
    }

    // Verify the tweet author matches the handle from the URL
    if (verification.authorHandle && handle.toLowerCase() !== verification.authorHandle) {
      return NextResponse.json(
        { success: false, error: `Tweet author (@${verification.authorHandle}) does not match the URL handle (@${handle})` },
        { status: 400 }
      );
    }

    // Update claim
    const { error: updateError } = await supabaseAdmin
      .from('agent_claims')
      .update({
        status: 'claimed',
        claimed_by: handle,
        claim_tweet_url: tweetUrl,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', claim.id);

    if (updateError) {
      console.error('[claim] Update failed:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to process claim' },
        { status: 500 }
      );
    }

    const agentName = ((claim.marketplace_agents as unknown as { agent_name: string })?.agent_name) || 'Unknown';

    return NextResponse.json({
      success: true,
      claim: {
        agentName,
        claimedBy: handle,
        tweetUrl,
        claimedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[claim] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Claim failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({
      endpoint: 'POST /api/agents/claim',
      description: 'Claim an agent by tweeting your verification code and submitting the tweet URL.',
      request: {
        claimToken: '(required) string — the claim token from onboarding',
        tweetUrl: '(required) string — URL to your tweet containing the verification code',
      },
      response: {
        success: 'boolean',
        claim: '{ agentName, claimedBy, tweetUrl, claimedAt }',
      },
    });
  }

  // Look up claim status
  const { data: claim, error } = await supabaseAdmin
    .from('agent_claims')
    .select('verification_code, status, claimed_by, claim_tweet_url, claimed_at, expires_at, marketplace_agents(agent_name)')
    .eq('claim_token', token)
    .single();

  if (error || !claim) {
    return NextResponse.json(
      { success: false, error: 'Claim not found' },
      { status: 404 }
    );
  }

  const agentName = ((claim.marketplace_agents as unknown as { agent_name: string })?.agent_name) || 'Unknown';

  return NextResponse.json({
    success: true,
    claim: {
      agentName,
      verificationCode: claim.verification_code,
      status: claim.status,
      claimedBy: claim.claimed_by,
      tweetUrl: claim.claim_tweet_url,
      claimedAt: claim.claimed_at,
      expiresAt: claim.expires_at,
    },
  });
}
