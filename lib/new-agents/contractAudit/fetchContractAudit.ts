import {
  ContractAuditRequest,
  ContractAuditResponse,
  ContractMetadata,
  AuditFinding,
  SolhintReport,
} from "./types";

// Analyzers
import { analyzeSecurityIssues } from "./analyzers/securityAnalyzer";
import { analyzeGasOptimizations, buildGasReport } from "./analyzers/gasOptimizationAnalyzer";
import { analyzeBestPractices } from "./analyzers/bestPracticesAnalyzer";
import { analyzeOZCompliance, generateOZComplianceFindings } from "./analyzers/ozComplianceAnalyzer";
import { analyzeDeFiSecurity } from "./analyzers/defiSecurityAnalyzer";
import { analyzeTokenCompliance } from "./analyzers/tokenComplianceAnalyzer";
import { buildVerdict } from "./analyzers/verdict";
import { runPashovAnalyzer } from "./analyzers/pashovAnalyzer";
import { runNemesisAnalyzer } from "./analyzers/nemesisAnalyzer";

// Helpers
import { runSolhint, convertSolhintToFindings } from "./helpers/solhintRunner";

// Utils
import { sortBySeverity, deduplicateFindings, buildCategorySummary } from "./utils/issueClassifier";

/**
 * Main orchestrator for contract audit
 */
export async function fetchContractAudit(
  request: ContractAuditRequest
): Promise<ContractAuditResponse> {
  const { sourceCode, contractName, compilerVersion, deepAudit, selectedModel } = request;

  // 1. Validate input
  if (!sourceCode || sourceCode.trim().length === 0) {
    throw new Error("Source code is required");
  }

  const trimmedSource = sourceCode.trim();
  const sourceLines = trimmedSource.split('\n');

  // 2. Extract metadata
  const metadata = extractMetadata(trimmedSource, contractName, compilerVersion);

  // 3. Run all analyzers in parallel
  const TOTAL_ANALYZERS = deepAudit ? 9 : 7;
  let completedAnalyzers = 0;

  const baseAnalyzers = Promise.allSettled([
    runSolhint(trimmedSource).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeSecurityIssues(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeGasOptimizations(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeBestPractices(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeOZCompliance(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeDeFiSecurity(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
    Promise.resolve(analyzeTokenCompliance(trimmedSource)).then(r => { completedAnalyzers++; return r; }),
  ]);

  const deepAnalyzers = deepAudit
    ? Promise.allSettled([
        runPashovAnalyzer(trimmedSource, selectedModel).then(r => { completedAnalyzers++; return r; }),
        runNemesisAnalyzer(trimmedSource, selectedModel).then(r => { completedAnalyzers++; return r; }),
      ])
    : Promise.resolve([]);

  const [baseResults, deepResults] = await Promise.all([baseAnalyzers, deepAnalyzers]);

  const [
    solhintResults,
    securityResult,
    gasFindings,
    bestPracticesFindings,
    ozComplianceResult,
    defiSecurityResult,
    tokenComplianceResult,
  ] = baseResults;

  const [pashovResult, nemesisResult] = deepResults as [
    PromiseSettledResult<Awaited<ReturnType<typeof runPashovAnalyzer>>> | undefined,
    PromiseSettledResult<Awaited<ReturnType<typeof runNemesisAnalyzer>>> | undefined,
  ];

  // 4. Extract values from settled promises
  const solhint = solhintResults.status === "fulfilled" ? solhintResults.value : [];
  const security = securityResult.status === "fulfilled" ? securityResult.value : { passed: false, findings: [] };
  const gas = gasFindings.status === "fulfilled" ? gasFindings.value : [];
  const bestPractices = bestPracticesFindings.status === "fulfilled" ? bestPracticesFindings.value : [];
  const ozCompliance = ozComplianceResult.status === "fulfilled"
    ? ozComplianceResult.value
    : {
      version: "v5.x" as const,
      implementedPatterns: [],
      recommendedPatterns: [],
      complianceScore: 50,
      summary: "Unable to analyze OpenZeppelin compliance",
    };
  const defiSecurity = defiSecurityResult.status === "fulfilled" ? defiSecurityResult.value.findings : [];
  const tokenCompliance = tokenComplianceResult.status === "fulfilled" ? tokenComplianceResult.value.findings : [];

  // 5. Convert Solhint results to findings
  const solhintFindings = convertSolhintToFindings(solhint, sourceLines);

  // 6. Generate OZ compliance findings
  const ozFindings = generateOZComplianceFindings(ozCompliance, trimmedSource);

  // 6b. Extract deep audit findings
  const pashovFindings = pashovResult?.status === 'fulfilled' ? pashovResult.value.findings : [];
  const nemesisFindings = nemesisResult?.status === 'fulfilled' ? nemesisResult.value.findings : [];

  // 7. Combine all findings
  const allFindings: AuditFinding[] = [
    ...security.findings,
    ...solhintFindings,
    ...gas,
    ...bestPractices,
    ...ozFindings,
    ...defiSecurity,
    ...tokenCompliance,
    ...pashovFindings,
    ...nemesisFindings,
  ];

  // 8. Deduplicate and sort findings
  const deduped = deduplicateFindings(allFindings);
  const sortedFindings = sortBySeverity(deduped);

  // 9. Build category summary
  const categorySummary = buildCategorySummary(sortedFindings);

  // 10. Build gas report
  const gasReport = buildGasReport(sortedFindings);

  // 11. Build Solhint report summary
  const solhintReport: SolhintReport = {
    errors: solhint.filter(r => r.severity >= 2).length,
    warnings: solhint.filter(r => r.severity === 1).length,
    rules: Array.from(new Set(solhint.map(r => r.ruleId))),
    findings: solhintFindings,
  };

  // 12. Build verdict
  const verdict = buildVerdict({
    findings: sortedFindings,
    ozCompliance,
    sourceCodeLength: trimmedSource.length,
    analyzersCompleted: completedAnalyzers,
    totalAnalyzers: TOTAL_ANALYZERS,
  });

  // 13. Return response
  return {
    success: true,
    metadata,
    verdict,
    findings: sortedFindings,
    categorySummary,
    ozCompliance,
    gasReport,
    solhintReport,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Extract metadata from source code
 */
function extractMetadata(
  sourceCode: string,
  contractName?: string,
  compilerVersion?: string
): ContractMetadata {
  const lines = sourceCode.split('\n');

  // Extract pragma version
  const pragmaMatch = sourceCode.match(/pragma\s+solidity\s*([^;]+);/);
  const pragmaVersion = pragmaMatch ? pragmaMatch[1].trim() : undefined;

  // Extract SPDX license
  const licenseMatch = sourceCode.match(/\/\/\s*SPDX-License-Identifier:\s*(\S+)/);
  const licenseIdentifier = licenseMatch ? licenseMatch[1] : undefined;

  // Count contracts
  const contractMatches = sourceCode.match(/\b(contract|interface|library|abstract\s+contract)\s+\w+/g);
  const contractCount = contractMatches ? contractMatches.length : 0;

  // Extract contract name if not provided
  let detectedName = contractName;
  if (!detectedName) {
    const nameMatch = sourceCode.match(/contract\s+(\w+)/);
    detectedName = nameMatch ? nameMatch[1] : undefined;
  }

  // Count functions
  const functionMatches = sourceCode.match(/function\s+\w+\s*\(/g);
  const functionCount = functionMatches ? functionMatches.length : 0;

  // Check for special functions
  const hasConstructor = /constructor\s*\(/.test(sourceCode);
  const hasReceiveFunction = /receive\s*\(\s*\)\s*external\s+payable/.test(sourceCode);
  const hasFallbackFunction = /fallback\s*\(\s*\)/.test(sourceCode);

  // Extract imports
  const importMatches = Array.from(sourceCode.matchAll(/import\s+(?:.*\s+from\s+)?["']([^"']+)["']/g));
  const imports: string[] = [];
  for (const match of importMatches) {
    imports.push(match[1]);
  }

  // Extract inheritance
  const inheritanceMatch = sourceCode.match(/contract\s+\w+\s+is\s+([^{]+)/);
  const inherits: string[] = [];
  if (inheritanceMatch) {
    const inheritList = inheritanceMatch[1].split(',');
    for (const inherit of inheritList) {
      const name = inherit.trim().split(/\s*\(/)[0].trim();
      if (name) {
        inherits.push(name);
      }
    }
  }

  return {
    name: detectedName,
    compiler: compilerVersion,
    pragmaVersion,
    licenseIdentifier,
    contractCount,
    functionCount,
    lineCount: lines.length,
    hasConstructor,
    hasReceiveFunction,
    hasFallbackFunction,
    imports,
    inherits,
  };
}

/**
 * Quick security check (returns true if no critical issues)
 */
export async function quickSecurityCheck(sourceCode: string): Promise<boolean> {
  const result = await analyzeSecurityIssues(sourceCode);
  const critical = result.findings.filter(f => f.severity === "CRITICAL");
  return critical.length === 0;
}

/**
 * Get summary stats for the audit
 */
export function getAuditStats(response: ContractAuditResponse): {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  auditScore: number;
  riskLevel: string;
  recommendation: string;
} {
  const findings = response.findings;

  return {
    totalFindings: findings.length,
    criticalCount: findings.filter(f => f.severity === "CRITICAL").length,
    highCount: findings.filter(f => f.severity === "HIGH").length,
    mediumCount: findings.filter(f => f.severity === "MEDIUM").length,
    lowCount: findings.filter(f => f.severity === "LOW").length,
    infoCount: findings.filter(f => f.severity === "INFORMATIONAL").length,
    auditScore: response.verdict.auditScore,
    riskLevel: response.verdict.overall,
    recommendation: response.verdict.recommendation,
  };
}
