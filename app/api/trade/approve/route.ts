import { NextRequest, NextResponse } from 'next/server';

/**
 * Helper endpoint to generate Permit2 approval transaction data.
 *
 * This endpoint returns the transaction data needed to approve
 * the Permit2 contract to spend tokens on behalf of the user.
 *
 * The user's wallet must sign and send this transaction.
 */

const BASE_CHAIN_ID = 8453;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Max uint256 for unlimited approval
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ERC20 approve function signature: approve(address spender, uint256 amount)
const APPROVE_FUNCTION_SIGNATURE = '0x095ea7b3';

function isAddressLike(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate token (only USDC for now)
    const token = body.token || BASE_USDC;
    if (!isAddressLike(token) || token.toLowerCase() !== BASE_USDC.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: 'Only Base USDC is supported' },
        { status: 400 }
      );
    }

    // Encode the approve transaction data
    // approve(address spender, uint256 amount)
    const spenderPadded = PERMIT2_ADDRESS.slice(2).padStart(64, '0');
    const amountPadded = MAX_UINT256.slice(2).padStart(64, '0');
    const data = `${APPROVE_FUNCTION_SIGNATURE}${spenderPadded}${amountPadded}`;

    return NextResponse.json({
      ok: true,
      transaction: {
        to: BASE_USDC as `0x${string}`,
        data: data as `0x${string}`,
        value: '0',
        chainId: BASE_CHAIN_ID,
      },
      info: {
        action: 'approve',
        token: BASE_USDC,
        tokenSymbol: 'USDC',
        spender: PERMIT2_ADDRESS,
        spenderName: 'Permit2 (0x Universal Router)',
        amount: 'unlimited',
        note: 'This is a one-time approval. After approving, you can swap without approving again.',
      },
    });
  } catch (e) {
    // Log error for debugging (server-side only)
    console.error('[Approve] Unexpected error:', e);

    // Return user-friendly error message
    const userMessage =
      e instanceof Error && e.message
        ? 'Failed to generate approval transaction. Please try again.'
        : 'An unexpected error occurred. Please try again.';

    return NextResponse.json(
      {
        ok: false,
        error: userMessage,
        // Include technical details only in development
        ...(process.env.NODE_ENV === 'development' && {
          _debug: {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          },
        }),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/trade/approve',
    description: 'Generate Permit2 approval transaction data',
    usage: {
      method: 'POST',
      body: {
        token: 'Token address (optional, defaults to Base USDC)',
      },
      response: {
        transaction: 'Transaction data to sign and send',
        info: 'Human-readable approval details',
      },
    },
    permit2Address: PERMIT2_ADDRESS,
    supportedTokens: ['USDC (Base)'],
  });
}
