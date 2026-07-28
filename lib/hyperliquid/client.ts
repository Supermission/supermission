import { HL_API_URL, HL_WS_URL } from './constants';
import type {
  PerpsMetaResponse,
  AssetCtx,
  ClearinghouseState,
  OpenOrder,
  FrontendOpenOrder,
  UserFill,
  Level,
  CandleData,
} from './types';

// ─── REST helpers ───────────────────────────────────────────────────────────
// All reads go through POST https://api.hyperliquid.xyz/info
// All writes go through POST https://api.hyperliquid.xyz/exchange (needs wallet signing)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hlInfo(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${HL_API_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HL API error: ${res.status}`);
  return res.json();
}

// ─── Typed info calls ───────────────────────────────────────────────────────

export async function fetchMeta(): Promise<PerpsMetaResponse> {
  return hlInfo({ type: 'meta' });
}

export async function fetchMetaAndAssetCtxs(): Promise<[PerpsMetaResponse, AssetCtx[]]> {
  return hlInfo({ type: 'metaAndAssetCtxs' });
}

export async function fetchAllMids(): Promise<Record<string, string>> {
  return hlInfo({ type: 'allMids' });
}

export async function fetchSpotMetaAndAssetCtxs(): Promise<[SpotMeta, SpotAssetCtx[]]> {
  return hlInfo({ type: 'spotMetaAndAssetCtxs' });
}

// Types for spot
export interface SpotToken {
  name: string;
  index: number;
  szDecimals: number;
  weiDecimals: number;
  tokenId: string;
  isCanonical?: boolean;
}

export interface SpotUniverse {
  tokens: number[];
  name: string;
  index: number;
  isCanonical?: boolean;
}

export interface SpotMeta {
  tokens: SpotToken[];
  universe: SpotUniverse[];
}

export interface SpotAssetCtx {
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  circulatingSupply: string;
}

export async function fetchClearinghouseState(user: string): Promise<ClearinghouseState> {
  return hlInfo({ type: 'clearinghouseState', user });
}

export async function fetchOpenOrders(user: string): Promise<OpenOrder[]> {
  return hlInfo({ type: 'openOrders', user });
}

export async function fetchFrontendOpenOrders(user: string): Promise<FrontendOpenOrder[]> {
  return hlInfo({ type: 'frontendOpenOrders', user });
}

export async function fetchUserFills(user: string): Promise<UserFill[]> {
  return hlInfo({ type: 'userFills', user });
}

export async function fetchL2Book(
  coin: string,
): Promise<{ levels: [Level[], Level[]] }> {
  return hlInfo({ type: 'l2Book', coin });
}

export async function fetchCandleSnapshot(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<CandleData[]> {
  return hlInfo({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  });
}

export async function fetchFundingHistory(
  coin: string,
  startTime: number,
  endTime?: number,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  return hlInfo({
    type: 'fundingHistory',
    coin,
    startTime,
    endTime: endTime || Date.now(),
  });
}

// ─── WebSocket helpers ──────────────────────────────────────────────────────

export function createHLWebSocket(): WebSocket {
  return new WebSocket(HL_WS_URL);
}

export function hlSubscribe(
  ws: WebSocket,
  subscription: Record<string, unknown>,
) {
  ws.send(JSON.stringify({ method: 'subscribe', subscription }));
}

export function hlUnsubscribe(
  ws: WebSocket,
  subscription: Record<string, unknown>,
) {
  ws.send(JSON.stringify({ method: 'unsubscribe', subscription }));
}
