import { AuditFinding, IssueSeverity } from "../types";

interface SecurityAnalysisResult {
  passed: boolean;
  findings: AuditFinding[];
}

interface SecurityPattern {
  id: string;
  name: string;
  severity: IssueSeverity;
  pattern: RegExp;
  description: string;
  recommendation: string;
  swcId?: string;
  cweId?: string;
}

// Security vulnerability patterns
const SECURITY_PATTERNS: SecurityPattern[] = [
  // CRITICAL
  {
    id: "SEC-001",
    name: "Reentrancy Vulnerability",
    severity: "CRITICAL",
    pattern: /\.call\{value:\s*[^}]+\}\s*\([^)]*\)/g,
    description: "External call with value transfer detected. This pattern is vulnerable to reentrancy attacks if state changes occur after the call.",
    recommendation: "Use the checks-effects-interactions pattern. Update state before making external calls, or use OpenZeppelin's ReentrancyGuard.",
    swcId: "SWC-107",
    cweId: "CWE-841",
  },
  {
    id: "SEC-002",
    name: "tx.origin Authorization",
    severity: "CRITICAL",
    pattern: /require\s*\(\s*tx\.origin\s*==|if\s*\(\s*tx\.origin\s*==/g,
    description: "Using tx.origin for authorization is dangerous as it can be exploited through phishing attacks.",
    recommendation: "Use msg.sender instead of tx.origin for authorization checks.",
    swcId: "SWC-115",
    cweId: "CWE-477",
  },
  {
    id: "SEC-003",
    name: "Unprotected selfdestruct",
    severity: "CRITICAL",
    pattern: /selfdestruct\s*\(|suicide\s*\(/g,
    description: "selfdestruct can permanently destroy the contract. If not properly protected, anyone could destroy it.",
    recommendation: "Add proper access control (onlyOwner) or remove selfdestruct if not needed.",
    swcId: "SWC-106",
    cweId: "CWE-284",
  },
  // HIGH
  {
    id: "SEC-004",
    name: "Unchecked External Call Return",
    severity: "HIGH",
    pattern: /\.call\s*\{[^}]*\}\s*\([^)]*\)\s*;(?!\s*(?:require|if|assert|\(bool))/g,
    description: "External call return value is not checked. Failed calls will silently continue execution.",
    recommendation: "Always check the return value of low-level calls: (bool success, ) = addr.call{...}(...); require(success);",
    swcId: "SWC-104",
    cweId: "CWE-252",
  },
  {
    id: "SEC-005",
    name: "Unprotected Ether Withdrawal",
    severity: "HIGH",
    pattern: /function\s+withdraw[^{]*\{[^}]*(?:transfer|send|call\{value)[^}]*\}/gi,
    description: "Withdrawal function may lack proper access control, allowing anyone to withdraw funds.",
    recommendation: "Add access control modifiers (onlyOwner, onlyRole) to withdrawal functions.",
    swcId: "SWC-105",
    cweId: "CWE-284",
  },
  {
    id: "SEC-006",
    name: "Delegatecall to Untrusted Contract",
    severity: "HIGH",
    pattern: /\.delegatecall\s*\(/g,
    description: "delegatecall executes code in the context of the calling contract. Using it with untrusted addresses is dangerous.",
    recommendation: "Only use delegatecall with trusted, audited contracts. Consider using a whitelist of allowed targets.",
    swcId: "SWC-112",
    cweId: "CWE-829",
  },
  {
    id: "SEC-007",
    name: "DoS with Failed Call",
    severity: "HIGH",
    pattern: /for\s*\([^)]+\)\s*\{[^}]*(?:\.transfer\(|\.send\(|\.call\{value)/g,
    description: "External calls inside loops can cause DoS if one call fails, blocking all subsequent iterations.",
    recommendation: "Use pull-over-push pattern. Let users withdraw their funds individually instead of pushing to multiple addresses.",
    swcId: "SWC-113",
    cweId: "CWE-400",
  },
  // MEDIUM
  {
    id: "SEC-008",
    name: "Missing Function Visibility",
    severity: "MEDIUM",
    pattern: /function\s+\w+\s*\([^)]*\)\s*(?:returns\s*\([^)]*\))?\s*\{/g,
    description: "Function visibility is not explicitly declared. In older Solidity versions, this defaults to public.",
    recommendation: "Always explicitly declare function visibility (public, external, internal, private).",
    swcId: "SWC-100",
    cweId: "CWE-710",
  },
  {
    id: "SEC-009",
    name: "Floating Pragma",
    severity: "MEDIUM",
    pattern: /pragma\s+solidity\s*[\^~><=]/g,
    description: "Floating pragma allows compilation with different compiler versions, which may introduce bugs.",
    recommendation: "Lock the pragma to a specific version: pragma solidity 0.8.20;",
    swcId: "SWC-103",
    cweId: "CWE-664",
  },
  {
    id: "SEC-010",
    name: "Weak Randomness",
    severity: "MEDIUM",
    pattern: /block\.timestamp|block\.difficulty|blockhash|block\.number/g,
    description: "Using block variables for randomness is predictable and can be manipulated by miners.",
    recommendation: "Use Chainlink VRF or similar oracle-based randomness solutions for critical random values.",
    swcId: "SWC-120",
    cweId: "CWE-330",
  },
  {
    id: "SEC-011",
    name: "DoS with Block Gas Limit",
    severity: "MEDIUM",
    pattern: /for\s*\([^)]*\.length[^)]*\)/g,
    description: "Unbounded loop iterating over array length may exceed block gas limit.",
    recommendation: "Implement pagination or limit the maximum iterations. Consider using mappings instead of arrays.",
    swcId: "SWC-128",
    cweId: "CWE-400",
  },
  // LOW
  {
    id: "SEC-012",
    name: "Outdated Compiler Version",
    severity: "LOW",
    pattern: /pragma\s+solidity\s*(?:\^|~|>=|>)?\s*0\.[0-6]\./g,
    description: "Using an outdated Solidity compiler version may expose the contract to known vulnerabilities.",
    recommendation: "Upgrade to Solidity 0.8.x or later for built-in overflow checks and security improvements.",
    swcId: "SWC-102",
    cweId: "CWE-1104",
  },
  {
    id: "SEC-013",
    name: "Deprecated Functions",
    severity: "LOW",
    pattern: /\.(suicide|sha3|callcode|throw)\s*\(/g,
    description: "Using deprecated Solidity functions that may be removed in future versions.",
    recommendation: "Replace deprecated functions: suicide->selfdestruct, sha3->keccak256, callcode->delegatecall, throw->revert.",
    swcId: "SWC-111",
    cweId: "CWE-477",
  },
  {
    id: "SEC-014",
    name: "Code with No Effects",
    severity: "LOW",
    pattern: /;\s*\w+\s*;|;\s*\d+\s*;/g,
    description: "Statement has no effect and may indicate a bug or forgotten code.",
    recommendation: "Remove statements with no effects or complete the intended operation.",
    swcId: "SWC-135",
    cweId: "CWE-1164",
  },
];

/**
 * Analyze source code for security vulnerabilities
 */
export function analyzeSecurityIssues(sourceCode: string): SecurityAnalysisResult {
  const findings: AuditFinding[] = [];
  const lines = sourceCode.split('\n');
  let findingId = 1;

  for (const pattern of SECURITY_PATTERNS) {
    const matches = sourceCode.matchAll(pattern.pattern);

    for (const match of matches) {
      // Find line number
      const beforeMatch = sourceCode.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Get the line content
      const lineContent = lines[lineNumber - 1]?.trim() || '';

      // Skip if it's in a comment
      if (isInComment(sourceCode, match.index || 0)) {
        continue;
      }

      // Skip certain false positives
      if (shouldSkipMatch(pattern.id, sourceCode, match.index || 0)) {
        continue;
      }

      findings.push({
        id: `${pattern.id}-${findingId++}`,
        severity: pattern.severity,
        category: "SECURITY",
        title: pattern.name,
        description: pattern.description,
        location: {
          line: lineNumber,
          column: (match.index || 0) - beforeMatch.lastIndexOf('\n') - 1,
          snippet: lineContent,
        },
        recommendation: pattern.recommendation,
        swcId: pattern.swcId,
        cweId: pattern.cweId,
      });
    }
  }

  // Check for reentrancy guard usage
  const hasReentrancyGuard = /ReentrancyGuard|nonReentrant/.test(sourceCode);
  const hasExternalCallWithValue = /\.call\{value:/.test(sourceCode);

  if (hasExternalCallWithValue && !hasReentrancyGuard) {
    // Already covered by SEC-001, but add extra context
  }

  const hasCritical = findings.some(f => f.severity === "CRITICAL");
  const hasHigh = findings.some(f => f.severity === "HIGH");

  return {
    passed: !hasCritical && !hasHigh,
    findings,
  };
}

/**
 * Check if a position is inside a comment
 */
function isInComment(sourceCode: string, position: number): boolean {
  const before = sourceCode.substring(0, position);

  // Check for single-line comment
  const lastNewline = before.lastIndexOf('\n');
  const currentLine = before.substring(lastNewline + 1);
  if (currentLine.includes('//')) {
    return true;
  }

  // Check for multi-line comment
  const lastCommentStart = before.lastIndexOf('/*');
  const lastCommentEnd = before.lastIndexOf('*/');
  if (lastCommentStart > lastCommentEnd) {
    return true;
  }

  return false;
}

/**
 * Check if a match should be skipped (false positive detection)
 */
function shouldSkipMatch(patternId: string, sourceCode: string, position: number): boolean {
  const before = sourceCode.substring(Math.max(0, position - 100), position);
  const after = sourceCode.substring(position, Math.min(sourceCode.length, position + 100));

  switch (patternId) {
    case "SEC-001": // Reentrancy
      // Skip if nonReentrant modifier is used nearby
      if (/nonReentrant/.test(before)) {
        return true;
      }
      break;

    case "SEC-004": // Unchecked call
      // Skip if the call result is being checked
      if (/\(bool\s+\w+,/.test(after) || /require\s*\(/.test(after)) {
        return true;
      }
      break;

    case "SEC-005": // Unprotected withdrawal
      // Skip if access control is present
      if (/onlyOwner|onlyRole|_checkRole|require\s*\(\s*msg\.sender/.test(before)) {
        return true;
      }
      break;

    case "SEC-008": // Missing visibility
      // Skip if visibility is declared
      if (/\b(public|external|internal|private)\b/.test(after.substring(0, 50))) {
        return true;
      }
      break;
  }

  return false;
}
