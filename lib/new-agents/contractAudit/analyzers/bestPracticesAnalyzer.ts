import { AuditFinding } from "../types";

interface BestPracticePattern {
  id: string;
  name: string;
  pattern: RegExp;
  description: string;
  recommendation: string;
  severity: "LOW" | "MEDIUM" | "INFORMATIONAL";
}

const BEST_PRACTICE_PATTERNS: BestPracticePattern[] = [
  {
    id: "BP-001",
    name: "Missing NatSpec Documentation",
    pattern: /(?<!\/\/\/[^\n]*\n)(?<!\/\*\*[\s\S]*?\*\/\s*)function\s+\w+/g,
    description: "Function is missing NatSpec documentation.",
    recommendation: "Add NatSpec comments (/// or /** */) to document function purpose, parameters, and return values.",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-002",
    name: "Magic Numbers",
    pattern: /(?<![0-9a-fA-Fx])(?:100|1000|10000|86400|3600|1e18|1e6)\b/g,
    description: "Magic numbers should be replaced with named constants for better readability.",
    recommendation: "Define constants: uint256 constant SECONDS_PER_DAY = 86400;",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-003",
    name: "Missing Event Emission",
    pattern: /function\s+(?:set|update|change|modify)\w*\s*\([^)]*\)[^{]*\{(?:(?!emit\s+\w+).)*\}/gs,
    description: "State-changing function does not emit an event.",
    recommendation: "Emit events for important state changes to enable off-chain monitoring and indexing.",
    severity: "LOW",
  },
  {
    id: "BP-004",
    name: "Using assert() for Input Validation",
    pattern: /assert\s*\(/g,
    description: "assert() should only be used for invariants, not input validation. It consumes all remaining gas on failure.",
    recommendation: "Use require() for input validation and revert() for error conditions. Reserve assert() for invariant checks.",
    severity: "LOW",
  },
  {
    id: "BP-005",
    name: "Public Function Could Be External",
    pattern: /function\s+\w+\s*\([^)]*\)\s*public(?!\s+view|\s+pure)/g,
    description: "Public function is not called internally and could be external.",
    recommendation: "Use external instead of public for functions only called from outside the contract.",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-006",
    name: "Unused Function Parameter",
    pattern: /function\s+\w+\s*\(\s*(?:[^)]*,\s*)?(\w+\s+\w+)(?:\s*,[^)]*)*\s*\)[^{]*\{[^}]*\}/g,
    description: "Function parameter may be unused.",
    recommendation: "Remove unused parameters or prefix with underscore: function foo(uint256 _unused) to indicate intentional non-use.",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-007",
    name: "Missing Zero Address Check",
    pattern: /function\s+(?:set|update|change|initialize)\w*\s*\(\s*address\s+\w+/g,
    description: "Address parameter should be validated against zero address.",
    recommendation: "Add zero address validation: require(addr != address(0), 'Zero address');",
    severity: "LOW",
  },
  {
    id: "BP-008",
    name: "Boolean Comparison",
    pattern: /==\s*true|==\s*false|true\s*==|false\s*==/g,
    description: "Explicit boolean comparison is unnecessary.",
    recommendation: "Use if(condition) instead of if(condition == true), and if(!condition) instead of if(condition == false).",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-009",
    name: "Missing License Identifier",
    pattern: /^(?![\s\S]*SPDX-License-Identifier)/,
    description: "Contract is missing SPDX license identifier.",
    recommendation: "Add SPDX license at the top of the file: // SPDX-License-Identifier: MIT",
    severity: "INFORMATIONAL",
  },
  {
    id: "BP-010",
    name: "Large Contract",
    pattern: /contract\s+\w+[^{]*\{/g,
    description: "Contract may be too large. Consider splitting into smaller contracts.",
    recommendation: "Split large contracts into libraries or smaller contracts using inheritance or composition.",
    severity: "INFORMATIONAL",
  },
];

/**
 * Analyze source code for best practices
 */
export function analyzeBestPractices(sourceCode: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lines = sourceCode.split('\n');
  let findingId = 1;

  // Check for missing SPDX license
  if (!sourceCode.includes('SPDX-License-Identifier')) {
    findings.push({
      id: `BP-009-${findingId++}`,
      severity: "INFORMATIONAL",
      category: "BEST_PRACTICES",
      title: "Missing License Identifier",
      description: "Contract is missing SPDX license identifier.",
      location: {
        line: 1,
        column: 0,
        snippet: lines[0] || '',
      },
      recommendation: "Add SPDX license at the top of the file: // SPDX-License-Identifier: MIT",
    });
  }

  // Check contract size
  if (lines.length > 500) {
    findings.push({
      id: `BP-010-${findingId++}`,
      severity: "INFORMATIONAL",
      category: "BEST_PRACTICES",
      title: "Large Contract",
      description: `Contract has ${lines.length} lines. Large contracts are harder to audit and maintain.`,
      location: {
        line: 1,
        column: 0,
        snippet: '',
      },
      recommendation: "Consider splitting into smaller contracts or using libraries.",
    });
  }

  // Run pattern-based checks
  for (const pattern of BEST_PRACTICE_PATTERNS) {
    // Skip special patterns handled above
    if (pattern.id === "BP-009" || pattern.id === "BP-010") continue;

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
      if (shouldSkipBestPractice(pattern.id, sourceCode, match.index || 0, match[0])) {
        continue;
      }

      findings.push({
        id: `${pattern.id}-${findingId++}`,
        severity: pattern.severity,
        category: "BEST_PRACTICES",
        title: pattern.name,
        description: pattern.description,
        location: {
          line: lineNumber,
          column: (match.index || 0) - beforeMatch.lastIndexOf('\n') - 1,
          snippet: lineContent,
        },
        recommendation: pattern.recommendation,
      });
    }
  }

  return findings;
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
 * Check if a match should be skipped
 */
function shouldSkipBestPractice(
  patternId: string,
  sourceCode: string,
  position: number,
  matchText: string
): boolean {
  const before = sourceCode.substring(Math.max(0, position - 200), position);

  switch (patternId) {
    case "BP-001": // Missing NatSpec
      // Check if there's a comment before the function
      if (/\/\/\/[^\n]*$|\/\*\*[\s\S]*?\*\/\s*$/.test(before)) {
        return true;
      }
      break;

    case "BP-003": // Missing event
      // Skip if it's a view/pure function or if there's an emit
      if (/\bview\b|\bpure\b/.test(matchText)) {
        return true;
      }
      break;

    case "BP-005": // Public could be external
      // Skip if the function is called internally
      const funcName = matchText.match(/function\s+(\w+)/)?.[1];
      if (funcName && new RegExp(`\\b${funcName}\\s*\\(`).test(sourceCode.replace(matchText, ''))) {
        return true;
      }
      break;

    case "BP-007": // Missing zero address check
      // Skip if there's already a zero check nearby
      const after = sourceCode.substring(position, Math.min(sourceCode.length, position + 300));
      if (/address\s*\(\s*0\s*\)|address\(0x0\)/.test(after)) {
        return true;
      }
      break;
  }

  return false;
}
