import { AuditFinding } from "../types";

export async function analyzeTokenCompliance(sourceCode: string): Promise<{ findings: AuditFinding[] }> {
    const findings: AuditFinding[] = [];
    const lowerSource = sourceCode.toLowerCase();

    // Naive heuristic to guess token type based on inheritance or function names
    const isERC20 = /erc20|transfer\(address,uint256\)|balanceof\(address\)/i.test(sourceCode);
    const isERC721 = /erc721|ownerof\(uint256\)|safeTransferFrom/i.test(sourceCode);
    const isERC1155 = /erc1155|safeBatchTransferFrom|balanceOfBatch/i.test(sourceCode);

    if (!isERC20 && !isERC721 && !isERC1155) {
        return { findings };
    }

    // ERC-20 Checks
    if (isERC20) {
        // Check for public supply/balance
        if (!/function\s+totalSupply\s*\(/.test(sourceCode) && !/public\s+totalSupply/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-20-01", "MEDIUM", "Missing totalSupply", "ERC-20 standard requires totalSupply function."));
        }
        if (!/function\s+balanceOf\s*\(/.test(sourceCode) && !/public\s+.*balanceOf/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-20-02", "HIGH", "Missing balanceOf", "ERC-20 standard requires balanceOf function."));
        }
        if (!/event\s+Transfer\s*\(/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-20-03", "HIGH", "Missing Transfer Event", "ERC-20 standard requires Transfer event."));
        }
        if (!/event\s+Approval\s*\(/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-20-04", "HIGH", "Missing Approval Event", "ERC-20 standard requires Approval event."));
        }

        // Fee-on-transfer check
        if (/(fee|tax|deduct|burn).*(transfer|sent)/i.test(sourceCode) && !/check/i.test(sourceCode)) {
            findings.push(createFinding("TOKEN-20-05", "INFORMATIONAL", "Potential Fee-on-Transfer", "Detected potential fee-on-transfer logic. Ensure this is documented and compatible with AMMs/Routers."));
        }
    }

    // ERC-721 Checks
    if (isERC721) {
        if (!/function\s+ownerOf\s*\(/.test(sourceCode) && !/public\s+.*ownerOf/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-721-01", "HIGH", "Missing ownerOf", "ERC-721 standard requires ownerOf function."));
        }
        if (!/function\s+safeTransferFrom\s*\(/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-721-02", "HIGH", "Missing safeTransferFrom", "ERC-721 standard requires safeTransferFrom implementation."));
        }
        if (!/event\s+Transfer\s*\(/.test(sourceCode)) {
            findings.push(createFinding("TOKEN-721-03", "HIGH", "Missing Transfer Event", "ERC-721 standard requires Transfer event."));
        }
    }

    // Common Token Checks
    // Check for paused functionality without Pausable
    if (/paused|unpaused/i.test(sourceCode) && !/Pausable|whenNotPaused/i.test(sourceCode)) {
        findings.push(createFinding("TOKEN-GEN-01", "MEDIUM", "Custom Pausable Implementation", "Detected pause logic but seemingly not using OpenZeppelin's Pausable. Ensure implementation is secure."));
    }

    // Blacklist check
    if (/blacklist|isBlacklisted|banned/i.test(sourceCode)) {
        findings.push(createFinding("TOKEN-GEN-02", "MEDIUM", "Blacklist Capability", "Token has blacklisting capabilities. This centralizes control and may affect trust."));
    }

    return { findings };
}

function createFinding(id: string, severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL", title: string, description: string): AuditFinding {
    return {
        id,
        severity,
        category: "TOKEN_COMPLIANCE",
        title,
        description,
        recommendation: "Review standard requirements (EIP-20/721/1155) and ensure full compliance.",
        location: { line: 1 } // Generic location for file-level issues
    };
}
