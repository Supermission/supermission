
import { SolhintResult, AuditFinding } from "../types";

export async function runSolhint(sourceCode: string): Promise<SolhintResult[]> {
    // Mock implementation since running real solhint in browser/edge might be hard
    // In a real app this would call a serverless function or WASM
    return [];
}

export function convertSolhintToFindings(results: SolhintResult[], sourceLines: string[]): AuditFinding[] {
    return results.map((r, i) => ({
        id: `solhint-${i}`,
        severity: r.severity === 2 ? "MEDIUM" : "LOW", // keeping it simple
        category: "BEST_PRACTICES",
        title: `Solhint: ${r.ruleId}`,
        description: r.message,
        location: {
            line: r.line,
            column: r.column,
            code: sourceLines[r.line - 1]?.trim() || ""
        },
        recommendation: "Fix the linter error",
        ruleId: r.ruleId
    }));
}
