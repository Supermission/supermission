/**
 * Pashov Analyzer
 * Implements Pashov's parallel 4-vector attack surface scanning methodology.
 * Runs 4 parallel OpenRouter AI calls, each targeting a specific attack vector.
 */

import { chatCompletionJSON } from '@/lib/openrouter/client';
import type { AuditFinding, IssueSeverity, IssueCategory } from '../types';

const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';

interface PashovRawFinding {
  title: string;
  description: string;
  severity: string;
  location: string;
  confidence: number;
  recommendation: string;
}

interface PashovAgentResult {
  findings: PashovRawFinding[];
}

export interface PashovReport {
  findings: AuditFinding[];
  vectorCoverage: string[];
  totalRaw: number;
}

const VECTORS = [
  {
    name: 'access-control',
    label: 'Access Control & Authorization',
    prompt: `You are a smart contract security expert specializing in access control vulnerabilities.
Analyze the provided Solidity contract for:
- Missing or incorrect access modifiers (onlyOwner, onlyRole, etc.)
- Privilege escalation paths
- Unprotected admin functions
- Improper role management and role separation
- msg.sender checks that can be bypassed
- Constructor ownership issues
- Delegatecall privilege abuse

Return a JSON object: { "findings": [ { "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "confidence": number (0-1), "recommendation": string } ] }
If no issues found for a category, return an empty array. Be precise and avoid false positives.`,
  },
  {
    name: 'reentrancy',
    label: 'Reentrancy & External Calls',
    prompt: `You are a smart contract security expert specializing in reentrancy and external call vulnerabilities.
Analyze the provided Solidity contract for:
- Classic reentrancy (state updated after external call)
- Cross-function reentrancy
- Cross-contract reentrancy
- Read-only reentrancy
- Pull-payment pattern violations
- Unchecked return values from external calls
- Flash loan callback reentrancy
- Dangerous use of .call(), .delegatecall(), .send()

Return a JSON object: { "findings": [ { "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "confidence": number (0-1), "recommendation": string } ] }
If no issues found, return empty array. Be precise.`,
  },
  {
    name: 'arithmetic',
    label: 'Arithmetic & Precision',
    prompt: `You are a smart contract security expert specializing in arithmetic vulnerabilities.
Analyze the provided Solidity contract for:
- Integer overflow and underflow (pre-0.8.x contracts especially)
- Division before multiplication (precision loss)
- Rounding errors in fee calculations
- Incorrect decimal scaling
- Unsafe type casting (e.g., uint256 → uint128)
- Unchecked blocks hiding overflows
- Price manipulation via integer math
- Modulo operations on untrusted input

Return a JSON object: { "findings": [ { "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "confidence": number (0-1), "recommendation": string } ] }
If no issues found, return empty array. Be precise.`,
  },
  {
    name: 'business-logic',
    label: 'Business Logic & Economic Exploits',
    prompt: `You are a smart contract security expert specializing in business logic and economic vulnerabilities.
Analyze the provided Solidity contract for:
- Logic flaws that violate the contract's intended invariants
- Economic exploits (sandwich attacks, MEV, price oracle manipulation)
- Flash loan attack vectors
- Spec violations (e.g., ERC20/ERC721 non-compliance)
- Incorrect state machine transitions
- Front-running opportunities
- Griefing vectors (DoS, gas griefing)
- Timestamp or block number manipulation
- Improper slippage or deadline enforcement in DeFi

Return a JSON object: { "findings": [ { "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "confidence": number (0-1), "recommendation": string } ] }
If no issues found, return empty array. Be precise.`,
  },
];

function normalizeSeverity(raw: string): IssueSeverity {
  const s = raw?.toUpperCase();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  if (s === 'MEDIUM') return 'MEDIUM';
  if (s === 'LOW') return 'LOW';
  return 'INFORMATIONAL';
}

function vectorToCategory(vectorName: string): IssueCategory {
  if (vectorName === 'access-control') return 'SECURITY';
  if (vectorName === 'reentrancy') return 'SECURITY';
  if (vectorName === 'arithmetic') return 'SECURITY';
  if (vectorName === 'business-logic') return 'LOGIC';
  return 'SECURITY';
}

function rawToAuditFinding(
  raw: PashovRawFinding,
  vectorName: string,
  idx: number
): AuditFinding {
  return {
    id: `pashov-${vectorName}-${idx}`,
    severity: normalizeSeverity(raw.severity),
    category: vectorToCategory(vectorName),
    title: raw.title || 'Unnamed finding',
    description: raw.description || '',
    location: { code: raw.location || undefined },
    recommendation: raw.recommendation || '',
    source: 'pashov',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.7,
  } as AuditFinding & { source: string; confidence: number };
}

function deduplicateByRootCause(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Map<string, AuditFinding & { confidence?: number }>();

  for (const f of findings) {
    const key = f.title.toLowerCase().replace(/\s+/g, '-').substring(0, 40);
    const existing = seen.get(key) as (AuditFinding & { confidence?: number }) | undefined;
    if (!existing) {
      seen.set(key, f as AuditFinding & { confidence?: number });
    } else {
      // Keep the higher confidence one
      const existingConf = existing.confidence ?? 0;
      const newConf = (f as AuditFinding & { confidence?: number }).confidence ?? 0;
      if (newConf > existingConf) {
        seen.set(key, f as AuditFinding & { confidence?: number });
      }
    }
  }

  // Sort by confidence descending
  return Array.from(seen.values()).sort(
    (a, b) => ((b as AuditFinding & { confidence?: number }).confidence ?? 0) - ((a as AuditFinding & { confidence?: number }).confidence ?? 0)
  );
}

/**
 * Run Pashov 4-vector parallel scan on a Solidity contract.
 */
export async function runPashovAnalyzer(
  sourceCode: string,
  model: string = DEFAULT_MODEL
): Promise<PashovReport> {
  console.log('[PashovAnalyzer] Starting 4-vector parallel scan');

  const vectorPromises = VECTORS.map(async (vector) => {
    const userPrompt = `Analyze this Solidity contract for ${vector.label} vulnerabilities:\n\n\`\`\`solidity\n${sourceCode.substring(0, 50000)}\n\`\`\``;

    try {
      const result = await chatCompletionJSON<PashovAgentResult>(
        model,
        vector.prompt,
        userPrompt,
        { temperature: 0.1, max_tokens: 2000 }
      );

      const rawFindings: PashovRawFinding[] = Array.isArray(result?.findings) ? result.findings : [];
      return { vector: vector.name, findings: rawFindings };
    } catch (err) {
      console.error(`[PashovAnalyzer] Vector ${vector.name} failed:`, err);
      return { vector: vector.name, findings: [] };
    }
  });

  const results = await Promise.all(vectorPromises);

  // Flatten all findings
  const allFindings: AuditFinding[] = [];
  for (const { vector, findings } of results) {
    findings.forEach((raw, idx) => {
      allFindings.push(rawToAuditFinding(raw, vector, idx));
    });
  }

  const totalRaw = allFindings.length;
  const deduped = deduplicateByRootCause(allFindings);

  console.log(`[PashovAnalyzer] Completed: ${totalRaw} raw findings → ${deduped.length} after dedup`);

  return {
    findings: deduped,
    vectorCoverage: VECTORS.map(v => v.label),
    totalRaw,
  };
}
