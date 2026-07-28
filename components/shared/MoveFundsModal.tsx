'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { usePolymarketWithdraw } from '@/lib/hooks/use-polymarket-withdraw';
import { useBridgeWithdraw, BridgeWithdrawError, type BridgeQuote } from '@/lib/hooks/use-bridge-withdraw';
import { BASE_USDC_ADDRESS, POLYGON_USDC_NATIVE_ADDRESS, ARBITRUM_USDC_ADDRESS, ETHEREUM_USDC_ADDRESS } from '@/lib/tokens/registry';
import { useWallets } from '@privy-io/react-auth';
import { usePublicClient } from 'wagmi';
import { useLifiSwap } from '@/lib/hooks/use-uniswap-swap';
import { waitForArbUsdcBalance, USDC_ARBITRUM } from '@/lib/hyperliquid/deposit';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/store/ui';
import { usePathname } from 'next/navigation';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// ─── Account definitions ────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  sub: string;
  img: string;
}

const ACCOUNTS: Account[] = [
  { id: 'hl', name: 'Hyperliquid', sub: 'Trading Account', img: '/tokens/chain-hyperliquid.png' },
  { id: 'poly', name: 'Polymarket', sub: 'Polygon · pUSD', img: '/tokens/polymarket.png' },
  { id: 'base', name: 'Wallet', sub: 'Base', img: '/tokens/chain-base.png' },
  { id: 'polygon', name: 'Wallet', sub: 'Polygon', img: '/tokens/chain-polygon.png' },
  { id: 'arb', name: 'Wallet', sub: 'Arbitrum', img: '/tokens/chain-arbitrum.png' },
  { id: 'robinhood', name: 'Wallet', sub: 'Robinhood', img: '/tokens/chain-robinhood.png' },
  { id: 'ethereum', name: 'Wallet', sub: 'Ethereum', img: '/tokens/chain-ethereum.png' },
];

function AccountIcon({ account, size = 34 }: { account: Account; size?: number }) {
  return (
    <img
      src={account.img}
      alt={account.name}
      width={size}
      height={size}
      className="rounded-[10px] flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{ width: size, height: size, objectFit: 'cover' }}
    />
  );
}

// ─── Account selector dropdown ──────────────────────────────────────────────

function AccountSelector({ accounts, selected, onSelect, balances, open, onToggle, isDark }: {
  accounts: Account[];
  selected: Account;
  onSelect: (a: Account) => void;
  balances: Record<string, number>;
  open: boolean;
  onToggle: () => void;
  isDark: boolean;
}) {
  return (
    <div className="relative">
      <div
        onClick={onToggle}
        className={`flex items-center gap-3 cursor-pointer rounded-[10px] p-1.5 -m-1.5 transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.02]'}`}
      >
        <AccountIcon account={selected} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-bold tracking-[-0.01em] ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>{selected.name}</div>
          <div className={`text-[10px] font-medium ${isDark ? 'text-[#a0a0a0]' : 'text-[#b5b5b5]'}`} style={{ fontFamily: FONT }}>{selected.sub}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[15px] font-extrabold tabular-nums tracking-[-0.02em] ${isDark ? 'text-white' : 'text-[#0a0a0a]'}`} style={{ fontFamily: FONT }}>
            ${(balances[selected.id] ?? 0).toFixed(2)}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#555' : '#d4d4d4'} strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 right-0 top-full mt-1 rounded-[12px] border shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-20 overflow-hidden ${isDark ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-[#edeef0]'}`}
          >
            {accounts.map((a) => (
              <div
                key={a.id}
                onClick={() => { onSelect(a); onToggle(); }}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isDark ? 'hover:bg-[#2a2a2a]' : 'hover:bg-[#fafbfc]'}`}
              >
                <AccountIcon account={a} size={28} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-bold ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>{a.name}</div>
                  <div className={`text-[9px] ${isDark ? 'text-[#a0a0a0]' : 'text-[#b5b5b5]'}`} style={{ fontFamily: FONT }}>{a.sub}</div>
                </div>
                <span className={`text-[12px] font-bold tabular-nums ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
                  ${(balances[a.id] ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Route display ──────────────────────────────────────────────────────────

function getRoute(from: string, to: string): string[] {
  // HL always goes through Arbitrum
  if (from === 'hl' && to === 'arb') return ['HL', 'Arbitrum'];
  if (from === 'hl') return ['HL', 'Arbitrum', ACCOUNTS.find(a => a.id === to)?.sub || to];
  if (to === 'hl' && from === 'arb') return ['Arbitrum', 'HL'];
  if (to === 'hl') return [ACCOUNTS.find(a => a.id === from)?.sub || from, 'Arbitrum', 'HL'];
  // Wallet to wallet = bridge
  const fromName = ACCOUNTS.find(a => a.id === from)?.sub || from;
  const toName = ACCOUNTS.find(a => a.id === to)?.sub || to;
  return [fromName, toName];
}

const ROUTE_ICONS: Record<string, string> = {
  HL: '/tokens/chain-hyperliquid.png',
  'Trading Account': '/tokens/chain-hyperliquid.png',
  Arbitrum: '/tokens/chain-arbitrum.png',
  Base: '/tokens/chain-base.png',
  Polygon: '/tokens/chain-polygon.png',
  'Polygon · USDC.e': '/tokens/chain-polygon.png',
  Polymarket: '/tokens/polymarket.png',
  Robinhood: '/tokens/chain-robinhood.png',
  Ethereum: '/tokens/chain-ethereum.png',
};

// ─── Polymarket bridge destinations ─────────────────────────────────────────
// When withdrawing FROM Polymarket, the selected "To" account maps to a bridge
// destination chain + the USDC token to receive there. Polymarket's offramp
// unwraps pUSD → USDC and delivers it to the user's EOA on that chain.
const POLY_BRIDGE_DEST: Record<string, { chainId: number; token: string; name: string }> = {
  polygon: { chainId: 137, token: POLYGON_USDC_NATIVE_ADDRESS, name: 'Polygon' },
  base: { chainId: 8453, token: BASE_USDC_ADDRESS, name: 'Base' },
  arb: { chainId: 42161, token: ARBITRUM_USDC_ADDRESS, name: 'Arbitrum' },
};

// ─── Main modal ─────────────────────────────────────────────────────────────

interface MoveFundsModalProps {
  open: boolean;
  onClose: () => void;
  defaultFrom?: string; // account id
  defaultTo?: string;
  // 'modal' (default) = centered overlay card, used from perps/markets banners.
  // 'panel' = inline content with no overlay, rendered inside the wallet
  // dropdown so Withdraw matches the Send/Receive/Swap views.
  variant?: 'modal' | 'panel';
  // When set, overrides the route-derived dark mode (the wallet dropdown passes
  // its own theme so the panel matches the surrounding menu).
  isDark?: boolean;
  // Panel variant: back arrow handler (returns to the wallet view).
  onBack?: () => void;
}

export function MoveFundsModal({ open, onClose, defaultFrom, defaultTo, variant = 'modal', isDark: isDarkOverride, onBack }: MoveFundsModalProps) {
  const marketsDark = useUIStore((s) => s.marketsDarkMode);
  const perpsDark = useUIStore((s) => s.perpsDarkMode);
  const pathname = usePathname() || '';
  const isDark = isDarkOverride ?? (pathname.startsWith('/perps') ? perpsDark : pathname.startsWith('/markets') ? marketsDark : false);
  const address = useEmbeddedAddress();
  const { wallets } = useWallets();
  const { baseUsdc, polyUsdc, arbUsdc, robinhoodUsdg, ethUsdc, hlBalance, hlWithdrawable, refetch } = useUsdcBalances(address ?? undefined);
  // For the withdraw flow we want HL's actual `withdrawable` (net of locked
  // margin / maintenance), not account equity. Falls back to hlBalance only
  // while the new field is loading on first paint.
  const hlEffective = hlWithdrawable ?? hlBalance;
  const { fetchQuote, executeSwap } = useLifiSwap();
  const { withdraw: withdrawPolymarket } = usePolymarketWithdraw();
  const { getQuote: getBridgeQuote, bridgeWithdraw } = useBridgeWithdraw();
  const arbPublicClient = usePublicClient({ chainId: 42161 });

  const balances: Record<string, number> = useMemo(() => ({
    // hlEffective reflects the actually-withdrawable amount when positions are
    // open, so the "Max" button and validation match what HL will accept.
    hl: hlEffective,
    poly: polyUsdc,
    base: baseUsdc,
    polygon: polyUsdc,
    arb: arbUsdc,
    // Robinhood wallet holds USDG on chain 4663.
    robinhood: robinhoodUsdg,
    ethereum: ethUsdc,
  }), [hlEffective, polyUsdc, baseUsdc, arbUsdc, robinhoodUsdg, ethUsdc]);

  const [from, setFrom] = useState<Account>(ACCOUNTS.find(a => a.id === (defaultFrom || 'hl')) || ACCOUNTS[0]);
  const [to, setTo] = useState<Account>(ACCOUNTS.find(a => a.id === (defaultTo || 'base')) || ACCOUNTS[2]);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'executing' | 'done' | 'error'>('idle');
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  // Live bridge quote shown when withdrawing FROM Polymarket (best-effort).
  const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
  const [quotingBridge, setQuotingBridge] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount('');
      setStatus('idle');
      setFromOpen(false);
      setToOpen(false);
      setBridgeQuote(null);
      if (defaultFrom) setFrom(ACCOUNTS.find(a => a.id === defaultFrom) || ACCOUNTS[0]);
      if (defaultTo) setTo(ACCOUNTS.find(a => a.id === defaultTo) || ACCOUNTS[2]);
    }
  }, [open, defaultFrom, defaultTo]);

  const amountNum = parseFloat(amount) || 0;
  const available = balances[from.id] ?? 0;
  // Hyperliquid charges a flat $1 withdrawal fee on top of the requested amount.
  const HL_WITHDRAW_FEE = 1;
  // Hyperliquid enforces a minimum withdraw of $2 (anything smaller fails on
  // the exchange side with no useful client error). Block it client-side.
  const HL_MIN_WITHDRAW = 2;
  // Polymarket's bridge rejects checkouts under $2 (verified live against
  // bridge.polymarket.com/supported-assets). Gate it client-side so the button
  // is disabled with a clear reason instead of the on-chain send failing —
  // otherwise bridgeWithdraw throws a 'balance'-stage error that the catch
  // handler misreports as "already in your Polygon wallet".
  const POLY_MIN_WITHDRAW = 2;
  const isPolySource = from.id === 'poly';
  const belowPolyMin = isPolySource && amountNum > 0 && amountNum < POLY_MIN_WITHDRAW;
  const isHLSource = from.id === 'hl';
  const maxWithdrawable = isHLSource ? Math.max(0, available - HL_WITHDRAW_FEE) : available;
  const exceedsHLMax = isHLSource && amountNum > 0 && amountNum > maxWithdrawable;
  const belowHLMin = isHLSource && amountNum > 0 && amountNum < HL_MIN_WITHDRAW;
  // Equity > withdrawable means margin is locked in open positions — the
  // amount the user sees on /perps (accountValue) can't all be moved.
  const hlMarginLocked = isHLSource && hlWithdrawable != null && hlBalance > hlWithdrawable + 0.01
    ? hlBalance - hlWithdrawable
    : 0;
  const hlAllLocked = isHLSource && hlBalance > 0 && available <= 0.01;
  const isValid = amountNum > 0 && amountNum <= available && !exceedsHLMax && !belowHLMin && !belowPolyMin && from.id !== to.id;
  const route = getRoute(from.id, to.id);

  // Live bridge quote for Polymarket withdrawals — previews the estimated
  // received amount + fee before the user confirms. Debounced; best-effort
  // (a null result just hides the estimate, it never blocks the withdrawal).
  const polyDest = from.id === 'poly' ? POLY_BRIDGE_DEST[to.id] : undefined;
  useEffect(() => {
    if (!open || from.id !== 'poly' || !address || !polyDest || amountNum <= 0) {
      setBridgeQuote(null);
      setQuotingBridge(false);
      return;
    }
    let cancelled = false;
    setQuotingBridge(true);
    const t = setTimeout(async () => {
      try {
        const q = await getBridgeQuote({
          eoa: address,
          amountUsd: amountNum,
          toChainId: polyDest.chainId,
          toTokenAddress: polyDest.token,
        });
        if (!cancelled) setBridgeQuote(q);
      } catch {
        if (!cancelled) setBridgeQuote(null);
      } finally {
        if (!cancelled) setQuotingBridge(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, from.id, to.id, address, amountNum, polyDest?.chainId, polyDest?.token, getBridgeQuote]);

  const handleSwap = useCallback(() => {
    setFrom(to);
    setTo(from);
    setFromOpen(false);
    setToOpen(false);
  }, [from, to]);

  const handleMax = useCallback(() => {
    const max = from.id === 'hl' ? Math.max(0, (balances.hl ?? 0) - HL_WITHDRAW_FEE) : (balances[from.id] ?? 0);
    setAmount(max > 0 ? max.toFixed(2) : '');
  }, [from, balances]);

  // Filter out the currently selected "other" account from each dropdown
  const fromAccounts = ACCOUNTS.filter(a => a.id !== to.id);
  const toAccounts = ACCOUNTS.filter(a => a.id !== from.id);

  const destName = to.name === 'Wallet' ? `Wallet (${to.sub})` : to.name;

  const handleMove = useCallback(async () => {
    if (!isValid || !address) return;
    setStatus('executing');

    // Invalidate the server-side balance cache so the next refetch reads
    // post-withdraw state instead of the 15s-stale snapshot, then refetch.
    const refreshBalances = async () => {
      try {
        await fetch(`/api/wallet/balances?address=${address}`, { method: 'DELETE' });
      } catch { /* cache invalidation is best-effort */ }
      refetch();
      // Notify other balance consumers (Zustand HL store, banners) to refresh.
      try { window.dispatchEvent(new CustomEvent('bridge-completed')); } catch { /* SSR/no-op */ }
    };

    try {
      if (from.id === 'hl') {
        // Step 1: Withdraw from HL to Arbitrum
        const embedded = wallets.find(w => w.walletClientType === 'privy');
        if (!embedded) throw new Error('No embedded wallet found. Please connect your wallet.');

        const provider = await embedded.getEthereumProvider();
        const { ExchangeClient, HttpTransport } = await import('@nktkas/hyperliquid');
        const { createWalletClient, custom } = await import('viem');
        const { arbitrum } = await import('viem/chains');

        const walletClient = createWalletClient({
          account: embedded.address as `0x${string}`,
          chain: arbitrum,
          transport: custom(provider),
        });

        const exchangeClient = new ExchangeClient({ wallet: walletClient, transport: new HttpTransport() });

        // Robinhood (chain 4663) isn't a Hyperliquid withdraw destination — the
        // bridge step below only knows Polygon/Base/Arbitrum, so bailing here
        // prevents silently delivering to Arbitrum instead. Route via a wallet
        // first, then bridge to Robinhood.
        if (to.id === 'robinhood') {
          toast.error("Hyperliquid can't withdraw straight to your Robinhood wallet yet — move to Base or Arbitrum first, then bridge to Robinhood.", { id: 'move-funds', duration: 8000 });
          setStatus('idle');
          return;
        }

        // If destination is Arbitrum wallet, just withdraw — done
        if (to.id === 'arb') {
          toast.loading(`Withdrawing $${amountNum.toFixed(2)} to Arbitrum...`, { id: 'move-funds' });
          await exchangeClient.withdraw3({ destination: address.toLowerCase(), amount: amountNum.toFixed(2) });
          toast.success(`$${(amountNum - HL_WITHDRAW_FEE).toFixed(2)} withdrawn to your Arbitrum wallet (after $${HL_WITHDRAW_FEE} HL fee)`, { id: 'move-funds' });
          setStatus('done');
          setTimeout(() => { refreshBalances(); onClose(); setStatus('idle'); }, 2000);
          return;
        }

        // For other destinations: withdraw to Arb first, wait, then bridge.
        // Capture the pre-withdraw Arb USDC balance so we can poll for the
        // *delta* (robust to pre-existing balances) and later bridge the
        // actually-arrived amount instead of `amountNum`.
        const readArbUsdc = async (): Promise<bigint> => {
          if (!arbPublicClient) return 0n;
          try {
            const bal = await arbPublicClient.readContract({
              address: USDC_ARBITRUM,
              abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            });
            return bal as bigint;
          } catch { return 0n; }
        };

        const preBalance = await readArbUsdc();

        toast.loading(`Step 1/2: Withdrawing from Hyperliquid...`, { id: 'move-funds' });
        await exchangeClient.withdraw3({ destination: address.toLowerCase(), amount: amountNum.toFixed(2) });

        // Step 2: Wait for the *net* amount to arrive on Arbitrum. HL deducts
        // a flat $1 fee, so the expected on-chain delta is amount - $1, not
        // amount * 0.95. The previous threshold caused the poll to time out
        // on every successful withdraw, stranding funds on Arbitrum.
        toast.loading(`Waiting for USDC on Arbitrum...`, { id: 'move-funds' });
        const expectedNet = Math.max(0, amountNum - HL_WITHDRAW_FEE);
        // Small epsilon (0.5%) absorbs rounding/SDK pre-deduction differences.
        const pollThreshold = expectedNet * 0.995;
        // Poll target is preBalance + threshold (use the unsigned diff helper).
        const targetTotal = preBalance + BigInt(Math.floor(pollThreshold * 1e6));
        // waitForArbUsdcBalance reads absolute balance; we want absolute >= targetTotal.
        // Re-use it by passing targetTotal scaled back to human units.
        const arrived = await waitForArbUsdcBalance(
          address,
          Number(targetTotal) / 1e6,
          120_000,
          arbPublicClient,
        );

        // Whether or not the poll says "arrived", read the actual on-chain
        // delta. If anything landed, proceed with bridging the real amount.
        const postBalance = await readArbUsdc();
        const deltaRaw = postBalance > preBalance ? postBalance - preBalance : 0n;
        const deltaHuman = Number(deltaRaw) / 1e6;

        if (deltaHuman < 0.01) {
          // Truly nothing arrived — surface a clear, actionable error.
          toast.error(
            !arrived
              ? `Hyperliquid hasn't released the funds yet. They usually land in ~30s but can take up to a few minutes. Reopen this modal shortly to bridge from Arbitrum.`
              : `USDC didn't arrive on Arbitrum. Check your Arbitrum wallet — if it's there, retry the bridge step.`,
            { id: 'move-funds', duration: 8000 },
          );
          setStatus('error');
          setTimeout(() => setStatus('idle'), 3000);
          return;
        }

        // Bridge the *actually arrived* amount, not the requested gross.
        const destChainId = to.id === 'poly' || to.id === 'polygon' ? 137 : to.id === 'base' ? 8453 : to.id === 'ethereum' ? 1 : 42161;
        const destChainName = to.id === 'poly' || to.id === 'polygon' ? 'Polygon' : to.id === 'base' ? 'Base' : to.id === 'ethereum' ? 'Ethereum' : 'Arbitrum';
        toast.loading(`Step 2/2: Bridging $${deltaHuman.toFixed(2)} to ${destChainName}...`, { id: 'move-funds' });

        try {
          const bridgeParams = {
            tokenIn: USDC_ARBITRUM,
            tokenOut: destChainId === 137 ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' : destChainId === 1 ? ETHEREUM_USDC_ADDRESS : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            amountIn: deltaHuman.toFixed(2),
            decimalsIn: 6,
            decimalsOut: 6,
            chainId: 42161 as const,
            toChainId: destChainId,
          };
          const quote = await fetchQuote(bridgeParams);
          if (quote) {
            await executeSwap(bridgeParams, quote);
            toast.success(`$${deltaHuman.toFixed(2)} moved to ${destChainName}!`, { id: 'move-funds' });
          } else {
            toast.error(`Bridge quote failed. Your $${deltaHuman.toFixed(2)} is safe on Arbitrum — bridge it from the deposit flow.`, { id: 'move-funds', duration: 6000 });
          }
        } catch (bridgeErr) {
          const bridgeMsg = bridgeErr instanceof Error ? bridgeErr.message : 'Bridge failed';
          toast.error(`Withdrawn $${deltaHuman.toFixed(2)} to Arbitrum but bridge failed: ${bridgeMsg}. Your USDC is safe on Arbitrum.`, { id: 'move-funds', duration: 6000 });
        }

        setStatus('done');
        setTimeout(() => { refreshBalances(); onClose(); setStatus('idle'); }, 2000);

      } else if (to.id === 'hl') {
        // Deposit to HL — redirect to existing deposit flow
        toast.info('Use the + deposit button to add funds to Hyperliquid from your wallet.');
        setStatus('idle');
      } else if (from.id === 'poly') {
        // Withdrawing FROM Polymarket. PRIMARY path: the Polymarket Bridge —
        // request a per-chain bridge address, then send pUSD from the user's
        // Polymarket wallet to it; Polymarket's offramp unwraps pUSD → USDC and
        // delivers it on the chosen destination chain. Funds deposited via the
        // Polymarket frontend sit in the Magic proxy, so the pUSD send goes
        // through ProxyWalletFactory.proxy() (one gasless Polygon tx).
        //
        // If the bridge API is unreachable, fall back to the legacy proxy()
        // sweep, which pulls the balance back to the user's Polygon wallet —
        // nothing is sent to a bridge before we have an address, so this is safe.
        const dest = POLY_BRIDGE_DEST[to.id];
        if (!dest) {
          toast.error('Pick Base, Polygon, or Arbitrum as the destination for a Polymarket withdrawal.', { id: 'poly-withdraw' });
          setStatus('idle');
          return;
        }
        try {
          toast.loading(`Bridging $${amountNum.toFixed(2)} to ${dest.name}…`, { id: 'poly-withdraw' });
          const res = await bridgeWithdraw({
            eoa: address,
            amountUsd: amountNum,
            toChainId: dest.chainId,
            toTokenAddress: dest.token,
          });
          toast.success(
            `Sent $${res.sent.toFixed(2)} to the bridge — it'll arrive as USDC on ${dest.name} shortly.`,
            { id: 'poly-withdraw', duration: 8000 },
          );
          setStatus('done');
          setTimeout(() => { refreshBalances(); onClose(); setStatus('idle'); }, 2000);
          return;
        } catch (e) {
          const stage = e instanceof BridgeWithdrawError ? e.stage : 'send';
          const msg = e instanceof Error ? e.message : 'Polymarket withdrawal failed';

          if (stage === 'balance') {
            // Nothing to withdraw — funds already landed, or never funded.
            toast.success('Your Polymarket funds are already in your Polygon wallet.', { id: 'poly-withdraw' });
            setStatus('idle');
            return;
          }

          if (stage === 'api') {
            // Bridge service unreachable — fall back to the legacy proxy sweep.
            try {
              toast.loading('Bridge unavailable — moving your Polymarket balance to your Polygon wallet…', { id: 'poly-withdraw' });
              const swept = await withdrawPolymarket(address);
              toast.success(
                `Bridge was unavailable, so $${swept.withdrawn.toFixed(2)} was moved to your Polygon wallet instead.`,
                { id: 'poly-withdraw', duration: 8000 },
              );
              setStatus('done');
              setTimeout(() => { refreshBalances(); onClose(); setStatus('idle'); }, 2000);
              return;
            } catch (se) {
              const sm = se instanceof Error ? se.message : 'Fallback withdrawal failed';
              if (/no polymarket proxy balance/i.test(sm)) {
                toast.success('Your Polymarket funds are already in your Polygon wallet.', { id: 'poly-withdraw' });
              } else {
                toast.error(`Bridge unavailable and fallback failed: ${sm}`, { id: 'poly-withdraw', duration: 8000 });
              }
              setStatus('idle');
              return;
            }
          }

          // stage === 'unsupported' | 'send' — nothing was confirmed on-chain,
          // so the balance is untouched. Surface a clear, actionable message.
          const userMsg =
            stage === 'unsupported'
              ? `${dest.name} isn't available for Polymarket withdrawals right now. Try Polygon.`
              : /user rejected|denied/i.test(msg)
                ? 'Withdrawal cancelled.'
                : msg;
          toast.error(userMsg, { id: 'poly-withdraw', duration: 8000 });
          setStatus('idle');
          return;
        }
      } else {
        // Wallet-to-wallet transfers — bridge via DELPHI
        const fromChain = from.sub;
        const toChain = to.id === 'poly' ? 'Polygon' : to.sub;
        toast.info(`Ask DELPHI: "bridge $${amountNum.toFixed(0)} USDC from ${fromChain} to ${toChain}"`, { duration: 6000 });
        setStatus('idle');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? '');
      // Surface the actionable HL errors users actually hit. The SDK returns
      // structured strings; we translate the common ones into plain language
      // so the user knows what to do instead of seeing "Transfer failed".
      let msg = raw || 'Transfer failed';
      const lower = raw.toLowerCase();
      if (lower.includes('insufficient') || lower.includes('not enough')) {
        msg = 'Hyperliquid says balance is insufficient. Margin may be locked in open positions — close them and retry.';
      } else if (lower.includes('minimum') || lower.includes('too small')) {
        msg = `Amount below Hyperliquid's $${HL_MIN_WITHDRAW} minimum withdraw.`;
      } else if (lower.includes('user rejected') || lower.includes('denied')) {
        msg = 'Withdraw cancelled.';
      } else if (lower.includes('signature') || lower.includes('signing')) {
        msg = 'Wallet signing failed. Reconnect your embedded wallet and retry.';
      }
      toast.error(msg, { id: 'move-funds', duration: 8000 });
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }, [isValid, address, wallets, from, to, amountNum, refetch, onClose, destName, bridgeWithdraw, withdrawPolymarket]);

  if (!open) return null;

  const isPanel = variant === 'panel';
  // Horizontal insets scale down for the narrow (dropdown) variant.
  const mx = isPanel ? 'mx-4' : 'mx-[22px]';
  const px = isPanel ? 'px-4' : 'px-[22px]';

  // Header — back arrow for the in-panel (dropdown) variant, title + close for
  // the centered-modal variant.
  const headerEl = isPanel ? (
    <div className={`px-4 py-3 border-b flex items-center gap-2.5 ${isDark ? 'border-white/[0.06]' : 'border-[#f1f3f4]'}`}>
      <button
        onClick={onBack || onClose}
        className={`transition-colors ${isDark ? 'text-white/50 hover:text-white' : 'text-[#a1a1aa] hover:text-[#1a1a1a]'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>Withdraw</span>
    </div>
  ) : (
    <div className="flex items-center justify-between px-[22px] pt-5 pb-4">
      <span className={`text-[16px] font-extrabold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-[#0a0a0a]'}`} style={{ fontFamily: FONT }}>
        Move Funds
      </span>
      <button
        onClick={onClose}
        className={`w-7 h-7 rounded-[8px] flex items-center justify-center transition-all cursor-pointer ${isDark ? 'bg-[#2a2a2a] text-[#666] hover:bg-[#333] hover:text-[#aaa]' : 'bg-[#f5f5f5] text-[#b5b5b5] hover:bg-[#eee] hover:text-[#666]'}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  const bodyEl = (
    <>
          {/* Transfer block */}
          <div className={`${mx} rounded-[14px] relative ${isDark ? 'bg-transparent border border-[#2a2a2a]' : 'bg-[#fafbfc] border border-[#edeef0]'}`}>
            {/* From */}
            <div className="px-4 pt-3 pb-3">
              <div className={`text-[9px] font-bold uppercase tracking-[0.6px] mb-2 ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>From</div>
              <AccountSelector
                accounts={fromAccounts}
                selected={from}
                onSelect={setFrom}
                balances={balances}
                open={fromOpen}
                onToggle={() => { setFromOpen(!fromOpen); setToOpen(false); }}
                isDark={isDark}
              />
            </div>

            {/* Swap button */}
            <div className="flex items-center justify-center relative h-0">
              <div className={`absolute left-4 right-4 h-px ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#edeef0]'}`} />
              <button
                onClick={handleSwap}
                className={`relative z-10 w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center hover:rotate-180 transition-all duration-300 cursor-pointer ${isDark ? 'bg-[#1e1e1e] border-[#333] text-[#666] hover:border-[#888] hover:text-[#ccc] shadow-[0_1px_4px_rgba(0,0,0,0.3)]' : 'bg-white border-[#edeef0] text-[#c0c0c0] hover:border-[#1a1a1a] hover:text-[#1a1a1a] shadow-[0_1px_4px_rgba(0,0,0,0.04)]'}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M7 4v16M7 20l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3" />
                </svg>
              </button>
            </div>

            {/* To */}
            <div className="px-4 pt-3 pb-3">
              <div className={`text-[9px] font-bold uppercase tracking-[0.6px] mb-2 ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>To</div>
              <AccountSelector
                accounts={toAccounts}
                selected={to}
                onSelect={setTo}
                balances={balances}
                open={toOpen}
                onToggle={() => { setToOpen(!toOpen); setFromOpen(false); }}
                isDark={isDark}
              />
            </div>
          </div>

          {/* Amount */}
          <div className={`${px} pt-4`}>
            <div className={`text-[9px] font-bold uppercase tracking-[0.6px] mb-2 ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>Amount</div>
            <div className={`flex items-center border-[1.5px] rounded-[12px] px-3.5 py-2.5 gap-1 transition-all ${isDark ? 'bg-transparent border-[#2a2a2a] focus-within:border-[#555] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]' : 'bg-[#fafbfc] border-[#edeef0] focus-within:border-[#1a1a1a] focus-within:shadow-[0_0_0_3px_rgba(26,26,26,0.06)]'}`}>
              <span className={`text-[22px] font-extrabold tracking-[-0.02em] ${isDark ? 'text-[#666]' : 'text-[#d4d4d4]'}`} style={{ fontFamily: FONT }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '');
                  if (v.split('.').length <= 2) setAmount(v);
                }}
                className={`flex-1 bg-transparent border-none outline-none text-[22px] font-extrabold tabular-nums tracking-[-0.02em] min-w-0 ${isDark ? 'text-white placeholder:text-[#555]' : 'text-[#0a0a0a] placeholder:text-[#e0e0e0]'}`}
                style={{ fontFamily: FONT }}
              />
              <button
                onClick={handleMax}
                className={`text-[9px] font-extrabold rounded-[6px] px-2.5 py-1 transition-all cursor-pointer tracking-[0.03em] ${isDark ? 'text-[#aaa] bg-[#2a2a2a] hover:bg-[#333] hover:text-white' : 'text-[#666] bg-[#edeef0] hover:bg-[#ddd] hover:text-[#1a1a1a]'}`}
                style={{ fontFamily: FONT }}
              >
                MAX
              </button>
            </div>

            {/* Details */}
            <div className="flex flex-col gap-1.5 px-1 pt-2.5">
              <div className="flex justify-between">
                <span className={`text-[10px] font-medium ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>
                  Network fee
                </span>
                <strong className={`text-[10px] font-semibold ${isDark ? 'text-[#ccc]' : 'text-[#888]'}`} style={{ fontFamily: FONT }}>
                  {isHLSource ? `$${HL_WITHDRAW_FEE.toFixed(2)} + ~$0.01` : '~$0.01'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className={`text-[10px] font-medium ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>
                  Arrives in
                </span>
                <strong className={`text-[10px] font-semibold ${isDark ? 'text-[#ccc]' : 'text-[#888]'}`} style={{ fontFamily: FONT }}>~30s</strong>
              </div>
              {/* Polymarket bridge estimate — previews the received amount + fee. */}
              {from.id === 'poly' && amountNum > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className={`text-[10px] font-medium ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>
                      You receive
                    </span>
                    <strong className={`text-[10px] font-semibold ${isDark ? 'text-[#ccc]' : 'text-[#888]'}`} style={{ fontFamily: FONT }}>
                      {quotingBridge ? 'Estimating…' : bridgeQuote ? `≈ $${bridgeQuote.estOutputUsd.toFixed(2)}` : '—'}
                    </strong>
                  </div>
                  {bridgeQuote && bridgeQuote.totalImpactUsd > 0 && (
                    <div className="flex justify-between">
                      <span className={`text-[10px] font-medium ${isDark ? 'text-[#888]' : 'text-[#c0c0c0]'}`} style={{ fontFamily: FONT }}>
                        Bridge fee
                      </span>
                      <strong className={`text-[10px] font-semibold ${isDark ? 'text-[#ccc]' : 'text-[#888]'}`} style={{ fontFamily: FONT }}>
                        ${bridgeQuote.totalImpactUsd.toFixed(2)}
                      </strong>
                    </div>
                  )}
                </>
              )}
            </div>
            {exceedsHLMax && (
              <div className="px-1 pt-1.5">
                <span className="text-[10px] font-semibold text-[#d4574a]" style={{ fontFamily: FONT }}>
                  HL requires a $1 withdrawal fee — max withdrawable is ${maxWithdrawable.toFixed(2)}
                </span>
              </div>
            )}
            {belowHLMin && !exceedsHLMax && (
              <div className="px-1 pt-1.5">
                <span className="text-[10px] font-semibold text-[#d4574a]" style={{ fontFamily: FONT }}>
                  Hyperliquid minimum withdraw is ${HL_MIN_WITHDRAW.toFixed(2)}
                </span>
              </div>
            )}
            {belowPolyMin && (
              <div className="px-1 pt-1.5">
                <span className="text-[10px] font-semibold text-[#d4574a]" style={{ fontFamily: FONT }}>
                  Polymarket bridge minimum is ${POLY_MIN_WITHDRAW.toFixed(2)}
                </span>
              </div>
            )}
            {isHLSource && hlAllLocked && (
              <div className="px-1 pt-1.5">
                <span className="text-[10px] font-semibold text-[#d4574a]" style={{ fontFamily: FONT }}>
                  ${hlBalance.toFixed(2)} is locked as position margin — close your perp positions to withdraw.
                </span>
              </div>
            )}
            {isHLSource && !hlAllLocked && hlMarginLocked > 0.01 && (
              <div className="px-1 pt-1.5">
                <span className={`text-[10px] font-medium ${isDark ? 'text-[#888]' : 'text-[#888]'}`} style={{ fontFamily: FONT }}>
                  ${hlMarginLocked.toFixed(2)} locked in open positions · ${available.toFixed(2)} withdrawable
                </span>
              </div>
            )}
          </div>

          {/* Route */}
          <div className={`${px} pt-3`}>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] ${isDark ? 'bg-[#1e1e1e]' : 'bg-[#f5f5f5]'}`}>
              {route.map((step, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className={`text-[8px] ${isDark ? 'text-[#555]' : 'text-[#d4d4d4]'}`}>→</span>}
                  <img src={ROUTE_ICONS[step] || '/tokens/chain-base.png'} alt="" width={14} height={14} className="rounded-full" />
                  <span className={`text-[10px] font-semibold ${isDark ? 'text-[#bbb]' : 'text-[#999]'}`} style={{ fontFamily: FONT }}>{step}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className={`${px} pt-4 pb-[22px]`}>
            <button
              onClick={handleMove}
              disabled={!isValid || status === 'executing'}
              className={`w-full py-3 rounded-[12px] text-[14px] font-bold transition-all cursor-pointer ${
                isValid && status !== 'executing'
                  ? 'bg-gradient-to-b from-[#1a1a1a] to-[#2a2a2a] text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:-translate-y-[1px] active:translate-y-0'
                  : isDark ? 'bg-[#2a2a2a] text-[#555] cursor-default shadow-none' : 'bg-[#f0f0f0] text-[#c8c8c8] cursor-default shadow-none'
              }`}
              style={{ fontFamily: FONT, letterSpacing: '-0.01em' }}
            >
              {status === 'executing' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Moving...
                </span>
              ) : status === 'done' ? (
                'Done!'
              ) : amountNum > 0 ? (
                `Move $${amountNum.toFixed(2)}`
              ) : (
                'Move Funds'
              )}
            </button>
          </div>
    </>
  );

  // Panel variant — inline content for the wallet dropdown (no overlay).
  if (isPanel) {
    return (
      <div className="w-full pb-2" style={{ fontFamily: FONT }}>
        {headerEl}
        {bodyEl}
      </div>
    );
  }

  // Modal variant — centered overlay card (perps / markets banners).
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
        style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className={`rounded-[20px] w-full max-w-[390px] overflow-hidden ${isDark ? 'bg-[#161616] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_80px_rgba(0,0,0,0.6)]' : 'bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_24px_80px_rgba(0,0,0,0.14)]'}`}
        >
          {headerEl}
          {bodyEl}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
