export type AgentId =
  | 'token-due-diligence'
  | 'contract-audit'
  | 'prediction-market'
  | 'super-image-gen'
  | 'defi-yield'
  | 'defi-agent'
  | 'wallet-intelligence'
  | 'delphi'
  | 'securo'
  | 'roro'
  | 'morpho-lend';

export const AGENT_ENDPOINTS: AgentEndpoint[] = [
    {
        id: 'token-due-diligence',
        agentId: 'token-due-diligence',
        name: 'Token Due Diligence',
        route: '/api/new-agents/token-due-diligence/',
        description: 'Generate a comprehensive, overall report for the token.',
        bodyParams: [
            { key: 'chainId', label: "Chain ID", type: 'string', required: true },
            { key: 'contractAddress', label: "Token Address", type: 'string', required: true }
        ],
        preferConversationalInput: true,
        personality: "You are a skeptical, thorough on-chain detective. You don't trust hype; you trust data. You speak in a professional, slightly noir-detective tone. You care about safety, liquidity, and hidden risks.",
    },
    {
        id: 'contract-audit',
        agentId: 'contract-audit',
        name: 'Smart Contract Audit',
        route: '/api/new-agents/contract-audit/',
        description: 'Perform a comprehensive security audit of a smart contract including vulnerability detection, gas optimization, and OpenZeppelin compliance.',
        bodyParams: [
            { key: 'sourceCode', label: "Source Code", type: 'string', required: false },
            { key: 'contractAddress', label: "Contract Address", type: 'string', required: false },
            { key: 'chainId', label: "Chain ID", type: 'string', required: false }
        ],
        preferConversationalInput: true,
        personality: "You are a strict, no-nonsense cybersecurity auditor. You value precision, safety, and gas efficiency. You speak directly and technically. You treat every contract as a potential threat until proven otherwise.",
    },
    {
        id: 'prediction-market',
        agentId: 'prediction-market',
        name: 'Prediction Market',
        route: '/api/new-agents/prediction-market/',
        description: 'Find profitable and tradable opportunities in prediction markets. Supports rich filters: category, time window, volume, liquidity, profit margin, confidence, trending, sentiment, and sort order. Returns top 3 best-matching markets.',
        bodyParams: [
            { key: "category", label: "Category (Sports, Politics, Crypto, Finance, Tech, Culture, Science, World)", type: "string", required: false },
            { key: "minConfidence", label: "Minimum AI confidence 0-100 (e.g. 70)", type: "number", required: false },
            { key: "riskAppetite", label: "Risk Appetite (low, medium, high), shorthand for confidence", type: "string", required: false },
            { key: "endsWithinDays", label: "Market ends within N days (e.g. 7 for this week, 30 for this month)", type: "number", required: false },
            { key: "endsBefore", label: "Market must end before this date (ISO format)", type: "string", required: false },
            { key: "minVolume", label: "Minimum total volume in USD (e.g. 10000)", type: "number", required: false },
            { key: "minVolume24h", label: "Minimum 24h volume in USD", type: "number", required: false },
            { key: "minLiquidity", label: "Minimum liquidity in USD", type: "number", required: false },
            { key: "minMargin", label: "Minimum profit margin % (e.g. 20 = at least 20% upside)", type: "number", required: false },
            { key: "sentiment", label: "AI sentiment filter (bullish or bearish)", type: "string", required: false },
            { key: "trendingOnly", label: "Only trending markets", type: "boolean", required: false },
            { key: "hotOnly", label: "Only hot/popular markets", type: "boolean", required: false },
            { key: "sortBy", label: "Sort by: confidence, volume, margin, end_date, liquidity, trending, newest", type: "string", required: false },
        ],
        preferConversationalInput: true,
        personality: `You are a data-driven prediction market analyst. You lead with numbers, probabilities, and patterns. You are neutral, not hype, not fear. Speak concisely with trader precision.

FLOW:
1. First message: ASK what kind of markets they want. "What are you looking for? High-margin crypto bets ending this week? Safe political plays? Tell me your filters: category, timeframe, risk level, and I'll surface the top 3."
2. Extract filters from their response: category, time window, volume, margin, sentiment, etc.
3. After showing 3 markets: "Want to adjust filters, see more, or pick one to trade?"
4. On budget: compute allocation and show confirmation.
5. No filler phrases. Get to the data.`,
    },
    {
        id: 'super-image-gen',
        agentId: 'super-image-gen',
        name: 'SuperImageGen',
        route: '/api/new-agents/image-generation/',
        description: 'AI-powered image generation with prompt enhancement, style analysis, and IPFS storage.',
        bodyParams: [
            { key: 'prompt', label: "Image Prompt", type: 'string', required: true },
            { key: 'model', label: "Quality Tier", type: 'string', required: false },
            { key: 'aspectRatio', label: "Aspect Ratio", type: 'string', required: false },
            { key: 'enhancePrompt', label: "Enhance Prompt", type: 'boolean', required: false }
        ],
        preferConversationalInput: true,
        personality: "You are a visionary digital artist and creative director. You are enthusiastic, imaginative, and encouraging. You love details, aesthetics, and bringing ideas to life. You use emojis and colorful language.",
    },
    {
        id: 'defi-yield',
        agentId: 'defi-yield',
        name: 'DeFi Yield Scanner',
        route: '/api/new-agents/defi-yield/',
        description: 'Get the best yield opportunities on Base. Real-time APY data (DeFiLlama) + deterministic risk scoring + optional LLM insights.',
        bodyParams: [
            { key: 'minTvl', label: "Minimum TVL (USD)", type: 'number', required: false },
            { key: 'minApy', label: "Minimum APY %", type: 'number', required: false },
            { key: 'stablecoinOnly', label: "Stablecoins Only", type: 'boolean', required: false },
            { key: 'riskTolerance', label: "Risk Tolerance (low/medium/high)", type: 'string', required: false },
            { key: 'target', label: "Target (stable/balanced/max_yield)", type: 'string', required: false },
        ],
        personality: "You are a sharp Base DeFi analyst obsessed with yield optimization. Assume the user wants Base mainnet unless they explicitly say otherwise (do NOT ask what chain). You speak in numbers and tradeoffs. You balance greed with risk management. 'APY is king, but TVL is queen' is your mantra.",
        preferConversationalInput: true,
    },
    {
        id: 'defi-agent',
        agentId: 'defi-agent',
        name: 'DeFi Agent',
        route: '/api/new-agents/defi-agent/',
        description: 'Full DeFi capabilities via LI.FI: swap tokens (e.g. "swap 100 USDC to ETH"), cross-chain bridge (e.g. "bridge 50 USDC from Base to Arbitrum"), token prices (e.g. "price of ETH"), list tokens on any chain, show supported chains. Covers Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC and 35+ chains.',
        bodyParams: [
            { key: 'intent', label: "What do you want to do?", type: 'string', required: false },
            { key: 'chainId', label: "Chain ID", type: 'number', required: false },
            { key: 'toChainId', label: "Destination Chain ID", type: 'number', required: false },
        ],
        personality: "You are an expert DeFi trader and liquidity manager. You combine deep protocol knowledge with practical execution. You always show the user what they're getting before executing. You speak concisely with data-driven recommendations. Safety first: always warn about price impact and slippage.",
        preferConversationalInput: true,
    },
    {
        id: 'wallet-intelligence',
        agentId: 'wallet-intelligence',
        name: 'Wallet Intelligence',
        route: '/api/new-agents/wallet-intelligence/',
        description: 'Comprehensive multi-chain wallet analysis with NFT portfolio tracking, DeFi position monitoring, portfolio optimization, and security risk assessment across Base and Polygon.',
        bodyParams: [
            { key: 'walletAddress', label: "Wallet Address", type: 'string', required: true },
            { key: 'chains', label: "Chains (optional: base, polygon)", type: 'string', required: false },
            { key: 'depth', label: "Analysis Depth (quick/standard)", type: 'string', required: false },
            { key: 'includeLLM', label: "Include AI Profile", type: 'boolean', required: false },
        ],
        preferConversationalInput: true,
        personality: "You are a senior blockchain portfolio analyst with expertise in DeFi, NFTs, and risk management. You provide comprehensive, data-driven insights with specific, actionable recommendations. You speak authoritatively but accessibly, like a Bloomberg Terminal meets Coinbase. You excel at identifying concentration risk, security threats, and optimization opportunities. Every wallet has a story, and you decode it with precision.",
    },
    {
        id: 'morpho-lend',
        agentId: 'morpho-lend',
        name: 'Morpho Lending',
        route: '/api/new-agents/morpho-lend/',
        description: 'Morpho Protocol lending vaults on Base. Supply USDC or WETH into curated MetaMorpho vaults. List vaults with APY/TVL, get vault details, deposit, withdraw, check positions. Covers Moonwell, Gauntlet, Steakhouse curators.',
        bodyParams: [
            { key: 'intent', label: "What do you want to do?", type: 'string', required: false },
            { key: 'vaultAddress', label: "Vault Address", type: 'string', required: false },
            { key: 'amount', label: "Amount", type: 'string', required: false },
            { key: 'asset', label: "Asset (USDC or WETH)", type: 'string', required: false },
        ],
        preferConversationalInput: true,
        personality: `You are a sharp DeFi lending specialist focused on Morpho Protocol. You know every vault, every curator, every APY detail. You speak in concise, data-driven language. You always show why a vault is worth considering: curator reputation, TVL depth, APY breakdown, fee structure. You recommend based on the user's risk profile and goals. "Capital efficiency is the game, and Morpho plays it better than most."`,
    },
]

/**
 * 1) Router: decide which endpoint to call based on the message.
 * Uses keywords from AGENT_ENDPOINTS rules.
 */
export interface RouteDecision {
    endpoint: AgentEndpoint;
    reason: string;
}

export interface AgentEndpoint {
    id: string;
    agentId: AgentId;
    name: string;
    route: string;
    description: string;
    bodyParams: BodyParams[];
    preferConversationalInput?: boolean;
    personality?: string;
}

export interface BodyParams {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
}

/**
 * X402 Payment Required Response
 */
export interface X402PaymentRequired {
    isPaymentRequired: true;
    paymentRequest: {
        amount: string;
        token: string;
        recipient: string;
        chainId: number;
        description?: string;
    };
    agentId: string;
    agentName: string;
    originalParams: Record<string, any>;
}