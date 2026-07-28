/**
 * Platform Knowledge Base
 * Contains all information about Supermission/QuickGig platform capabilities
 */

export interface PlatformAgent {
  id: string;
  name: string;
  icon: string;
  description: string;
  capabilities: string[];
  pricing: string;
  prompt: string;
  category: 'core' | 'premium';
}

export interface PlatformFeature {
  name: string;
  description: string;
  icon: string;
}

// All available agents on the platform
export const PLATFORM_AGENTS: PlatformAgent[] = [
  {
    id: 'token-due-diligence',
    name: 'Token Due Diligence',
    icon: 'TD',
    description: 'Comprehensive token analysis with risk assessment, holder distribution, liquidity checks, and investment recommendations.',
    capabilities: [
      'Token risk scoring (0-100)',
      'Holder distribution analysis',
      'Liquidity pool assessment',
      'Contract verification status',
      'Honeypot detection',
      'Rug pull risk indicators',
      'Buy/Sell tax analysis'
    ],
    pricing: 'Free',
    prompt: 'Analyse this token for me',
    category: 'core'
  },
  {
    id: 'contract-audit',
    name: 'Smart Contract Audit',
    icon: 'CA',
    description: 'Security audit for smart contracts with vulnerability detection, gas optimization tips, and OpenZeppelin compliance checking.',
    capabilities: [
      'Vulnerability scanning (reentrancy, overflow, etc.)',
      'Gas optimization suggestions',
      'OpenZeppelin compliance check',
      'AI-powered code review',
      'Security score (0-100)',
      'Risk categorization (Critical, High, Medium, Low)',
      'Best practices recommendations'
    ],
    pricing: 'Free',
    prompt: 'Audit this smart contract',
    category: 'core'
  },
  {
    id: 'prediction-market',
    name: 'Prediction Market Finder',
    icon: 'PM',
    description: 'AI-powered discovery of profitable prediction market opportunities on Polymarket with real-time odds analysis.',
    capabilities: [
      'Polymarket integration',
      'Real-time odds tracking',
      'Profitable opportunity detection',
      'Market sentiment analysis',
      'Risk/reward calculations',
      'Direct trading from chat',
      'Market expiry tracking'
    ],
    pricing: 'Free',
    prompt: 'Find market opportunities',
    category: 'core'
  },
  {
    id: 'super-image-gen',
    name: 'AI Image Generation',
    icon: 'IG',
    description: 'Create stunning AI-generated images with automatic prompt enhancement, style variations, and IPFS storage.',
    capabilities: [
      'Text-to-image generation',
      'Automatic prompt enhancement',
      'Multiple style options (Anime, Oil Paint, Cyberpunk, etc.)',
      'Quality upscaling (2K, 4K)',
      'Image variations',
      'IPFS permanent storage',
      'NFT-ready output'
    ],
    pricing: 'Free',
    prompt: 'Generate an image for me',
    category: 'core'
  },
  {
    id: 'defi-yield',
    name: 'DeFi Yield Scanner',
    icon: 'DY',
    description: 'Get the best yield opportunities on Base. Real-time APY data from DeFiLlama with deterministic risk scoring and AI insights.',
    capabilities: [
      'Real-time APY tracking across 1000+ pools',
      'Base-native yield ranking',
      'TVL-based risk filtering',
      'Stablecoin yield discovery',
      'Impermanent loss risk assessment',
      'AI-powered investment insights',
      'Protocol reputation scoring'
    ],
    pricing: 'Free',
    prompt: 'Find me the best DeFi yields on Base',
    category: 'core'
  },
  {
    id: 'wallet-intelligence',
    name: 'Wallet Intelligence',
    icon: 'WI',
    description: 'Comprehensive multi-chain wallet intelligence with NFT portfolio tracking, DeFi position monitoring, portfolio optimization, and security risk assessment.',
    capabilities: [
      'Multi-chain analysis (Base + Polygon)',
      'NFT portfolio tracking with floor prices',
      'DeFi position detection (Aave, Uniswap, Compound)',
      'Portfolio diversification scoring (HHI algorithm)',
      'Security risk assessment (scam detection, phishing risk)',
      'AI-powered behavioral profiling',
      'Priority-sorted recommendations',
      'Concentration risk analysis'
    ],
    pricing: 'Free',
    prompt: 'Give me comprehensive wallet intelligence',
    category: 'premium'
  }
];

// Platform features
export const PLATFORM_FEATURES: PlatformFeature[] = [
  {
    name: 'Free to Use',
    description: 'All agents are free, no payments, no subscriptions required',
    icon: '💳'
  },
  {
    name: 'Multi-Model AI',
    description: 'Choose your AI model: GPT-4o, Claude, Gemini, Grok, and more',
    icon: '🤖'
  },
  {
    name: 'Wallet Integration',
    description: 'Connect with Coinbase Wallet, MetaMask, or any Web3 wallet',
    icon: '👛'
  },
  {
    name: 'Real-time Analysis',
    description: 'Live data from blockchain, prediction markets, and more',
    icon: '📊'
  },
  {
    name: 'Inline Actions',
    description: 'Execute transactions, generate images, and trade directly from chat',
    icon: '⚡'
  },
  {
    name: 'Chat History',
    description: 'Your conversations are saved and synced across devices',
    icon: '💾'
  }
];

// Intent patterns for detecting platform questions
// These only fire on short, standalone platform queries — NOT mid-conversation messages.
const PLATFORM_INTENT_PATTERNS = {
  // Greetings - ONLY exact short greetings (no trailing content)
  greetings: [
    /^hi!?$/i,
    /^hello!?$/i,
    /^hey!?$/i,
    /^hi there!?$/i,
    /^hello there!?$/i,
    /^good (morning|afternoon|evening)!?$/i,
    /^sup!?$/i,
    /^yo!?$/i,
    /^gm!?$/i,
  ],
  // Questions specifically about agents/capabilities
  agentQuestions: [
    /^(how many|what|which|list|show|available)\s*(agents|services|tools)/i,
    /^what can you do\??$/i,
    /^what do you do\??$/i,
    /^your (capabilities|agents)/i,
    /^what are your/i,
    /^show me what you can/i,
  ],
  // Questions about platform itself — must mention supermission/platform explicitly
  platformQuestions: [
    /what is (supermission|quickgig)/i,
    /about (supermission|quickgig|this platform)/i,
    /how does.*(platform|supermission) work/i,
    /tell me about.*(platform|supermission)/i,
  ],
  // Pricing questions — only when explicitly asking about cost/pricing
  pricingQuestions: [
    /^(how much|what.*cost|pricing|is it free)/i,
    /^how do i pay/i,
    /^what are the fees/i,
  ],
};

/**
 * Detect if a message is asking about platform capabilities.
 * Only matches short, standalone platform queries.
 * `messageCount` is used to restrict greetings to the first message only.
 */
export function detectPlatformIntent(message: string, messageCount = 0): {
  isPlatformQuestion: boolean;
  intentType: 'agents' | 'capabilities' | 'platform' | 'pricing' | 'greeting' | null;
} {
  const trimmed = message.trim();

  // Skip detection for long messages (>80 chars) — likely a real request, not a platform question
  if (trimmed.length > 80) {
    return { isPlatformQuestion: false, intentType: null };
  }

  // Greetings: only on the first message of a session (messageCount === 0)
  if (messageCount === 0) {
    for (const pattern of PLATFORM_INTENT_PATTERNS.greetings) {
      if (pattern.test(trimmed)) {
        return { isPlatformQuestion: true, intentType: 'greeting' };
      }
    }
  }

  for (const pattern of PLATFORM_INTENT_PATTERNS.agentQuestions) {
    if (pattern.test(trimmed)) {
      return { isPlatformQuestion: true, intentType: 'agents' };
    }
  }

  for (const pattern of PLATFORM_INTENT_PATTERNS.platformQuestions) {
    if (pattern.test(trimmed)) {
      return { isPlatformQuestion: true, intentType: 'platform' };
    }
  }

  for (const pattern of PLATFORM_INTENT_PATTERNS.pricingQuestions) {
    if (pattern.test(trimmed)) {
      return { isPlatformQuestion: true, intentType: 'pricing' };
    }
  }

  return { isPlatformQuestion: false, intentType: null };
}

/**
 * Generate a platform knowledge context for the AI system prompt
 */
export function getPlatformKnowledgeContext(): string {
  const agentList = PLATFORM_AGENTS.map(a =>
    `- **${a.name}** (${a.icon}): ${a.description} | Pricing: ${a.pricing}`
  ).join('\n');

  const featureList = PLATFORM_FEATURES.map(f =>
    `- ${f.icon} **${f.name}**: ${f.description}`
  ).join('\n');

  return `
=== SUPERMISSION PLATFORM KNOWLEDGE ===

You are the AI assistant for Supermission (also known as QuickGig), a Web3 AI platform.

**AVAILABLE AI AGENTS (${PLATFORM_AGENTS.length} total):**
${agentList}

**PLATFORM FEATURES:**
${featureList}

**PAYMENT MODEL:**
- All agents are currently free to use
- No payments or subscriptions required

**RULES:**
1. Be direct and specific, no filler phrases, no "Great question!", no unnecessary preamble.
2. When asked about agents → name the relevant ones with a one-liner each. Don't list all ${PLATFORM_AGENTS.length} unless asked.
3. NEVER say "I don't know about the platform", you have complete knowledge.
4. Keep answers to 1-3 sentences unless the user asks for detail.
`;
}

/**
 * Build a response with action card for platform showcase
 */
export function buildPlatformShowcaseResponse(intentType: string): string {
  let message = '';

  switch (intentType) {
    case 'greeting':
      message = `Hey! I'm here to help with crypto, tokens, and Web3. Pick an agent below or just ask me anything.`;
      break;

    case 'agents':
      message = `We have ${PLATFORM_AGENTS.length} agents ready to help:`;
      break;

    case 'recommendation':
      message = `Here's what I'd suggest based on what you need:`;
      break;

    case 'platform':
      message = `Supermission is your Web3 AI toolkit, all agents are free to use.`;
      break;

    case 'pricing':
      message = `Everything is free right now, all agents, no limits, no subscriptions.`;
      break;

    case 'capabilities':
    default:
      message = `Here's what I can do for you:`;
  }

  const payload = {
    message,
    action: {
      type: 'platform_showcase',
      data: {
        agents: PLATFORM_AGENTS,
        intentType
      }
    }
  };

  return JSON.stringify(payload);
}
