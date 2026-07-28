"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { useUIStore } from "@/lib/store/ui";
import { useAccount, useBalance, useChainId } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { base, polygon } from "wagmi/chains";
import { formatUnits, isAddress, encodeFunctionData, parseUnits } from "viem";
import { usePaymentWallet } from "@/lib/hooks/use-payment-wallet";
import { useWallets, useSendTransaction as usePrivySendTransaction, useExportWallet } from "@privy-io/react-auth";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { BaseIcon, PolygonIcon, EthereumIcon, ArbitrumIcon, RobinhoodIcon } from "@/components/dashboard/shared/ChainIcons";
import { TokenIconWithChain } from "@/components/dashboard/shared/TokenIcon";
import { FundEmbeddedWallet } from "@/components/wallet/FundEmbeddedWallet";
import { useLifiSwap } from "@/lib/hooks/use-uniswap-swap";
import { useUsdcBalances } from "@/lib/hooks/use-usdc-balances";
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_USDG_ADDRESS } from "@/lib/chains/robinhood";
import {
  BASE_USDC_ADDRESS,
  POLYGON_USDCE_ADDRESS,
  POLYGON_USDC_NATIVE_ADDRESS,
  ARBITRUM_USDC_ADDRESS,
  ETHEREUM_USDC_ADDRESS,
} from "@/lib/tokens/registry";
import type { NormalizedQuoteResponse } from "@/lib/uniswap/types";

// Withdraw / move funds across the wallet + trading accounts (perps, Polymarket).
const MoveFundsModal = dynamic(
  () => import("@/components/shared/MoveFundsModal").then((m) => ({ default: m.MoveFundsModal })),
  { ssr: false }
);

// USDC addresses sourced from the token registry (lib/tokens/registry.ts) — SSOT.
const USDC_BASE = BASE_USDC_ADDRESS;
const USDC_POLYGON_BRIDGED = POLYGON_USDCE_ADDRESS;
const USDC_POLYGON_NATIVE = POLYGON_USDC_NATIVE_ADDRESS;
const USDC_ARBITRUM = ARBITRUM_USDC_ADDRESS;
const USDC_ETHEREUM = ETHEREUM_USDC_ADDRESS;

const ERC20_TRANSFER_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

type View = "wallet" | "send" | "receive" | "swap" | "withdraw";
type SendStatus = "idle" | "switching" | "sending" | "success" | "error";

// Native ETH placeholder — use address(0) to detect native sends
const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

interface SwapToken { symbol: string; address: string; decimals: number }
// Send network list — Robinhood first, then Base / Polygon / Arbitrum.
const SEND_CHAINS: { id: number; name: string; explorer: string; icon: React.FC<{ size?: number }> }[] = [
  { id: ROBINHOOD_CHAIN_ID, name: "Robinhood", explorer: "https://robinhoodchain.blockscout.com/tx/", icon: RobinhoodIcon },
  { id: 8453, name: "Base", explorer: "https://basescan.org/tx/", icon: BaseIcon },
  { id: 137, name: "Polygon", explorer: "https://polygonscan.com/tx/", icon: PolygonIcon },
  { id: 42161, name: "Arbitrum", explorer: "https://arbiscan.io/tx/", icon: ArbitrumIcon },
];
// Swap network list — unchanged (LiFi routes): Base, Polygon, Ethereum, Arbitrum.
const SWAP_CHAINS: { id: number; name: string; explorer: string; icon: React.FC<{ size?: number }> }[] = [
  { id: 8453, name: "Base", explorer: "https://basescan.org/tx/", icon: BaseIcon },
  { id: 137, name: "Polygon", explorer: "https://polygonscan.com/tx/", icon: PolygonIcon },
  { id: 1, name: "Ethereum", explorer: "https://etherscan.io/tx/", icon: EthereumIcon },
  { id: 42161, name: "Arbitrum", explorer: "https://arbiscan.io/tx/", icon: ArbitrumIcon },
];

const SEND_TOKENS: Record<number, SwapToken[]> = {
  [ROBINHOOD_CHAIN_ID]: [
    { symbol: "USDG", address: ROBINHOOD_USDG_ADDRESS, decimals: 6 },
    { symbol: "ETH", address: NATIVE_ETH, decimals: 18 },
  ],
  8453: [
    { symbol: "USDC", address: USDC_BASE, decimals: 6 },
    { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    { symbol: "ETH", address: NATIVE_ETH, decimals: 18 },
    { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
  ],
  137: [
    { symbol: "USDC.e", address: USDC_POLYGON_BRIDGED, decimals: 6 },
    { symbol: "USDC", address: USDC_POLYGON_NATIVE, decimals: 6 },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "MATIC", address: NATIVE_ETH, decimals: 18 },
  ],
  1: [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "ETH", address: NATIVE_ETH, decimals: 18 },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  ],
  42161: [
    { symbol: "USDC", address: USDC_ARBITRUM, decimals: 6 },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "ETH", address: NATIVE_ETH, decimals: 18 },
    { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
  ],
};
const SWAP_TOKENS: Record<number, SwapToken[]> = {
  8453: SEND_TOKENS[8453],
  137: SEND_TOKENS[137],
  1: SEND_TOKENS[1],
  42161: SEND_TOKENS[42161],
};

export function UnifiedWalletConnect({ autoOpen = false }: { autoOpen?: boolean } = {}) {
  const { isConnecting } = useAccount();
  const pathname = usePathname();
  const siteDarkMode = useUIStore((s) => s.siteDarkMode);
  const dashboardDarkMode = useUIStore((s) => s.dashboardDarkMode);
  const defaiDarkMode = useUIStore((s) => s.defaiDarkMode);
  const securityDarkMode = useUIStore((s) => s.securityDarkMode);
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);
  const isSiteMarketingRoute =
    pathname === '/how-it-works'
    || pathname === '/faq'
    || pathname === '/terms'
    || pathname === '/privacy'
    || pathname === '/blog'
    || !!pathname?.startsWith('/blog/');
  // Keeps the pill style consistent across all dark surfaces.
  const isArenaDark =
    (pathname?.startsWith('/markets') && marketsDarkMode) ||
    (isSiteMarketingRoute && siteDarkMode) ||
    (pathname?.startsWith('/defai') && defaiDarkMode) ||
    (pathname?.startsWith('/security') && securityDarkMode) ||
    (pathname?.startsWith('/dashboard') && dashboardDarkMode);
  const isDashboardDarkPill = pathname?.startsWith('/dashboard') && dashboardDarkMode;
  const { login, logout, ready, authenticated } = usePrivy();
  const router = useRouter();
  const chainId = useChainId();
  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const { exportWallet } = useExportWallet();

  const [exporting, setExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>("wallet");

  // Send state
  const [sendChainId, setSendChainId] = useState(8453);
  const [sendTokenIdx, setSendTokenIdx] = useState(0);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendTxHash, setSendTxHash] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Swap state
  const [swapChainId, setSwapChainId] = useState(8453);
  const [swapTokenIn, setSwapTokenIn] = useState<SwapToken>(SWAP_TOKENS[8453][0]); // USDC
  const [swapTokenOut, setSwapTokenOut] = useState<SwapToken>(SWAP_TOKENS[8453][1]); // USDT
  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<NormalizedQuoteResponse | null>(null);
  const [swapFetching, setSwapFetching] = useState(false);
  const [swapQuoteError, setSwapQuoteError] = useState<string | null>(null);
  const { fetchQuote: lifiFetchQuote, executeSwap: lifiExecuteSwap, progress: swapProgress, isSwapping, reset: resetSwap } = useLifiSwap();

  const { wallets } = useWallets();
  const { sendTransaction: privySendTx } = usePrivySendTransaction();
  const addr = paymentAddress;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [explorerMenuOpen, setExplorerMenuOpen] = useState(false);
  const explorerRef = useRef<HTMLDivElement>(null);

  // Consolidated USDC + HL balances — single server-side API call
  const { baseUsdc, polyPusd, polyBridgedUsdc, polyNativeUsdc, arbUsdc, ethUsdc, robinhoodUsdg, totalUsdc, hlBalance, isLoading: isUsdcLoading } = useUsdcBalances(addr || undefined);

  const isBalanceLoading = isUsdcLoading;

  const displayBalance = totalUsdc + hlBalance;

  const showAsConnected = isWalletReady && ready && authenticated;
  const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (autoOpen && !showAsConnected && mounted && ready) login(); }, [autoOpen, showAsConnected, mounted, ready, login]);

  useEffect(() => {
    if (!showDropdown) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      if ((target as HTMLElement)?.closest?.('[data-wallet-dropdown]')) return;
      setShowDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showDropdown]);

  useEffect(() => {
    if (!explorerMenuOpen) return;
    const h = (e: MouseEvent) => { if (explorerRef.current && !explorerRef.current.contains(e.target as Node)) setExplorerMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [explorerMenuOpen]);

  // Reset on close or back to wallet
  useEffect(() => {
    if (!showDropdown || view === "wallet") {
      setSendTo(""); setSendAmount(""); setSendStatus("idle");
      setSendTxHash(null); setSendError(null); setSendChainId(8453); setSendTokenIdx(0);
      setSwapAmount(""); setSwapQuote(null); setSwapQuoteError(null); resetSwap();
      setExplorerMenuOpen(false);
    }
  }, [showDropdown, view, resetSwap]);

  // Auto-fetch swap quote with debounce
  useEffect(() => {
    if (view !== "swap" || !swapAmount || parseFloat(swapAmount) <= 0 || !addr) {
      setSwapQuote(null); setSwapQuoteError(null); return;
    }
    if (swapTokenIn.address === swapTokenOut.address) {
      setSwapQuote(null); setSwapQuoteError("Select different tokens"); return;
    }
    setSwapFetching(true); setSwapQuoteError(null);
    const timer = setTimeout(async () => {
      const result = await lifiFetchQuote({
        tokenIn: swapTokenIn.address,
        tokenOut: swapTokenOut.address,
        amountIn: swapAmount,
        decimalsIn: swapTokenIn.decimals,
        decimalsOut: swapTokenOut.decimals,
        chainId: swapChainId as any,
        slippageBps: 50,
      });
      if (result) { setSwapQuote(result); setSwapQuoteError(null); }
      else setSwapQuoteError("No route found");
      setSwapFetching(false);
    }, 600);
    return () => { clearTimeout(timer); setSwapFetching(false); };
  }, [view, swapAmount, swapTokenIn, swapTokenOut, swapChainId, addr, lifiFetchQuote]);

  const copyAddr = useCallback(() => {
    navigator.clipboard.writeText(addr || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }, [addr]);

  // Send — derive selected token/chain
  const sendTokens = SEND_TOKENS[sendChainId] || [];
  const sendToken = sendTokens[sendTokenIdx] || sendTokens[0];
  const sendChainCfg = SEND_CHAINS.find(c => c.id === sendChainId)!;
  const isNativeSend = sendToken?.address === NATIVE_ETH;

  // Dynamic balance for selected send token
  const { data: sendTokenBal } = useBalance({
    address: addr as `0x${string}` | undefined,
    token: isNativeSend ? undefined : (sendToken?.address as `0x${string}`),
    chainId: sendChainId,
    query: { enabled: !!addr && !!sendToken, refetchInterval: 10_000 },
  });
  const sendBalRaw = sendTokenBal ? formatUnits(sendTokenBal.value, sendTokenBal.decimals) : "0";
  const sendBal = sendTokenBal ? parseFloat(sendBalRaw).toFixed(sendToken.decimals <= 6 ? 2 : 4) : "0.00";

  const getEmbedded = useCallback(() => wallets.find(w => w.walletClientType === "privy"), [wallets]);

  const handleSend = async () => {
    const embedded = getEmbedded();
    if (!embedded || !sendToken) { toast.error("No embedded wallet"); return; }
    setSendStatus("switching"); setSendError(null); setSendTxHash(null);
    try {
      await embedded.switchChain(sendChainId);
      setSendStatus("sending");
      const txReq = isNativeSend
        ? { to: sendTo as `0x${string}`, value: parseUnits(sendAmount, sendToken.decimals), chainId: sendChainId }
        : {
            to: sendToken.address as `0x${string}`,
            data: encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: [sendTo as `0x${string}`, parseUnits(sendAmount, sendToken.decimals)] }),
            chainId: sendChainId,
          };
      const sendWith = (sponsor: boolean) =>
        privySendTx(txReq as any, { sponsor, address: embedded.address as `0x${string}` });
      let receipt;
      try {
        receipt = await sendWith(true);
      } catch (sponsorErr: any) {
        const msg = String(sponsorErr?.message || sponsorErr || "");
        const isSponsorshipFailure = /sponsor/i.test(msg) || /not configured/i.test(msg) || /paymaster/i.test(msg);
        if (!isSponsorshipFailure) throw sponsorErr;
        receipt = await sendWith(false);
      }
      const hash = receipt?.hash;
      setSendTxHash(hash ?? null);
      setSendStatus("success"); toast.success("Sent!");
      try { await embedded.switchChain(base.id); } catch {}
    } catch (err: any) {
      setSendError(err?.message || "Transfer failed"); setSendStatus("error");
      try { const e = getEmbedded(); if (e) await e.switchChain(base.id); } catch {}
    }
  };

  // ── Connected ──
  if (showAsConnected) {
    const sendAmtNum = parseFloat(sendAmount) || 0;
    const sendOk = sendAmtNum > 0 && sendAmtNum <= parseFloat(sendBal) && (sendTo ? isAddress(sendTo) : false);
    const sendBusy = sendStatus === "switching" || sendStatus === "sending";

    // ── Back header (shared by send + receive) ──
    const BackHeader = ({ title }: { title: string }) => (
      <div className="px-4 py-3 border-b border-[#f1f3f4] flex items-center gap-2.5">
        <button
          onClick={() => { if (!sendBusy) setView("wallet"); }}
          disabled={sendBusy}
          className="text-[#a1a1aa] hover:text-[#1a1a1a] disabled:opacity-30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
      </div>
    );

    return (
      <div className="relative" ref={dropdownRef}>
        {/* Header button */}
        <div className="flex items-stretch h-10">
          <button
            onClick={() => { setShowDropdown(!showDropdown); setView("wallet"); }}
            className={`px-4 font-medium text-sm rounded-l-[10px] transition-all cursor-pointer flex items-center justify-center min-w-[80px] ${
              isDashboardDarkPill
                ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border border-white/10 border-r-0 hover:opacity-90 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_22px_rgba(0,0,0,0.22)]'
                : isArenaDark
                ? 'bg-white/[0.04] text-[#ededed] border border-white/[0.08] border-r-0 hover:bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm'
                : 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white hover:opacity-90'
            }`}
          >
            {isBalanceLoading ? (
              <div className="flex items-center gap-1.5 opacity-80" aria-label="Loading balance">
                <div className="w-1 h-1 rounded-full bg-white/80 animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-white/50 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              `$${displayBalance.toFixed(2)}`
            )}
          </button>
          <div ref={explorerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExplorerMenuOpen(!explorerMenuOpen);
              }}
              className={`px-3 h-full font-medium text-sm rounded-r-[10px] transition-all cursor-pointer flex items-center justify-center ${
                isDashboardDarkPill
                  ? 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border border-white/10 border-l border-l-white/10 hover:opacity-90 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_22px_rgba(0,0,0,0.22)]'
                  : isArenaDark
                  ? 'bg-white/[0.04] text-[#ededed] border border-white/[0.08] border-l border-l-white/[0.08] hover:bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm'
                  : 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white border-l border-white/10 hover:opacity-90'
              }`}
              title="View on Explorer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
            {explorerMenuOpen && addr && (
              <div className="bg-white border border-[#e7e9eb] rounded-[10px] shadow-[0px_8px_24px_rgba(0,0,0,0.1)] overflow-hidden py-1 explorer-dropdown-menu fixed md:absolute top-14 md:top-full right-4 md:right-0 z-[9999]" style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif', marginTop: '6px', width: 190, maxWidth: 'none' }}>
                {[
                  { name: "Basescan", url: `https://basescan.org/address/${addr}`, Icon: BaseIcon },
                  { name: "Polygonscan", url: `https://polygonscan.com/address/${addr}`, Icon: PolygonIcon },
                  { name: "Etherscan", url: `https://etherscan.io/address/${addr}`, Icon: EthereumIcon },
                  { name: "Arbiscan", url: `https://arbiscan.io/address/${addr}`, Icon: ArbitrumIcon },
                ].map((exp) => (
                  <a
                    key={exp.name}
                    href={exp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setExplorerMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f3f0] transition-colors"
                  >
                    <exp.Icon size={16} />
                    <span>{exp.name}</span>
                    <svg className="w-3 h-3 ml-auto text-[#a1a1aa]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {showDropdown && (() => {
          const dropdown = (
          <div data-wallet-dropdown data-theme={isArenaDark ? 'dark' : 'light'} className={`wallet-panel fixed md:absolute right-4 md:right-0 mt-2 top-16 md:top-auto rounded-[16px] w-[272px] max-w-[calc(100vw-2rem)] z-[9999] shadow-[0px_8px_30px_rgba(0,0,0,0.08)] ${view === "withdraw" ? "overflow-visible" : "overflow-hidden"} border ${isArenaDark ? 'bg-[#121212] border-white/[0.08]' : 'bg-white border-[#e7e9eb]'}`} style={{ fontFamily: 'var(--font-bricolage), Bricolage Grotesque, sans-serif' }}>
            <style>{`
              .wallet-panel[data-theme='dark'] { color: #ededed; }
              .wallet-panel[data-theme='dark'] .text-\\[\\#1a1a1a\\] { color: #ededed !important; }
              .wallet-panel[data-theme='dark'] .text-\\[\\#3a3a3a\\] { color: #d4d4d4 !important; }
              .wallet-panel[data-theme='dark'] .text-\\[\\#48484b\\] { color: #b3b3b3 !important; }
              .wallet-panel[data-theme='dark'] .text-\\[\\#a1a1aa\\] { color: rgba(255,255,255,0.55) !important; }
              .wallet-panel[data-theme='dark'] .border-\\[\\#f1f3f4\\] { border-color: rgba(255,255,255,0.06) !important; }
              .wallet-panel[data-theme='dark'] .border-\\[\\#e7e9eb\\] { border-color: rgba(255,255,255,0.1) !important; }
              .wallet-panel[data-theme='dark'] .bg-\\[\\#f5f5f5\\],
              .wallet-panel[data-theme='dark'] .bg-\\[\\#f9fafb\\],
              .wallet-panel[data-theme='dark'] .bg-\\[\\#fafbfc\\] { background-color: rgba(255,255,255,0.04) !important; }
              .wallet-panel[data-theme='dark'] .hover\\:bg-\\[\\#f5f5f5\\]:hover,
              .wallet-panel[data-theme='dark'] .hover\\:bg-\\[\\#f5f3f0\\]:hover { background-color: rgba(255,255,255,0.06) !important; }
              .wallet-panel[data-theme='dark'] .bg-\\[\\#3a3a3a\\] { background-color: #ededed !important; color: #1a1a1a !important; }
              .wallet-panel[data-theme='dark'] .hover\\:bg-\\[\\#555\\]:hover { background-color: #ffffff !important; }
              .wallet-panel[data-theme='dark'] code { color: #d4d4d4 !important; }
              .wallet-panel[data-theme='dark'] input,
              .wallet-panel[data-theme='dark'] select { background-color: rgba(255,255,255,0.04) !important; color: #ededed !important; border-color: rgba(255,255,255,0.1) !important; }
              .wallet-panel[data-theme='dark'] input::placeholder { color: rgba(255,255,255,0.35) !important; }
              /* Receive → Supported Networks chips: remap the light color-50 surfaces to a uniform subtle dark chip (icons keep their colour) */
              .wallet-panel[data-theme='dark'] .bg-lime-50\\/60,
              .wallet-panel[data-theme='dark'] .bg-blue-50\\/50,
              .wallet-panel[data-theme='dark'] .bg-purple-50\\/50,
              .wallet-panel[data-theme='dark'] .bg-sky-50\\/50,
              .wallet-panel[data-theme='dark'] .bg-slate-50 { background-color: rgba(255,255,255,0.04) !important; }
              .wallet-panel[data-theme='dark'] .border-lime-200,
              .wallet-panel[data-theme='dark'] .border-blue-100,
              .wallet-panel[data-theme='dark'] .border-purple-100,
              .wallet-panel[data-theme='dark'] .border-sky-100,
              .wallet-panel[data-theme='dark'] .border-slate-200 { border-color: rgba(255,255,255,0.1) !important; }
              .wallet-panel[data-theme='dark'] .text-lime-700,
              .wallet-panel[data-theme='dark'] .text-blue-700,
              .wallet-panel[data-theme='dark'] .text-purple-700,
              .wallet-panel[data-theme='dark'] .text-sky-700,
              .wallet-panel[data-theme='dark'] .text-slate-700 { color: #ededed !important; }
            `}</style>

            {/* ══ WALLET VIEW ══ */}
            {view === "wallet" && (
              <>
                {/* Address bar */}
                <div className="px-4 py-2.5 border-b border-[#f1f3f4] flex items-center justify-between">
                  <button onClick={copyAddr} className="flex items-center gap-2 group">
                    <img
                      src={`https://cdn.stamp.fyi/avatar/${addr}?s=56`}
                      alt="avatar"
                      className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.onerror = null;
                        el.src = `https://effigy.im/a/${addr}.png`;
                      }}
                    />
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">{shortAddr}</span>
                    {copied ? (
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-[#a1a1aa] group-hover:text-[#3a3a3a] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setExplorerMenuOpen(!explorerMenuOpen)}
                      className="text-[11px] font-medium text-[#a1a1aa] hover:text-[#3a3a3a] transition-colors"
                    >
                      Explorer &#8599;
                    </button>
                    {explorerMenuOpen && addr && (
                      <div className="bg-white border border-[#e7e9eb] rounded-[10px] w-[170px] z-[110] shadow-[0px_8px_24px_rgba(0,0,0,0.1)] overflow-hidden py-1" style={{ position: 'absolute', top: '100%', right: '0px', left: 'auto', marginTop: '4px' }}>
                        {[
                          { name: "BaseScan", url: `https://basescan.org/address/${addr}`, Icon: BaseIcon },
                          { name: "PolygonScan", url: `https://polygonscan.com/address/${addr}`, Icon: PolygonIcon },
                          { name: "Etherscan", url: `https://etherscan.io/address/${addr}`, Icon: EthereumIcon },
                          { name: "Arbiscan", url: `https://arbiscan.io/address/${addr}`, Icon: ArbitrumIcon },
                        ].map((exp) => (
                          <a
                            key={exp.name}
                            href={exp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setExplorerMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f5f3f0] transition-colors"
                          >
                            <exp.Icon size={14} />
                            <span>{exp.name}</span>
                            <svg className="w-2.5 h-2.5 ml-auto text-[#a1a1aa]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Balances */}
                <div className="px-4 py-2.5 space-y-2">
                  {/* Total */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#f1f3f4]">
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">Total Balance</span>
                    {isBalanceLoading ? (
                      <div className="flex items-center justify-center gap-1.5 h-6 w-16 px-1 rounded-[6px] bg-[#f5f5f5]">
                        <div className="w-1 h-1 rounded-full bg-[#ccc] animate-pulse" />
                        <div className="w-1 h-1 rounded-full bg-[#ccc] animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-1 h-1 rounded-full bg-[#ccc] animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className="text-[15px] font-bold text-[#1a1a1a] tabular-nums">${displayBalance.toFixed(2)}</span>
                    )}
                  </div>
                  {/* Per-chain breakdown */}
                  {[
                    { label: 'USDC', symbol: 'USDC', chainId: 8453, network: 'Base', value: baseUsdc.toFixed(2) },
                    { label: 'pUSD', symbol: 'pUSD', chainId: 137, network: 'Polymarket', value: polyPusd.toFixed(2) },
                    { label: 'USDG', symbol: 'USDG', chainId: ROBINHOOD_CHAIN_ID, network: 'Robinhood', value: robinhoodUsdg.toFixed(2) },
                    ...(polyBridgedUsdc > 0.01 ? [{ label: 'USDC.e', symbol: 'USDC.e', chainId: 137, network: 'Polygon (legacy)', value: polyBridgedUsdc.toFixed(2) }] : []),
                    ...(polyNativeUsdc > 0.01 ? [{ label: 'USDC', symbol: 'USDC', chainId: 137, network: 'Polygon', value: polyNativeUsdc.toFixed(2) }] : []),
                    ...(arbUsdc > 0.01 ? [{ label: 'USDC', symbol: 'USDC', chainId: 42161, network: 'Arbitrum', value: arbUsdc.toFixed(2) }] : []),
                    ...(ethUsdc > 0.01 ? [{ label: 'USDC', symbol: 'USDC', chainId: 1, network: 'Ethereum', value: ethUsdc.toFixed(2) }] : []),
                    ...(hlBalance > 0.01 ? [{ label: 'USDC', symbol: 'USDC', chainId: 0, network: 'Hyperliquid (Perps)', value: hlBalance.toFixed(2) }] : []),
                  ].map((b) => (
                    <div key={b.label + b.network} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TokenIconWithChain symbol={b.symbol} chainId={b.chainId} size={20} badgeSize={10} />
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{b.label}</span>
                        <span className="text-[11px] text-[#a1a1aa] font-medium">{b.network}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[#1a1a1a] tabular-nums">{b.value}</span>
                    </div>
                  ))}
                </div>

                {/* Polymarket Trading Account */}
                {/* <div className="px-4 py-2 border-t border-[#f1f3f4]">
                  <LinkAccountButton />
                </div> */}

                {/* Actions — 2×2 grid + logout */}
                <div className="px-4 pb-3 pt-1 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setView("send")}
                      className="py-2 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[12px] font-medium rounded-[8px] hover:opacity-90 transition-opacity text-center flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                      Send
                    </button>
                    <button
                      onClick={() => setView("receive")}
                      className="py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors text-center flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                      Receive
                    </button>
                    <FundEmbeddedWallet className="py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors text-center flex items-center justify-center gap-1.5" />
                    <button
                      onClick={() => setView("swap")}
                      className="py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors text-center flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                      Swap
                    </button>
                  </div>
                  <button
                    onClick={() => setView("withdraw")}
                    className="w-full py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 14l-4-4m4 4l4-4" /></svg>
                    Withdraw
                  </button>
                  {paymentAddress && (
                    <button
                      onClick={async () => {
                        setExporting(true);
                        try { await exportWallet({ address: paymentAddress }); }
                        catch (e: any) { toast.error(e?.message || "Couldn't open key export"); }
                        finally { setExporting(false); }
                      }}
                      disabled={exporting}
                      className="w-full py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                      title="Reveal your embedded wallet's private key in Privy's secure window"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                      {exporting ? "Opening…" : "Export private keys"}
                    </button>
                  )}
                  <button
                    onClick={() => { router.push("/dashboard"); setShowDropdown(false); }}
                    className="w-full py-2 border border-[#e7e9eb] text-[#1a1a1a] text-[12px] font-medium rounded-[8px] hover:bg-[#f5f5f5] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
                    Dashboard
                  </button>
                  <button
                    onClick={() => { logout(); setShowDropdown(false); }}
                    className="w-full py-2 text-[11px] text-[#a1a1aa] hover:text-[#1a1a1a] transition-colors flex items-center justify-center gap-1.5"
                    title="Disconnect"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Disconnect
                  </button>
                </div>
              </>
            )}

            {/* ══ RECEIVE VIEW ══ */}
            {view === "receive" && (
              <>
                <BackHeader title="Receive" />
                <div className="px-4 py-4 space-y-4">
                  {/* QR Code */}
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-[12px] border border-[#e7e9eb]">
                      <QRCodeSVG
                        value={addr || ""}
                        size={140}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#1a1a1a"
                      />
                    </div>
                    <p className="text-[11px] text-[#a1a1aa] mt-2.5 font-medium">Scan to send funds</p>
                  </div>

                  {/* Address + Copy */}
                  <button
                    onClick={copyAddr}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-[#fafbfc] border border-[#e7e9eb] rounded-[10px] hover:border-[#a1a1aa] transition-colors group"
                  >
                    <code className="text-[11px] text-[#48484b] break-all leading-relaxed flex-1 text-left">{addr}</code>
                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] rounded-[6px]">
                      {copied ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      )}
                    </div>
                  </button>
                  {copied && <p className="text-center text-[11px] text-emerald-600 font-medium -mt-2">Copied!</p>}

                  {/* Supported networks */}
                  <div>
                    <p className="text-[11px] text-[#a1a1aa] font-medium mb-2">Supported Networks</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-lime-50/60 border border-lime-200 rounded-[8px]">
                        <RobinhoodIcon size={14} />
                        <span className="text-[12px] font-semibold text-lime-700">Robinhood</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-[8px]">
                        <BaseIcon size={14} />
                        <span className="text-[12px] font-semibold text-blue-700">Base</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50/50 border border-purple-100 rounded-[8px]">
                        <PolygonIcon size={14} />
                        <span className="text-[12px] font-semibold text-purple-700">Polygon</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50/50 border border-sky-100 rounded-[8px]">
                        <ArbitrumIcon size={14} />
                        <span className="text-[12px] font-semibold text-sky-700">Arbitrum</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px]">
                        <EthereumIcon size={14} />
                        <span className="text-[12px] font-semibold text-slate-700">Ethereum</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══ SEND VIEW ══ */}
            {view === "send" && (
              <>
                <BackHeader title="Send" />
                <div className="px-4 py-3 space-y-3">
                  {sendStatus === "idle" && (
                    <>
                      {/* Chain selector */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#48484b]/60 mb-1.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Network</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SEND_CHAINS.map((c) => {
                            const Icon = c.icon;
                            return (
                              <button
                                key={c.id}
                                onClick={() => { setSendChainId(c.id); setSendTokenIdx(0); setSendAmount(""); }}
                                className={`flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-center transition-all ${
                                  sendChainId === c.id ? "bg-[#3a3a3a] text-white shadow-sm" : "bg-[#f5f5f5] border border-[#e7e9eb] text-[#3a3a3a] hover:border-[#ccc]"
                                }`}
                              >
                                <Icon size={12} />
                                <span className="text-[11px] font-semibold leading-tight" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>{c.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Token selector */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#48484b]/60 mb-1.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Token</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {sendTokens.map((t, i) => (
                            <button
                              key={t.address}
                              onClick={() => { setSendTokenIdx(i); setSendAmount(""); }}
                              className={`px-3 py-1.5 rounded-[8px] text-[11px] font-semibold transition-all ${
                                sendTokenIdx === i ? "bg-[#3a3a3a] text-white shadow-sm" : "bg-[#f5f5f5] border border-[#e7e9eb] text-[#3a3a3a] hover:border-[#ccc]"
                              }`}
                              style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                            >
                              {t.symbol}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Balance */}
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f9fafb] rounded-[10px] border border-[#e7e9eb]">
                        <span className="text-[10px] text-[#48484b]/60 font-medium" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Balance</span>
                        <span className="text-[11px] font-semibold text-[#3a3a3a]" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>{sendBal} {sendToken?.symbol}</span>
                      </div>

                      {/* Recipient */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#48484b]/60 mb-1.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Recipient</label>
                        <input
                          type="text" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..."
                          className={`w-full px-3 py-2 rounded-[10px] border text-xs focus:outline-none transition-colors ${sendTo && !isAddress(sendTo) ? "border-red-300 bg-red-50/50" : "border-[#e7e9eb] focus:border-[#3a3a3a]"}`}
                          style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                        />
                        {sendTo && !isAddress(sendTo) && <p className="text-[9px] text-red-500 mt-1" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Invalid address</p>}
                      </div>

                      {/* Amount */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#48484b]/60 mb-1.5" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Amount</label>
                        <div className="relative">
                          <input
                            type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)}
                            placeholder="0.00" step="0.01" min="0"
                            className={`w-full px-3 py-2 pr-14 rounded-[10px] border text-xs focus:outline-none transition-colors ${sendAmount && sendAmtNum > parseFloat(sendBal) ? "border-red-300 bg-red-50/50" : "border-[#e7e9eb] focus:border-[#3a3a3a]"}`}
                            style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                          />
                          <button onClick={() => setSendAmount(sendBalRaw)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[9px] font-semibold rounded-[6px] bg-[#3a3a3a] text-white hover:bg-[#555] transition-colors" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                            Max
                          </button>
                        </div>
                        {sendAmount && sendAmtNum > parseFloat(sendBal) && <p className="text-[9px] text-red-500 mt-1" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Insufficient balance</p>}
                      </div>

                      {/* Send button */}
                      <button
                        onClick={handleSend} disabled={!sendOk}
                        className="w-full py-2.5 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-[#3a3a3a]"
                        style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                      >
                        Send {sendToken?.symbol} on {sendChainCfg.name}
                      </button>
                    </>
                  )}

                  {sendBusy && (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <div className="w-5 h-5 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin" />
                      <span className="text-[11px] font-medium text-[#48484b]/60" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                        {sendStatus === "switching" ? "Switching network..." : "Sending..."}
                      </span>
                    </div>
                  )}

                  {sendStatus === "success" && (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-sm font-semibold text-green-700" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Sent successfully</span>
                      {sendTxHash && (
                        <a href={`${sendChainCfg.explorer}${sendTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#48484b]/50 hover:text-[#3a3a3a] underline" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                          View transaction
                        </a>
                      )}
                      <button onClick={() => setView("wallet")} className="mt-2 w-full py-2 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                        Done
                      </button>
                    </div>
                  )}

                  {sendStatus === "error" && (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </div>
                      <span className="text-sm font-semibold text-red-600" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Transaction failed</span>
                      {sendError && <p className="text-[10px] text-red-500/70 text-center break-all" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>{sendError}</p>}
                      <div className="flex gap-2 mt-2 w-full">
                        <button onClick={() => { setSendStatus("idle"); setSendError(null); }} className="flex-1 py-2 rounded-[10px] border border-[#e7e9eb] text-[11px] font-semibold text-[#3a3a3a] hover:bg-[#f5f5f5] transition-colors" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Retry</button>
                        <button onClick={() => setView("wallet")} className="flex-1 py-2 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>Back</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══ SWAP VIEW ══ */}
            {view === "swap" && (() => {
              const chainTokens = SWAP_TOKENS[swapChainId] || [];
              const swapChainCfg = SWAP_CHAINS.find(c => c.id === swapChainId)!;
              const canSwap = swapQuote && !swapFetching && swapAmount && parseFloat(swapAmount) > 0 && swapTokenIn.address !== swapTokenOut.address;
              return (
              <>
                <BackHeader title="Swap" />
                <div className="px-4 py-3 space-y-3">
                  {swapProgress.step === "idle" || swapProgress.step === "fetching_quote" ? (
                    <>
                      {/* Chain selector */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {SWAP_CHAINS.map((c) => {
                          const Icon = c.icon;
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                if (c.id === swapChainId) return;
                                const tokens = SWAP_TOKENS[c.id];
                                setSwapChainId(c.id);
                                setSwapTokenIn(tokens[0]);
                                setSwapTokenOut(tokens[1]);
                                setSwapAmount(""); setSwapQuote(null);
                              }}
                              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] text-[11px] font-semibold text-center transition-all ${
                                swapChainId === c.id ? "bg-[#3a3a3a] text-white shadow-sm" : "bg-[#f5f5f5] border border-[#e7e9eb] text-[#3a3a3a] hover:border-[#ccc]"
                              }`}
                            >
                              <Icon size={12} />
                              {c.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* From token */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-[#48484b]/60">From</label>
                        <div className="flex gap-2">
                          <select
                            value={swapTokenIn.address}
                            onChange={(e) => {
                              const t = chainTokens.find(tk => tk.address === e.target.value);
                              if (t) { setSwapTokenIn(t); setSwapQuote(null); }
                            }}
                            className="flex-1 px-3 py-2 rounded-[10px] border border-[#e7e9eb] text-xs font-semibold bg-white focus:outline-none focus:border-[#3a3a3a] appearance-none cursor-pointer"
                          >
                            {chainTokens.map((t) => (
                              <option key={t.address} value={t.address}>{t.symbol}</option>
                            ))}
                          </select>
                          <div className="relative flex-1">
                            <input
                              type="number" value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)}
                              placeholder="0.00" step="0.01" min="0"
                              className="w-full px-3 py-2 pr-12 rounded-[10px] border border-[#e7e9eb] text-xs focus:outline-none focus:border-[#3a3a3a]"
                            />
                            <button
                              onClick={() => {
                                // Use known balance for USDC tokens, otherwise leave empty
                                if (swapTokenIn.address === USDC_BASE) setSwapAmount(baseUsdc.toFixed(2));
                                else if (swapTokenIn.address === USDC_POLYGON_BRIDGED) setSwapAmount(polyBridgedUsdc.toFixed(2));
                                else if (swapTokenIn.address === USDC_POLYGON_NATIVE) setSwapAmount(polyNativeUsdc.toFixed(2));
                                else if (swapTokenIn.address === USDC_ARBITRUM) setSwapAmount(arbUsdc.toFixed(2));
                                else if (swapTokenIn.address === USDC_ETHEREUM) setSwapAmount(ethUsdc.toFixed(2));
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[8px] font-semibold rounded-[4px] bg-[#3a3a3a] text-white hover:bg-[#555] transition-colors"
                            >
                              Max
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Flip button */}
                      <div className="flex justify-center -my-1">
                        <button
                          onClick={() => {
                            const prev = swapTokenIn;
                            setSwapTokenIn(swapTokenOut);
                            setSwapTokenOut(prev);
                            setSwapAmount(""); setSwapQuote(null);
                          }}
                          className="w-7 h-7 rounded-full border border-[#e7e9eb] bg-white hover:bg-[#f5f5f5] flex items-center justify-center transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 text-[#3a3a3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                        </button>
                      </div>

                      {/* To token */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-[#48484b]/60">To</label>
                        <select
                          value={swapTokenOut.address}
                          onChange={(e) => {
                            const t = chainTokens.find(tk => tk.address === e.target.value);
                            if (t) { setSwapTokenOut(t); setSwapQuote(null); }
                          }}
                          className="w-full px-3 py-2 rounded-[10px] border border-[#e7e9eb] text-xs font-semibold bg-white focus:outline-none focus:border-[#3a3a3a] appearance-none cursor-pointer"
                        >
                          {chainTokens.filter(t => t.address !== swapTokenIn.address).map((t) => (
                            <option key={t.address} value={t.address}>{t.symbol}</option>
                          ))}
                        </select>
                      </div>

                      {/* Quote */}
                      {swapFetching && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#f9fafb] rounded-[10px] border border-[#e7e9eb]">
                          <div className="w-3 h-3 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin" />
                          <span className="text-[10px] text-[#48484b]/60">Getting quote...</span>
                        </div>
                      )}
                      {swapQuote && !swapFetching && (
                        <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/50 rounded-[10px] border border-emerald-100">
                          <span className="text-[10px] text-emerald-700 font-medium">You receive</span>
                          <span className="text-[12px] font-semibold text-emerald-800 tabular-nums">
                            ~{swapQuote.amountOutFormatted || parseFloat(swapQuote.amountOut || "0").toFixed(4)} {swapTokenOut.symbol}
                          </span>
                        </div>
                      )}
                      {swapQuoteError && !swapFetching && (
                        <p className="text-[10px] text-red-500 px-1">{swapQuoteError}</p>
                      )}

                      {/* Swap button */}
                      <button
                        onClick={async () => {
                          if (!swapQuote) return;
                          try {
                            await lifiExecuteSwap({
                              tokenIn: swapTokenIn.address,
                              tokenOut: swapTokenOut.address,
                              amountIn: swapAmount,
                              decimalsIn: swapTokenIn.decimals,
                              decimalsOut: swapTokenOut.decimals,
                              chainId: swapChainId as any,
                              slippageBps: 50,
                            }, swapQuote);
                            window.dispatchEvent(new Event('trade-completed'));
                          } catch { /* handled by progress */ }
                        }}
                        disabled={!canSwap}
                        className="w-full py-2.5 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        Swap {swapTokenIn.symbol} → {swapTokenOut.symbol}
                      </button>
                    </>
                  ) : swapProgress.step === "completed" ? (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-sm font-semibold text-green-700">Swap complete!</span>
                      {swapProgress.txHash && (
                        <a
                          href={`${swapChainCfg.explorer}${swapProgress.txHash}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-[#48484b]/50 hover:text-[#3a3a3a] underline"
                        >
                          View transaction
                        </a>
                      )}
                      <button onClick={() => { resetSwap(); setSwapAmount(""); setSwapQuote(null); }} className="mt-2 w-full py-2 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors">
                        Done
                      </button>
                    </div>
                  ) : swapProgress.step === "failed" ? (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </div>
                      <span className="text-sm font-semibold text-red-600">Swap failed</span>
                      {swapProgress.error && <p className="text-[10px] text-red-500/70 text-center break-all">{swapProgress.error}</p>}
                      <div className="flex gap-2 mt-2 w-full">
                        <button onClick={() => { resetSwap(); setSwapQuote(null); }} className="flex-1 py-2 rounded-[10px] border border-[#e7e9eb] text-[11px] font-semibold text-[#3a3a3a] hover:bg-[#f5f5f5] transition-colors">Retry</button>
                        <button onClick={() => setView("wallet")} className="flex-1 py-2 rounded-[10px] bg-[#3a3a3a] text-white text-[11px] font-semibold hover:bg-[#555] transition-colors">Back</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <div className="w-5 h-5 border-2 border-[#e7e9eb] border-t-[#3a3a3a] rounded-full animate-spin" />
                      <span className="text-[11px] font-medium text-[#48484b]/60">{swapProgress.message || "Processing..."}</span>
                    </div>
                  )}
                </div>
              </>
              );
            })()}

            {/* ══ WITHDRAW VIEW ══ (in-panel — matches Send/Receive/Swap) */}
            {view === "withdraw" && (
              <MoveFundsModal
                open
                variant="panel"
                isDark={!!isArenaDark}
                defaultTo="base"
                onBack={() => setView("wallet")}
                onClose={() => setView("wallet")}
              />
            )}
          </div>
          );
          if (typeof window === "undefined") return null;
          const isMobile = window.matchMedia("(max-width: 767px)").matches;
          return isMobile ? createPortal(dropdown, document.body) : dropdown;
        })()}
      </div>
    );
  }

  // Not ready yet — show skeleton to avoid flashing "Get Started" for signed-in users
  if (!ready || !mounted) {
    return (
      <div className="flex items-stretch h-10 opacity-50 grayscale pointer-events-none transition-all duration-300">
        <div className="px-4 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] rounded-l-[10px] flex items-center justify-center min-w-[80px]">
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-white/40 animate-pulse" />
            <div className="w-1 h-1 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
        <div className="px-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] border-l border-white/10 rounded-r-[10px] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </div>
    );
  }

  // Connecting
  if (isConnecting) {
    return (
      <button
        disabled
        className={`inline-flex items-center justify-center h-10 px-5 font-medium text-sm rounded-[10px] gap-2.5 cursor-wait shadow-sm transition-all ${
          isArenaDark
            ? 'bg-[#151515] text-white/90 border border-white/[0.16] shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white/90 border border-[#3b3b3b]'
        }`}
      >
        <div className="relative flex items-center justify-center w-4 h-4">
          <div className="absolute inset-0 border-2 border-white/10 rounded-full"></div>
          <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
        <span className="tracking-wide">Connecting...</span>
      </button>
    );
  }

  // Disconnected
  return (
    <button
      onClick={() => login()}
      className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white font-medium text-sm rounded-[10px] hover:opacity-90 transition-opacity"
    >
      Get Started
    </button>
  );
}
