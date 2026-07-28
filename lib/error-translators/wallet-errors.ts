/**
 * Centralised translator for wallet / tx / RPC errors.
 *
 * Raw errors from viem, wagmi, Privy, LiFi, and on-chain reverts leak
 * internals like "execution reverted: 0x..." or "TransferHelper: TRANSFER_FROM_FAILED"
 * which are useless to end users. translateWalletError() maps the common
 * patterns to a short title + actionable hint.
 *
 * If nothing matches, we return the original shortMessage/message (still better
 * than "Something went wrong") alongside a generic hint.
 */

export interface TranslatedError {
  title: string;
  hint?: string;
  raw?: string;
}

interface ErrorLike {
  message?: string;
  shortMessage?: string;
  code?: string | number;
  name?: string;
  cause?: unknown;
}

function extract(err: unknown): { msg: string; code?: string | number; name?: string } {
  if (!err) return { msg: '' };
  if (typeof err === 'string') return { msg: err };
  const e = err as ErrorLike;
  const msg = e.shortMessage || e.message || '';
  return { msg, code: e.code, name: e.name };
}

export function translateWalletError(err: unknown): TranslatedError {
  const { msg, code, name } = extract(err);
  const raw = msg || (typeof err === 'object' ? JSON.stringify(err) : String(err));
  const lower = msg.toLowerCase();

  // User-initiated rejections
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    name === 'UserRejectedRequestError' ||
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('request rejected')
  ) {
    return {
      title: 'You rejected the signature request.',
      hint: 'Retry if you changed your mind.',
      raw,
    };
  }

  // Network / RPC
  if (
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('timeout') ||
    lower.includes('etimedout')
  ) {
    return {
      title: 'Network hiccup.',
      hint: 'Check your connection and retry.',
      raw,
    };
  }

  // Balance / allowance
  if (lower.includes('insufficient funds')) {
    return {
      title: 'Not enough balance to cover the amount plus gas.',
      hint: 'Top up, reduce the amount, or try on a chain where you have funds.',
      raw,
    };
  }
  if (
    lower.includes('insufficient allowance') ||
    lower.includes('erc20: insufficient allowance') ||
    lower.includes('transfer_from_failed')
  ) {
    return {
      title: 'Token approval is too low or missing.',
      hint: 'The spend approval needs to be set before this transaction can succeed. Retry to re-check.',
      raw,
    };
  }
  if (lower.includes('insufficient balance') || lower.includes('transfer amount exceeds balance')) {
    return {
      title: 'Balance too low for this transaction.',
      hint: 'Lower the amount or deposit more of the token you are spending.',
      raw,
    };
  }

  // Slippage / price movement
  if (
    lower.includes('slippage') ||
    lower.includes('too little received') ||
    lower.includes('price impact too high') ||
    lower.includes('minimum output') ||
    lower.includes('min_amount_out')
  ) {
    return {
      title: 'Price moved while preparing the transaction.',
      hint: 'Try again with a higher slippage tolerance, or wait for the market to settle.',
      raw,
    };
  }

  // Liquidity
  if (
    lower.includes('insufficient liquidity') ||
    lower.includes('no route found') ||
    lower.includes('no routes found') ||
    lower.includes('unable to find route')
  ) {
    return {
      title: 'Not enough liquidity on the chosen route.',
      hint: 'Try a smaller amount or a different token pair.',
      raw,
    };
  }

  // Nonce / replacement
  if (lower.includes('nonce too low') || lower.includes('replacement transaction underpriced')) {
    return {
      title: 'Another transaction is in flight from this wallet.',
      hint: 'Wait a moment for the previous transaction to land, then retry.',
      raw,
    };
  }

  // Gas
  if (
    lower.includes('gas required exceeds') ||
    lower.includes('intrinsic gas too low') ||
    lower.includes('out of gas')
  ) {
    return {
      title: 'Transaction ran out of gas.',
      hint: 'Retry — the estimate will be adjusted.',
      raw,
    };
  }

  // Chain / network mismatch
  if (
    lower.includes('chain mismatch') ||
    lower.includes('wrong network') ||
    lower.includes('unsupported chain') ||
    lower.includes('switch chain')
  ) {
    return {
      title: 'Wrong network selected in your wallet.',
      hint: 'Switch networks and retry. Privy embedded wallets switch automatically.',
      raw,
    };
  }

  // Polymarket CLOB: "maker address not allowed". Usually means we signed the
  // order with the wrong maker for the user's account type — Polymarket-frontend
  // funded accounts use a Magic-style proxy as maker, not the EOA. The trade
  // execution path now resolves this via lib/polymarket/proxy.ts; if this error
  // still surfaces, the proxy isn't initialized yet or it's a less common case.
  if (
    lower.includes('maker address not allowed') ||
    lower.includes('maker not allowed') ||
    (lower.includes('not allowed') && lower.includes('deposit wallet'))
  ) {
    return {
      title: 'Polymarket rejected this order.',
      hint: 'Your account may need to be initialized on polymarket.com first, or the wallet holding your funds may differ from the one signing. Complete one trade on polymarket.com if you haven\'t already, then try again.',
      raw,
    };
  }

  // Generic revert
  if (
    lower.includes('execution reverted') ||
    lower.startsWith('0x') ||
    lower.includes('transaction failed') ||
    lower.includes('reverted')
  ) {
    return {
      title: 'Transaction was rejected on-chain.',
      hint: 'Market conditions changed or an approval is missing. Retry, or reduce the amount.',
      raw,
    };
  }

  // Fallback — return the original message but clean it up
  return {
    title: msg ? truncate(msg, 140) : 'Transaction failed.',
    hint: 'Retry or reach out if this keeps happening.',
    raw,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** Convenience: flatten to a single human string, for progress.message etc. */
export function translateWalletErrorToString(err: unknown): string {
  const t = translateWalletError(err);
  return t.hint ? `${t.title} ${t.hint}` : t.title;
}
