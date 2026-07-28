/**
 * Wallet Intelligence AI Agent Service
 * Comprehensive multi-chain wallet analysis with NFT, DeFi, and portfolio optimization
 * Supports Base + Polygon + Ethereum (expandable to 5+ chains)
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { isAddress } from 'viem';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';
import { chatCompletionJSON, MODELS } from '@/lib/openrouter/client';

// Wallet Intelligence imports
import { orchestrateWalletAnalysis, fetchSocialIdentity } from '@/lib/wallet-intelligence/orchestrator';
import { analyzePortfolio, generateOptimizationRecommendations } from '@/lib/wallet-intelligence/analyzers/portfolio-analyzer';
import { analyzeRisk, generateSecurityRecommendations } from '@/lib/wallet-intelligence/analyzers/risk-analyzer';
import { analyzeBehavior, generateBehaviorInsights, detectNotablePatterns } from '@/lib/wallet-intelligence/analyzers/behavior-analyzer';
import { SYSTEM_PROMPT, buildUserMessage } from '@/lib/wallet-intelligence/prompts';
import type { SupportedChain, WalletIntelligenceRequest, WalletIntelligenceResponse, AIProfile } from '@/lib/wallet-intelligence/types';

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'wallet-intelligence';
const AGENT_NAME = 'Wallet Intelligence';
const ERC8004_AGENT_ID = '0';
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7';

const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const CHAIN_ID = 8453; // Base
const TOKEN_DECIMALS = 6;
const SERVICE_PRICE = '0.15'; // USDC

const SUPPORTED_CHAINS: SupportedChain[] = ['base', 'polygon', 'ethereum', 'arbitrum'];

/**
 * Generate AI profile using LLM
 */
async function generateAIProfile(
  walletAddress: string,
  orchestratorResult: any,
  portfolioAnalysis: any,
  riskAnalysis: any,
  behaviorAnalysis: any,
  totalValueUSD: number
): Promise<AIProfile | null> {
  try {
    // Build user message
    const userMessage = buildUserMessage(
      walletAddress,
      orchestratorResult.chains,
      portfolioAnalysis,
      riskAnalysis,
      behaviorAnalysis,
      totalValueUSD
    );

    // Call LLM
    const aiProfile = await chatCompletionJSON(
      MODELS.GEMINI_FLASH_15,
      SYSTEM_PROMPT,
      userMessage,
      { temperature: 0.3, max_tokens: 2500 }
    );

    return aiProfile as AIProfile;
  } catch (error) {
    console.error('[WalletIntelligence] AI profile generation failed:', error);
    return null;
  }
}

/**
 * POST - Wallet Intelligence Analysis (with payment)
 */
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  console.log('[WalletIntelligence API] POST handler called');

  try {
    const body: WalletIntelligenceRequest = await request.json();
    const { walletAddress, chains, depth = 'standard', includeLLM = true } = body;
    const paymentProofHeader = request.headers.get('x-payment-proof');
    const paymentAmount = SERVICE_PRICE;

    // Validate wallet address
    if (!walletAddress || !isAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address. Must be a valid Ethereum address' },
        { status: 400 }
      );
    }

    // Payment gating disabled - agents are free to use
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // Track job in collaborate_missions
    const user_address = request.headers.get('x-wallet-address');
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `Wallet Intelligence: ${walletAddress.slice(0, 10)}...`,
      description: `Multi-chain wallet analysis`,
      budget: SERVICE_PRICE,
      category: 'wallet-intelligence',
      creatorAddress: user_address || walletAddress || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    // Execute wallet intelligence analysis
    const executionStartTime = Date.now();

    try {
      console.log(`[WalletIntelligence] Starting analysis for ${walletAddress}`);

      // 1. Fetch social identity
      const socialIdentity = await fetchSocialIdentity(walletAddress as `0x${string}`);

      // 2. Orchestrate multi-chain data fetching
      const chainsToAnalyze = chains && chains.length > 0 ? chains : SUPPORTED_CHAINS;
      const orchestratorResult = await orchestrateWalletAnalysis(walletAddress, chainsToAnalyze);

      // 3. Run analyzers
      const portfolioAnalysis = analyzePortfolio(
        orchestratorResult.chains,
        orchestratorResult.aggregatedData.allTokens,
        orchestratorResult.aggregatedData.allNFTs,
        orchestratorResult.aggregatedData.allDeFiPositions
      );

      const riskAnalysis = analyzeRisk(
        orchestratorResult.chains,
        orchestratorResult.aggregatedData.allTokens,
        portfolioAnalysis.concentrationRisk
      );

      const behaviorAnalysis = analyzeBehavior(
        orchestratorResult.chains,
        orchestratorResult.aggregatedData.allTokens,
        orchestratorResult.aggregatedData.allNFTs,
        orchestratorResult.aggregatedData.allDeFiPositions,
        orchestratorResult.aggregatedData.totalValueUSD
      );

      // 4. Generate AI profile (if requested)
      let aiProfile: AIProfile | null = null;
      if (includeLLM) {
        aiProfile = await generateAIProfile(
          walletAddress,
          orchestratorResult,
          portfolioAnalysis,
          riskAnalysis,
          behaviorAnalysis,
          orchestratorResult.aggregatedData.totalValueUSD
        );
      }

      // 5. Build summary
      const summary = {
        totalPortfolioUSD: orchestratorResult.aggregatedData.totalValueUSD,
        totalChainsActive: orchestratorResult.chains.filter((c) => c.totalValueUSD > 0).length,
        totalTokens: orchestratorResult.aggregatedData.allTokens.length,
        totalNFTs: orchestratorResult.aggregatedData.allNFTs.reduce(
          (sum, nft) => sum + nft.tokenCount,
          0
        ),
        totalDeFiPositions: orchestratorResult.aggregatedData.allDeFiPositions.length,
        overallRiskScore: riskAnalysis.overallScore,
      };

      const executionTimeMs = Date.now() - executionStartTime;

      // Complete the job
      if (missionId && jobResult.taskId) {
        completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { walletAddress, executionTimeMs } }).catch(() => {});
      }

      // Build response
      const response: WalletIntelligenceResponse = {
        success: true,
        agentId: AGENT_ID,
        missionId: missionId || undefined,
        data: {
          walletAddress,
          socialIdentity,
          summary,
          chains: orchestratorResult.chains,
          portfolioAnalysis,
          riskAnalysis,
          behaviorAnalysis,
          aiProfile: aiProfile || undefined,
        },
        executionTimeMs,
      };

      return NextResponse.json(response);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Wallet intelligence analysis failed';
      console.error('[WalletIntelligence] Analysis error:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Wallet intelligence analysis failed',
          message: msg,
        },
        { status: 422 }
      );
    }
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
 * GET - Agent Metadata
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
      'multi-chain-analysis',
      'nft-portfolio',
      'defi-positions',
      'historical-trends',
      'portfolio-optimization',
      'security-scoring',
      'social-identity',
    ],
    supportedChains: SUPPORTED_CHAINS,
    features: {
      chains: `${SUPPORTED_CHAINS.length} chains (Base, Polygon, Ethereum)`,
      nftAnalysis: 'Collection metadata + floor prices (Reservoir API)',
      defiTracking: 'Aave, Uniswap, Compound positions',
      portfolioMetrics: 'Diversification score, concentration risk, rebalancing',
      securityScoring: 'Scam detection, approval scanning, phishing risk',
      aiProfile: 'LLM-generated wallet behavior analysis',
    },
    timestamp: new Date().toISOString(),
  });
}
