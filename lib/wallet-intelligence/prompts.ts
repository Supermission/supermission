/**
 * LLM Prompts for Wallet Intelligence
 * System and user prompts for generating AI-powered wallet profiles
 */

import type {
  ChainData,
  TokenBalance,
  NFTCollection,
  DeFiPosition,
  PortfolioAnalysis,
  RiskAnalysis,
  BehaviorAnalysis,
} from './types';

export const SYSTEM_PROMPT = `You are a senior blockchain analyst with expertise in DeFi, NFTs, and portfolio management. You have deep knowledge of crypto trading patterns, on-chain behavior, and wallet security.

Your task is to analyze wallet data and provide:
1. Clear wallet type classification
2. Comprehensive risk assessment (0-100 score, higher = safer)
3. Portfolio insights (diversification, concentration risk)
4. Security warnings (scam tokens, dangerous approvals)
5. Actionable, specific recommendations

## CRITICAL REQUIREMENTS ##

1. **Return ONLY valid JSON** - No markdown, no explanations, no text before/after JSON
2. **Match the exact schema** - All fields are required unless marked optional
3. **Be specific and actionable** - Don't say "consider diversifying", say "Reduce ETH from 80% to 60%"
4. **Use data-driven insights** - Reference actual numbers from the wallet
5. **Professional tone** - Bloomberg Terminal meets Coinbase (authoritative but accessible)

## OUTPUT SCHEMA ##

Return JSON matching this exact structure:

{
  "walletType": "whale|institutional|trader|defi_power_user|nft_collector|casual|dormant|new",
  "riskScore": <number 0-100>,
  "activityLevel": "very_high|high|medium|low|dormant",
  "estimatedPortfolioUSD": "<formatted string like $12,345.67>",
  "profile": {
    "summary": "<2-3 sentence narrative about the wallet>",
    "characteristics": ["<trait1>", "<trait2>", ...],
    "likelyBehavior": "<1-2 sentences about typical behavior patterns>",
    "notablePatterns": ["<pattern1>", "<pattern2>", ...]
  },
  "nftActivity": {
    "isNFTCollector": <boolean>,
    "behavior": "holder|flipper|minter|none",
    "collectionPreference": "blue-chip|emerging|mixed|none"
  },
  "defiActivity": {
    "isDefiUser": <boolean>,
    "estimatedProtocols": ["<protocol1>", ...],
    "activityPatterns": "<brief description>"
  },
  "portfolioInsights": {
    "diversificationScore": <number 0-100>,
    "concentrationRisk": "high|medium|low",
    "stablecoinRatio": <number 0-1>
  },
  "securityInsights": {
    "scamTokensDetected": <number>,
    "dangerousApprovals": <number>,
    "phishingRisk": "high|medium|low"
  },
  "recommendations": [
    {
      "category": "security|optimization|diversification|defi|gas",
      "priority": "high|medium|low",
      "action": "<specific action to take>",
      "reason": "<why this recommendation matters>"
    },
    ...
  ],
  "warnings": ["<warning1>", "<warning2>", ...]
}

## WALLET TYPE DEFINITIONS ##

- **whale**: Portfolio > $100k, large holder, market influence
- **institutional**: $50k+, multi-chain, professional management
- **trader**: High transaction count, frequent position changes
- **defi_power_user**: Active in 3+ protocols, yield farming, LP provision
- **nft_collector**: Significant NFT holdings (5+ or $5k+ value)
- **casual**: Moderate holdings, occasional activity
- **dormant**: Little to no recent activity, holding long-term
- **new**: < 5 transactions, small portfolio, learning phase

## ANALYSIS GUIDELINES ##

1. **Prioritize security warnings**: Unlimited approvals = HIGH priority always
2. **Be specific with numbers**: "Reduce ETH from 80% to 60%" not "diversify more"
3. **Compare to peers**: "Top 10% of Base users" or "Below average diversification"
4. **Identify opportunities**: "Staking could earn 4% APY" or "Tax loss harvest 20% down tokens"
5. **Flag concentration**: If top 3 holdings > 70%, HIGH concentration risk
6. **Praise good behavior**: If diversified well, acknowledge it

## RECOMMENDATION PRIORITIES ##

- **HIGH**: Security issues (approvals, phishing), extreme concentration (>70% in one asset)
- **MEDIUM**: Moderate concentration (>50%), low/high stablecoin ratio, protocol opportunities
- **LOW**: General optimization, gas savings, multi-chain expansion

## TONE EXAMPLES ##

✅ Good: "Reduce ETH allocation from 75% to 55% to decrease concentration risk. Portfolio is heavily exposed to ETH price movements."

❌ Bad: "You might want to think about diversifying your portfolio a bit more."

✅ Good: "Revoke unlimited USDC approval to 0x1234...5678 immediately using revoke.cash. This contract has full access to your tokens."

❌ Bad: "There are some security concerns you should look into."

Now analyze the wallet data and return your analysis as valid JSON.`;

/**
 * Build user message from wallet data
 */
export function buildUserMessage(
  walletAddress: string,
  chains: ChainData[],
  portfolioAnalysis: PortfolioAnalysis,
  riskAnalysis: RiskAnalysis,
  behaviorAnalysis: BehaviorAnalysis,
  totalValueUSD: number
): string {
  const sections: string[] = [];

  // Header
  sections.push(`# WALLET ANALYSIS REQUEST`);
  sections.push(`Address: ${walletAddress}`);
  sections.push(`Total Portfolio Value: $${totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  sections.push('');

  // Chain Summary
  sections.push(`## CHAIN ACTIVITY`);
  chains.forEach((chain) => {
    if (chain.totalValueUSD > 0) {
      sections.push(
        `- **${chain.chainName}**: $${chain.totalValueUSD.toLocaleString()} | ` +
        `${chain.transactionCount} txs | ` +
        `${chain.tokenBalances.length} tokens | ` +
        `${chain.nftCollections.length} NFT collections | ` +
        `${chain.defiPositions.length} DeFi positions`
      );
    }
  });
  sections.push('');

  // Token Holdings
  const allTokens = chains.flatMap((c) => c.tokenBalances);
  if (allTokens.length > 0) {
    sections.push(`## TOKEN HOLDINGS (${allTokens.length} tokens)`);
    const topTokens = allTokens.sort((a, b) => b.balanceUSD - a.balanceUSD).slice(0, 10);
    topTokens.forEach((token) => {
      const percentage = totalValueUSD > 0 ? (token.balanceUSD / totalValueUSD) * 100 : 0;
      sections.push(
        `- ${token.symbol}: ${token.balanceFormatted} ($${token.balanceUSD.toLocaleString()}, ${percentage.toFixed(1)}%)`
      );
    });
    if (allTokens.length > 10) {
      sections.push(`... and ${allTokens.length - 10} more tokens`);
    }
    sections.push('');
  }

  // NFT Holdings
  const allNFTs = chains.flatMap((c) => c.nftCollections);
  if (allNFTs.length > 0) {
    sections.push(`## NFT HOLDINGS (${allNFTs.length} collections)`);
    allNFTs.forEach((nft) => {
      const floorInfo = nft.floorPrice ? ` | Floor: $${nft.floorPrice}` : '';
      const valueInfo = nft.estimatedValue ? ` | Est. Value: $${nft.estimatedValue.toLocaleString()}` : '';
      const blueChipBadge = nft.isBlueChip ? ' 🔵 BLUE-CHIP' : '';
      sections.push(`- ${nft.name}: ${nft.tokenCount} NFTs${floorInfo}${valueInfo}${blueChipBadge}`);
    });
    sections.push('');
  }

  // DeFi Positions
  const allDeFi = chains.flatMap((c) => c.defiPositions);
  if (allDeFi.length > 0) {
    sections.push(`## DEFI POSITIONS (${allDeFi.length} positions)`);
    allDeFi.forEach((position) => {
      sections.push(
        `- ${position.protocol} ${position.type}: ${position.amount} ${position.asset} ($${position.valueUSD.toLocaleString()})`
      );
    });
    sections.push('');
  }

  // Portfolio Analysis
  sections.push(`## PORTFOLIO ANALYSIS`);
  sections.push(`- Diversification Score: ${portfolioAnalysis.diversificationScore}/100`);
  sections.push(`- Concentration Risk: ${portfolioAnalysis.concentrationRisk.toUpperCase()}`);
  sections.push(`- Stablecoin Ratio: ${(portfolioAnalysis.stablecoinRatio * 100).toFixed(1)}%`);
  if (portfolioAnalysis.topHoldings.length > 0) {
    sections.push(`- Top Holdings:`);
    portfolioAnalysis.topHoldings.forEach((holding) => {
      sections.push(`  - ${holding.asset}: ${holding.percentageOfPortfolio.toFixed(1)}% ($${holding.valueUSD.toLocaleString()})`);
    });
  }
  sections.push('');

  // Risk Analysis
  sections.push(`## RISK ANALYSIS`);
  sections.push(`- Overall Risk Score: ${riskAnalysis.overallScore}/100 (higher = safer)`);
  sections.push(`- Scam Tokens Detected: ${riskAnalysis.scamTokensDetected}`);
  sections.push(`- Dangerous Approvals: ${riskAnalysis.dangerousApprovals}`);
  sections.push(`- Phishing Risk: ${riskAnalysis.phishingRisk.toUpperCase()}`);
  if (riskAnalysis.warnings.length > 0) {
    sections.push(`- Warnings:`);
    riskAnalysis.warnings.forEach((warning) => {
      sections.push(`  - ${warning}`);
    });
  }
  sections.push('');

  // Behavior Analysis
  sections.push(`## BEHAVIOR ANALYSIS`);
  sections.push(`- Wallet Type: ${behaviorAnalysis.walletType.replace('_', ' ').toUpperCase()}`);
  sections.push(`- Activity Level: ${behaviorAnalysis.activityLevel.replace('_', ' ').toUpperCase()}`);
  sections.push(`- Is Whale: ${behaviorAnalysis.isWhale ? 'YES' : 'NO'}`);
  sections.push(`- Is NFT Collector: ${behaviorAnalysis.isNFTCollector ? 'YES' : 'NO'}`);
  sections.push(`- Is DeFi User: ${behaviorAnalysis.isDefiUser ? 'YES' : 'NO'}`);
  sections.push(`- Is Trader: ${behaviorAnalysis.isTrader ? 'YES' : 'NO'}`);
  sections.push(`- Cross-Chain Activity: ${behaviorAnalysis.crossChainActivity ? 'YES' : 'NO'}`);
  sections.push('');

  // Final instruction
  sections.push(`## INSTRUCTIONS`);
  sections.push(`Based on the above data, generate a comprehensive AI profile in JSON format.`);
  sections.push(`Remember: Return ONLY valid JSON matching the exact schema. No markdown, no extra text.`);

  return sections.join('\n');
}
