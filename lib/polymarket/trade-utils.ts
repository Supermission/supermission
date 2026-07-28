// trade-utils.ts — Shared Polymarket trade constants, ABIs, and utility functions.
// Extracted from use-trade-execution.ts and use-limit-orders.ts to eliminate duplication.

import type { ClobClient, ApiKeyCreds } from "@polymarket/clob-client-v2";
import type { ConnectedWallet } from "@privy-io/react-auth";
import type { providers } from "ethers";
import { getAddress } from "@ethersproject/address";
import { encodeFunctionData, parseUnits as viemParseUnits } from "viem";
import { polygon, base } from "viem/chains";
import {
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
  POLYGON_USDC_NATIVE_ADDRESS,
  BASE_USDC_ADDRESS,
} from "@/lib/tokens/registry";
import { httpRpcUrl } from "@/lib/rpc/endpoints";

// ── Types ───────────────────────────────────────────────────────────

interface TransactionReceipt {
  hash?: string;
  transactionHash?: string;
}

export type PrivySendTransactionFn = (
  tx: { to: string; data: string; chainId: number; value?: bigint; gasLimit?: number },
  opts: { sponsor: boolean; address: string },
) => Promise<TransactionReceipt | string>;

// ── Constants ──────────────────────────────────────────────────────
// Client-side: route through our proxy to bypass CORS / ISP blocks
// Server-side: call Polymarket directly (no CORS in Node)
export const POLYMARKET_HOST =
  typeof window === 'undefined'
    ? 'https://clob.polymarket.com'
    : '/api/clob';
export const POLYMARKET_CHAIN_ID = 137;

// Token addresses sourced from the registry (lib/tokens/registry.ts) — SSOT.
// V2: Polymarket uses pUSD (backed 1:1 by USDC, wrappable via CollateralOnramp)
export const POLYGON_PUSD = POLYGON_PUSD_ADDRESS;
export const POLYGON_PUSD_CHECKSUMMED = getAddress(POLYGON_PUSD_ADDRESS);
// Legacy USDC.e — still needed for wrapping flow and non-Polymarket uses
export const POLYGON_USDC = POLYGON_USDCE_ADDRESS;
export const POLYGON_USDC_CHECKSUMMED = getAddress(POLYGON_USDCE_ADDRESS);
// Native USDC on Polygon (NOT what Polymarket uses, but users may hold it)
export const POLYGON_USDC_NATIVE = POLYGON_USDC_NATIVE_ADDRESS;
export const BASE_USDC = BASE_USDC_ADDRESS;
export const POLYGON_RPC = httpRpcUrl('polygon');

// Polymarket V2 contracts on Polygon
export const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
export const CTF_EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B";
export const NEG_RISK_CTF_EXCHANGE = "0xe2222d279d744050d28e00520010520000310F59";
export const CTF_COLLATERAL_ADAPTER = "0xAdA100Db00Ca00073811820692005400218FcE1f";
export const NEG_RISK_CTF_COLLATERAL_ADAPTER = "0xadA2005600Dec949baf300f4C6120000bDB6eAab";
export const COLLATERAL_ONRAMP = "0x93070a847efEf7F70739046A929D47a521F5B8ee";

// V2: Builder program uses a single bytes32 builder code, not HMAC headers
// Must use NEXT_PUBLIC_ prefix so the value is bundled into client-side JS
// (builder codes are public — they appear on-chain in every OrderFilled event)
export const BUILDER_CODE: string | undefined = process.env.NEXT_PUBLIC_POLY_BUILDER_CODE || undefined;

// ── ABIs ───────────────────────────────────────────────────────────
export const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC1155_SET_APPROVAL_ABI = [
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// CTF redeemPositions ABI — used after market resolves to convert winning shares → pUSD
export const CTF_REDEEM_ABI = [
  {
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    name: "redeemPositions",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// LEGACY NegRiskAdapter redeemPositions ABI — (conditionId, amounts[]).
// ⚠️ This is the signature of the DEPRECATED CLOB-v1 NegRiskAdapter
// (0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296), which is being retired.
// It is NOT the signature exposed by the V2 NegRiskCtfCollateralAdapter
// (0xadA2005600Dec949baf300f4C6120000bDB6eAab). The V2 collateral adapter
// inherits the plain 4-arg CTF `redeemPositions(address, bytes32, bytes32,
// uint256[])` selector (see CTF_REDEEM_ABI) and computes amounts on-chain.
// Redeem flows must use CTF_REDEEM_ABI against the collateral adapters — do
// NOT send this 2-arg selector to a V2 adapter (it reverts: no matching fn).
export const NEG_RISK_REDEEM_ABI = [
  {
    inputs: [
      { name: "_conditionId", type: "bytes32" },
      { name: "_amounts", type: "uint256[]" },
    ],
    name: "redeemPositions",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ── Wallet Helpers ─────────────────────────────────────────────────

/**
 * Switch embedded wallet to Polygon. Throws if no wallet.
 */
export async function switchToPolygon(embeddedWallet: ConnectedWallet | undefined): Promise<void> {
  if (!embeddedWallet) throw new Error("No embedded wallet");
  await embeddedWallet.switchChain(polygon.id);
}

/**
 * Switch embedded wallet to Base. Non-critical — catches errors silently.
 */
export async function switchToBase(embeddedWallet: ConnectedWallet | undefined): Promise<void> {
  if (!embeddedWallet) return;
  try {
    await embeddedWallet.switchChain(base.id);
  } catch (err) {
    console.warn("[Trade] Failed to switch to Base (non-critical):", err);
  }
}

/**
 * Get an ethers JsonRpcSigner on Polygon from the embedded wallet.
 * Caches the signer per wallet instance to avoid recreating Web3Provider on every call.
 */
let cachedSignerEntry: { wallet: ConnectedWallet; signer: providers.JsonRpcSigner } | null = null;

export async function getPolygonSigner(embeddedWallet: ConnectedWallet | undefined): Promise<providers.JsonRpcSigner> {
  if (!embeddedWallet) throw new Error("No embedded wallet found.");

  try {
    // Skip switchChain if already on Polygon (saves ~200-400ms per trade)
    const provider = await embeddedWallet.getEthereumProvider();
    const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string;
    const chainId = parseInt(chainIdHex, 16);
    if (chainId !== polygon.id) {
      await embeddedWallet.switchChain(polygon.id);
    }
  } catch (err) {
    throw new Error(`Failed to switch to Polygon: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Return cached signer if same wallet instance
  if (cachedSignerEntry && cachedSignerEntry.wallet === embeddedWallet) {
    return cachedSignerEntry.signer;
  }

  const ethereumProvider = await embeddedWallet.getEthereumProvider();
  const { providers: ethersProviders } = await import("ethers");
  const ethersProvider = new ethersProviders.Web3Provider(ethereumProvider as providers.ExternalProvider, "any");
  const signer = ethersProvider.getSigner();
  cachedSignerEntry = { wallet: embeddedWallet, signer };
  return signer;
}

// ── CLOB Client ────────────────────────────────────────────────────

/**
 * Derive Polymarket L2 API credentials with retries.
 *
 * The /auth/derive-api-key endpoint is occasionally flaky for us — the request
 * gets proxied through /api/clob which has a 15s timeout, and Polymarket
 * itself sometimes returns transient 401/5xx. On failure the SDK returns a
 * response without key/secret/passphrase rather than throwing, so we treat
 * any "missing fields" response as a retryable error.
 */
export async function deriveApiKeyWithRetry(
  signer: providers.JsonRpcSigner,
  attempts = 3,
  baseDelayMs = 400,
): Promise<ApiKeyCreds> {
  const { ClobClient } = await import("@polymarket/clob-client-v2");
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const tempClient = new ClobClient({ host: POLYMARKET_HOST, chain: POLYMARKET_CHAIN_ID, signer });
      const creds = await tempClient.createOrDeriveApiKey();
      if (creds?.key && creds?.secret && creds?.passphrase) {
        return creds;
      }
      lastErr = new Error(`derive returned missing fields: ${JSON.stringify(creds ?? null)}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  console.error("[Polymarket] derive-api-key failed after retries:", lastErr);
  throw new Error("Failed to derive Polymarket API credentials");
}

/**
 * Build an authenticated ClobClient. Derives or uses cached API credentials.
 *
 * If `makerConfig` is omitted, defaults to a type-0 EOA setup. Callers that
 * need proxy-funded accounts (the common case for Polymarket-frontend users)
 * must resolve a MakerConfig via `detectFundedMaker` first.
 */
export async function buildClobClient(
  signer: providers.JsonRpcSigner,
  address: string,
  apiCredsRef: { current: ApiKeyCreds | null },
  makerConfig?: { maker: string; signatureType: 0 | 1 },
): Promise<ClobClient> {
  const { ClobClient } = await import("@polymarket/clob-client-v2");

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
    signatureType: makerConfig?.signatureType ?? 0,
    funderAddress: makerConfig?.maker ?? address,
    builderConfig: BUILDER_CODE ? { builderCode: BUILDER_CODE } : undefined,
  });
}

// ── Balance & Approval Helpers ─────────────────────────────────────

/**
 * Fast parallel balance pre-check across pUSD, USDC.e, Polygon native USDC, and Base USDC.
 * `poly` = pUSD balance (what Polymarket accepts), `polyUsdcE` = wrappable USDC.e.
 * Returns dollars. Never throws — returns zeros on failure.
 */
export async function fastBalancePreCheck(
  address: string,
): Promise<{ poly: number; base: number; polyNative: number; polyUsdcE: number }> {
  try {
    const balanceData = "0x70a08231000000000000000000000000" + address.slice(2).toLowerCase();
    const rpcCall = (to: string) => fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data: balanceData }, "latest"] }),
      signal: AbortSignal.timeout(3_000),
    });
    const [pusdRes, usdcERes, baseRes, polyNativeRes] = await Promise.all([
      rpcCall(POLYGON_PUSD),
      rpcCall(POLYGON_USDC),
      fetch(httpRpcUrl('base'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: BASE_USDC, data: balanceData }, "latest"] }),
        signal: AbortSignal.timeout(3_000),
      }),
      rpcCall(POLYGON_USDC_NATIVE),
    ]);
    const [pusdJson, usdcEJson, baseJson, polyNativeJson] = await Promise.all([
      pusdRes.json(), usdcERes.json(), baseRes.json(), polyNativeRes.json(),
    ]);
    return {
      poly: pusdJson.result ? Number(BigInt(pusdJson.result)) / 1e6 : 0,
      base: baseJson.result ? Number(BigInt(baseJson.result)) / 1e6 : 0,
      polyNative: polyNativeJson.result ? Number(BigInt(polyNativeJson.result)) / 1e6 : 0,
      polyUsdcE: usdcEJson.result ? Number(BigInt(usdcEJson.result)) / 1e6 : 0,
    };
  } catch (err) {
    console.warn("[Trade] Fast balance pre-check failed (continuing):", err);
    return { poly: 0, base: 0, polyNative: 0, polyUsdcE: 0 };
  }
}

/**
 * Check ERC-1155 isApprovedForAll via direct RPC call.
 * Avoids Privy's embedded provider which uses an unreliable internal RPC.
 */
export async function checkIsApprovedForAll(
  contractAddress: string,
  account: string,
  operator: string,
): Promise<boolean> {
  try {
    const data = "0xe985e9c5" +
      account.slice(2).toLowerCase().padStart(64, '0') +
      operator.slice(2).toLowerCase().padStart(64, '0');

    const res = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contractAddress, data }, "latest"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json();
    if (json.result) {
      return BigInt(json.result) !== 0n;
    }
    return false;
  } catch (err) {
    console.warn("[Trade] isApprovedForAll RPC check failed:", err);
    return false;
  }
}

/**
 * Check on-chain ERC1155 balanceOf for a conditional token on the CTF contract.
 * balanceOf(address, uint256) selector = 0x00fdd58e
 */
export async function checkConditionalTokenBalance(
  account: string,
  tokenId: string,
): Promise<bigint> {
  try {
    // ABI-encode: balanceOf(address, uint256)
    const paddedAccount = account.slice(2).toLowerCase().padStart(64, '0');
    const tokenIdBig = BigInt(tokenId);
    const paddedTokenId = tokenIdBig.toString(16).padStart(64, '0');
    const data = "0x00fdd58e" + paddedAccount + paddedTokenId;

    const res = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: CTF_CONTRACT, data }, "latest"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json();
    if (json.result) {
      return BigInt(json.result);
    }
    return 0n;
  } catch (err) {
    console.warn("[Trade] balanceOf RPC check failed:", err);
    return 0n;
  }
}

/**
 * Optional compliance pre-check via Circle API.
 * Returns true if address is safe (or if Circle compliance is disabled/fails).
 * Results are cached per address for 5 minutes to avoid redundant API calls in batch trades.
 */
const complianceCache = new Map<string, { safe: boolean; ts: number }>();
const COMPLIANCE_TTL = 5 * 60 * 1000; // 5 minutes

export async function compliancePreCheck(address: string, chainId: number = 137): Promise<boolean> {
  const cacheKey = `${address.toLowerCase()}:${chainId}`;
  const cached = complianceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < COMPLIANCE_TTL) {
    return cached.safe;
  }

  try {
    const res = await fetch('/api/circle/compliance/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chainId }),
    });
    const result = await res.json();
    if (result.screened && !result.safe) {
      console.warn('[Trade/Compliance] Address flagged as unsafe:', result);
      complianceCache.set(cacheKey, { safe: false, ts: Date.now() });
      return false;
    }
    complianceCache.set(cacheKey, { safe: true, ts: Date.now() });
    return true;
  } catch {
    return true;
  }
}

/**
 * Bridge Base USDC → Polygon USDC.e.
 * Caller must wrap USDC.e → pUSD via wrapUsdcEToPusd() after bridge arrives.
 * Tries unified bridge (Circle CCTP when enabled) first, falls back to Polymarket bridge.
 */
export async function bridgeToPolygon(
  address: string,
  amount: string,
  privySendTransaction: PrivySendTransactionFn,
  switchToBaseFn: () => Promise<void>,
): Promise<string> {
  const amountRaw = viemParseUnits(amount, 6);

  const depositRes = await fetch("/api/trade/bridge/unified", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromAddress: address,
      amount: amountRaw.toString(),
      sourceChainId: 8453,
      destChainId: 137,
    }),
  });

  let depositAddress: string;

  if (depositRes.ok) {
    const data = await depositRes.json();

    if (data.provider === 'circle_cctp') {
      // CCTP client signing not yet available, using Polymarket bridge
    }

    if (data.depositAddress) {
      depositAddress = data.depositAddress;
    } else {
      const fallbackRes = await fetch("/api/trade/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAddress: address, amount: amountRaw.toString() }),
      });
      if (!fallbackRes.ok) {
        const err = await fallbackRes.json().catch(() => ({ error: "Failed to get deposit address" }));
        throw new Error(err.error || `Bridge request failed (${fallbackRes.status})`);
      }
      const fallbackData = await fallbackRes.json();
      depositAddress = fallbackData.depositAddress;
    }
  } else {
    const fallbackRes = await fetch("/api/trade/bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: address, amount: amountRaw.toString() }),
    });
    if (!fallbackRes.ok) {
      const err = await fallbackRes.json().catch(() => ({ error: "Failed to get deposit address" }));
      throw new Error(err.error || `Bridge request failed (${fallbackRes.status})`);
    }
    const fallbackData = await fallbackRes.json();
    depositAddress = fallbackData.depositAddress;
  }

  if (!depositAddress) {
    throw new Error('Bridge deposit address unavailable. Please try again.');
  }

  await switchToBaseFn();

  const transferData = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [depositAddress as `0x${string}`, amountRaw],
  });

  const receipt = await privySendTransaction(
    { to: BASE_USDC, data: transferData, chainId: base.id },
    { sponsor: true, address },
  );

  if (typeof receipt === "string") return receipt;
  const txHash = receipt?.hash || receipt?.transactionHash || "";
  return txHash;
}

/**
 * Poll a Polygon token balance until it increases above preBridgeBalance.
 * Defaults to USDC.e (what bridges deposit), but can poll any token.
 * Returns true if balance increased, false on timeout.
 */
export async function waitForPolygonBalance(
  address: string,
  preBridgeBalance: number,
  timeoutMs = 180_000,
  tokenAddress: string = POLYGON_USDC,
): Promise<boolean> {
  const INTERVAL = 5_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(httpRpcUrl('polygon'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: tokenAddress,
              data: "0x70a08231000000000000000000000000" + address.slice(2).toLowerCase(),
            },
            "latest",
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(fetchTimeout);
      const json = await res.json();
      if (json.result) {
        const bal = Number(BigInt(json.result)) / 1e6;
        if (bal > preBridgeBalance + 0.01) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('bridge-completed'));
          }
          return true;
        }
      }
    } catch (err) {
      console.warn("[Trade/Bridge] Balance poll error:", err);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }

  return false;
}

// CollateralOnramp wrap ABI — converts USDC.e → pUSD for Polymarket V2 trading
export const COLLATERAL_ONRAMP_WRAP_ABI = [
  {
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    name: "wrap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Wrap USDC.e → pUSD via Polymarket's CollateralOnramp.
 * Approves USDC.e spending if needed, then calls wrap().
 */
export async function wrapUsdcEToPusd(
  address: string,
  amountRaw: bigint,
  privySendTransaction: PrivySendTransactionFn,
): Promise<string> {
  // Check existing allowance — skip approve tx if already sufficient (saves ~3-5s)
  const allowanceSelector = "0xdd62ed3e";
  const allowanceData = allowanceSelector +
    address.slice(2).toLowerCase().padStart(64, '0') +
    COLLATERAL_ONRAMP.slice(2).toLowerCase().padStart(64, '0');

  let needsApprove = true;
  try {
    const res = await fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: POLYGON_USDC, data: allowanceData }, "latest"],
      }),
      signal: AbortSignal.timeout(3_000),
    });
    const json = await res.json();
    if (json.result) {
      needsApprove = BigInt(json.result) < amountRaw;
    }
  } catch {
    // If check fails, approve anyway
  }

  if (needsApprove) {
    // Approve max so future wraps skip this step entirely
    const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const approveData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [COLLATERAL_ONRAMP as `0x${string}`, maxApproval],
    });
    await privySendTransaction(
      { to: POLYGON_USDC, data: approveData, chainId: polygon.id },
      { sponsor: true, address },
    );
  }

  // Wrap USDC.e → pUSD
  const wrapData = encodeFunctionData({
    abi: COLLATERAL_ONRAMP_WRAP_ABI,
    functionName: "wrap",
    args: [POLYGON_USDC as `0x${string}`, address as `0x${string}`, amountRaw],
  });
  const receipt = await privySendTransaction(
    { to: COLLATERAL_ONRAMP, data: wrapData, chainId: polygon.id },
    { sponsor: true, address },
  );

  const txHash = typeof receipt === "string" ? receipt : receipt?.hash || receipt?.transactionHash || "";
  console.log(`[Trade] Wrapped USDC.e → pUSD: ${txHash}`);
  return txHash;
}

/**
 * Swap native USDC → USDC.e on Polygon via LiFi, then wrap to pUSD.
 * Used when user has native USDC on Polygon but needs pUSD for Polymarket.
 */
export async function swapNativeUsdcToPusd(
  address: string,
  amount: string,
  privySendTransaction: PrivySendTransactionFn,
): Promise<string> {
  const amountRaw = viemParseUnits(amount, 6);

  const quoteRes = await fetch('/api/defi/swap/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: 137,
      tokenIn: POLYGON_USDC_NATIVE,
      tokenOut: POLYGON_USDC,
      amount: amountRaw.toString(),
      type: 'EXACT_INPUT',
      taker: address,
      slippageBps: 100,
    }),
  });

  if (!quoteRes.ok) {
    const errBody = await quoteRes.json().catch(() => ({}));
    throw new Error(errBody.error || `Swap quote failed (HTTP ${quoteRes.status})`);
  }
  const quote = await quoteRes.json();
  if (!quote.methodParameters) {
    throw new Error(quote.error || 'Failed to get swap quote for USDC → USDC.e');
  }

  const spender = quote.spender || quote.methodParameters.to;
  const allowanceSelector = "0xdd62ed3e";
  const allowanceData = allowanceSelector +
    address.slice(2).toLowerCase().padStart(64, '0') +
    spender.slice(2).toLowerCase().padStart(64, '0');

  const allowanceRes = await fetch(POLYGON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: POLYGON_USDC_NATIVE, data: allowanceData }, "latest"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const allowanceJson = await allowanceRes.json();
  const currentAllowance = allowanceJson.result ? BigInt(allowanceJson.result) : 0n;

  if (currentAllowance < amountRaw) {
    const approveData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spender as `0x${string}`, amountRaw * 2n],
    });
    try {
      await privySendTransaction(
        { to: POLYGON_USDC_NATIVE, data: approveData, chainId: polygon.id },
        { sponsor: true, address },
      );
    } catch (approveErr: unknown) {
      const errMsg = approveErr instanceof Error ? approveErr.message : String(approveErr);
      if (/insufficient funds|gas|eth_estimateGas|MATIC/i.test(errMsg)) {
        console.warn('[Trade] Approval gas estimation failed, retrying with explicit gasLimit:', errMsg);
        await privySendTransaction(
          { to: POLYGON_USDC_NATIVE, data: approveData, chainId: polygon.id, gasLimit: 100_000 },
          { sponsor: true, address },
        );
      } else {
        throw approveErr;
      }
    }
  }

  let receipt;
  try {
    receipt = await privySendTransaction(
      {
        to: quote.methodParameters.to,
        data: quote.methodParameters.calldata,
        value: 0n,
        chainId: polygon.id,
      },
      { sponsor: true, address },
    );
  } catch (swapErr: unknown) {
    const errMsg = swapErr instanceof Error ? swapErr.message : String(swapErr);
    const isGasError = /insufficient funds|gas|eth_estimateGas|MATIC/i.test(errMsg);
    if (isGasError) {
      console.warn('[Trade] Swap gas estimation failed, retrying with explicit gasLimit:', errMsg);
      receipt = await privySendTransaction(
        {
          to: quote.methodParameters.to,
          data: quote.methodParameters.calldata,
          value: 0n,
          chainId: polygon.id,
          gasLimit: 500_000,
        },
        { sponsor: true, address },
      );
    } else {
      throw swapErr;
    }
  }

  const swapTxHash = typeof receipt === "string" ? receipt : receipt?.hash || receipt?.transactionHash || "";
  console.log('[Trade] Swapped native USDC → USDC.e on Polygon:', swapTxHash);

  // Wrap the resulting USDC.e → pUSD for Polymarket V2
  const wrapTxHash = await wrapUsdcEToPusd(address, amountRaw, privySendTransaction);
  return wrapTxHash;
}
