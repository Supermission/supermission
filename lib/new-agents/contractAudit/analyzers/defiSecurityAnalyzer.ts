import { AuditFinding, SourceLocation } from "../types";

interface DeFiCheck {
    id: string;
    title: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";
    pattern: RegExp;
    description: string;
    recommendation: string;
}

const DEFI_CHECKS: DeFiCheck[] = [
    {
        id: "DEFI-001",
        title: "Flash Loan Vulnerability",
        severity: "CRITICAL",
        pattern: /\.call\s*\{[^}]*\}[^;]*(?:getPrice|getReserves|consult)/,
        description: "Price read followed by external call or external call relying on instant price. This pattern is often vulnerable to flash loan manipulation where an attacker manipulates the price in a single transaction.",
        recommendation: "Use Time-Weighted Average Price (TWAP) or decentralized oracles (Chainlink) instead of spot prices from AMMs. Ensure external calls do not rely on manipulated states."
    },
    {
        id: "DEFI-002",
        title: "Single Source Oracle",
        severity: "HIGH",
        pattern: /latestRoundData\s*\(\s*\)(?![^{]*\n?[^}]*(staleness|freshness|updatedAt|startedAt))/,
        description: "Chainlink oracle usage detected without staleness/freshness check. If the oracle pauses or stops updating, the contract will use stale prices.",
        recommendation: "Always check `updatedAt` or `startedAt` from the oracle response to ensure the price is fresh. Revert if the price is stale."
    },
    {
        id: "DEFI-003",
        title: "Missing Slippage Protection",
        severity: "MEDIUM",
        pattern: /swap.*(?:amountOutMin|minAmountOut)\s*[:=]\s*0/,
        description: "Swap transaction detected with zero slippage protection (amountOutMin = 0). This makes the transaction vulnerable to sandwich attacks.",
        recommendation: "Always set a non-zero `amountOutMin` based on a reasonable slippage tolerance (e.g., 0.5% or 1%). Allow this to be passed as a parameter by the user."
    },
    {
        id: "DEFI-004",
        title: "Reentrancy in Token Callback",
        severity: "HIGH",
        pattern: /(?:onERC721Received|onERC1155Received|tokensReceived)/,
        description: "Token callback functions (`onERC721Received`, etc.) are external entry points that can be exploited for reentrancy if they make state changes after external calls or if they interact with untrusted contracts.",
        recommendation: "Ensure all state changes happen before external calls (Checks-Effects-Interactions pattern) and/or use `nonReentrant` modifiers on callback functions."
    },
    {
        id: "DEFI-005",
        title: "Unbounded Token Approval",
        severity: "MEDIUM",
        pattern: /approve\s*\([^,]+,\s*(?:type\s*\(\s*uint256\s*\)\s*\.max|2\s*\*\*\s*256\s*-\s*1)/,
        description: "Infinite token approval detected. While convenient, it puts all user funds at risk if the spender contract is compromised.",
        recommendation: "Approve only the amount needed for the transaction, or implement a feature to let users set/revoke allowances explicitly."
    },
    {
        id: "DEFI-006",
        title: "AMMs Price Manipulation",
        severity: "HIGH",
        pattern: /(?:getReserves|slot0|observe\s*\()/,
        description: "Direct AMM pool price reading detected. Using spot prices from `getReserves` or `slot0` is highly susceptible to manipulation via flash loans.",
        recommendation: "Do not use `getReserves` or `slot0` for on-chain pricing if assets are at risk. Use TWAP or an external oracle."
    },
    {
        id: "DEFI-007",
        title: "Missing Deadline Parameter",
        severity: "MEDIUM",
        pattern: /swap[^{]*\{[^}]*\}(?![^;]*deadline)/,
        description: "Swap function execution without a deadline check. Miner Extractable Value (MEV) bots can hold the transaction and execute it when the price is unfavorable.",
        recommendation: "Ensure all swap functions include a `deadline` parameter that reverts the transaction if it is not mined within a certain timeframe."
    }
];

/**
 * Check if the contract DEFINES a pattern (e.g., defines slot0 as a struct/variable/function)
 * vs merely READING it from an external contract. Definitions are not vulnerabilities.
 */
function contractDefinesPattern(sourceCode: string, checkId: string): boolean {
    switch (checkId) {
        case 'DEFI-006':
            // Contract defines slot0 as a struct, mapping, variable, or function — it IS the AMM
            return /(?:struct\s+Slot0|function\s+slot0|Slot0\s+(?:public|internal|private|external)|mapping.*slot0)/i.test(sourceCode)
                // Also check if it defines getReserves or observe as its own function
                || /function\s+(?:getReserves|observe)\s*\(/i.test(sourceCode);
        case 'DEFI-004':
            // Contract defines callback functions as part of its interface/design
            return /function\s+(?:uniswapV3SwapCallback|uniswapV3MintCallback|uniswapV3FlashCallback|onERC721Received|onERC1155Received|tokensReceived)\s*\(/i.test(sourceCode)
                // Or it's an interface that declares them
                || /interface\s+\w+[^{]*\{[^}]*(?:onERC721Received|onERC1155Received|tokensReceived)/s.test(sourceCode);
        default:
            return false;
    }
}

export async function analyzeDeFiSecurity(sourceCode: string): Promise<{ findings: AuditFinding[] }> {
    const findings: AuditFinding[] = [];
    const lines = sourceCode.split('\n');

    DEFI_CHECKS.forEach(check => {
        // Skip checks where the contract DEFINES the pattern (not a vulnerability)
        if (contractDefinesPattern(sourceCode, check.id)) {
            return;
        }

        // Naive line-by-line check for location reporting without AST
        lines.forEach((line, index) => {
            // Skip lines that are comments
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
                return;
            }

            if (check.pattern.test(line)) {
                findings.push({
                    id: check.id,
                    title: check.title,
                    severity: check.severity,
                    category: "DEFI_RISK",
                    description: check.description,
                    recommendation: check.recommendation,
                    location: {
                        line: index + 1,
                        code: line.trim()
                    }
                });
            }
        });
    });

    return { findings };
}
