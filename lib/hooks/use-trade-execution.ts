// use-trade-execution.ts - Polymarket BUY/SELL flow with Privy embedded wallet
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { queueTradeRecord, updateTradeRecord } from "@/lib/trade-record-queue";
import { translateWalletError } from "@/lib/error-translators/wallet-errors";
import { httpRpcUrl } from "@/lib/rpc/endpoints";
import { ClobClient, OrderType, AssetType, Side, type ApiKeyCreds } from "@polymarket/clob-client-v2";
import type { providers } from "ethers";
import { parseUnits } from "@ethersproject/units";
import { useWallets, useSendTransaction as usePrivySendTransaction } from "@privy-io/react-auth";
import { polygon } from "viem/chains";
import { encodeFunctionData } from "viem";
import {
  POLYMARKET_HOST,
  POLYMARKET_CHAIN_ID,
  POLYGON_PUSD,
  POLYGON_PUSD_CHECKSUMMED,
  POLYGON_USDC,
  POLYGON_USDC_CHECKSUMMED,
  POLYGON_USDC_NATIVE,
  BASE_USDC,
  POLYGON_RPC,
  CTF_CONTRACT,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  CTF_COLLATERAL_ADAPTER,
  NEG_RISK_CTF_COLLATERAL_ADAPTER,
  BUILDER_CODE,
  wrapUsdcEToPusd,
  ERC20_APPROVE_ABI,
  ERC1155_SET_APPROVAL_ABI,
  ERC20_TRANSFER_ABI,
  CTF_REDEEM_ABI,
  switchToPolygon as switchToPolygonUtil,
  switchToBase as switchToBaseUtil,
  getPolygonSigner,
  fastBalancePreCheck,
  checkIsApprovedForAll,
  checkConditionalTokenBalance,
  compliancePreCheck,
  deriveApiKeyWithRetry,
} from "@/lib/polymarket/trade-utils";
import { detectFundedMaker, type MakerConfig } from "@/lib/polymarket/proxy";

// Re-export shared utilities for backward compatibility
export {
  POLYGON_PUSD,
  POLYGON_USDC,
  POLYGON_USDC_NATIVE,
  BASE_USDC,
  POLYGON_RPC,
  CTF_CONTRACT,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  ERC1155_SET_APPROVAL_ABI,
  checkIsApprovedForAll,
  compliancePreCheck,
};

/** Raw orderbook bid/ask entry from the Polymarket API */
interface RawOrderbookEntry {
  price: string;
  size: string;
}

/** Extended balance/allowance view returned by the CLOB at runtime */
interface ClobBalanceAllowanceView {
  balance?: string;
  allowance?: string;
  allowances?: Record<string, string>;
}

/** Shape of the postOrder response used in this file */
interface PostOrderResponse {
  orderID?: string;
  id?: string;
  error?: string;
  errorMsg?: string;
  averagePrice?: string;
  price?: string;
  filledSize?: string;
}

export type TradeStep =
  | "idle"
  | "checking_balance"
  | "switching_to_polygon"
  | "funding_gas"
  | "approving"
  | "swapping_usdc"
  | "signing_order"
  | "submitting_order"
  | "switching_to_base"
  | "bridging"
  | "waiting_bridge"
  | "redeeming"
  | "completed"
  | "failed";

export interface TradeProgress {
  step: TradeStep;
  message: string;
  orderId?: string;
  error?: string;
}

// Slippage tolerance for market orders (2.5% from best price)
const MARKET_ORDER_SLIPPAGE = 0.025;

/**
 * Fetch best bid and ask prices from the Polymarket orderbook.
 * Used to set slippage-protected price limits on FAK orders.
 */
async function fetchBestPrices(tokenId: string, side?: 'buy' | 'sell'): Promise<{ bestBid: number; bestAsk: number }> {
  try {
    // Only fetch the side we need — halves API calls for single-side operations
    if (side === 'buy') {
      const askRes = await fetch(`${POLYMARKET_HOST}/price?token_id=${tokenId}&side=sell`, {
        signal: AbortSignal.timeout(3_000),
      });
      const askData = await askRes.json();
      return { bestBid: 0, bestAsk: parseFloat(askData.price || '0') };
    }
    if (side === 'sell') {
      const bidRes = await fetch(`${POLYMARKET_HOST}/price?token_id=${tokenId}&side=buy`, {
        signal: AbortSignal.timeout(3_000),
      });
      const bidData = await bidRes.json();
      return { bestBid: parseFloat(bidData.price || '0'), bestAsk: 0 };
    }
    const [bidRes, askRes] = await Promise.all([
      fetch(`${POLYMARKET_HOST}/price?token_id=${tokenId}&side=buy`, {
        signal: AbortSignal.timeout(3_000),
      }),
      fetch(`${POLYMARKET_HOST}/price?token_id=${tokenId}&side=sell`, {
        signal: AbortSignal.timeout(3_000),
      }),
    ]);
    const [bidData, askData] = await Promise.all([bidRes.json(), askRes.json()]);
    return {
      bestBid: parseFloat(bidData.price || '0'),
      bestAsk: parseFloat(askData.price || '0'),
    };
  } catch (err) {
    console.warn("[Trade] Failed to fetch orderbook prices:", err);
    return { bestBid: 0, bestAsk: 0 };
  }
}

/**
 * Pre-check orderbook liquidity before attempting a sell.
 * Returns { fillableSize, bestBid, totalBidDepth } so caller can
 * decide whether to proceed, sell partial, or abort early.
 */
async function checkSellLiquidity(tokenId: string, sellSize: number): Promise<{
  fillableSize: number;
  bestBid: number;
  totalBidDepth: number;
  bids: { price: number; size: number }[];
}> {
  try {
    const res = await fetch(`${POLYMARKET_HOST}/book?token_id=${tokenId}`, {
      signal: AbortSignal.timeout(5_000),
    });
    const raw = await res.json();
    const bids: { price: number; size: number }[] = (raw?.bids || [])
      .map((b: RawOrderbookEntry) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .sort((a: { price: number }, b: { price: number }) => b.price - a.price);

    let totalBidDepth = 0;
    let fillableSize = 0;
    for (const bid of bids) {
      totalBidDepth += bid.size;
      fillableSize = Math.min(totalBidDepth, sellSize);
      if (fillableSize >= sellSize) break;
    }

    return {
      fillableSize,
      bestBid: bids.length > 0 ? bids[0].price : 0,
      totalBidDepth,
      bids,
    };
  } catch (err) {
    console.warn("[Trade] Failed to check sell liquidity:", err);
    return { fillableSize: 0, bestBid: 0, totalBidDepth: 0, bids: [] };
  }
}

export function useTradeExecution() {
  const { wallets } = useWallets();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<TradeProgress>({ step: "idle", message: "" });
  const [isExecuting, setIsExecuting] = useState(false);

  const apiCredsRef = useRef<ApiKeyCreds | null>(null);
  const cachedClobClientRef = useRef<{ client: ClobClient; credsKey: string } | null>(null);
  // Cache CLOB balance/allowance to skip redundant updateBalanceAllowance calls
  const clobBalanceCacheRef = useRef<{ view: ClobBalanceAllowanceView; ts: number } | null>(null);
  const CLOB_BALANCE_TTL = 30_000; // 30 seconds — cache is invalidated on approval changes anyway

  // Get embedded wallet
  const getEmbeddedWallet = useCallback(() => {
    return wallets.find(w => w.walletClientType === 'privy');
  }, [wallets]);

  // Get signer from embedded wallet
  const getEmbeddedPolygonSigner = useCallback(async (): Promise<providers.JsonRpcSigner> => {
    return getPolygonSigner(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Switch to Polygon
  const switchToPolygon = useCallback(async () => {
    await switchToPolygonUtil(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Switch to Base
  const switchToBase = useCallback(async () => {
    await switchToBaseUtil(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Create and sign order (embedded wallet only)
  // preloadedClobView: skip balance sync if we already have fresh data
  const createAndSignOrder = useCallback(async (
    signer: providers.JsonRpcSigner,
    tokenId: string,
    size: number,
    maxApprovalRaw: ReturnType<typeof parseUnits>,
    address: string,
    makerConfig: MakerConfig,
    preloadedClobView?: ClobBalanceAllowanceView,
    preloadedBestPrices?: { bestBid: number; bestAsk: number },
  ) => {
    const buildClient = (creds: ApiKeyCreds) => new ClobClient({
      host: POLYMARKET_HOST,
      chain: POLYMARKET_CHAIN_ID,
      signer,
      creds,
      signatureType: makerConfig.signatureType,
      funderAddress: makerConfig.maker,
      builderConfig: BUILDER_CODE ? { builderCode: BUILDER_CODE } : undefined,
    });

    // Derive or use cached credentials
    let creds = apiCredsRef.current;
    if (!creds) {
      creds = await deriveApiKeyWithRetry(signer);
      apiCredsRef.current = creds;
    }

    let client = buildClient(creds);

    // Use pre-loaded CLOB data if available, otherwise sync fresh
    let clobView: ClobBalanceAllowanceView;
    if (preloadedClobView) {
      clobView = preloadedClobView;
    } else {
      try {
        await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      } catch (syncErr: unknown) {
        const syncErrObj = syncErr as { response?: { status?: number }; message?: string };
        const is401 = syncErrObj?.response?.status === 401 || syncErrObj?.message?.includes("Unauthorized");
        if (is401 && apiCredsRef.current) {
          apiCredsRef.current = null;
          creds = await deriveApiKeyWithRetry(signer);
          apiCredsRef.current = creds;
          client = buildClient(creds);
          await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        } else {
          throw syncErr;
        }
      }
      clobView = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }) as ClobBalanceAllowanceView;
      clobBalanceCacheRef.current = { view: clobView, ts: Date.now() };
    }

    // Approve CLOB-tracked spenders if needed — filter first, then send only necessary txns
    const tradeAmountBig = BigInt(parseUnits(String(size), 6).toString());
    const allowancesMap: Record<string, string> | undefined = clobView?.allowances;
    let didApprove = false;

    if (allowancesMap) {
      const spendersNeedingApproval = Object.entries(allowancesMap)
        .filter(([, allowanceStr]) => BigInt(allowanceStr) < tradeAmountBig)
        .map(([spender]) => spender);

      const totalApprovals = spendersNeedingApproval.length;
      if (totalApprovals > 0) {
        if (makerConfig.source === 'proxy') {
          // The proxy holds the funds, so only the proxy can grant allowances.
          // Polymarket's frontend sets these up via their relayer when the user
          // first interacts. We can't replicate that flow client-side.
          throw new Error(
            "Your Polymarket proxy doesn't have the required USDC allowances set up. " +
            "Please complete one trade on polymarket.com to initialize the proxy, then try again here."
          );
        }
        setProgress({
          step: "approving",
          message: `One-time setup — approving ${totalApprovals} Polymarket contract${totalApprovals > 1 ? 's' : ''} to spend USDC. No funds move yet.`,
        });
      }

      for (let i = 0; i < spendersNeedingApproval.length; i++) {
        const spender = spendersNeedingApproval[i];
        setProgress({
          step: "approving",
          message: `Approving contract ${i + 1} of ${totalApprovals}…`,
        });
        const approveData = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [spender as `0x${string}`, BigInt(maxApprovalRaw.toString())],
        });
        await privySendTransaction(
          { to: POLYGON_PUSD_CHECKSUMMED, data: approveData, chainId: polygon.id },
          { sponsor: true, address },
        );
        didApprove = true;
      }
    }

    // Only re-sync CLOB if approvals were actually made
    if (didApprove) {
      await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      // Invalidate balance cache since allowances changed
      clobBalanceCacheRef.current = null;
    }

    // Use pre-fetched prices if available, otherwise fetch now
    const { bestAsk } = preloadedBestPrices || await fetchBestPrices(tokenId, 'buy');

    if (bestAsk <= 0) {
      throw new Error("No sell orders available right now. Try placing a limit buy order instead, or wait for sellers to appear.");
    }

    // Set price ceiling: best ask plus slippage tolerance (max 0.99)
    const buyPrice = Math.min(0.99, Math.round((bestAsk * (1 + MARKET_ORDER_SLIPPAGE)) * 100) / 100);
    console.log(`[Trade] Buy: bestAsk=${bestAsk}, buyPrice=${buyPrice} (${MARKET_ORDER_SLIPPAGE * 100}% slippage protection)`);

    // Sign order
    // Omit feeRateBps — when undefined, the SDK auto-resolves the correct fee rate per market
    const order = await client.createMarketOrder({
      tokenID: tokenId,
      amount: size,
      price: buyPrice,
      side: Side.BUY,
      builderCode: BUILDER_CODE,
    });

    return { client, order };
  }, [privySendTransaction]);

  // SELL execution
  const executeSell = useCallback(async (params: {
    tokenId: string;
    size: number;
    outcome: string;
    question: string;
    marketId?: string;
    negativeRisk?: boolean;
  }) => {
    const embedded = getEmbeddedWallet();
    if (!embedded) {
      throw new Error("No embedded wallet found");
    }

    setIsExecuting(true);

    try {
      // ── Run liquidity check, signer setup, and compliance in parallel ──
      setProgress({ step: "checking_balance", message: "Checking market liquidity..." });
      const address = embedded.address.toLowerCase();
      const [liquidity, signer, isSafe] = await Promise.all([
        checkSellLiquidity(params.tokenId, params.size),
        getEmbeddedPolygonSigner(),
        compliancePreCheck(address, POLYMARKET_CHAIN_ID),
      ]);
      console.log(`[Trade] Sell liquidity check: bestBid=${liquidity.bestBid}, totalDepth=${liquidity.totalBidDepth}, fillable=${liquidity.fillableSize}/${params.size}`);

      if (liquidity.totalBidDepth === 0 || liquidity.bestBid <= 0) {
        throw new Error(
          "NO_LIQUIDITY: There are no buy orders for this market right now. Place a limit sell order instead — it will wait on the book until a buyer matches."
        );
      }

      if (liquidity.fillableSize < params.size) {
        const pct = Math.round((liquidity.fillableSize / params.size) * 100);
        throw new Error(
          `LOW_LIQUIDITY: Only ${liquidity.fillableSize.toFixed(2)} of your ${params.size.toFixed(2)} shares can be sold right now (${pct}% of your position). Place a limit sell order for the full amount, or sell a smaller quantity.`
        );
      }

      if (!isSafe) {
        throw new Error("Trade blocked: your address has been flagged by compliance screening. Please contact support.");
      }

      // Resolve maker config — for users who funded via Polymarket's frontend
      // (Magic email login), their pUSD and CTF shares live in the derived
      // proxy, not the EOA. The CLOB rejects signatureType=0/maker=EOA in that
      // case with "maker address not allowed".
      const makerConfig = await detectFundedMaker(address, { rpcUrl: POLYGON_RPC });

      // Approve CTF Exchange operators + check on-chain balance + derive API creds — all in parallel
      setProgress({ step: "approving", message: "Checking token approvals..." });
      const userAddress = address;
      const operatorsToApprove = params.negativeRisk
        ? [NEG_RISK_CTF_EXCHANGE]
        : [CTF_EXCHANGE];

      const credsReady = apiCredsRef.current?.key && apiCredsRef.current?.secret && apiCredsRef.current?.passphrase;
      // CTF approvals are checked against the maker (proxy users have them
      // pre-set by Polymarket's frontend). Balance is also read off the maker.
      const [approvalResults, onChainBalance, creds] = await Promise.all([
        Promise.all(operatorsToApprove.map(op => checkIsApprovedForAll(CTF_CONTRACT, makerConfig.maker, op))),
        checkConditionalTokenBalance(makerConfig.maker, params.tokenId),
        credsReady ? Promise.resolve(apiCredsRef.current!) : deriveApiKeyWithRetry(signer),
      ]);
      apiCredsRef.current = creds;

      for (let i = 0; i < operatorsToApprove.length; i++) {
        if (!approvalResults[i]) {
          if (makerConfig.source === 'proxy') {
            // We can't grant approvals on behalf of the proxy from the EOA —
            // only the proxy itself can. Polymarket's frontend handles this
            // for proxy-funded accounts via their relayer.
            throw new Error(
              "Your Polymarket proxy doesn't have the required CTF approvals set up. " +
              "Please complete one trade on polymarket.com to initialize the proxy, then try again here."
            );
          }
          const approveData = encodeFunctionData({
            abi: ERC1155_SET_APPROVAL_ABI,
            functionName: "setApprovalForAll",
            args: [operatorsToApprove[i] as `0x${string}`, true],
          });
          await privySendTransaction(
            { to: CTF_CONTRACT, data: approveData, chainId: polygon.id },
            { sponsor: true, address: userAddress },
          );
        }
      }

      const client = new ClobClient({
        host: POLYMARKET_HOST,
        chain: POLYMARKET_CHAIN_ID,
        signer,
        creds,
        signatureType: makerConfig.signatureType,
        funderAddress: makerConfig.maker,
        builderConfig: BUILDER_CODE ? { builderCode: BUILDER_CODE } : undefined,
      });

      // Cap sell size to actual on-chain balance
      setProgress({ step: "signing_order", message: "Syncing position..." });
      const onChainShares = Number(onChainBalance) / 1e6;
      console.log(`[Trade] On-chain CTF balance: ${onChainBalance.toString()} (${onChainShares} shares), requested sell: ${params.size}`);

      if (onChainBalance === 0n) {
        throw new Error(
          "You don't hold this token on-chain. The buy may not have settled yet — try again in a moment."
        );
      }

      // Cap sell size to actual on-chain balance (Data API can report slightly more due to fee rounding)
      if (params.size > onChainShares) {
        const actualShares = Math.floor(onChainShares * 1000) / 1000; // floor to 3 decimals
        if (actualShares <= 0) {
          throw new Error("On-chain balance too small to sell.");
        }
        toast.info(`You hold ${actualShares} shares on-chain. Adjusting sell size.`);
        params.size = actualShares;
      }

      // Sync conditional token balance & allowance with the CLOB + pre-fetch best bid in parallel
      const [, bestPrices] = await Promise.all([
        client.updateBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
          token_id: params.tokenId,
        }),
        fetchBestPrices(params.tokenId, 'sell'),
      ]);

      // Check CLOB-tracked allowances and approve any that are insufficient
      const condView = await client.getBalanceAllowance({
        asset_type: AssetType.CONDITIONAL,
        token_id: params.tokenId,
      }) as ClobBalanceAllowanceView;

      const allowancesMap: Record<string, string> | undefined = condView?.allowances;
      let didApproveCond = false;

      if (allowancesMap) {
        // Check all spenders in parallel, then send approvals for those that need it
        const spendersNeedingApproval: string[] = [];
        const zeroAllowanceSpenders = Object.entries(allowancesMap)
          .filter(([, allowanceStr]) => BigInt(allowanceStr) === 0n)
          .map(([spender]) => spender);

        if (zeroAllowanceSpenders.length > 0) {
          const approvalStatuses = await Promise.all(
            zeroAllowanceSpenders.map(spender => checkIsApprovedForAll(CTF_CONTRACT, userAddress, spender))
          );
          zeroAllowanceSpenders.forEach((spender, i) => {
            if (!approvalStatuses[i]) spendersNeedingApproval.push(spender);
          });
        }

        // Send approval txns (sequential — each is a wallet tx that needs user signing)
        for (const spender of spendersNeedingApproval) {
          const approveData = encodeFunctionData({
            abi: ERC1155_SET_APPROVAL_ABI,
            functionName: "setApprovalForAll",
            args: [spender as `0x${string}`, true],
          });
          await privySendTransaction(
            { to: CTF_CONTRACT, data: approveData, chainId: polygon.id },
            { sponsor: true, address: userAddress },
          );
          didApproveCond = true;
        }
      }

      // Re-sync if new approvals were granted so the CLOB sees them
      if (didApproveCond) {
        await client.updateBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
          token_id: params.tokenId,
        });
      }

      // Re-fetch best bid if approvals added delay (price may have moved)
      setProgress({ step: "submitting_order", message: "Checking market liquidity..." });
      const { bestBid } = didApproveCond ? await fetchBestPrices(params.tokenId, 'sell') : bestPrices;

      if (bestBid <= 0) {
        throw new Error("No buy orders available right now. Try placing a limit sell order instead, or wait for buyers to appear.");
      }

      // Set price floor: best bid minus slippage tolerance (min 0.01)
      const sellPrice = Math.max(0.01, Math.round((bestBid * (1 - MARKET_ORDER_SLIPPAGE)) * 100) / 100);
      console.log(`[Trade] Sell: bestBid=${bestBid}, sellPrice=${sellPrice} (${MARKET_ORDER_SLIPPAGE * 100}% slippage protection)`);

      // Create SELL order
      setProgress({ step: "submitting_order", message: "Submitting sell order..." });
      const order = await client.createMarketOrder({
        tokenID: params.tokenId,
        amount: params.size,
        price: sellPrice,
        side: Side.SELL,
        builderCode: BUILDER_CODE,
      });

      const response = await client.postOrder(order, OrderType.FAK) as PostOrderResponse;
      const orderId = response?.orderID || response?.id;

      if (!orderId) {
        throw new Error(response?.error || response?.errorMsg || "Sell order was not accepted");
      }

      setProgress({ step: "completed", message: "Sold!", orderId });

      // Record trade (fire-and-forget — retry queue handles failures)
      const sellShares = typeof params.size === 'string' ? parseFloat(params.size) : params.size;
      const fillPrice = Number(response?.averagePrice) || Number(response?.price) || bestBid;
      const fillAmount = Number(response?.filledSize) || sellShares;
      const executedAt = new Date().toISOString();
      console.log(`[Trade] Recording SELL: conditionId=${params.marketId}, amount=${fillAmount * fillPrice}, price=${fillPrice}, shares=${fillAmount}, orderId=${orderId}`);
      queueTradeRecord({
        user_address: userAddress,
        condition_id: params.marketId || '',
        token_id: params.tokenId,
        side: 'SELL',
        outcome: params.outcome,
        amount: fillAmount * fillPrice,
        price: fillPrice,
        shares: fillAmount,
        order_id: orderId,
        market_question: params.question || '',
        status: 'completed',
        executed_at: executedAt,
      }).catch((err) => { console.error('[Trade] SELL record failed:', err); });

      // Switch back to Base after recording (fire-and-forget — must not block or throw)
      switchToBase().catch(() => {});

      setIsExecuting(false);
      return response;

    } catch (error: unknown) {
      const errorStr = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      console.error("[Trade] Sell failed:", errorStr, error);
      const errorObj = error as { response?: { data?: { error?: string } }; message?: string };
      let msg = errorObj?.response?.data?.error || errorObj?.message || errorStr || "Sell failed";

      // Clean up prefixed liquidity errors (show the human-readable part)
      if (msg.startsWith("NO_LIQUIDITY: ")) {
        msg = msg.replace("NO_LIQUIDITY: ", "");
      } else if (msg.startsWith("LOW_LIQUIDITY: ")) {
        msg = msg.replace("LOW_LIQUIDITY: ", "");
      } else if (/no orders found to match|FAK order/i.test(msg)) {
        // FAK rejection from the API — orderbook drained between our check and submission
        msg = "No buyers at your price right now. Try a limit sell order or wait for more liquidity.";
      } else {
        const t = translateWalletError(error);
        msg = t.hint ? `${t.title} ${t.hint}` : t.title;
      }

      setProgress({ step: "failed", message: msg, error: msg });
      const isAuthError = /unauthorized|403|invalid api key/i.test(errorStr);
      if (isAuthError) apiCredsRef.current = null;
      // Fire-and-forget — must not block the re-throw
      try { switchToBase().catch(() => {}); } catch {}
      setIsExecuting(false);
      throw new Error(msg);
    }
  }, [getEmbeddedWallet, getEmbeddedPolygonSigner, privySendTransaction, switchToBase]);

  // REDEEM execution — for resolved markets, converts winning shares → pUSD on-chain
  const executeRedeem = useCallback(async (params: {
    conditionId: string;
    tokenId?: string;
    negativeRisk?: boolean;
    proxyWallet?: string;
    shares?: number;
    outcome?: string;
  }) => {
    const embedded = getEmbeddedWallet();
    if (!embedded) throw new Error("No embedded wallet found");

    setIsExecuting(true);

    try {
      setProgress({ step: "checking_balance", message: "Checking on-chain balance..." });

      const rpcUrl = httpRpcUrl('polygon');
      const address = embedded.address.toLowerCase();
      let onChainBalance = 0n;

      console.log("[Redeem] conditionId:", params.conditionId, "negRisk:", params.negativeRisk, "tokenId:", params.tokenId);

      // Single parallel blast: signer(+chain switch) + token balance + adapter approval + pre-balance snapshot
      const adapterAddress = params.negativeRisk ? NEG_RISK_CTF_COLLATERAL_ADAPTER : CTF_COLLATERAL_ADAPTER;
      const paddedAddr = "000000000000000000000000" + address.slice(2);
      const balanceOfData = "0x70a08231" + paddedAddr;

      const [signer, tokenBalance, isAdapterApproved, preSnapshot] = await Promise.all([
        getEmbeddedPolygonSigner(),
        params.tokenId
          ? checkConditionalTokenBalance(address, params.tokenId)
              .catch((err) => { console.warn("[Redeem] Balance pre-check failed (continuing):", err); return 0n; })
          : Promise.resolve(0n),
        checkIsApprovedForAll(CTF_CONTRACT, address, adapterAddress),
        Promise.all([
          fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: POLYGON_PUSD, data: balanceOfData }, "latest"] }),
            signal: AbortSignal.timeout(5_000),
          }).then(r => r.json()),
          fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: POLYGON_USDC, data: balanceOfData }, "latest"] }),
            signal: AbortSignal.timeout(5_000),
          }).then(r => r.json()),
        ]).catch(() => null as null),
      ]);
      onChainBalance = tokenBalance;

      let preRedeemPusdBalance = 0n;
      let preRedeemUsdcEBalance = 0n;
      let preCheckSucceeded = false;
      if (preSnapshot) {
        preRedeemPusdBalance = preSnapshot[0]?.result ? BigInt(preSnapshot[0].result) : 0n;
        preRedeemUsdcEBalance = preSnapshot[1]?.result ? BigInt(preSnapshot[1].result) : 0n;
        preCheckSucceeded = true;
        console.log("[Redeem] Pre-redeem balances — pUSD:", preRedeemPusdBalance.toString(), "USDC.e:", preRedeemUsdcEBalance.toString());
      }

      if (params.tokenId && onChainBalance === 0n) {
        try {
          const tokenIdHex = BigInt(params.tokenId).toString(16).padStart(64, "0");
          const balanceRes = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "eth_call",
              params: [{ to: CTF_CONTRACT, data: "0x00fdd58e" + paddedAddr + tokenIdHex }, "latest"],
            }),
            signal: AbortSignal.timeout(5_000),
          });
          const balanceJson = await balanceRes.json();
          onChainBalance = balanceJson.result ? BigInt(balanceJson.result) : 0n;
        } catch {
          // already warned above
        }
        if (onChainBalance === 0n) {
          throw new Error("No redeemable shares found on-chain. This position may have already been redeemed.");
        }
      }
      console.log("[Redeem] On-chain token balance:", onChainBalance.toString());

      setProgress({ step: "redeeming", message: "Redeeming winning shares..." });

      if (!isAdapterApproved) {
        setProgress({ step: "approving", message: "Approving collateral adapter..." });
        const approveCtfData = encodeFunctionData({
          abi: ERC1155_SET_APPROVAL_ABI,
          functionName: "setApprovalForAll",
          args: [adapterAddress as `0x${string}`, true],
        });
        await privySendTransaction(
          { to: CTF_CONTRACT, data: approveCtfData, chainId: polygon.id },
          { sponsor: true, address },
        );
      }

      // Both plain-CTF and neg-risk markets redeem through Polymarket V2's pUSD
      // collateral adapters, which expose the SAME 4-arg Conditional-Tokens
      // signature:
      //   redeemPositions(address collateralToken, bytes32 parentCollectionId,
      //                   bytes32 conditionId, uint256[] indexSets)
      // Only `conditionId` is read on-chain — the adapter looks up the caller's
      // own YES/NO balances, redeems via the legacy CTF, then wraps the USDC.e
      // proceeds into pUSD and returns them to the caller. `collateralToken` is
      // pUSD per the docs; parentCollectionId is bytes32(0) for top-level
      // positions; indexSets [1,2] covers both outcomes (only the winner pays).
      // The ONLY difference between the two market types is which adapter address
      // the tx is sent to.
      //
      // Source of truth: Polymarket/ctf-exchange-v2 —
      //   CtfCollateralAdapter.redeemPositions(address, bytes32, bytes32 _conditionId, uint256[])
      //   NegRiskCtfCollateralAdapter extends it and overrides ONLY the internal
      //   _redeemPositions/_getPositionIds, NOT the external selector.
      // Docs: https://docs.polymarket.com/trading/ctf/redeem +
      //       https://docs.polymarket.com/resources/contracts
      const indexSets = [1n, 2n];
      const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      const redeemData = encodeFunctionData({
        abi: CTF_REDEEM_ABI,
        functionName: "redeemPositions",
        args: [POLYGON_PUSD as `0x${string}`, parentCollectionId, params.conditionId as `0x${string}`, indexSets],
      });
      const toContract = params.negativeRisk ? NEG_RISK_CTF_COLLATERAL_ADAPTER : CTF_COLLATERAL_ADAPTER;

      const receipt = await privySendTransaction(
        { to: toContract, data: redeemData, chainId: polygon.id },
        { sponsor: true, address },
      );

      const txHash = receipt?.hash || (receipt as unknown as { transactionHash?: string })?.transactionHash || receipt;
      console.log("[Trade] Redeemed positions:", txHash);

      setProgress({ step: "completed", message: "Redeemed!", orderId: typeof txHash === "string" ? txHash : "" });

      const redeemShares = params.shares || 0;
      const txHashStr = typeof txHash === "string" ? txHash : "";
      const executedAt = new Date().toISOString();

      // Record the REDEEM immediately so it appears in trade history even if the
      // user navigates away before payout verification completes.
      await queueTradeRecord({
        user_address: address,
        condition_id: params.conditionId,
        token_id: params.tokenId || '',
        side: 'REDEEM',
        outcome: params.outcome || 'Unknown',
        amount: 0,
        price: 0,
        shares: redeemShares,
        order_id: txHashStr,
        market_question: '',
        status: 'pending_payout',
        executed_at: executedAt,
      }).catch(() => {});

      // Fire-and-forget payout verification — don't block the user while we poll Etherscan.
      // The trade record was already saved as pending_payout above; this updates it async.
      if (txHashStr) {
        (async () => {
          let actualPayout = 0;
          let payoutVerified = false;

          await new Promise(r => setTimeout(r, 2000));
          for (let attempt = 0; attempt < 2 && !payoutVerified; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
            try {
              const verifyRes = await fetch(
                `/api/trades/verify-payout?txHash=${txHashStr}&address=${address}`,
                { signal: AbortSignal.timeout(12_000) },
              );
              const verifyJson = await verifyRes.json();
              if (verifyJson.verified) {
                actualPayout = verifyJson.payout || 0;
                payoutVerified = true;
                console.log("[Redeem] Etherscan V2 verified payout:", actualPayout);
              }
            } catch (err) {
              console.warn(`[Redeem] Etherscan verify attempt ${attempt + 1} failed:`, err);
            }
          }

          // Fallback: balance diff via RPC — check pUSD first, then USDC.e
          if (!payoutVerified && preCheckSucceeded) {
            try {
              const [postPusdRes, postUsdcERes] = await Promise.all([
                fetch(rpcUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    jsonrpc: "2.0", id: 1, method: "eth_call",
                    params: [{ to: POLYGON_PUSD, data: balanceOfData }, "latest"],
                  }),
                  signal: AbortSignal.timeout(8_000),
                }),
                fetch(rpcUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    jsonrpc: "2.0", id: 2, method: "eth_call",
                    params: [{ to: POLYGON_USDC, data: balanceOfData }, "latest"],
                  }),
                  signal: AbortSignal.timeout(8_000),
                }),
              ]);
              const [postPusdJson, postUsdcEJson] = await Promise.all([postPusdRes.json(), postUsdcERes.json()]);
              const postPusd = postPusdJson.result ? BigInt(postPusdJson.result) : 0n;
              const pusdDiff = postPusd - preRedeemPusdBalance;
              const postUsdcE = postUsdcEJson.result ? BigInt(postUsdcEJson.result) : 0n;
              const usdcEDiff = postUsdcE - preRedeemUsdcEBalance;
              const diff = pusdDiff > 0n ? pusdDiff : usdcEDiff;
              actualPayout = diff > 0n ? Number(diff) / 1e6 : 0;
              payoutVerified = true;
              console.log("[Redeem] Balance diff fallback payout:", actualPayout, "pUSD diff:", pusdDiff.toString(), "USDC.e diff:", usdcEDiff.toString());
            } catch (err) {
              console.warn("[Redeem] Balance diff fallback failed:", err);
            }
          }

          if (payoutVerified) {
            const redeemPrice = redeemShares > 0 ? actualPayout / redeemShares : 0;
            updateTradeRecord(txHashStr, {
              amount: actualPayout,
              price: redeemPrice,
              status: 'completed',
            }).catch(() => {});
          } else {
            console.warn("[Redeem] Could not verify payout. Record stays as pending_payout.");
          }
        })().catch(err => console.warn("[Redeem] Async payout verification failed:", err));
      }

      // Switch back to Base after recording (fire-and-forget — must not block or throw)
      switchToBase().catch(() => {});

      setIsExecuting(false);
      // actualPayout will be resolved async by the fire-and-forget verification above
      return { txHash: typeof txHash === "string" ? txHash : "", actualPayout: 0 };

    } catch (error: unknown) {
      const errorStr = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      console.error("[Trade] Redeem failed:", errorStr, error);
      const errorObj = error as { response?: { data?: { error?: string } }; message?: string };
      let msg = errorObj?.response?.data?.error || errorObj?.message || errorStr || "Redeem failed";
      // Translate on-chain SafeMath errors to user-friendly messages
      if (msg.includes("SafeMath") || msg.includes("subtraction overflow")) {
        msg = "No redeemable shares found on-chain. This position may have already been redeemed.";
      }
      setProgress({ step: "failed", message: msg, error: msg });
      try { switchToBase().catch(() => {}); } catch {}
      setIsExecuting(false);
      // Always throw the translated message so callers (toast) show the user-friendly text
      throw new Error(msg);
    }
  }, [getEmbeddedWallet, getEmbeddedPolygonSigner, privySendTransaction, switchToBase]);

  // BUY execution
  const executeTrade = useCallback(async (params: {
    tokenId: string;
    price: number;
    size: string;
    side: "BUY";
    outcome: string;
    question: string;
    marketId?: string;
    endDate?: string;
    marketSlug?: string;
    maxApprovalUsdc?: number;
  }) => {
    const embedded = getEmbeddedWallet();
    if (!embedded) {
      throw new Error("No embedded wallet found");
    }

    setIsExecuting(true);

    try {
      // Get signer + balance/compliance checks in parallel
      setProgress({ step: "checking_balance", message: "Checking balance..." });
      const address = embedded.address.toLowerCase();
      const requiredAmount = parseFloat(params.size);

      // ── Run signer setup, balance pre-check, and compliance in parallel ──
      const [signer, balances, isSafe] = await Promise.all([
        getEmbeddedPolygonSigner(),
        fastBalancePreCheck(address),
        compliancePreCheck(address, POLYMARKET_CHAIN_ID),
      ]);

      // Fail fast if total balance across all sources is clearly insufficient
      // Include wrappable USDC.e — can be converted to pUSD automatically
      const totalAvailable = balances.poly + balances.polyUsdcE + balances.base;
      if (totalAvailable < requiredAmount * 0.95) {
        throw new Error(
          `Insufficient pUSD. Need $${params.size}, you have $${balances.poly.toFixed(2)} pUSD` +
          (balances.polyUsdcE > 0.01 ? ` + $${balances.polyUsdcE.toFixed(2)} USDC.e (wrappable)` : '') +
          ` on Polygon and $${balances.base.toFixed(2)} on Base.`
        );
      }

      // Auto-wrap USDC.e → pUSD if user has legacy balance
      if (balances.poly < requiredAmount * 0.95 && balances.polyUsdcE > 0.01) {
        setProgress({ step: "approving", message: "Converting USDC.e to pUSD..." });
        const wrapAmount = BigInt(Math.floor(balances.polyUsdcE * 1e6));
        await wrapUsdcEToPusd(address, wrapAmount, privySendTransaction);
        // Update balances after wrap
        balances.poly += balances.polyUsdcE;
        balances.polyUsdcE = 0;
      }

      if (!isSafe) {
        throw new Error("Trade blocked: your address has been flagged by compliance screening. Please contact support.");
      }

      // Derive API credentials (cached across navigation via module-level ref)
      let creds = apiCredsRef.current;
      if (!creds) {
        creds = await deriveApiKeyWithRetry(signer);
        apiCredsRef.current = creds;
      }

      // Resolve maker config — proxy-funded accounts (Polymarket frontend
      // users) need signatureType=1 with maker=proxy. See lib/polymarket/proxy.ts.
      const makerConfig = await detectFundedMaker(address, { rpcUrl: POLYGON_RPC });

      // Sync CLOB with on-chain state and get balance + allowances in one shot
      // Reuse cached ClobClient if credentials AND maker haven't changed
      const credsKey = `${creds.key}:${creds.secret}:${creds.passphrase}:${makerConfig.maker}`;
      let clobClient: ClobClient;
      if (cachedClobClientRef.current && cachedClobClientRef.current.credsKey === credsKey) {
        clobClient = cachedClobClientRef.current.client;
      } else {
        clobClient = new ClobClient({
          host: POLYMARKET_HOST,
          chain: POLYMARKET_CHAIN_ID,
          signer,
          creds,
          signatureType: makerConfig.signatureType,
          funderAddress: makerConfig.maker,
          builderConfig: BUILDER_CODE ? { builderCode: BUILDER_CODE } : undefined,
        });
        cachedClobClientRef.current = { client: clobClient, credsKey };
      }
      // Run CLOB balance sync and fetchBestPrices in parallel
      // Skip CLOB sync if we have a fresh cached view (saves ~500-800ms)
      const cachedBalance = clobBalanceCacheRef.current;
      const hasFreshCache = cachedBalance && (Date.now() - cachedBalance.ts < CLOB_BALANCE_TTL);
      const balanceSyncPromise = hasFreshCache
        ? Promise.resolve(cachedBalance.view)
        : (async () => {
            await clobClient.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            const view = await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }) as ClobBalanceAllowanceView;
            clobBalanceCacheRef.current = { view, ts: Date.now() };
            return view;
          })();
      const [clobView, prefetchedPrices] = await Promise.all([
        balanceSyncPromise,
        fetchBestPrices(params.tokenId, 'buy'),
      ]);

      // Freshness check: compare the price the user clicked (from SSE) against
      // the live Polymarket ask right before we touch wallet/bridge flows.
      // Abort beyond max(2¢, 3%) so the user retries at the real price rather
      // than eating slippage. Skip when bestAsk is 0 (REST fetch failed) —
      // the CLOB itself will surface a real error instead of us false-aborting.
      if (prefetchedPrices.bestAsk > 0) {
        const drift = Math.abs(prefetchedPrices.bestAsk - params.price);
        const tolerance = Math.max(0.02, params.price * 0.03);
        if (drift > tolerance) {
          throw new Error(
            `Price moved from $${params.price.toFixed(2)} to $${prefetchedPrices.bestAsk.toFixed(2)} — please retry at the current price.`,
          );
        }
      }

      // CLOB returns balance in raw 6-decimal units (e.g. 3822434 = $3.82), convert to dollars
      const balance = parseFloat(clobView?.balance || '0') / 1e6;

      // Track whether we bridged (if so, createAndSignOrder needs fresh sync)
      let preloadedClobView: ClobBalanceAllowanceView | undefined = clobView;
      let preloadedBestPrices: { bestBid: number; bestAsk: number } | undefined = prefetchedPrices;

      if (balance < requiredAmount) {
        // If on-chain pUSD balance covers the trade, skip swap/bridge —
        // the approval will be handled by createAndSignOrder when it checks allowances.
        // For proxy-funded accounts, `balances.poly` was read against the EOA
        // earlier — re-read against the actual maker so proxy holdings count.
        const onChainPusd = makerConfig.source === 'proxy'
          ? makerConfig.detectedBalance
          : balances.poly;
        if (onChainPusd >= requiredAmount * 0.95) {
          preloadedClobView = undefined; // force CLOB re-sync after approval
          clobBalanceCacheRef.current = null;
        } else {

        const shortfall = requiredAmount - balance;
        const baseUsdcBalance = balances.base;

        // Not enough pUSD on Polygon — tell user to bridge/deposit first
        if (shortfall > 0) {
          throw new Error(
            `Not enough pUSD on Polygon. You need $${shortfall.toFixed(2)} more.` +
            (baseUsdcBalance > 0 ? ` You have $${baseUsdcBalance.toFixed(2)} USDC on Base — ask Delphi to bridge it to Polygon, or bridge manually before trading.` : '') +
            ` Polymarket trades require pUSD on Polygon.`
          );
        }

        // Re-sync after swap or bridge
        setProgress({ step: "checking_balance", message: "Re-syncing balance..." });
        await switchToPolygon();
        preloadedClobView = undefined;
        preloadedBestPrices = undefined;
        } // end else (on-chain pUSD insufficient)
      }

      // Create order and sign (pass pre-loaded CLOB data and prices to skip redundant fetches)
      const maxApprovalRaw = parseUnits(String(params.maxApprovalUsdc || 100), 6);
      setProgress({ step: "signing_order", message: "Preparing order..." });
      const { client, order } = await createAndSignOrder(
        signer,
        params.tokenId,
        parseFloat(params.size),
        maxApprovalRaw,
        address,
        makerConfig,
        preloadedClobView,
        preloadedBestPrices,
      );

      // Submit order
      setProgress({ step: "submitting_order", message: "Submitting order..." });
      const response = await client.postOrder(order, OrderType.FAK) as PostOrderResponse;

      const orderId = response?.orderID || response?.id;
      if (!orderId) {
        throw new Error(response?.error || response?.errorMsg || "Order was not accepted");
      }

      setProgress({ step: "completed", message: "Trade completed!", orderId });
      setIsExecuting(false);

      // Switch back to Base (fire-and-forget)
      switchToBase().catch(() => {});

      // Record trade (fire-and-forget — retry queue handles failures)
      const requestedAmount = parseFloat(params.size);
      const fillPrice = Number(response?.averagePrice) || Number(response?.price) || params.price;
      const fillShares = Number(response?.filledSize) || (fillPrice > 0 ? requestedAmount / fillPrice : 0);
      const fillAmount = fillShares * fillPrice;
      const executedAt = new Date().toISOString();
      queueTradeRecord({
        user_address: address,
        condition_id: params.marketId || '',
        token_id: params.tokenId,
        side: params.side,
        outcome: params.outcome,
        amount: fillAmount,
        price: fillPrice,
        shares: fillShares,
        order_id: orderId,
        market_question: params.question || '',
        status: 'completed',
        executed_at: executedAt,
      }).catch(() => {});

      return { response, signer, clobClient, address };

    } catch (error: unknown) {
      const errorStr = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      console.error("[Trade] Failed:", errorStr, error);
      const errorObj = error as { response?: { data?: { error?: string } }; message?: string };
      let msg = errorObj?.response?.data?.error || errorObj?.message || errorStr || "Trade failed";
      // Friendlier message for FAK no-match errors
      if (/no orders found to match|FAK order/i.test(msg)) {
        msg = "No sellers at your price right now. Try a limit buy order or wait for more liquidity.";
      } else if (!/^Price moved from /.test(msg)) {
        // Price-moved messages (our freshness check) are already user-facing —
        // skip wallet-error translation so they don't get rewritten.
        const t = translateWalletError(error);
        msg = t.hint ? `${t.title} ${t.hint}` : t.title;
      }
      setProgress({ step: "failed", message: msg, error: msg });
      const isAuthError = /unauthorized|403|invalid api key/i.test(errorStr);
      if (isAuthError) apiCredsRef.current = null;
      // Fire-and-forget — must not block the re-throw
      try { switchToBase().catch(() => {}); } catch {}
      setIsExecuting(false);
      // Re-throw the translated message so callers (toast) show the user-friendly text
      throw new Error(msg);
    }
  }, [getEmbeddedWallet, getEmbeddedPolygonSigner, createAndSignOrder, switchToBase, switchToPolygon, privySendTransaction]);

  /**
   * Fast-path BUY for batch trades — skips balance checks, compliance, CLOB sync.
   * Requires a pre-built ClobClient and signer from a prior executeTrade() call.
   * Only fetches best price, signs, and submits the order.
   */
  const executeTradeQuick = useCallback(async (params: {
    tokenId: string;
    price: number;
    size: string;
    outcome: string;
    question: string;
    marketId?: string;
    clobClient: ClobClient;
    address: string;
  }) => {
    setIsExecuting(true);

    try {
      setProgress({ step: "signing_order", message: "Preparing order..." });

      const { bestAsk } = await fetchBestPrices(params.tokenId, 'buy');
      if (bestAsk <= 0) {
        throw new Error("No sell orders available right now. Try placing a limit buy order instead, or wait for sellers to appear.");
      }

      // Freshness check (see executeTrade for rationale). Quick-path skips the
      // wallet/bridge stages entirely, but we still want to refuse a fill at a
      // price materially different from what the user saw.
      const drift = Math.abs(bestAsk - params.price);
      const tolerance = Math.max(0.02, params.price * 0.03);
      if (drift > tolerance) {
        throw new Error(
          `Price moved from $${params.price.toFixed(2)} to $${bestAsk.toFixed(2)} — please retry at the current price.`,
        );
      }

      const buyPrice = Math.min(0.99, Math.round((bestAsk * (1 + MARKET_ORDER_SLIPPAGE)) * 100) / 100);
      console.log(`[Trade/Quick] Buy: bestAsk=${bestAsk}, buyPrice=${buyPrice}`);

      const order = await params.clobClient.createMarketOrder({
        tokenID: params.tokenId,
        amount: parseFloat(params.size),
        price: buyPrice,
        side: Side.BUY,
        builderCode: BUILDER_CODE,
      });

      setProgress({ step: "submitting_order", message: "Submitting order..." });
      const response = await params.clobClient.postOrder(order, OrderType.FAK) as PostOrderResponse;

      const orderId = response?.orderID || response?.id;
      if (!orderId) {
        throw new Error(response?.error || response?.errorMsg || "Order was not accepted");
      }

      setProgress({ step: "completed", message: "Trade completed!", orderId });
      setIsExecuting(false);

      // Record trade
      const requestedAmount = parseFloat(params.size);
      const fillPrice = Number(response?.averagePrice) || Number(response?.price) || params.price;
      const fillShares = Number(response?.filledSize) || (fillPrice > 0 ? requestedAmount / fillPrice : 0);
      const fillAmount = fillShares * fillPrice;
      await queueTradeRecord({
        user_address: params.address,
        condition_id: params.marketId || '',
        token_id: params.tokenId,
        side: 'BUY',
        outcome: params.outcome,
        amount: fillAmount,
        price: fillPrice,
        shares: fillShares,
        order_id: orderId,
        market_question: params.question || '',
        status: 'completed',
        executed_at: new Date().toISOString(),
      }).catch(() => {});

      return response;

    } catch (error: unknown) {
      const errorStr = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      console.error("[Trade/Quick] Failed:", errorStr, error);
      const errorObj = error as { response?: { data?: { error?: string } }; message?: string };
      let msg = errorObj?.response?.data?.error || errorObj?.message || errorStr || "Trade failed";
      if (/no orders found to match|FAK order/i.test(msg)) {
        msg = "No sellers at your price right now. Try a limit buy order or wait for more liquidity.";
      } else if (!/^Price moved from /.test(msg)) {
        const t = translateWalletError(error);
        msg = t.hint ? `${t.title} ${t.hint}` : t.title;
      }
      setProgress({ step: "failed", message: msg, error: msg });
      const isAuthError = /unauthorized|403|invalid api key/i.test(errorStr);
      if (isAuthError) apiCredsRef.current = null;
      setIsExecuting(false);
      throw new Error(msg);
    }
  }, []);

  // Reset
  const reset = useCallback(async () => {
    setProgress({ step: "idle", message: "" });
    setIsExecuting(false);
    apiCredsRef.current = null;
    await switchToBase();
  }, [switchToBase]);

  return {
    executeTrade,
    executeTradeQuick,
    executeSell,
    executeRedeem,
    progress,
    isExecuting,
    reset,
    isConnected: !!getEmbeddedWallet(),
    isReady: !!getEmbeddedWallet(),
  };
}
