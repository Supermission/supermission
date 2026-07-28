/**
 * AI Report Generator
 * Uses OpenRouter to generate comprehensive audit reports from AI models
 * Designed to integrate seamlessly with pattern-based findings
 */

import { chatCompletionJSON } from '@/lib/openrouter/client';
import type { ContractAuditResponse, AIAuditReport, AuditFinding, NemesisReport, PashovReport } from '../types';

interface AIReportRequest {
  sourceCode: string;
  contractName: string;
  auditResult: ContractAuditResponse;
  selectedModel: string;
  nemesisReport?: NemesisReport;
  pashovReport?: PashovReport;
}

const AUDIT_SYSTEM_PROMPT = `You are an expert smart contract security auditor. Analyze the provided contract and automated findings to generate a concise, actionable audit report.

Your response must be valid JSON with this exact structure. Be specific and reference line numbers when possible.

Key requirements:
- executiveSummary: 2-3 sentences max. State the contract's purpose and critical risk level.
- detailedAnalysis: For each significant finding, provide "FINDING_TITLE: explanation" format so it can be matched to findings. Prioritize Nemesis and Pashov findings when present.
- securityRecommendations: Specific, actionable fixes. Start each with the function/issue name. Include any adversarial trigger sequences from Nemesis findings.
- gasOptimizationSuggestions: Practical gas savings. Be specific about what to change.
- codeQualityAssessment: 2-3 sentences on code structure and maintainability.
- complianceNotes: ERC compliance and OpenZeppelin usage assessment.
- overallAssessment: Final verdict in 1-2 sentences. Should the contract be deployed?`;

/**
 * Build concise analysis context from audit results
 */
function buildAnalysisContext(
  audit: ContractAuditResponse,
  nemesisReport?: NemesisReport,
  pashovReport?: PashovReport
): string {
  const { verdict, findings, ozCompliance, metadata } = audit;

  const criticalFindings = findings.filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
  );

  // Build a compact findings summary that the AI can reference
  const findingsSummary = findings
    .slice(0, 15) // Limit to top 15 findings
    .map((f) => `[${f.severity}${f.source ? `/${f.source}` : ''}] ${f.title} (L:${f.location.line || '?'}): ${f.description.slice(0, 100)}`)
    .join('\n');

  let deepAuditSection = '';

  if (nemesisReport && nemesisReport.findings.length > 0) {
    const triggerFindings = nemesisReport.findings.filter(f => f.triggerSequence);
    deepAuditSection += `
--- NEMESIS ANALYSIS ---
Feynman Suspects: ${nemesisReport.feynmanSuspects.slice(0, 5).join(', ') || 'none'}
State Gaps: ${nemesisReport.stateGaps.slice(0, 3).join(' | ') || 'none'}
Nemesis Findings (${nemesisReport.findings.length}):
${nemesisReport.findings.slice(0, 8).map(f => `- [${f.severity}] ${f.title}${f.triggerSequence ? ` | Trigger: ${f.triggerSequence.substring(0, 80)}` : ''}`).join('\n')}
Adversarial Trigger Sequences (${triggerFindings.length}):
${triggerFindings.slice(0, 3).map(f => `- ${f.title}: ${f.triggerSequence}`).join('\n') || 'None identified'}
`;
  }

  if (pashovReport && pashovReport.findings.length > 0) {
    deepAuditSection += `
--- PASHOV VECTOR SCAN ---
Vectors Covered: ${pashovReport.vectorCoverage.join(', ')}
High-Confidence Findings (${pashovReport.findings.filter(f => (f.confidence ?? 0) >= 0.7).length}/${pashovReport.findings.length}):
${pashovReport.findings.slice(0, 8).map(f => `- [${f.severity}] ${f.title} (conf: ${((f.confidence ?? 0) * 100).toFixed(0)}%)`).join('\n')}
`;
  }

  return `
Contract: ${metadata.name || 'Unknown'} | ${metadata.functionCount} functions | ${metadata.lineCount} lines
Compiler: ${metadata.pragmaVersion || 'Unknown'}
Risk: ${verdict.overall} | Score: ${verdict.auditScore}/100 | ${verdict.recommendation}

Critical/High Issues (${criticalFindings.length}):
${criticalFindings.map(f => `- ${f.title}: ${f.description.slice(0, 80)}...`).join('\n') || 'None'}

All Findings (${findings.length} total):
${findingsSummary}

OZ Compliance: ${ozCompliance.complianceScore}/100
Implemented: ${ozCompliance.implementedPatterns.map(p => p.name).join(', ') || 'None'}
Recommended: ${ozCompliance.recommendedPatterns.map(p => p.name).join(', ') || 'None'}
${deepAuditSection}`;
}

/**
 * Truncate source code intelligently
 */
function truncateSourceCode(code: string, maxChars: number): string {
  if (code.length <= maxChars) return code;

  const firstPartSize = Math.floor(maxChars * 0.65);
  const lastPartSize = Math.floor(maxChars * 0.25);

  const firstPart = code.substring(0, firstPartSize);
  const lastPart = code.substring(code.length - lastPartSize);

  return `${firstPart}\n\n// ... [truncated] ...\n\n${lastPart}`;
}

/**
 * Generate AI-enhanced audit report
 */
export async function generateAIAuditReport(
  request: AIReportRequest
): Promise<AIAuditReport> {
  const { sourceCode, contractName, auditResult, selectedModel, nemesisReport, pashovReport } = request;

  const analysisContext = buildAnalysisContext(auditResult, nemesisReport, pashovReport);
  const truncatedSource = truncateSourceCode(sourceCode, 12000);

  const userPrompt = `Analyze this smart contract and provide your expert assessment.

## Automated Analysis Summary:
${analysisContext}

## Source Code:
\`\`\`solidity
${truncatedSource}
\`\`\`

Respond with valid JSON:
{
  "executiveSummary": "Brief 2-3 sentence overview of contract purpose and security posture",
  "detailedAnalysis": "For each issue format as 'ISSUE_NAME: explanation'. Example: 'Reentrancy Vulnerability: The transfer function...'",
  "securityRecommendations": ["Fix 1 starting with function/issue name", "Fix 2", ...],
  "gasOptimizationSuggestions": ["Optimization 1", "Optimization 2", ...],
  "codeQualityAssessment": "2-3 sentences on code quality",
  "complianceNotes": "ERC and OZ compliance notes",
  "overallAssessment": "Final verdict: deploy or not?"
}`;

  console.log(`[AIReportGenerator] Generating report with ${selectedModel} for ${contractName}`);

  try {
    const response = await chatCompletionJSON<Omit<AIAuditReport, 'generatedBy' | 'generatedAt'>>(
      selectedModel,
      AUDIT_SYSTEM_PROMPT,
      userPrompt,
      {
        temperature: 0.2,
        max_tokens: 3000,
      }
    );

    console.log(`[AIReportGenerator] Successfully generated AI report`);

    return {
      ...response,
      generatedBy: selectedModel,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[AIReportGenerator] Failed to generate AI report:', error);

    return {
      executiveSummary: `AI analysis unavailable. Review the automated findings below.`,
      detailedAnalysis: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      securityRecommendations: ['Review automated security findings', 'Consider manual audit for critical issues'],
      gasOptimizationSuggestions: ['Review gas optimization findings'],
      codeQualityAssessment: 'Unable to assess - AI generation failed.',
      complianceNotes: 'Review compliance tab for OpenZeppelin analysis.',
      overallAssessment: 'Manual review recommended due to AI analysis failure.',
      generatedBy: selectedModel,
      generatedAt: new Date().toISOString(),
    };
  }
}
