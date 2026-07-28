import { AuditFinding, GasReport } from "../types";

interface GasPattern {
  id: string;
  name: string;
  pattern: RegExp;
  description: string;
  recommendation: string;
  estimatedSavings?: string;
}

const GAS_PATTERNS: GasPattern[] = [
  {
    id: "GAS-001",
    name: "Use calldata instead of memory",
    pattern: /function\s+\w+\s*\([^)]*\bmemory\b[^)]*\)\s*(?:external|public)/g,
    description: "External/public function parameters can use calldata instead of memory to save gas.",
    recommendation: "Change 'memory' to 'calldata' for external function parameters that are not modified.",
    estimatedSavings: "~60 gas per parameter",
  },
  {
    id: "GAS-002",
    name: "Cache array length in loops",
    pattern: /for\s*\([^;]*;\s*\w+\s*<\s*\w+\.length\s*;/g,
    description: "Reading array length on each iteration wastes gas.",
    recommendation: "Cache the array length before the loop: uint256 len = arr.length; for(uint i = 0; i < len; ...)",
    estimatedSavings: "~3 gas per iteration",
  },
  {
    id: "GAS-003",
    name: "Use ++i instead of i++",
    pattern: /\w+\+\+(?!\s*\))/g,
    description: "Post-increment (i++) is slightly more expensive than pre-increment (++i).",
    recommendation: "Use pre-increment (++i) instead of post-increment (i++) when the return value is not needed.",
    estimatedSavings: "~5 gas per operation",
  },
  {
    id: "GAS-004",
    name: "Use unchecked for safe arithmetic",
    pattern: /for\s*\([^)]*\+\+[^)]*\)/g,
    description: "Loop counter increments can use unchecked block since overflow is impossible in practice.",
    recommendation: "Wrap loop counter increments in unchecked { ++i; } for gas savings.",
    estimatedSavings: "~30-40 gas per iteration",
  },
  {
    id: "GAS-005",
    name: "Pack storage variables",
    pattern: /uint(?:8|16|32|64|128)\s+\w+\s*;[^}]*uint(?:8|16|32|64|128)\s+\w+\s*;/g,
    description: "Multiple small uint variables can be packed into a single storage slot.",
    recommendation: "Group smaller uint types together to pack them into 32-byte slots.",
    estimatedSavings: "~20,000 gas per slot saved",
  },
  {
    id: "GAS-006",
    name: "Use custom errors instead of require strings",
    pattern: /require\s*\([^,]+,\s*["'][^"']+["']\s*\)/g,
    description: "String error messages in require statements consume more gas than custom errors.",
    recommendation: "Use custom errors: error InsufficientBalance(); then revert InsufficientBalance();",
    estimatedSavings: "~50 gas per error",
  },
  {
    id: "GAS-007",
    name: "Avoid redundant SLOAD",
    pattern: /(\w+)\s*=[^;]+;\s*[^}]*\1\s*=[^;]+;/g,
    description: "Reading from storage multiple times in the same function wastes gas.",
    recommendation: "Cache storage variables in memory: uint256 cached = storageVar; // use cached",
    estimatedSavings: "~100 gas per avoided SLOAD",
  },
  {
    id: "GAS-008",
    name: "Use bytes32 instead of string",
    pattern: /string\s+(public\s+)?constant/g,
    description: "Fixed-size bytes32 is cheaper than dynamic string for small constant values.",
    recommendation: "Use bytes32 instead of string for values 32 bytes or less.",
    estimatedSavings: "Deployment gas savings",
  },
  {
    id: "GAS-009",
    name: "Use immutable for constants set in constructor",
    pattern: /constructor[^}]*\{[^}]*\b(\w+)\s*=[^}]+\}/g,
    description: "Variables set once in constructor can be immutable instead of storage.",
    recommendation: "Declare variables as immutable if they are only set in the constructor.",
    estimatedSavings: "~2,100 gas per access",
  },
  {
    id: "GAS-010",
    name: "Avoid unnecessary initialization",
    pattern: /uint\d*\s+\w+\s*=\s*0\s*;|bool\s+\w+\s*=\s*false\s*;/g,
    description: "Default values are automatically set, explicit initialization wastes gas.",
    recommendation: "Remove explicit zero/false initialization: uint256 count; instead of uint256 count = 0;",
    estimatedSavings: "~3 gas per variable",
  },
];

/**
 * Analyze source code for gas optimization opportunities
 */
export function analyzeGasOptimizations(sourceCode: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lines = sourceCode.split('\n');
  let findingId = 1;

  for (const pattern of GAS_PATTERNS) {
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

      findings.push({
        id: `${pattern.id}-${findingId++}`,
        severity: "LOW",
        category: "GAS_OPTIMIZATION",
        title: pattern.name,
        description: pattern.description + (pattern.estimatedSavings ? ` Estimated savings: ${pattern.estimatedSavings}.` : ''),
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
 * Build a gas report from findings
 */
export function buildGasReport(allFindings: AuditFinding[]): GasReport {
  const gasFindings = allFindings.filter(f => f.category === "GAS_OPTIMIZATION");

  // Calculate estimated savings
  let totalEstimatedSavings = 0;
  const optimizations: Array<{ title: string; savings: string; count: number }> = [];

  const grouped = new Map<string, AuditFinding[]>();
  for (const finding of gasFindings) {
    const existing = grouped.get(finding.title) || [];
    existing.push(finding);
    grouped.set(finding.title, existing);
  }

  for (const [title, findings] of grouped) {
    const savingsMatch = findings[0]?.description.match(/~(\d+)/);
    const savingsPerOccurrence = savingsMatch ? parseInt(savingsMatch[1]) : 0;
    const totalSavings = savingsPerOccurrence * findings.length;
    totalEstimatedSavings += totalSavings;

    optimizations.push({
      title,
      savings: `~${totalSavings} gas`,
      count: findings.length,
    });
  }

  // Sort by savings (descending)
  optimizations.sort((a, b) => {
    const aNum = parseInt(a.savings.match(/\d+/)?.[0] || '0');
    const bNum = parseInt(b.savings.match(/\d+/)?.[0] || '0');
    return bNum - aNum;
  });

  return {
    totalOptimizations: gasFindings.length,
    estimatedSavings: `~${totalEstimatedSavings} gas`,
    topOptimizations: optimizations.slice(0, 5),
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
