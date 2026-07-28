/**
 * SECURO tool definitions + executors.
 * 3 tools for the smart contract security agent using OpenAI function calling schema.
 */

import { getCachedAuditData } from '@/lib/new-agents/contractAudit/cacheDataHelper';
import { getAuditStats } from '@/lib/new-agents/contractAudit/fetchContractAudit';
import { fetchContractSource } from '@/lib/new-agents/contractAudit/helpers/blockExplorerFetcher';
import { generateAIAuditReport } from '@/lib/new-agents/contractAudit/helpers/aiReportGenerator';
import { researchTopic } from '@/lib/ai/shared/research';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ToolDefinition, ToolResult } from '../shared/types';
import type { ToolDefinition, ToolResult } from '../shared/types';

// ---------------------------------------------------------------------------
// Tool Definitions (OpenAI function calling schema)
// ---------------------------------------------------------------------------

export const SECURO_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'audit_contract',
      description:
        'Audit raw Solidity source code for vulnerabilities, gas issues, and compliance. Paste the full contract source.',
      parameters: {
        type: 'object',
        properties: {
          sourceCode: { type: 'string', description: 'Full Solidity source code to audit' },
          contractName: { type: 'string', description: 'Name of the contract (optional)' },
          deepAudit: { type: 'boolean', description: 'Enable deep audit with Nemesis + Pashov AI passes (~2-3 min)' },
          selectedModel: { type: 'string', description: 'LLM model for AI report generation (optional)' },
        },
        required: ['sourceCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_by_address',
      description:
        'Audit a deployed smart contract by its address. Fetches verified source code from block explorer, then runs the full audit pipeline.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'Deployed contract address' },
          chainId: { type: 'number', description: 'Optional chain ID (1 = Ethereum, 8453 = Base, 42161 = Arbitrum). OMIT this if the user did not specify a chain — SECURO will auto-probe Ethereum, Base, and Arbitrum.' },
          deepAudit: { type: 'boolean', description: 'Enable deep audit with Nemesis + Pashov AI passes (~2-3 min)' },
          selectedModel: { type: 'string', description: 'LLM model for AI report generation (optional)' },
        },
        required: ['contractAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_topic',
      description:
        'Search the web for smart contract security topics, recent exploits, vulnerability patterns, and best practices.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Specific search query about smart contract security, e.g. "reentrancy attack patterns 2026", "latest DeFi exploits".',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  walletAddress: string | null
): Promise<ToolResult> {
  switch (name) {
    case 'audit_contract':
      return { name, result: await executeAuditContract(args) };
    case 'audit_by_address':
      return { name, result: await executeAuditByAddress(args) };
    case 'research_topic':
      return { name, result: await executeResearch(args) };
    case 'redirect_to_agent':
      return { name, result: { redirect: args } };
    default:
      return { name, result: { error: `Unknown tool: ${name}` } };
  }
}

// ---------------------------------------------------------------------------
// audit_contract — wraps getCachedAuditData + generateAIAuditReport
// ---------------------------------------------------------------------------

async function executeAuditContract(args: Record<string, unknown>) {
  const sourceCode = args.sourceCode as string;
  const contractName = (args.contractName as string) || 'Contract';
  const deepAudit = (args.deepAudit as boolean) || false;
  const selectedModel = (args.selectedModel as string) || 'google/gemini-2.5-flash';

  if (!sourceCode) return { error: 'Missing sourceCode' };

  try {
    const auditResult = await getCachedAuditData({
      sourceCode,
      contractName,
      deepAudit,
      selectedModel,
    });

    const stats = getAuditStats(auditResult);

    const aiReport = await generateAIAuditReport({
      sourceCode,
      contractName,
      auditResult,
      selectedModel,
    });

    return { stats, aiReport, auditResult };
  } catch (err: any) {
    return { error: err.message || 'Contract audit failed' };
  }
}

// ---------------------------------------------------------------------------
// audit_by_address — wraps fetchContractSource + getCachedAuditData
// ---------------------------------------------------------------------------

// Chains SECURO can fetch verified source for (Etherscan V2). When the user
// doesn't say which chain, we probe these in order.
const SECURO_AUDIT_CHAINS: { id: number; name: string }[] = [
  { id: 1, name: 'Ethereum' },
  { id: 8453, name: 'Base' },
  { id: 42161, name: 'Arbitrum' },
];

async function executeAuditByAddress(args: Record<string, unknown>) {
  const contractAddress = args.contractAddress as string;
  const explicitChainId = typeof args.chainId === 'number' ? (args.chainId as number) : undefined;
  const deepAudit = (args.deepAudit as boolean) || false;
  const selectedModel = (args.selectedModel as string) || 'google/gemini-2.5-flash';

  if (!contractAddress) return { error: 'Missing contractAddress' };

  const chainsToTry = explicitChainId
    ? [{ id: explicitChainId, name: SECURO_AUDIT_CHAINS.find((c) => c.id === explicitChainId)?.name ?? `chain ${explicitChainId}` }]
    : SECURO_AUDIT_CHAINS;

  // Track whether we found a contract that simply isn't verified — that's a
  // very different answer than "this isn't a contract on any chain we check".
  let unverifiedOn: string | null = null;
  let lastError = '';

  for (const chain of chainsToTry) {
    try {
      const { sourceCode, contractName } = await fetchContractSource(contractAddress, chain.id);

      const auditResult = await getCachedAuditData({ sourceCode, contractName, deepAudit, selectedModel });
      const stats = getAuditStats(auditResult);
      const aiReport = await generateAIAuditReport({ sourceCode, contractName, auditResult, selectedModel });

      return { contractAddress, chainId: chain.id, chainName: chain.name, stats, aiReport, auditResult };
    } catch (err: any) {
      const msg = String(err?.message || '');
      lastError = msg;
      // "no verified source" / "not verified" → the address IS a contract here,
      // we just can't read its code. Remember it; keep probing other chains in
      // case it's also deployed (verified) elsewhere.
      if (/not verified|verified source/i.test(msg)) unverifiedOn = chain.name;
      // Otherwise (EOA / not found / network error) → try the next chain.
    }
  }

  if (unverifiedOn) {
    return {
      error: `There's a contract at ${contractAddress} on ${unverifiedOn}, but its source code isn't verified on the block explorer — I can only audit verified contracts by address. Paste the Solidity source directly and I'll audit it.`,
      relayToUser: true,
    };
  }
  return {
    error: explicitChainId
      ? `No verified contract found at ${contractAddress} on ${chainsToTry[0].name}. Double-check the address and chain.`
      : `No verified contract found at ${contractAddress} on Ethereum, Base, or Arbitrum. Double-check the address, or tell me which chain it's on if it's elsewhere.`,
    relayToUser: true,
    detail: lastError,
  };
}

// ---------------------------------------------------------------------------
// research_topic — wraps research via oracle endpoint
// ---------------------------------------------------------------------------

async function executeResearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return { error: 'Missing required parameter: query' };

  try {
    const result = await researchTopic(query);
    return {
      query: result.query,
      one_liner: result.oneLiner,
      sources: result.snippets.map((s) => ({
        title: s.title,
        url: s.url,
        excerpt: s.excerpt,
      })),
      cached: result.cached,
    };
  } catch (err: any) {
    return { error: 'Research service temporarily unavailable. Answer this question from your own expert knowledge instead.' };
  }
}
