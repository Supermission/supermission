import { AgentEndpoint } from "./agent-info";

const isDev = process.env.NODE_ENV === 'development';
const baseUrl = isDev
  ? 'http://localhost:3000'
  : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

export const API_BASE_URL = baseUrl;

/**
 * Call the backend agent endpoint with resolved params only.
 * No message or conversation history is sent to the agent itself.
 */

const AGENT_TIMEOUT_MS = 120_000; // 120 seconds (wallet analysis can take ~60s)

export async function callAgentEndpoint(
  endpoint: AgentEndpoint,
  body: Record<string, any>,
  paymentProof?: any,
  walletAddress?: string
): Promise<any> {

  const fullUrl = `${API_BASE_URL}${endpoint.route}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (paymentProof) {
    headers['x-payment-proof'] = JSON.stringify(paymentProof);
  }

  if (walletAddress) {
    headers['x-wallet-address'] = walletAddress;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Agent endpoint timed out after ${AGENT_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');

    let parsedError: any = null;
    try {
      parsedError = JSON.parse(text);
    } catch {
      // Not JSON, use as-is
    }

    const error = new Error(
      parsedError?.message || parsedError?.error || `Agent endpoint error (${endpoint.id}): ${res.status} ${res.statusText}`
    );
    (error as any).status = res.status;
    (error as any).parsedBody = parsedError;
    (error as any).userMessage = parsedError?.message;
    throw error;
  }

  return await res.json();
}