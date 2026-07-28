/**
 * Client-side tracking helpers.
 * Fire-and-forget POSTs to /api/track for recording events from the browser.
 */

const TRACK_ENDPOINT = '/api/track';

function track(event: string, data: Record<string, any>) {
  try {
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...data, timestamp: new Date().toISOString() }),
    }).catch(() => {});
  } catch {}
}

export function trackTradeFailure(params: {
  userAddress: string;
  side: 'BUY' | 'SELL';
  conditionId?: string;
  tokenId?: string;
  amount?: number;
  errorReason: string;
  errorStep?: string;
}) {
  track('trade_failure', params);
}

export function trackBridgeInitiated(params: {
  userAddress: string;
  amount: string;
  sourceChain?: string;
  destChain?: string;
}) {
  track('bridge_initiated', params);
}

export function trackBridgeTxSent(params: {
  userAddress: string;
  amount: string;
  txHash: string;
  depositAddress: string;
}) {
  track('bridge_tx_sent', params);
}

export function trackBridgeResult(params: {
  userAddress: string;
  amount: string;
  txHash?: string;
  status: 'arrived' | 'timeout' | 'failed';
  errorMessage?: string;
}) {
  track('bridge_result', params);
}
