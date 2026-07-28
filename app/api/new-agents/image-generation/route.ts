/**
 * Image Generation AI Agent Service (Serverless)
 * Provides AI-powered image generation with prompt enhancement
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { fetchImageGeneration, PRICING } from '@/lib/new-agents/imageGeneration/fetchImageGeneration';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'agent_image_generation_001';
const AGENT_NAME = 'SuperImageGen';
const ERC8004_AGENT_ID = '0'; // Update with actual ERC-8004 NFT Token ID when registered
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7'; // Agent's wallet to receive payments

// Token configuration (Base Mainnet USDC)
const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453; // Base Mainnet
const TOKEN_DECIMALS = 6; // USDC has 6 decimals

/**
 * Image Generation Request Interface
 */
interface ImageGenAPIRequest {
  prompt: string;
  model?: 'flash' | 'standard' | 'premium' | 'auto';
  enhancePrompt?: boolean;
  width?: number;
  height?: number;
  aspectRatio?: string;
}

/**
 * Execute task endpoint with X402 Payment Required support
 */
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  console.log('[ImageGen API] POST handler called');

  try {
    const body: ImageGenAPIRequest = await request.json();
    const { prompt, model = 'auto', enhancePrompt = true, width, height, aspectRatio } = body;
    const paymentProofHeader = request.headers.get('x-payment-proof');

    console.log('[ImageGen API] Payment proof header exists?:', !!paymentProofHeader);
    console.log('[ImageGen API] Prompt:', prompt?.slice(0, 50) + '...');
    console.log('[ImageGen API] Model tier:', model);

    // Validate required fields
    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: 'Prompt too long (max 2000 characters)' },
        { status: 400 }
      );
    }

    console.log(`[${AGENT_NAME}] Received request for prompt: "${prompt.slice(0, 50)}..."`);

    // Determine payment amount based on model tier
    const servicePrice = PRICING[model] || PRICING['auto'];

    // Payment gating disabled - agents are free to use
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // ========================================
    // STEP 1: Execute image generation (no payment required)
    // ========================================
    // Track job in collaborate_missions
    const user_address = request.headers.get('x-wallet-address');
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `Image Generation: ${prompt.slice(0, 80)}`,
      description: `Model: ${model}, Size: ${width}x${height}`,
      budget: servicePrice.toString(),
      category: 'image-generation',
      creatorAddress: user_address || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    let generationResult;
    try {
      generationResult = await fetchImageGeneration({
        prompt,
        model: model as any,
        enhancePrompt,
        width,
        height,
        aspectRatio: aspectRatio as any,
      });
      console.log(`[${AGENT_NAME}] Image generation completed`);
    } catch (generationError) {
      const errorMessage = generationError instanceof Error ? generationError.message : 'Image generation failed';
      console.error(`[${AGENT_NAME}] Image generation failed:`, errorMessage);

      return NextResponse.json(
        {
          success: false,
          error: 'Image generation failed',
          message: errorMessage,
        },
        { status: 422 }
      );
    }

    // ========================================
    // STEP 2: Return success
    // ========================================
    // Complete the job
    if (missionId && jobResult.taskId) {
      completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { model } }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        missionId,
        data: generationResult,
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
    pricing: PRICING,
    models: {
      flash: 'Nano Banana (Gemini Flash) - 1K resolution, fastest',
      standard: 'Nano Banana Pro (Gemini Pro) - 2K resolution, high quality',
      premium: 'Nano Banana Pro (Gemini Pro) - 4K resolution, highest quality',
      auto: 'Automatic selection based on prompt analysis',
    },
    capabilities: [
      'image-generation',
      'prompt-enhancement',
      'style-analysis',
      'ipfs-storage',
      'multi-resolution',
    ],
    supportedAspectRatios: [
      '1:1', '16:9', '9:16', '4:3', '3:4',
      '2:3', '3:2', '4:5', '5:4', '21:9',
    ],
    chainId: CHAIN_ID,
    token: PAYMENT_TOKEN,
    timestamp: new Date().toISOString(),
  });
}
