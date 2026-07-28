
import { AuditFinding, CategorySummary, IssueSeverity, IssueCategory } from "../types";

const severityWeights: Record<IssueSeverity, number> = {
    "CRITICAL": 5,
    "HIGH": 4,
    "MEDIUM": 3,
    "LOW": 2,
    "INFORMATIONAL": 1
};

export function sortBySeverity(findings: AuditFinding[]): AuditFinding[] {
    return [...findings].sort((a, b) => {
        return severityWeights[b.severity] - severityWeights[a.severity];
    });
}

const SOURCE_PRIORITY: Record<string, number> = {
    nemesis: 3,
    pashov: 2,
    pattern: 1,
};

function sourcePriority(f: AuditFinding): number {
    return SOURCE_PRIORITY[f.source || 'pattern'] ?? 1;
}

export function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
    const unique = new Map<string, AuditFinding>();

    findings.forEach(f => {
        // Primary key: exact match by title + location
        const exactKey = `${f.title}-${f.location.line}-${f.location.code}`;
        // Fuzzy key: match by title alone (catches same issue from different analyzers)
        const fuzzyKey = `fuzzy:${f.title.toLowerCase().replace(/\s+/g, '-').substring(0, 50)}`;

        for (const key of [exactKey, fuzzyKey]) {
            const existing = unique.get(key);
            if (!existing) {
                unique.set(key, f);
            } else {
                // Prefer Nemesis > Pashov > pattern analyzers
                const existingPriority = sourcePriority(existing);
                const newPriority = sourcePriority(f);
                if (newPriority > existingPriority) {
                    unique.set(key, f);
                } else if (newPriority === existingPriority && (f.confidence ?? 0) > (existing.confidence ?? 0)) {
                    // Same source tier: prefer higher confidence
                    unique.set(key, f);
                }
            }
        }
    });

    // Deduplicate the map values themselves (fuzzy + exact may point to same finding)
    const seen = new Set<string>();
    const result: AuditFinding[] = [];
    for (const f of unique.values()) {
        if (!seen.has(f.id)) {
            seen.add(f.id);
            result.push(f);
        }
    }
    return result;
}

export function buildCategorySummary(findings: AuditFinding[]): CategorySummary[] {
    const categories: IssueCategory[] = [
        "SECURITY", "GAS_OPTIMIZATION", "BEST_PRACTICES",
        "OZ_COMPLIANCE", "LOGIC", "UPGRADE_SAFETY",
        "DEFI_RISK", "TOKEN_COMPLIANCE"
    ];

    return categories.map(cat => {
        const catFindings = findings.filter(f => f.category === cat);
        return {
            category: cat,
            critical: catFindings.filter(f => f.severity === "CRITICAL").length,
            high: catFindings.filter(f => f.severity === "HIGH").length,
            medium: catFindings.filter(f => f.severity === "MEDIUM").length,
            low: catFindings.filter(f => f.severity === "LOW").length,
            informational: catFindings.filter(f => f.severity === "INFORMATIONAL").length,
            total: catFindings.length
        };
    });
}
