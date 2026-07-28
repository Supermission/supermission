/**
 * Token Due Diligence AI Agent Service (Serverless)
 * Provides comprehensive token analysis and risk assessment
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { getCachedTokenData } from '@/lib/new-agents/tokenDueDiligence/cacheDataHelper';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'agent_1765183632485_4usq607o8';
const AGENT_NAME = 'Token Due Diligence';
const ERC8004_AGENT_ID = '0'; // Update with actual ERC-8004 NFT Token ID when registered
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7'; // Agent's wallet to receive payments

// Token configuration (Base Mainnet USDC)
const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453; // Base Mainnet
const TOKEN_DECIMALS = 6; // USDC has 6 decimals

// Pricing (in USDC)
const SERVICE_PRICE = '0.1'; // $0.1 per token analysis

/**
 * Token Due Diligence Request Interface
 */
interface TokenDDRequest {
  contractAddress: string;
  chainId: number | string;
  payment?: number; // Optional: override default price
}

const CHAIN_ALIASES: Record<string, number> = {
  '1': 1,
  eth: 1,
  ethereum: 1,
  mainnet: 1,
  '8453': 8453,
  base: 8453,
  base_mainnet: 8453,
  'base-mainnet': 8453,
  '56': 56,
  bsc: 56,
  binance: 56,
  binance_smart_chain: 56,
  '137': 137,
  polygon: 137,
  matic: 137,
  '42161': 42161,
  arbitrum: 42161,
};

const KNOWN_TOKENS: Record<number, Record<string, string>> = {
  8453: {
    eth: '0x4200000000000000000000000000000000000006',
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    dai: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    cbbtc: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    btc: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    wbtc: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
  },
  1: {
    eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    btc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    link: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    uni: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  137: {
    eth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    matic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    'usdc.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
};

function resolveChainId(input: number | string): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const key = String(input || '').trim().toLowerCase();
  if (!key) return null;
  const parsed = Number(key);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return CHAIN_ALIASES[key] ?? null;
}

function resolveContractAddress(input: string, chainId: number): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return raw;

  const symbol = raw.toLowerCase();
  return KNOWN_TOKENS[chainId]?.[symbol] ?? null;
}

/**
 * Execute task endpoint with X402 Payment Required support
 */
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  console.log('[TokenDD API] POST handler called');
  try {
    const body: TokenDDRequest = await request.json();
    const { contractAddress, chainId } = body;
    const paymentProofHeader = request.headers.get('x-payment-proof');

    const resolvedChainId = resolveChainId(chainId);
    const resolvedContractAddress = resolvedChainId
      ? resolveContractAddress(contractAddress, resolvedChainId)
      : null;

    console.log('[TokenDD API] Payment proof header exists?:', !!paymentProofHeader);
    console.log('[TokenDD API] contractAddress:', contractAddress);
    console.log('[TokenDD API] chainId:', chainId);
    console.log('[TokenDD API] resolvedContractAddress:', resolvedContractAddress);
    console.log('[TokenDD API] resolvedChainId:', resolvedChainId);

    // Validate required fields
    if (!contractAddress || !chainId) {
      return NextResponse.json(
        { error: 'Missing contractAddress or chainId' },
        { status: 400 }
      );
    }

    if (!resolvedChainId) {
      return NextResponse.json(
        { error: 'Invalid chainId', message: `Unsupported chain value: ${chainId}` },
        { status: 400 }
      );
    }

    if (!resolvedContractAddress) {
      return NextResponse.json(
        {
          error: 'Invalid contractAddress',
          message: `Could not resolve token "${contractAddress}" on chain ${resolvedChainId}. Provide a valid token contract address.`,
        },
        { status: 422 }
      );
    }

    console.log(`[${AGENT_NAME}] Received request for token: ${resolvedContractAddress}`);
    console.log(`[${AGENT_NAME}] Chain ID: ${resolvedChainId}`);

    // Payment gating disabled - agents are free to use
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // ========================================
    // STEP 1: Execute token due diligence (no payment required)
    // ========================================
    // Track job in collaborate_missions
    const user_address = request.headers.get('x-wallet-address');
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `Token Due Diligence: ${resolvedContractAddress.slice(0, 10)}...`,
      description: `Token analysis on chain ${resolvedChainId}`,
      budget: SERVICE_PRICE,
      category: 'token-due-diligence',
      creatorAddress: user_address || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    let analysisResult;
    try {
      analysisResult = await getCachedTokenData(resolvedContractAddress, resolvedChainId);
      console.log(`[${AGENT_NAME}] Analysis completed for token: ${resolvedContractAddress}`);
    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : 'Token analysis failed';
      console.error(`[${AGENT_NAME}] Token analysis failed:`, errorMessage);

      return NextResponse.json(
        {
          success: false,
          error: 'Token analysis failed',
          message: errorMessage.includes('both CoinGecko and 1inch failed')
            ? `Token not found on chain ${resolvedChainId}. The contract address may not exist on this blockchain or may not be indexed yet.`
            : errorMessage,
          contractAddress: resolvedContractAddress,
          chainId: resolvedChainId,
        },
        { status: 422 }
      );
    }

    // ========================================
    // STEP 2: Return success
    // ========================================
    // Complete the job
    if (missionId && jobResult.taskId) {
      completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { contractAddress: resolvedContractAddress, chainId: resolvedChainId } }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        missionId,
        data: analysisResult,
      },
    );
  } catch (error) {
    console.error(`[${AGENT_NAME}] Request error:`, error);
    return NextResponse.json(
      {
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    erc8004AgentId: ERC8004_AGENT_ID,
    cdpWallet: CDP_WALLET,
    pricing: {
      perAnalysis: SERVICE_PRICE,
      currency: 'USDC',
      chainId: CHAIN_ID,
      token: PAYMENT_TOKEN,
    },
    capabilities: [
      'token-analysis',
      'risk-assessment',
      'holder-distribution',
      'liquidity-analysis',
      'security-audit',
      'market-snapshot',
    ],
    supportedChains: [
      'ETH_MAINNET',
      'BASE_MAINNET',
      'POLYGON_MAINNET',
      'BSC_MAINNET',
      'ARBITRUM_MAINNET',
    ],
    officialRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
    timestamp: new Date().toISOString(),
  });
}
