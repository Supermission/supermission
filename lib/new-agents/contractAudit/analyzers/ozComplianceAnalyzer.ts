import { AuditFinding, OZComplianceReport, OZPattern } from "../types";

interface OZPatternDefinition {
  name: string;
  importPattern: RegExp;
  usagePattern: RegExp;
  description: string;
  recommendation: string;
}

const OZ_PATTERNS: OZPatternDefinition[] = [
  {
    name: "Ownable",
    importPattern: /@openzeppelin\/contracts\/access\/Ownable/,
    usagePattern: /\bOwnable\b|onlyOwner\b/,
    description: "Basic access control with single owner",
    recommendation: "Use Ownable for simple admin-only functions.",
  },
  {
    name: "AccessControl",
    importPattern: /@openzeppelin\/contracts\/access\/AccessControl/,
    usagePattern: /\bAccessControl\b|hasRole\b|_grantRole\b|onlyRole\b/,
    description: "Role-based access control system",
    recommendation: "Use AccessControl for complex permission systems with multiple roles.",
  },
  {
    name: "ReentrancyGuard",
    importPattern: /@openzeppelin\/contracts\/security\/ReentrancyGuard|@openzeppelin\/contracts\/utils\/ReentrancyGuard/,
    usagePattern: /\bReentrancyGuard\b|nonReentrant\b/,
    description: "Protection against reentrancy attacks",
    recommendation: "Use ReentrancyGuard for functions that make external calls.",
  },
  {
    name: "Pausable",
    importPattern: /@openzeppelin\/contracts\/security\/Pausable|@openzeppelin\/contracts\/utils\/Pausable/,
    usagePattern: /\bPausable\b|whenNotPaused\b|_pause\b|_unpause\b/,
    description: "Emergency stop mechanism",
    recommendation: "Use Pausable to add circuit breaker functionality.",
  },
  {
    name: "SafeERC20",
    importPattern: /@openzeppelin\/contracts\/token\/ERC20\/utils\/SafeERC20/,
    usagePattern: /\bSafeERC20\b|safeTransfer\b|safeTransferFrom\b|safeApprove\b/,
    description: "Safe wrapper for ERC20 operations",
    recommendation: "Use SafeERC20 to handle non-standard ERC20 tokens safely.",
  },
  {
    name: "Initializable",
    importPattern: /@openzeppelin\/contracts-upgradeable\/proxy\/utils\/Initializable/,
    usagePattern: /\bInitializable\b|initializer\b|reinitializer\b/,
    description: "Initialization for upgradeable contracts",
    recommendation: "Use Initializable for contracts deployed behind proxies.",
  },
  {
    name: "UUPSUpgradeable",
    importPattern: /@openzeppelin\/contracts-upgradeable\/proxy\/utils\/UUPSUpgradeable/,
    usagePattern: /\bUUPSUpgradeable\b|_authorizeUpgrade\b/,
    description: "Universal Upgradeable Proxy Standard",
    recommendation: "Use UUPSUpgradeable for efficient upgradeable contracts.",
  },
  {
    name: "ERC20",
    importPattern: /@openzeppelin\/contracts\/token\/ERC20\/ERC20/,
    usagePattern: /\bERC20\b/,
    description: "Standard fungible token implementation",
    recommendation: "Inherit from OZ ERC20 for token implementations.",
  },
  {
    name: "ERC721",
    importPattern: /@openzeppelin\/contracts\/token\/ERC721\/ERC721/,
    usagePattern: /\bERC721\b/,
    description: "Standard non-fungible token implementation",
    recommendation: "Inherit from OZ ERC721 for NFT implementations.",
  },
  {
    name: "ERC1155",
    importPattern: /@openzeppelin\/contracts\/token\/ERC1155\/ERC1155/,
    usagePattern: /\bERC1155\b/,
    description: "Multi-token standard implementation",
    recommendation: "Inherit from OZ ERC1155 for multi-token implementations.",
  },
];

/**
 * Analyze OpenZeppelin compliance
 */
export function analyzeOZCompliance(sourceCode: string): OZComplianceReport {
  const implementedPatterns: OZPattern[] = [];
  const recommendedPatterns: OZPattern[] = [];

  // Detect OZ version from imports
  const isV5 = sourceCode.includes('@openzeppelin/contracts@5') ||
    sourceCode.includes('pragma solidity ^0.8.20') ||
    sourceCode.includes('pragma solidity ^0.8.21') ||
    sourceCode.includes('pragma solidity ^0.8.22') ||
    sourceCode.includes('pragma solidity ^0.8.23') ||
    sourceCode.includes('pragma solidity ^0.8.24');

  const version = isV5 ? "v5.x" : "v4.x";

  // Check each pattern
  for (const pattern of OZ_PATTERNS) {
    const isImported = pattern.importPattern.test(sourceCode);
    const isUsed = pattern.usagePattern.test(sourceCode);

    if (isImported || isUsed) {
      implementedPatterns.push({
        name: pattern.name,
        implemented: true,
        version,
        description: pattern.description,
      });
    }
  }

  // Recommend patterns based on contract characteristics
  const hasExternalCalls = /\.call\{value:|\.transfer\(|\.send\(/i.test(sourceCode);
  const hasAccessControl = /onlyOwner|onlyRole|_checkRole/i.test(sourceCode);
  const hasTokenTransfers = /\.transfer\(|\.transferFrom\(/i.test(sourceCode);
  const isUpgradeable = /initializer|proxy|upgradeable/i.test(sourceCode);
  const isToken = /ERC20|ERC721|ERC1155|balanceOf|totalSupply/i.test(sourceCode);

  // Recommend ReentrancyGuard if external calls present but not using it
  if (hasExternalCalls && !implementedPatterns.some(p => p.name === "ReentrancyGuard")) {
    recommendedPatterns.push({
      name: "ReentrancyGuard",
      implemented: false,
      version,
      reason: "Contract makes external calls that could be vulnerable to reentrancy.",
    });
  }

  // Recommend access control if not present
  if (!hasAccessControl && !implementedPatterns.some(p => p.name === "Ownable" || p.name === "AccessControl")) {
    recommendedPatterns.push({
      name: "Ownable",
      implemented: false,
      version,
      reason: "Contract lacks access control for administrative functions.",
    });
  }

  // Recommend SafeERC20 if token transfers present but not using it
  if (hasTokenTransfers && !implementedPatterns.some(p => p.name === "SafeERC20")) {
    recommendedPatterns.push({
      name: "SafeERC20",
      implemented: false,
      version,
      reason: "Contract transfers ERC20 tokens without SafeERC20 wrapper.",
    });
  }

  // Recommend Initializable for upgradeable contracts
  if (isUpgradeable && !implementedPatterns.some(p => p.name === "Initializable")) {
    recommendedPatterns.push({
      name: "Initializable",
      implemented: false,
      version,
      reason: "Upgradeable contract should use Initializable pattern.",
    });
  }

  // Recommend Pausable for token contracts
  if (isToken && !implementedPatterns.some(p => p.name === "Pausable")) {
    recommendedPatterns.push({
      name: "Pausable",
      implemented: false,
      version,
      reason: "Token contract could benefit from emergency pause functionality.",
    });
  }

  // Calculate compliance score
  const totalRecommended = implementedPatterns.length + recommendedPatterns.length;
  const complianceScore = totalRecommended > 0
    ? Math.round((implementedPatterns.length / totalRecommended) * 100)
    : 100;

  // Generate summary
  let summary = "";
  if (implementedPatterns.length === 0) {
    summary = "No OpenZeppelin patterns detected. Consider using OZ contracts for security best practices.";
  } else if (recommendedPatterns.length === 0) {
    summary = `Excellent! Contract implements ${implementedPatterns.length} OpenZeppelin patterns with no critical gaps.`;
  } else {
    summary = `Contract implements ${implementedPatterns.length} OpenZeppelin patterns. ${recommendedPatterns.length} additional patterns recommended.`;
  }

  return {
    version,
    implementedPatterns,
    recommendedPatterns,
    complianceScore,
    summary,
  };
}

/**
 * Generate findings from OZ compliance report
 */
export function generateOZComplianceFindings(
  report: OZComplianceReport,
  sourceCode: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let findingId = 1;

  for (const pattern of report.recommendedPatterns) {
    findings.push({
      id: `OZ-${findingId++}`,
      severity: pattern.name === "ReentrancyGuard" ? "HIGH" : "MEDIUM",
      category: "OZ_COMPLIANCE",
      title: `Missing ${pattern.name}`,
      description: pattern.reason || `Contract does not implement ${pattern.name} pattern.`,
      location: {
        line: 1,
        column: 0,
        snippet: "",
      },
      recommendation: `Import and use OpenZeppelin's ${pattern.name}: import "@openzeppelin/contracts/${getImportPath(pattern.name)}";`,
    });
  }

  return findings;
}

/**
 * Get import path for OZ pattern
 */
function getImportPath(patternName: string): string {
  const paths: Record<string, string> = {
    Ownable: "access/Ownable.sol",
    AccessControl: "access/AccessControl.sol",
    ReentrancyGuard: "utils/ReentrancyGuard.sol",
    Pausable: "utils/Pausable.sol",
    SafeERC20: "token/ERC20/utils/SafeERC20.sol",
    Initializable: "proxy/utils/Initializable.sol",
    UUPSUpgradeable: "proxy/utils/UUPSUpgradeable.sol",
    ERC20: "token/ERC20/ERC20.sol",
    ERC721: "token/ERC721/ERC721.sol",
    ERC1155: "token/ERC1155/ERC1155.sol",
  };

  return paths[patternName] || `${patternName}.sol`;
}
