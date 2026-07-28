// Severity levels for audit findings
export type IssueSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";

// Issue categories
export type IssueCategory =
  | "SECURITY"
  | "GAS_OPTIMIZATION"
  | "BEST_PRACTICES"
  | "OZ_COMPLIANCE"
  | "LOGIC"
  | "UPGRADE_SAFETY"
  | "DEFI_RISK"
  | "TOKEN_COMPLIANCE";

// Risk level for verdicts
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Audit verdict recommendation
export type AuditRecommendation = "SAFE" | "CAUTION" | "WARNING" | "AVOID";

// Input - Direct source code only
export interface ContractAuditRequest {
  sourceCode: string;            // Solidity source code (required)
  contractName?: string;         // Optional: specific contract to analyze
  compilerVersion?: string;      // Optional: for version-specific checks
  deepAudit?: boolean;           // Optional: run Nemesis + Pashov AI passes
  selectedModel?: string;        // Optional: AI model for deep audit passes
}

// Source code location
export interface SourceLocation {
  line?: number;
  column?: number;
  code?: string;
  snippet?: string; // Alias for code
}

// Audit finding
export interface AuditFinding {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  location: SourceLocation;
  recommendation: string;
  swcId?: string;                // Smart Contract Weakness Classification
  cweId?: string;                // Common Weakness Enumeration
  ruleId?: string;               // Solhint rule ID
  source?: string;               // e.g., 'pashov', 'nemesis', 'pattern'
  confidence?: number;           // 0-1 confidence score (Pashov)
  triggerSequence?: string;      // Multi-tx adversarial sequence (Nemesis)
}

// Nemesis report type
export interface NemesisReport {
  findings: AuditFinding[];
  reconSummary: string;
  feynmanSuspects: string[];
  stateGaps: string[];
  iterations: number;
}

// Pashov report type
export interface PashovReport {
  findings: AuditFinding[];
  vectorCoverage: string[];
  totalRaw: number;
}

// Category summary
export interface CategorySummary {
  category: IssueCategory;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  total: number;
}

// OpenZeppelin pattern info
export interface OZPatternInfo {
  pattern: string;
  implemented: boolean;
  recommended: boolean;
  reason?: string;
  version?: string;
}

// OpenZeppelin pattern (used by analyzers)
export interface OZPattern {
  name: string;
  implemented: boolean;
  version?: string;
  description?: string;
  reason?: string;
}

// OpenZeppelin compliance report
export interface OZComplianceReport {
  version: "v5.x" | "v4.x";
  implementedPatterns: OZPattern[];
  recommendedPatterns: OZPattern[];
  complianceScore: number;       // 0-100
  summary: string;
}

// Gas report
export interface GasReport {
  totalOptimizations: number;
  estimatedSavings: string;      // e.g., "~500 gas"
  topOptimizations: Array<{
    title: string;
    savings: string;
    count: number;
  }>;
}

// Solhint report summary
export interface SolhintReport {
  errors: number;
  warnings: number;
  rules: string[];
  findings: AuditFinding[];
}

// Contract metadata
export interface ContractMetadata {
  name?: string;
  compiler?: string;
  pragmaVersion?: string;
  licenseIdentifier?: string;
  contractCount: number;
  functionCount: number;
  lineCount: number;
  hasConstructor: boolean;
  hasReceiveFunction: boolean;
  hasFallbackFunction: boolean;
  imports: string[];
  inherits: string[];
}

// Audit verdict
export interface AuditVerdict {
  overall: RiskLevel;
  confidence: number;            // 0-1
  recommendation: AuditRecommendation;
  summary: string;
  keyFactors: string[];
  auditScore: number;            // 0-100
}

// Main response
export interface ContractAuditResponse {
  success: boolean;
  metadata: ContractMetadata;
  verdict: AuditVerdict;
  findings: AuditFinding[];
  categorySummary: CategorySummary[];
  ozCompliance: OZComplianceReport;
  gasReport: GasReport;
  solhintReport: SolhintReport;
  analyzedAt: string;
}

// Solhint result from parser
export interface SolhintResult {
  line: number;
  column: number;
  severity: number;
  message: string;
  ruleId: string;
}

// Security check result
export interface SecurityCheckResult {
  passed: boolean;
  findings: AuditFinding[];
}

// Pattern match result
export interface PatternMatchResult {
  pattern: string;
  found: boolean;
  lines: number[];
  code?: string;
}

// AI-generated comprehensive audit report
export interface AIAuditReport {
  executiveSummary: string;
  detailedAnalysis: string;
  securityRecommendations: string[];
  gasOptimizationSuggestions: string[];
  codeQualityAssessment: string;
  complianceNotes: string;
  overallAssessment: string;
  generatedBy: string;
  generatedAt: string;
}
