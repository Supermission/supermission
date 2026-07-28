/**
 * GOAT AI Agent API Route
 * Streaming AI agent with on-chain execution capabilities
 * Uses OpenRouter for LLM access and GOAT SDK for blockchain tools
 */

import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getOnChainTools } from '@goat-sdk/adapter-vercel-ai';
import { createWalletClient, http, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGoatWallet, getChainName, getRpcUrl, CHAIN_MAP, type SupportedChainId } from '@/lib/goat/wallet-provider';
import { getPluginsForChain } from '@/lib/goat/plugins';
import { checkRateLimit, formatRateLimitError, getRateLimitHeaders } from '@/lib/goat/rate-limiter';
import { isTestnetMode, getTestnetWarnings, BASE_SEPOLIA_CHAIN_ID } from '@/lib/goat/testnet-config';

export const maxDuration = 60; // 60 seconds for complex operations
export const runtime = 'nodejs'; // Required for Viem

// Initialize OpenRouter
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://supermission.fun',
    'X-Title': 'SUPERMISSION AI DeFi Agent',
  },
});

/**
 * POST /api/agent
 * Stream AI agent responses with on-chain execution
 */
export async function POST(req: Request) {
  try {
    const { messages, walletAddress, chainId, privateKey } = await req.json();

    // Validate inputs
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages are required' }),
        { status: 400 }
      );
    }

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Wallet address is required' }),
        { status: 400 }
      );
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(walletAddress);
    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({ error: formatRateLimitError(rateLimitResult) }),
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimitResult),
        }
      );
    }

    if (!chainId) {
      return new Response(
        JSON.stringify({ error: 'Chain ID is required' }),
        { status: 400 }
      );
    }

    // Validate chain is supported
    const supportedChainId = chainId as SupportedChainId;
    if (!CHAIN_MAP[supportedChainId]) {
      return new Response(
        JSON.stringify({ error: `Unsupported chain ID: ${chainId}` }),
        { status: 400 }
      );
    }

    // Validate API key
    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { status: 500 }
      );
    }

    // Create wallet client
    let walletClient: WalletClient;

    if (privateKey) {
      // Server-side wallet with private key (for autonomous agents)
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      walletClient = createWalletClient({
        account,
        chain: CHAIN_MAP[supportedChainId],
        transport: http(getRpcUrl(supportedChainId)),
      });
    } else {
      // Client-side wallet (user must sign via frontend)
      // For now, we'll return an error as client-side signing needs special handling
      return new Response(
        JSON.stringify({
          error: 'Client-side wallet signing not yet implemented. Please use server-side wallet.',
        }),
        { status: 501 }
      );
    }

    // Create GOAT wallet
    const goatWallet = createGoatWallet(walletClient);

    // Get plugins for this chain
    const plugins = getPluginsForChain(supportedChainId);

    // Get on-chain tools
    // Note: Using 'any' type due to GOAT SDK internal dependency version conflicts
    const tools: any = await getOnChainTools({
      wallet: goatWallet as any,
      plugins,
    });

    console.log(`[Agent] Initialized with ${Object.keys(tools).length} tools on ${getChainName(supportedChainId)}`);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(walletAddress, supportedChainId);

    // Stream AI response with tool calling
    const result = streamText({
      model: openrouter('google/gemini-2.5-flash'), // Cheap, fast, cost-effective
      system: systemPrompt,
      messages,
      tools,
      temperature: 0.7,
      maxRetries: 3, // Retry failed operations

      onError: (error) => {
        console.error('[Agent] Error:', error);

        // Categorize and log different error types
        if (error instanceof Error) {
          if (error.message.includes('insufficient funds')) {
            console.error('[Agent] Insufficient funds error');
          } else if (error.message.includes('user rejected')) {
            console.error('[Agent] User rejected transaction');
          } else if (error.message.includes('slippage')) {
            console.error('[Agent] Slippage tolerance exceeded');
          } else if (error.message.includes('network')) {
            console.error('[Agent] Network error');
          }
        }
      },
    });

    return result.toTextStreamResponse();

  } catch (error: any) {
    console.error('[Agent] API error:', error);

    // Categorize errors for better user messaging
    let userMessage = 'Agent execution failed';
    let statusCode = 500;

    if (error.message) {
      // Network errors
      if (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('fetch failed')) {
        userMessage = 'Network error. Please check your connection and try again.';
        statusCode = 503;
      }
      // Authentication/Authorization errors
      else if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
        userMessage = 'Wallet authentication failed. Please reconnect your wallet.';
        statusCode = 401;
      }
      // Insufficient funds
      else if (error.message.includes('insufficient') || error.message.includes('balance')) {
        userMessage = 'Insufficient balance to complete this operation.';
        statusCode = 400;
      }
      // Gas estimation errors
      else if (error.message.includes('gas')) {
        userMessage = 'Gas estimation failed. The transaction may not succeed.';
        statusCode = 400;
      }
      // Slippage errors
      else if (error.message.includes('slippage')) {
        userMessage = 'Slippage tolerance exceeded. Try increasing slippage or waiting for better prices.';
        statusCode = 400;
      }
      // Contract errors
      else if (error.message.includes('revert') || error.message.includes('execution reverted')) {
        userMessage = 'Smart contract execution failed. The operation was rejected.';
        statusCode = 400;
      }
      // Rate limit
      else if (error.message.includes('rate limit')) {
        userMessage = 'Too many requests. Please wait a moment and try again.';
        statusCode = 429;
      }
      // OpenRouter/LLM errors
      else if (error.message.includes('OpenRouter') || error.message.includes('model')) {
        userMessage = 'AI model error. Please try again.';
        statusCode = 503;
      }
      // Generic error with message
      else {
        userMessage = error.message;
      }
    }

    // Log structured error for debugging
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      walletAddress: error.walletAddress || 'unknown',
      chainId: error.chainId || 'unknown',
    };
    console.error('[Agent] Error details:', JSON.stringify(errorLog));

    return new Response(
      JSON.stringify({
        error: userMessage,
        code: statusCode,
        timestamp: new Date().toISOString(),
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * Build system prompt for the agent
 */
function buildSystemPrompt(walletAddress: string, chainId: SupportedChainId): string {
  const chainName = getChainName(chainId);
  const testnetWarnings = chainId === BASE_SEPOLIA_CHAIN_ID ? getTestnetWarnings() : [];
  const testnetSection = testnetWarnings.length > 0
    ? `\n\nTESTNET MODE:\n${testnetWarnings.join('\n')}\n`
    : '';

  return `You are a DeFi agent on ${chainName} blockchain.${testnetSection}

CAPABILITIES:
- Check token balances (ERC-20 tokens)
- Swap tokens on the same chain via LI.FI (aggregates all major DEXs for best rates)
- Cross-chain swaps and bridges via LI.FI (35+ chains supported)
- Get swap quotes with route details, gas estimates, and bridge info
- Transfer tokens to addresses
- Approve token spending for contracts
- List supported chains and available tokens

SUPPORTED CHAINS:
Ethereum (1), Base (8453), Polygon (137), Arbitrum (42161), Optimism (10), Avalanche (43114), BSC (56), and 30+ more.

SAFETY RULES:
1. ALWAYS ask for explicit confirmation before executing transactions
2. Show all transaction details (amount, token, recipient, estimated gas, route)
3. Check token balance before swapping or transferring
4. Get swap quotes before executing swaps
5. Warn about large transactions (>20% of portfolio)
6. Never execute without user approval
7. For cross-chain swaps, clearly show source and destination chains
8. If a quote request times out, tell the user and suggest retrying — do NOT get stuck

WORKFLOW:
1. User makes request
2. You gather required information (balances, quotes, etc.)
3. You present a clear transaction summary
4. You ask user to type "approve" or "confirm"
5. Only after explicit approval, execute the transaction
6. Provide transaction hash and block explorer link

CURRENT CONTEXT:
- Wallet: ${walletAddress}
- Chain: ${chainName} (${chainId})

IMPORTANT GUIDELINES:
- Be conversational and helpful
- Explain what you're doing at each step
- Show transaction hashes after execution
- Estimate gas costs when possible
- If a transaction fails, explain why and suggest alternatives
- For swaps, always show expected output amount, slippage, and which DEX/bridge is used
- For cross-chain, show estimated bridge time if available
- If the quote API returns an error or times out, tell the user clearly and suggest they retry

Example interactions:

Same-chain swap:
User: "Swap 100 USDC to ETH on Base"
You: "Let me check your balance and get a quote... You have 250 USDC on Base. Via LI.FI (routed through SushiSwap): you'll receive ~0.048 ETH for 100 USDC. Gas: ~$0.01. Slippage: 0.5%. Type 'approve' to execute."

Cross-chain bridge:
User: "Bridge 50 USDC from Base to Arbitrum"
You: "Getting a cross-chain quote... Via LI.FI (Stargate bridge): 50 USDC on Base → ~49.95 USDC on Arbitrum. Gas: ~$0.15. Bridge time: ~1-3 min. Type 'approve' to execute."

Start by greeting the user and asking how you can help with DeFi operations.`;
}
