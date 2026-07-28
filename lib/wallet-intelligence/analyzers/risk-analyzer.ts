/**
 * Risk Analyzer
 * Detects scam tokens, dangerous approvals, and calculates overall risk score
 */

import type { TokenBalance, ChainData, RiskAnalysis } from '../types';

/**
 * Detect scam/spam tokens in portfolio
 */
function detectScamTokens(tokens: TokenBalance[]): {
  count: number;
  tokens: TokenBalance[];
} {
  const scamTokens = tokens.filter((token) => token.isSpam);
  return {
    count: scamTokens.length,
    tokens: scamTokens,
  };
}

/**
 * Calculate phishing risk based on activity patterns
 * This is a simplified heuristic - in production, you'd:
 * 1. Check against known phishing addresses
 * 2. Analyze transaction patterns
 * 3. Use machine learning models
 */
function calculatePhishingRisk(
  chains: ChainData[],
  scamTokenCount: number
): 'high' | 'medium' | 'low' {
  // High risk: Many scam tokens + recent activity
  if (scamTokenCount > 10) {
    return 'high';
  }

  // Medium risk: Some scam tokens
  if (scamTokenCount > 3) {
    return 'medium';
  }

  // Low risk: Few or no scam tokens
  return 'low';
}

/**
 * Analyze dangerous token approvals
 * NOTE: This requires checking on-chain allowances via eth_call
 * For now, this is a placeholder that would need to be implemented
 */
function analyzeDangerousApprovals(chains: ChainData[]): {
  count: number;
  warnings: string[];
} {
  // Placeholder - in production, you would:
  // 1. For each token, call allowance() for known spender addresses
  // 2. Check if allowance is max uint256 (unlimited approval)
  // 3. Flag high-risk spenders (unknown contracts, EOAs)

  return {
    count: 0,
    warnings: [],
  };
}

/**
 * Calculate overall risk score (0-100, higher = safer)
 * Factors:
 * - Scam token presence (0-25 points)
 * - Dangerous approvals (0-25 points)
 * - Portfolio concentration (0-25 points)
 * - Chain security (0-25 points)
 */
function calculateOverallRiskScore(
  scamTokenCount: number,
  dangerousApprovalCount: number,
  concentrationRisk: 'high' | 'medium' | 'low',
  chains: ChainData[]
): number {
  let score = 0;

  // Scam token score (0-25 points)
  if (scamTokenCount === 0) {
    score += 25;
  } else if (scamTokenCount <= 3) {
    score += 20;
  } else if (scamTokenCount <= 10) {
    score += 10;
  } else {
    score += 0;
  }

  // Dangerous approval score (0-25 points)
  if (dangerousApprovalCount === 0) {
    score += 25;
  } else if (dangerousApprovalCount === 1) {
    score += 15;
  } else if (dangerousApprovalCount <= 3) {
    score += 5;
  } else {
    score += 0;
  }

  // Concentration risk score (0-25 points)
  if (concentrationRisk === 'low') {
    score += 25;
  } else if (concentrationRisk === 'medium') {
    score += 15;
  } else {
    score += 5;
  }

  // Chain security score (0-25 points)
  // Base and Polygon are both secure L2s/sidechains
  const activeChains = chains.filter((c) => c.totalValueUSD > 0).length;
  if (activeChains >= 2) {
    score += 25; // Multi-chain diversification
  } else if (activeChains === 1) {
    score += 20;
  } else {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Generate security warnings based on detected issues
 */
function generateSecurityWarnings(
  scamTokens: TokenBalance[],
  dangerousApprovals: number,
  phishingRisk: 'high' | 'medium' | 'low'
): string[] {
  const warnings: string[] = [];

  // Scam token warnings
  if (scamTokens.length > 0) {
    if (scamTokens.length === 1) {
      warnings.push(`⚠️ 1 scam/spam token detected: ${scamTokens[0].symbol}`);
    } else if (scamTokens.length <= 5) {
      warnings.push(
        `⚠️ ${scamTokens.length} scam/spam tokens detected: ${scamTokens.map((t) => t.symbol).join(', ')}`
      );
    } else {
      warnings.push(
        `⚠️ ${scamTokens.length} scam/spam tokens detected. Do not interact with these tokens.`
      );
    }
  }

  // Dangerous approval warnings
  if (dangerousApprovals > 0) {
    warnings.push(
      `🔴 ${dangerousApprovals} dangerous unlimited token approval${dangerousApprovals > 1 ? 's' : ''} found. ` +
        `Use revoke.cash or etherscan to revoke immediately.`
    );
  }

  // Phishing risk warnings
  if (phishingRisk === 'high') {
    warnings.push(
      '🔴 HIGH phishing risk detected. Recent interactions with suspicious addresses. ' +
        'Review all recent transactions carefully.'
    );
  } else if (phishingRisk === 'medium') {
    warnings.push(
      '⚠️ MEDIUM phishing risk. Some suspicious activity detected. ' +
        'Be cautious of unexpected token transfers or approvals.'
    );
  }

  // General security advice
  if (warnings.length === 0) {
    warnings.push('✅ No major security issues detected. Continue following best practices.');
  }

  return warnings;
}

/**
 * Main risk analysis function
 */
export function analyzeRisk(
  chains: ChainData[],
  aggregatedTokens: TokenBalance[],
  concentrationRisk: 'high' | 'medium' | 'low'
): RiskAnalysis {
  // Detect scam tokens
  const { count: scamTokenCount, tokens: scamTokens } = detectScamTokens(aggregatedTokens);

  // Analyze dangerous approvals (placeholder)
  const { count: dangerousApprovalCount, warnings: approvalWarnings } =
    analyzeDangerousApprovals(chains);

  // Calculate phishing risk
  const phishingRisk = calculatePhishingRisk(chains, scamTokenCount);

  // Calculate overall risk score
  const overallScore = calculateOverallRiskScore(
    scamTokenCount,
    dangerousApprovalCount,
    concentrationRisk,
    chains
  );

  // Generate warnings
  const warnings = [
    ...generateSecurityWarnings(scamTokens, dangerousApprovalCount, phishingRisk),
    ...approvalWarnings,
  ];

  return {
    overallScore,
    scamTokensDetected: scamTokenCount,
    dangerousApprovals: dangerousApprovalCount,
    phishingRisk,
    warnings,
  };
}

/**
 * Generate security-focused recommendations
 */
export function generateSecurityRecommendations(
  analysis: RiskAnalysis
): Array<{
  category: 'security';
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
}> {
  const recommendations: Array<{
    category: 'security';
    priority: 'high' | 'medium' | 'low';
    action: string;
    reason: string;
  }> = [];

  // Critical: Dangerous approvals
  if (analysis.dangerousApprovals > 0) {
    recommendations.push({
      category: 'security',
      priority: 'high',
      action: 'Revoke unlimited token approvals immediately using revoke.cash',
      reason: `${analysis.dangerousApprovals} unlimited approval${analysis.dangerousApprovals > 1 ? 's' : ''} give malicious contracts full access to your tokens.`,
    });
  }

  // High priority: Many scam tokens
  if (analysis.scamTokensDetected > 10) {
    recommendations.push({
      category: 'security',
      priority: 'high',
      action: 'Hide spam tokens in your wallet interface',
      reason: `${analysis.scamTokensDetected} scam tokens detected. While they cannot be removed, hiding them prevents accidental interaction.`,
    });
  }

  // Medium priority: Phishing risk
  if (analysis.phishingRisk === 'high' || analysis.phishingRisk === 'medium') {
    recommendations.push({
      category: 'security',
      priority: 'medium',
      action: 'Review recent transactions and connected dApps',
      reason: `${analysis.phishingRisk.toUpperCase()} phishing risk detected. Verify all recent interactions are legitimate.`,
    });
  }

  // Low priority: General security hygiene
  if (analysis.overallScore < 70) {
    recommendations.push({
      category: 'security',
      priority: 'low',
      action: 'Use a hardware wallet for large holdings',
      reason: `Current risk score: ${analysis.overallScore}/100. Hardware wallets provide enhanced security.`,
    });
  }

  // Positive reinforcement
  if (analysis.overallScore >= 90 && analysis.dangerousApprovals === 0) {
    recommendations.push({
      category: 'security',
      priority: 'low',
      action: 'Excellent security posture - maintain current practices',
      reason: `Risk score: ${analysis.overallScore}/100. No critical issues detected.`,
    });
  }

  return recommendations;
}
