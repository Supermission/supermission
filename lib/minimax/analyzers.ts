import { minimaxCompletionJSON } from './client';
import { Address } from 'viem';

// Types
export interface TokenAnalysis {
  riskScore: number; // 0-100 (0 = safe, 100 = extremely risky)
  verdict: 'BUY' | 'HOLD' | 'SELL' | 'AVOID';
  confidence: number; // 0-100
  strengths: string[];
  risks: string[];
  securityIssues: string[];
  recommendation: string;
  summary: string;
}

export interface WalletAnalysis {
  riskScore: number; // 0-100
  profile: string; // "DeFi Trader", "Long-term Holder", "Whale", etc.
  diversificationScore: number; // 0-100
  concentrationRisk: string; // "Low", "Medium", "High"
  topRecommendations: string[];
  securityAlerts: string[];
  portfolioHealth: string;
  summary: string;
}

export interface SentimentAnalysis {
  overallScore: number; // 0-100 (0 = very bearish, 100 = very bullish)
  signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number; // 0-100
  trend: 'rising' | 'falling' | 'stable';
  factors: {
    social: number;
    market: number;
    technical: number;
  };
  reasoning: string;
  timeframe: '24h' | '7d' | '30d';
}

export interface YieldStrategy {
  strategy: string; // "Conservative Income", "Balanced Growth", "Aggressive Yield"
  expectedAPY: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: {
    protocol: string;
    action: string; // "Deposit X USDC into Aave"
    apy: number;
    risk: string;
    reason: string;
  }[];
  implementation: string[]; // Step-by-step guide
  estimatedReturn: string; // "Estimated $X-$Y per year"
}

// Token Analysis
export async function analyzeToken(
  tokenAddress: Address,
  chainId: number,
  tokenData: any // From CoinGecko/QuickNode
): Promise<TokenAnalysis> {
  const systemPrompt = `You are a professional crypto security analyst. Analyze tokens for investment risk, security issues, and provide actionable recommendations.`;

  const userMessage = `Analyze this token and provide risk assessment:

Token: ${tokenData.symbol || 'Unknown'} (${tokenData.name || 'Unknown'})
Chain: ${chainId}
Address: ${tokenAddress}
Price: $${tokenData.priceUSD || tokenData.current_price || 'Unknown'}
Market Cap: $${tokenData.marketCap || tokenData.market_cap || 'Unknown'}
24h Volume: $${tokenData.volume24h || tokenData.total_volume || 'Unknown'}
24h Change: ${tokenData.priceChange24h || tokenData.price_change_percentage_24h || 0}%
Liquidity: $${tokenData.liquidity || 'Unknown'}

Provide analysis in this JSON format:
{
  "riskScore": number (0-100, higher = riskier),
  "verdict": "BUY" or "HOLD" or "SELL" or "AVOID",
  "confidence": number (0-100),
  "strengths": ["strength 1", "strength 2"],
  "risks": ["risk 1", "risk 2"],
  "securityIssues": ["issue 1" or "None identified"],
  "recommendation": "specific action to take",
  "summary": "2-3 sentence overview"
}

Consider:
- Liquidity depth (low liquidity = high risk)
- Volume/Market Cap ratio (low = manipulation risk)
- Price volatility
- Known security issues
- Market conditions`;

  try {
    return await minimaxCompletionJSON<TokenAnalysis>(systemPrompt, userMessage);
  } catch (error) {
    console.error('[Minimax] Token analysis error:', error);
    throw new Error('Failed to analyze token');
  }
}

// Wallet Analysis
export async function analyzeWallet(
  address: Address,
  portfolioData: any // From wallet overview API
): Promise<WalletAnalysis> {
  const systemPrompt = `You are a DeFi portfolio advisor. Analyze wallet holdings and provide risk assessment and optimization recommendations.`;

  const totalValue = portfolioData.summary?.totalPortfolioUSD || 0;
  const tokenCount = portfolioData.summary?.totalTokenCount || 0;
  const chainCount = portfolioData.summary?.totalChains || 0;

  const topHoldings = (portfolioData.tokens || [])
    .slice(0, 5)
    .map((t: any) => {
      const tokenValue = t.balanceUSD || 0;
      const percentage = totalValue > 0 ? ((tokenValue / totalValue) * 100).toFixed(1) : '0.0';
      return `- ${t.symbol}: $${tokenValue.toFixed(2)} (${percentage}%)`;
    })
    .join('\n');

  const userMessage = `Analyze this crypto wallet:

Address: ${address}
Total Value: $${totalValue.toFixed(2)}
Holdings: ${tokenCount} tokens
Chains: ${chainCount}

Top Holdings:
${topHoldings || '- No holdings found'}

Provide analysis in JSON:
{
  "riskScore": number (0-100),
  "profile": "wallet type (DeFi Trader, HODLer, Whale, etc.)",
  "diversificationScore": number (0-100, 100 = well diversified),
  "concentrationRisk": "Low" or "Medium" or "High",
  "topRecommendations": ["rec 1", "rec 2", "rec 3"],
  "securityAlerts": ["alert 1" or "None"],
  "portfolioHealth": "Excellent" or "Good" or "Fair" or "Poor",
  "summary": "2-3 sentence overview"
}`;

  try {
    return await minimaxCompletionJSON<WalletAnalysis>(systemPrompt, userMessage);
  } catch (error) {
    console.error('[Minimax] Wallet analysis error:', error);
    throw new Error('Failed to analyze wallet');
  }
}

// Sentiment Analysis
export async function analyzeSentiment(
  symbol: string,
  marketData: any
): Promise<SentimentAnalysis> {
  const systemPrompt = `You are a crypto market analyst. Analyze market sentiment and provide trading signals.`;

  const userMessage = `Analyze market sentiment for ${symbol}:

Price: $${marketData.priceUSD || marketData.current_price || 'Unknown'}
24h Change: ${marketData.priceChange24h || marketData.price_change_percentage_24h || 0}%
7d Change: ${marketData.priceChange7d || marketData.price_change_percentage_7d || 'N/A'}%
Market Cap: $${marketData.marketCap || marketData.market_cap || 'N/A'}
Volume 24h: $${marketData.volume24h || marketData.total_volume || 'N/A'}

Provide sentiment analysis in JSON:
{
  "overallScore": number (0-100, 0=bearish, 100=bullish),
  "signal": "STRONG_BUY" or "BUY" or "NEUTRAL" or "SELL" or "STRONG_SELL",
  "confidence": number (0-100),
  "trend": "rising" or "falling" or "stable",
  "factors": {
    "social": number (0-100),
    "market": number (0-100),
    "technical": number (0-100)
  },
  "reasoning": "explanation of the signal",
  "timeframe": "24h" or "7d" or "30d"
}`;

  try {
    return await minimaxCompletionJSON<SentimentAnalysis>(systemPrompt, userMessage);
  } catch (error) {
    console.error('[Minimax] Sentiment analysis error:', error);
    throw new Error('Failed to analyze sentiment');
  }
}

// Yield Strategy Generator
export async function generateYieldStrategy(
  portfolioData: any,
  yieldPools: any[],
  riskTolerance: 'conservative' | 'balanced' | 'aggressive'
): Promise<YieldStrategy> {
  const systemPrompt = `You are a DeFi yield farming expert. Generate personalized yield strategies based on portfolio and risk tolerance.`;

  const totalValue = portfolioData.summary?.totalPortfolioUSD || 0;

  const topHoldings = (portfolioData.tokens || [])
    .slice(0, 5)
    .map((t: any) => `- ${t.symbol}: $${(t.balanceUSD || 0).toFixed(2)}`)
    .join('\n');

  const topPools = yieldPools
    .slice(0, 5)
    .map(p => {
      const tvl = p.tvlUsd ? (p.tvlUsd / 1e6).toFixed(1) : 'N/A';
      return `- ${p.project} (${p.chain}): ${(p.apy || 0).toFixed(2)}% APY, $${tvl}M TVL, ${p.symbol}`;
    })
    .join('\n');

  const userMessage = `Generate yield strategy for this portfolio:

Total Value: $${totalValue.toFixed(2)}
Risk Tolerance: ${riskTolerance}

Top Holdings:
${topHoldings || '- No holdings found'}

Available Yield Pools (top 5):
${topPools || '- No pools available'}

Provide strategy in JSON:
{
  "strategy": "strategy name",
  "expectedAPY": number,
  "riskLevel": "low" or "medium" or "high",
  "recommendations": [
    {
      "protocol": "name",
      "action": "specific action with amounts",
      "apy": number,
      "risk": "low" or "medium" or "high",
      "reason": "why this opportunity"
    }
  ],
  "implementation": ["step 1", "step 2", "step 3"],
  "estimatedReturn": "Estimated $X-$Y per year"
}`;

  try {
    return await minimaxCompletionJSON<YieldStrategy>(systemPrompt, userMessage);
  } catch (error) {
    console.error('[Minimax] Yield strategy error:', error);
    throw new Error('Failed to generate yield strategy');
  }
}
