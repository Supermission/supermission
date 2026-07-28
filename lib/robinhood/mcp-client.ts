/**
 * Minimal MCP client for the Robinhood Trading MCP (streamable HTTP transport).
 * Server-only. Each call carries the per-user OAuth Bearer token.
 *
 * Transport notes (MCP 2025-06-18 streamable HTTP):
 *  - POST JSON-RPC to the endpoint with Accept: application/json, text/event-stream.
 *  - The server may reply with a single JSON body OR an SSE stream; we handle both.
 *  - `initialize` returns an `Mcp-Session-Id` response header that must be echoed
 *    on subsequent requests.
 */

import { ROBINHOOD_TRADING_MCP_URL } from './config';

const PROTOCOL_VERSION = '2025-06-18';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
  [k: string]: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

/** Parse a streamable-HTTP response body that may be JSON or SSE into JSON-RPC messages. */
async function readRpc(res: Response): Promise<JsonRpcResponse> {
  const ctype = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ctype.includes('text/event-stream')) {
    // Concatenate all `data:` lines, take the last JSON-RPC object with a result/error.
    let last: JsonRpcResponse | null = null;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (obj && (obj.result !== undefined || obj.error !== undefined)) last = obj;
      } catch { /* skip non-JSON keepalives */ }
    }
    if (!last) throw new Error('MCP SSE response contained no JSON-RPC result');
    return last;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MCP non-JSON response: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

export class RobinhoodMcpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(private accessToken: string, private url: string = ROBINHOOD_TRADING_MCP_URL) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.accessToken}`,
      'mcp-protocol-version': PROTOCOL_VERSION,
    };
    if (this.sessionId) h['mcp-session-id'] = this.sessionId;
    return h;
  }

  private async rpc(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }),
    });
    // Capture the session id issued on initialize.
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (res.status === 401) {
      const e: any = new Error('Robinhood MCP unauthorized (token expired or revoked)');
      e.code = 'unauthorized';
      throw e;
    }
    if (!res.ok && res.status !== 200) {
      throw new Error(`Robinhood MCP ${method} failed: HTTP ${res.status}`);
    }
    const rpcRes = await readRpc(res);
    if (rpcRes.error) {
      throw new Error(`Robinhood MCP ${method} error ${rpcRes.error.code}: ${rpcRes.error.message}`);
    }
    return rpcRes.result;
  }

  /** One-shot notification (no response expected). */
  private async notify(method: string, params?: unknown): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {} }),
    }).catch(() => { /* notifications are best-effort */ });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'Supermission RORO', version: '1.0.0' },
    });
    await this.notify('notifications/initialized');
    this.initialized = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const result = await this.rpc('tools/list', {});
    return (result?.tools ?? []) as McpTool[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.initialize();
    return (await this.rpc('tools/call', { name, arguments: args ?? {} })) as McpToolResult;
  }
}

/** Flatten an MCP tool result's content array into plain text for the LLM. */
export function mcpResultToText(result: McpToolResult): string {
  if (result?.structuredContent !== undefined) {
    try { return JSON.stringify(result.structuredContent); } catch { /* fall through */ }
  }
  const parts = (result?.content ?? [])
    .map((c) => (typeof c.text === 'string' ? c.text : JSON.stringify(c)))
    .filter(Boolean);
  return parts.join('\n') || '(no content)';
}
