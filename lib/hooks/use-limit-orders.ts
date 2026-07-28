// use-limit-orders.ts - Limit order management via Polymarket CLOB
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { ClobClient } from "@polymarket/clob-client-v2";
import type { providers } from "ethers";
import type { parseUnits } from "@ethersproject/units";
import { useWallets, useSendTransaction as usePrivySendTransaction } from "@privy-io/react-auth";
import { polygon } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { useTradingStore } from "@/lib/store/trading";
import { fetchTickSize } from "@/lib/polymarket/api";
import { queueTradeRecord } from "@/lib/trade-record-queue";
import {
  POLYGON_PUSD_CHECKSUMMED,
  POLYGON_USDC,
  POLYGON_USDC_NATIVE,
  POLYGON_USDC_CHECKSUMMED,
  BASE_USDC,
  POLYGON_RPC,
  CTF_CONTRACT,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  POLYMARKET_HOST,
  POLYMARKET_CHAIN_ID,
  BUILDER_CODE,
  wrapUsdcEToPusd,
  ERC20_APPROVE_ABI,
  ERC1155_SET_APPROVAL_ABI,
  checkIsApprovedForAll,
  checkConditionalTokenBalance,
  compliancePreCheck,
  fastBalancePreCheck,
  getPolygonSigner as getPolygonSignerUtil,
  switchToPolygon as switchToPolygonUtil,
  switchToBase as switchToBaseUtil,
  deriveApiKeyWithRetry,
} from "@/lib/polymarket/trade-utils";
import { detectFundedMaker } from "@/lib/polymarket/proxy";

interface ApiCreds {
  key: string;
  secret: string;
  passphrase: string;
}

interface BalanceAllowanceView {
  balance?: string;
  allowances?: Record<string, string>;
}

interface PostOrderResponse {
  orderID?: string;
  id?: string;
  error?: string;
  errorMsg?: string;
  message?: string;
}

export interface OpenOrder {
  id: string;
  market: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  size_matched: string;
  status: string;
  created_at: string;
  outcome?: string;
  owner?: string;
}

export function useLimitOrders() {
  const { wallets } = useWallets();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();
  const setOpenOrderCount = useTradingStore((s) => s.setOpenOrderCount);

  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiCredsRef = useRef<ApiCreds | null>(null);
  // Cache CLOB balance/allowance to skip redundant updateBalanceAllowance calls
  const clobBalanceCacheRef = useRef<{ view: BalanceAllowanceView; ts: number } | null>(null);
  const CLOB_BALANCE_TTL = 10_000; // 10 seconds

  // Detect Privy embedded wallet
  const getEmbeddedWallet = useCallback(() => {
    return wallets.find((w) => w.walletClientType === "privy");
  }, [wallets]);

  // Get embedded wallet address
  const address = getEmbeddedWallet()?.address?.toLowerCase();
  const isConnected = !!address;

  // Switch to Base
  const switchToBase = useCallback(async () => {
    await switchToBaseUtil(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Switch to Polygon
  const switchToPolygon = useCallback(async () => {
    await switchToPolygonUtil(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Get an ethers signer on Polygon (embedded wallet only)
  const getPolygonSigner = useCallback(async (): Promise<providers.JsonRpcSigner> => {
    return getPolygonSignerUtil(getEmbeddedWallet());
  }, [getEmbeddedWallet]);

  // Build an authenticated ClobClient
  const getClobClient = useCallback(
    async (signer: providers.JsonRpcSigner): Promise<ClobClient> => {
      const { ClobClient } = await import("@polymarket/clob-client-v2");

      if (!address) throw new Error("No address");

      // Resolve the funded maker — users who funded via Polymarket's frontend
      // (Magic email login) hold their pUSD / CTF shares in a derived proxy,
      // not the EOA. The CLOB rejects signatureType=0 / maker=EOA for those
      // accounts ("maker address not allowed"), which surfaces as false
      // "not enough balance" (BUY) / "you don't hold this token" (SELL) on
      // limit orders. Thread the detected maker + signatureType exactly like
      // the market-order path in use-trade-execution.ts. detectFundedMaker is
      // cached (5-min TTL), so this is cheap even on the 60s poll loop.
      const makerConfig = await detectFundedMaker(address, { rpcUrl: POLYGON_RPC });

      let creds = apiCredsRef.current;
      if (!creds) {
        creds = await deriveApiKeyWithRetry(signer);
        apiCredsRef.current = creds;
      }

      return new ClobClient({
        host: POLYMARKET_HOST,
        chain: POLYMARKET_CHAIN_ID,
        signer,
        creds,
        signatureType: makerConfig.signatureType,
        funderAddress: makerConfig.maker,
        builderConfig: BUILDER_CODE ? { builderCode: BUILDER_CODE } : undefined,
      });
    },
    [address],
  );

  // Track which CLOB trade IDs we've already recorded, to avoid duplicate API calls.
  // Server-side idempotency (UNIQUE order_id) is the real safety net; this just reduces noise.
  const syncedTradeIdsRef = useRef<Set<string>>(new Set());

  // Sync limit-order fills from CLOB into our trade history DB
  const syncLimitOrderFills = useCallback(async (client: ClobClient, userAddress: string) => {
    try {
      const trades = await client.getTrades({ maker_address: userAddress });
      if (!Array.isArray(trades) || trades.length === 0) return;

      for (const trade of trades) {
        // Skip already-synced trades (in-memory dedup)
        if (syncedTradeIdsRef.current.has(trade.id)) continue;

        // Only record trades where we were the MAKER (i.e., our limit order was filled)
        if (trade.trader_side !== 'MAKER') {
          syncedTradeIdsRef.current.add(trade.id);
          continue;
        }

        const tradeSize = parseFloat(trade.size) || 0;
        const tradePrice = parseFloat(trade.price) || 0;

        await queueTradeRecord({
          user_address: userAddress,
          condition_id: trade.market || '',
          token_id: trade.asset_id || '',
          side: trade.side as 'BUY' | 'SELL',
          outcome: trade.outcome || '',
          amount: tradeSize * tradePrice,
          price: tradePrice,
          shares: tradeSize,
          order_id: trade.id,
          market_question: '',
          status: 'completed',
          executed_at: trade.match_time
            ? new Date(typeof trade.match_time === 'number' || /^\d+$/.test(trade.match_time) ? Number(trade.match_time) * 1000 : trade.match_time).toISOString()
            : new Date().toISOString(),
        }).catch((err) => {
          console.error('[LimitOrders] Failed to record limit fill:', err);
        });

        syncedTradeIdsRef.current.add(trade.id);
        console.log(`[LimitOrders] Recorded limit-order fill: trade=${trade.id}, side=${trade.side}, size=${trade.size}, price=${trade.price}`);
      }
    } catch (err) {
      console.warn('[LimitOrders] syncLimitOrderFills failed:', err);
    }
  }, []);

  // Fetch open orders via authenticated CLOB client (no extra friction — creds are cached)
  const fetchOpenOrders = useCallback(async () => {
    if (!address || !isConnected) return;
    setLoading(true);
    setError(null);

    try {
      const signer = await getPolygonSigner();
      let client = await getClobClient(signer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any;
      try {
        response = await client.getOpenOrders();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // If creds expired (401), clear cache and retry once with fresh creds
        if (errMsg.includes("401") || errMsg.includes("expired") || errMsg.includes("Invalid")) {
          apiCredsRef.current = null;
          client = await getClobClient(signer);
          try {
            response = await client.getOpenOrders();
          } catch {
            // SDK can crash on "data is not iterable" when API returns null — treat as empty
            response = [];
          }
        } else if (errMsg.includes("is not iterable") || errMsg.includes("Cannot read prop")) {
          // SDK crashes internally when API returns { data: null } — treat as no open orders
          response = [];
        } else {
          throw err;
        }
      }

      // Normalize — CLOB may return array, object with orders key, or null/undefined
      const rawOrders = Array.isArray(response) ? response : (response as { orders?: typeof response })?.orders || [];
      const orders = rawOrders as unknown as OpenOrder[];
      setOpenOrders(orders);
      setOpenOrderCount(orders.length);

      // Sync any limit-order fills into trade history (fire-and-forget, non-blocking)
      syncLimitOrderFills(client, address).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch open orders";
      setError(msg);
      console.error("[LimitOrders] fetchOpenOrders error:", err);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, getPolygonSigner, getClobClient, setOpenOrderCount, syncLimitOrderFills]);

  // Create a GTC limit order
  const createLimitOrder = useCallback(
    async (tokenId: string, side: "BUY" | "SELL", price: number, size: number) => {
      const { OrderType, Side, AssetType } = await import("@polymarket/clob-client-v2");
      const { parseUnits } = await import("@ethersproject/units");

      if (!isConnected || !address) {
        toast.error("Please connect your wallet first");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Validate price against tick size
        const tickSizeStr = await fetchTickSize(tokenId);
        const tickSize = parseFloat(tickSizeStr);
        if (tickSize > 0) {
          const remainder = Math.round((price * 1e8) % (tickSize * 1e8)) / 1e8;
          if (remainder > 1e-10) {
            throw new Error(
              `Price must be a multiple of tick size ${tickSizeStr}. Got ${price}`,
            );
          }
        }

        if (price <= 0 || price >= 1) {
          throw new Error("Price must be between 0 and 1 (exclusive)");
        }
        if (size <= 0) {
          throw new Error("Size must be greater than 0");
        }

        const signer = await getPolygonSigner();
        const client = await getClobClient(signer);
        const userAddress = address.toLowerCase();

        // Resolve the funded maker — proxy-funded accounts (Polymarket frontend
        // users) hold pUSD / CTF shares in the derived proxy, not the EOA.
        // Mirrors the market-order path in use-trade-execution.ts. Cached, so
        // this reuses the same result getClobClient just fetched.
        const makerConfig = await detectFundedMaker(userAddress, { rpcUrl: POLYGON_RPC });

        // For BUY orders: cost = price × shares (in USDC)
        const requiredUsdc = side === "BUY" ? price * size : 0;

        console.log(
          `[LimitOrders] Creating GTC order: token=${tokenId}, side=${side}, price=${price}, size=${size}, cost=$${requiredUsdc.toFixed(2)}`,
        );

        // ── For BUY orders: 3-tier funding flow (same as market orders) ──
        if (side === "BUY") {
          // Fast balance pre-check + compliance in parallel
          const [balances, isSafe] = await Promise.all([
            fastBalancePreCheck(userAddress),
            compliancePreCheck(userAddress, POLYMARKET_CHAIN_ID),
          ]);

          // Fail fast if total balance across all sources is clearly insufficient
          // Include wrappable USDC.e — can be converted to pUSD automatically
          const totalAvailable = balances.poly + balances.polyUsdcE + balances.base;
          if (totalAvailable < requiredUsdc * 0.95) {
            throw new Error(
              `Insufficient pUSD. Need $${requiredUsdc.toFixed(2)}, you have $${balances.poly.toFixed(2)} pUSD` +
              (balances.polyUsdcE > 0.01 ? ` + $${balances.polyUsdcE.toFixed(2)} USDC.e (wrappable)` : '') +
              ` on Polygon and $${balances.base.toFixed(2)} on Base.`
            );
          }

          if (!isSafe) {
            throw new Error("Trade blocked: your address has been flagged by compliance screening. Please contact support.");
          }

          // Auto-wrap USDC.e → pUSD if user has legacy balance
          if (balances.poly < requiredUsdc * 0.95 && balances.polyUsdcE > 0.01) {
            const wrapAmount = BigInt(Math.floor(balances.polyUsdcE * 1e6));
            await wrapUsdcEToPusd(userAddress, wrapAmount, privySendTransaction);
            balances.poly += balances.polyUsdcE;
            balances.polyUsdcE = 0;
          }

          // Sync CLOB with on-chain state (skip if fresh cache available)
          const cachedBalance = clobBalanceCacheRef.current;
          const hasFreshCache = cachedBalance && (Date.now() - cachedBalance.ts < CLOB_BALANCE_TTL);
          let clobView: BalanceAllowanceView;
          if (hasFreshCache) {
            clobView = cachedBalance.view;
          } else {
            await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            clobView = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }) as BalanceAllowanceView;
            clobBalanceCacheRef.current = { view: clobView, ts: Date.now() };
          }
          const clobBalance = parseFloat(clobView?.balance || '0') / 1e6;

          // If CLOB balance is insufficient, try to fund from other sources
          if (clobBalance < requiredUsdc) {
            // If on-chain pUSD balance covers the trade, skip swap/bridge —
            // the approval will be handled below when checking CLOB-tracked allowances.
            // For proxy-funded accounts, `balances.poly` was read against the EOA
            // earlier — use the maker's detected balance so proxy holdings count.
            const onChainPusd = makerConfig.source === 'proxy'
              ? makerConfig.detectedBalance
              : balances.poly;
            if (onChainPusd >= requiredUsdc * 0.95) {
              // Just re-sync CLOB so it picks up on-chain balance after approval
            } else {

            const shortfall = requiredUsdc - clobBalance;
            const baseUsdcBalance = balances.base;

            // Not enough pUSD on Polygon — tell user to bridge/deposit first
            if (shortfall > 0) {
              throw new Error(
                `Not enough pUSD on Polygon. You need $${shortfall.toFixed(2)} more.` +
                (baseUsdcBalance > 0 ? ` You have $${baseUsdcBalance.toFixed(2)} USDC on Base — ask Delphi to bridge it to Polygon, or bridge manually before trading.` : '') +
                ` Polymarket trades require pUSD on Polygon for instant execution.`
              );
            }
            } // end else (on-chain pUSD insufficient)

            await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            clobBalanceCacheRef.current = null;
          }

          // Check CLOB-tracked spender allowances and approve if needed
          const freshClobView = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }) as BalanceAllowanceView;
          // Truncate to 6 decimals — floating-point multiplication (price*size) can produce
          // artifacts like 3.3000000000000003 which makes ethers parseUnits throw "underflow"
          const requiredUsdcSafe = Math.floor(requiredUsdc * 1e6) / 1e6;
          const tradeAmountBig = BigInt(parseUnits(requiredUsdcSafe.toFixed(6), 6).toString());
          const maxApprovalRaw = parseUnits("100", 6);
          const allowancesMap: Record<string, string> | undefined = freshClobView?.allowances;
          let didApprove = false;

          if (allowancesMap) {
            for (const [spender, allowanceStr] of Object.entries(allowancesMap)) {
              if (BigInt(allowanceStr) < tradeAmountBig) {
                if (makerConfig.source === 'proxy') {
                  // The proxy holds the funds, so only the proxy can grant
                  // allowances — Polymarket's relayer sets these up. We can't
                  // replicate that from the EOA. Mirrors createAndSignOrder.
                  throw new Error(
                    "Your Polymarket proxy doesn't have the required USDC allowances set up. " +
                    "Please complete one trade on polymarket.com to initialize the proxy, then try again here."
                  );
                }
                const approveData = encodeFunctionData({
                  abi: ERC20_APPROVE_ABI,
                  functionName: "approve",
                  args: [spender as `0x${string}`, BigInt(maxApprovalRaw.toString())],
                });
                await privySendTransaction(
                  { to: POLYGON_PUSD_CHECKSUMMED, data: approveData, chainId: polygon.id },
                  { sponsor: true, address: userAddress },
                );
                didApprove = true;
              }
            }
          }

          // Final re-sync if approvals were made
          if (didApprove) {
            await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            clobBalanceCacheRef.current = null;
          }
        } else {
          // SELL orders: check approvals + on-chain balance in parallel
          const operatorsToApprove = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE];

          // Approvals + on-chain balance are read against the funded maker —
          // proxy-funded accounts have them pre-set by Polymarket's frontend.
          // Mirrors executeSell in use-trade-execution.ts.
          const [approvalResults, onChainBalance] = await Promise.all([
            Promise.all(operatorsToApprove.map(op => checkIsApprovedForAll(CTF_CONTRACT, makerConfig.maker, op))),
            checkConditionalTokenBalance(makerConfig.maker, tokenId),
          ]);

          // Send approval txns for any unapproved operators (sequential — each is a wallet tx)
          for (let i = 0; i < operatorsToApprove.length; i++) {
            if (!approvalResults[i]) {
              if (makerConfig.source === 'proxy') {
                // Only the proxy can grant its own CTF approvals — Polymarket's
                // relayer handles this for proxy-funded accounts.
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
          const onChainShares = Number(onChainBalance) / 1e6;
          console.log(`[LimitOrders] On-chain CTF balance: ${onChainBalance.toString()} (${onChainShares} shares), requested sell: ${size}`);

          if (onChainBalance === 0n) {
            throw new Error(
              "You don't hold this token on-chain. The buy may not have settled yet — try again in a moment."
            );
          }

          // Cap sell size to actual on-chain balance (Data API can report slightly more due to fee rounding)
          if (size > onChainShares) {
            const actualShares = Math.floor(onChainShares * 1000) / 1000; // floor to 3 decimals
            if (actualShares <= 0) {
              throw new Error("On-chain balance too small to sell.");
            }
            toast.info(`You hold ${actualShares} shares on-chain. Adjusting sell size.`);
            size = actualShares;
          }

          // Sync conditional token balance with CLOB
          await client.updateBalanceAllowance({
            asset_type: AssetType.CONDITIONAL,
            token_id: tokenId,
          });
        }

        // note always omit feeRateBps from the order params. When it's undefined, the SDK auto-resolves the correct fee rate per market

        // ── Diagnostic: capture order book state BEFORE placement ──
        try {
          const [orderBook, midpoint, lastTradePrice] = await Promise.all([
            client.getOrderBook(tokenId),
            client.getMidpoint(tokenId).catch(() => null),
            client.getLastTradePrice(tokenId).catch(() => null),
          ]);
          const topBids = orderBook.bids?.slice(0, 5) || [];
          const topAsks = orderBook.asks?.slice(0, 5) || [];
          console.log(`[LimitOrders][DIAG] PRE-PLACEMENT state for token=${tokenId}:`);
          console.log(`[LimitOrders][DIAG]   midpoint=${JSON.stringify(midpoint)}, lastTrade=${JSON.stringify(lastTradePrice)}`);
          console.log(`[LimitOrders][DIAG]   top5 bids=${JSON.stringify(topBids)}`);
          console.log(`[LimitOrders][DIAG]   top5 asks=${JSON.stringify(topAsks)}`);
          console.log(`[LimitOrders][DIAG]   neg_risk=${orderBook.neg_risk}, tick_size=${orderBook.tick_size}, min_order_size=${orderBook.min_order_size}`);
        } catch (diagErr) {
          console.warn("[LimitOrders][DIAG] Failed to capture pre-placement state:", diagErr);
        }

        // Sanitize price/size to avoid floating-point artifacts hitting ethers parseFixed
        // inside the CLOB SDK. 8 decimal places covers any tick size; 2 for shares.
        // IMPORTANT: floor sell size (never round up) to avoid exceeding on-chain balance.
        const priceSafe = parseFloat(price.toFixed(8));
        const sizeSafe = side === "SELL"
          ? Math.floor(size * 100) / 100   // floor to 2 decimals — rounding up can exceed on-chain balance
          : parseFloat(size.toFixed(2));

        console.log(`[LimitOrders][DIAG] createOrder params: tokenID=${tokenId}, price=${priceSafe}, size=${sizeSafe}, side=${side}`);

        const order = await client.createOrder({
          tokenID: tokenId,
          price: priceSafe,
          size: sizeSafe,
          side: side === "BUY" ? Side.BUY : Side.SELL,
          expiration: 0, // GTC (no expiration)
          builderCode: BUILDER_CODE,
        });

        console.log(`[LimitOrders][DIAG] Signed order:`, JSON.stringify(order));

        const response = await client.postOrder(order, OrderType.GTC) as PostOrderResponse;
        const orderId = response?.orderID || response?.id;

        console.log(`[LimitOrders][DIAG] postOrder full response:`, JSON.stringify(response));

        if (!orderId) {
          throw new Error(
            response?.error ||
              response?.errorMsg ||
              response?.message ||
              "Limit order was not accepted by Polymarket",
          );
        }

        console.log("[LimitOrders] Order placed:", orderId);
        toast.success(`Limit order placed (${side} ${size} @ ${(price * 100).toFixed(1)}c)`);

        // ── Diagnostic: verify order is actually live on the CLOB ──
        try {
          const liveOrder = await client.getOrder(orderId);
          console.log(`[LimitOrders][DIAG] POST-PLACEMENT order status:`, JSON.stringify(liveOrder));
          console.log(`[LimitOrders][DIAG]   status=${liveOrder.status}, size_matched=${liveOrder.size_matched}, original_size=${liveOrder.original_size}, price=${liveOrder.price}, side=${liveOrder.side}`);
        } catch (diagErr) {
          console.warn("[LimitOrders][DIAG] Failed to verify order status:", diagErr);
        }

        // Switch back to Base (fire-and-forget)
        switchToBase().catch(() => {});

        // Refresh orders
        await fetchOpenOrders();

        return response;
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "Failed to create limit order";
        // Make balance/allowance errors user-friendly
        const msg = raw.includes('not enough balance')
          ? 'Not enough available shares — cancel an existing order or reduce size'
          : raw;
        setError(msg);
        toast.error(msg);
        console.error("[LimitOrders] createLimitOrder error:", err);
        // Switch back to Base on failure
        try { switchToBase().catch(() => {}); } catch {}
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, address, getPolygonSigner, getClobClient, fetchOpenOrders, privySendTransaction, switchToPolygon, switchToBase],
  );

  // Cancel a single order
  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!isConnected || !address) {
        toast.error("Please connect your wallet first");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const signer = await getPolygonSigner();
        const client = await getClobClient(signer);

        console.log(`[LimitOrders] Cancelling order: ${orderId}`);
        await client.cancelOrder({ orderID: orderId });

        toast.success("Order cancelled");
        await fetchOpenOrders();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to cancel order";
        setError(msg);
        toast.error(msg);
        console.error("[LimitOrders] cancelOrder error:", err);
      } finally {
        setLoading(false);
      }
    },
    [isConnected, address, getPolygonSigner, getClobClient, fetchOpenOrders],
  );

  // Cancel all open orders
  const cancelAllOrders = useCallback(async () => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (openOrders.length === 0) {
      toast.info("No open orders to cancel");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const signer = await getPolygonSigner();
      const client = await getClobClient(signer);

      console.log(`[LimitOrders] Cancelling all ${openOrders.length} orders...`);
      await client.cancelAll();

      // Re-fetch to confirm cancellation
      await fetchOpenOrders();
      toast.success('All orders cancelled');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel all orders";
      setError(msg);
      toast.error(msg);
      console.error("[LimitOrders] cancelAllOrders error:", err);
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, openOrders.length, getPolygonSigner, getClobClient, fetchOpenOrders]);

  // Diagnose a specific order — check its status, order book, and trades
  const diagnoseOrder = useCallback(
    async (orderId: string, tokenId: string) => {
      if (!isConnected || !address) return null;

      try {
        const signer = await getPolygonSigner();
        const client = await getClobClient(signer);

        const [orderStatus, orderBook, midpoint, trades] = await Promise.all([
          client.getOrder(orderId).catch((e: unknown) => ({ error: String(e) })),
          client.getOrderBook(tokenId).catch(() => null),
          client.getMidpoint(tokenId).catch(() => null),
          client.getTrades({ asset_id: tokenId }).catch(() => []),
        ]);

        const diag = {
          orderId,
          tokenId,
          timestamp: new Date().toISOString(),
          orderStatus,
          midpoint,
          orderBook: orderBook ? {
            neg_risk: orderBook.neg_risk,
            tick_size: orderBook.tick_size,
            top5Bids: orderBook.bids?.slice(0, 5),
            top5Asks: orderBook.asks?.slice(0, 5),
          } : null,
          recentTrades: (trades as Array<{ price: string; size: string; side: string; match_time: string }>).slice(0, 10).map((t) => ({
            price: t.price,
            size: t.size,
            side: t.side,
            time: t.match_time,
          })),
        };

        console.log(`[LimitOrders][DIAG] Full order diagnosis:`, JSON.stringify(diag, null, 2));
        return diag;
      } catch (err) {
        console.error("[LimitOrders][DIAG] diagnoseOrder failed:", err);
        return null;
      }
    },
    [isConnected, address, getPolygonSigner, getClobClient],
  );

  // Refresh alias
  const refreshOrders = fetchOpenOrders;

  // Auto-fetch on mount + poll every 60s (single interval shared by all consumers)
  useEffect(() => {
    if (!address) return;
    fetchOpenOrders();
    const id = setInterval(fetchOpenOrders, 60_000);
    return () => clearInterval(id);
  }, [address, fetchOpenOrders]);

  return {
    createLimitOrder,
    openOrders,
    cancelOrder,
    cancelAllOrders,
    diagnoseOrder,
    loading,
    error,
    refreshOrders,
  };
}
