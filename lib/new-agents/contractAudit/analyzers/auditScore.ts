import { AuditFinding, OZComplianceReport, RiskLevel } from "../types";

// Severity weights for score calculation
const SEVERITY_WEIGHTS = {
  CRITICAL: 40,
  HIGH: 25,
  MEDIUM: 10,
  LOW: 3,
  INFORMATIONAL: 1,
};

// Category weights for overall score
const CATEGORY_WEIGHTS: Record<string, number> = {
  SECURITY: 0.50,           // Security is most important
  OZ_COMPLIANCE: 0.15,      // OZ compliance adds safety
  BEST_PRACTICES: 0.10,     // Best practices matter
  GAS_OPTIMIZATION: 0.05,   // Gas is important but not critical
  LOGIC: 0.05,              // Logic issues (if any)
  UPGRADE_SAFETY: 0.05,     // Upgradeability concerns
  DEFI_RISK: 0.05,          // DeFi-specific risks
  TOKEN_COMPLIANCE: 0.05,   // Token standard compliance
};

/**
 * Compute overall audit score (0-100)
 */
export function computeAuditScore(
  findings: AuditFinding[],
  ozCompliance?: OZComplianceReport
): number {
  // Calculate base score starting from 100
  let baseScore = 100;

  // Deduct points based on findings
  for (const finding of findings) {
    const weight = SEVERITY_WEIGHTS[finding.severity] || 1;
    const categoryWeight = CATEGORY_WEIGHTS[finding.category] || 0.1;

    // Apply weighted penalty
    baseScore -= weight * categoryWeight * 0.5;
  }

  // Apply OZ compliance bonus/penalty
  if (ozCompliance) {
    const ozBonus = (ozCompliance.complianceScore - 50) / 10;  // -5 to +5 points
    baseScore += ozBonus;
  }

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, Math.round(baseScore)));
}

/**
 * Get risk level based on audit score and findings
 */
export function getRiskLevel(score: number, findings: AuditFinding[]): RiskLevel {
  // Critical findings always mean CRITICAL risk
  const criticalCount = findings.filter(f => f.severity === "CRITICAL").length;
  if (criticalCount > 0) {
    return "CRITICAL";
  }

  // High findings indicate HIGH risk
  const highCount = findings.filter(f => f.severity === "HIGH").length;
  if (highCount >= 3 || score < 40) {
    return "HIGH";
  }

  if (highCount >= 2 || score < 60) {
    return "HIGH";
  }

  // Medium threshold
  const mediumCount = findings.filter(f => f.severity === "MEDIUM").length;
  if (mediumCount >= 5 || score < 70) {
    return "MEDIUM";
  }

  // Otherwise LOW risk
  return "LOW";
}

/**
 * Calculate confidence level based on analysis coverage
 */
export function calculateConfidence(
  findings: AuditFinding[],
  sourceCodeLength: number,
  analyzersCompleted: number,
  totalAnalyzers: number
): number {
  let confidence = 1.0;

  // Reduce confidence if not all analyzers completed
  const analyzerRatio = analyzersCompleted / totalAnalyzers;
  confidence *= analyzerRatio;

  // Reduce confidence for very short contracts (might be incomplete)
  if (sourceCodeLength < 100) {
    confidence *= 0.5;
  } else if (sourceCodeLength < 500) {
    confidence *= 0.8;
  }

  // Reduce confidence for very complex contracts (might miss issues)
  if (sourceCodeLength > 5000) {
    confidence *= 0.9;
  }

  // Reduce confidence if many findings (might have false positives)
  const findingCount = findings.length;
  if (findingCount > 50) {
    confidence *= 0.8;
  } else if (findingCount > 30) {
    confidence *= 0.9;
  }

  // Minimum confidence
  return Math.max(0.3, Math.min(1.0, confidence));
}

/**
 * Get score breakdown by category
 */
export function getScoreBreakdown(findings: AuditFinding[]): Record<string, number> {
  const breakdown: Record<string, number> = {
    SECURITY: 100,
    OZ_COMPLIANCE: 100,
    BEST_PRACTICES: 100,
    GAS_OPTIMIZATION: 100,
    LOGIC: 100,
    UPGRADE_SAFETY: 100,
    DEFI_RISK: 100,
    TOKEN_COMPLIANCE: 100,
  };

  for (const finding of findings) {
    const weight = SEVERITY_WEIGHTS[finding.severity] || 1;
    breakdown[finding.category] = Math.max(0, breakdown[finding.category] - weight);
  }

  return breakdown;
}

/**
 * Get grade letter based on score
 */
export function getGradeLetter(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Calculate security-specific score
 */
export function calculateSecurityScore(findings: AuditFinding[]): number {
  const securityFindings = findings.filter(f => f.category === "SECURITY");

  let score = 100;

  for (const finding of securityFindings) {
    switch (finding.severity) {
      case "CRITICAL":
        score -= 50;
        break;
      case "HIGH":
        score -= 30;
        break;
      case "MEDIUM":
        score -= 15;
        break;
      case "LOW":
        score -= 5;
        break;
      default:
        score -= 1;
    }
  }

  return Math.max(0, score);
}

/**
 * Get detailed score metrics
 */
export function getDetailedScoreMetrics(
  findings: AuditFinding[],
  ozCompliance: OZComplianceReport
): {
  overall: number;
  security: number;
  bestPractices: number;
  gasEfficiency: number;
  ozCompliance: number;
  grade: string;
  riskLevel: RiskLevel;
} {
  const securityFindings = findings.filter(f => f.category === "SECURITY");
  const bpFindings = findings.filter(f => f.category === "BEST_PRACTICES");
  const gasFindings = findings.filter(f => f.category === "GAS_OPTIMIZATION");

  const securityScore = calculateCategoryScore(securityFindings);
  const bpScore = calculateCategoryScore(bpFindings);
  const gasScore = calculateCategoryScore(gasFindings);

  const overall = Math.round(
    securityScore * CATEGORY_WEIGHTS.SECURITY * 2 +
    bpScore * CATEGORY_WEIGHTS.BEST_PRACTICES * 2 +
    gasScore * CATEGORY_WEIGHTS.GAS_OPTIMIZATION * 2 +
    ozCompliance.complianceScore * CATEGORY_WEIGHTS.OZ_COMPLIANCE * 2
  );

  return {
    overall: Math.min(100, overall),
    security: securityScore,
    bestPractices: bpScore,
    gasEfficiency: gasScore,
    ozCompliance: ozCompliance.complianceScore,
    grade: getGradeLetter(overall),
    riskLevel: getRiskLevel(overall, findings),
  };
}

/**
 * Calculate score for a specific category
 */
function calculateCategoryScore(findings: AuditFinding[]): number {
  let score = 100;

  for (const finding of findings) {
    const weight = SEVERITY_WEIGHTS[finding.severity] || 1;
    score -= weight;
  }

  return Math.max(0, score);
}
