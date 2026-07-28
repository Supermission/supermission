import {
  AuditFinding,
  AuditVerdict,
  OZComplianceReport,
  RiskLevel,
  AuditRecommendation,
} from "../types";
import { computeAuditScore, getRiskLevel, calculateConfidence } from "./auditScore";

interface VerdictInput {
  findings: AuditFinding[];
  ozCompliance: OZComplianceReport;
  sourceCodeLength: number;
  analyzersCompleted: number;
  totalAnalyzers: number;
}

/**
 * Build the overall audit verdict
 */
export function buildVerdict(input: VerdictInput): AuditVerdict {
  const { findings, ozCompliance, sourceCodeLength, analyzersCompleted, totalAnalyzers } = input;

  // Count findings by severity
  const criticalCount = findings.filter(f => f.severity === "CRITICAL").length;
  const highCount = findings.filter(f => f.severity === "HIGH").length;
  const mediumCount = findings.filter(f => f.severity === "MEDIUM").length;
  const lowCount = findings.filter(f => f.severity === "LOW").length;

  // Calculate audit score
  const auditScore = computeAuditScore(findings, ozCompliance);

  // Determine risk level
  const overall: RiskLevel = getRiskLevel(auditScore, findings);

  // Calculate confidence
  const confidence = calculateConfidence(
    findings,
    sourceCodeLength,
    analyzersCompleted,
    totalAnalyzers
  );

  // Determine recommendation
  const recommendation = getRecommendation(overall, criticalCount, highCount);

  // Generate summary
  const summary = generateSummary(overall, criticalCount, highCount, mediumCount, auditScore);

  // Build key factors
  const keyFactors = buildKeyFactors(
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    ozCompliance,
    findings
  );

  return {
    overall,
    confidence,
    recommendation,
    summary,
    keyFactors,
    auditScore,
  };
}

/**
 * Get deployment recommendation based on risk level
 */
function getRecommendation(
  riskLevel: RiskLevel,
  criticalCount: number,
  highCount: number
): AuditRecommendation {
  if (criticalCount > 0) {
    return "AVOID";
  }

  if (highCount >= 3) {
    return "WARNING";
  }

  if (highCount >= 1) {
    return "CAUTION";
  }

  if (riskLevel === "LOW") {
    return "SAFE";
  }

  return "CAUTION";
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  riskLevel: RiskLevel,
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  auditScore: number
): string {
  if (criticalCount > 0) {
    return `This contract has ${criticalCount} CRITICAL vulnerabilit${criticalCount === 1 ? 'y' : 'ies'} that must be fixed before deployment. The contract is not safe for production use in its current state.`;
  }

  if (highCount > 0) {
    return `This contract has ${highCount} HIGH severity issue${highCount === 1 ? '' : 's'} that should be addressed. Review and fix these issues before deployment.`;
  }

  if (mediumCount > 0) {
    return `This contract has ${mediumCount} MEDIUM severity issue${mediumCount === 1 ? '' : 's'}. While not critical, these should be reviewed and fixed for better security.`;
  }

  if (auditScore >= 90) {
    return "This contract follows security best practices with no significant issues found. It appears safe for deployment.";
  }

  if (auditScore >= 70) {
    return "This contract is generally well-written with minor issues. Consider addressing the low-severity findings for improved code quality.";
  }

  return "This contract has several areas that could be improved. Review the findings and consider implementing the suggested changes.";
}

/**
 * Build key factors for the verdict
 */
function buildKeyFactors(
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  lowCount: number,
  ozCompliance: OZComplianceReport,
  findings: AuditFinding[]
): string[] {
  const factors: string[] = [];

  // Issue counts
  if (criticalCount > 0) {
    factors.push(`${criticalCount} critical vulnerabilit${criticalCount === 1 ? 'y' : 'ies'} detected`);
  }

  if (highCount > 0) {
    factors.push(`${highCount} high severity issue${highCount === 1 ? '' : 's'} found`);
  }

  if (mediumCount > 0) {
    factors.push(`${mediumCount} medium severity issue${mediumCount === 1 ? '' : 's'} identified`);
  }

  if (lowCount > 0) {
    factors.push(`${lowCount} low severity or informational finding${lowCount === 1 ? '' : 's'}`);
  }

  // OZ compliance
  if (ozCompliance.complianceScore >= 80) {
    factors.push(`Good OpenZeppelin compliance (${ozCompliance.complianceScore}%)`);
  } else if (ozCompliance.complianceScore >= 50) {
    factors.push(`Moderate OpenZeppelin compliance (${ozCompliance.complianceScore}%)`);
  } else {
    factors.push(`Low OpenZeppelin compliance - security patterns recommended`);
  }

  // Check for specific patterns
  const hasReentrancyGuard = ozCompliance.implementedPatterns.some(p => p.name === "ReentrancyGuard");
  const hasAccessControl = ozCompliance.implementedPatterns.some(p =>
    p.name === "Ownable" || p.name === "AccessControl"
  );

  if (!hasReentrancyGuard && findings.some(f => f.title.includes("Reentrancy"))) {
    factors.push("Missing reentrancy protection");
  }

  if (!hasAccessControl) {
    factors.push("No standard access control pattern detected");
  }

  // Security analysis results
  const securityFindings = findings.filter(f => f.category === "SECURITY");
  if (securityFindings.length === 0) {
    factors.push("No security vulnerabilities detected");
  }

  // Ensure we have at least 6 factors
  while (factors.length < 6) {
    if (factors.length === 5) {
      factors.push(`Total of ${findings.length} finding${findings.length === 1 ? '' : 's'} from automated analysis`);
    } else {
      break;
    }
  }

  return factors.slice(0, 6);
}
