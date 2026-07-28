/**
 * Nemesis Analyzer
 * Implements the Nemesis dual-methodology iterative audit loop:
 * - Phase 0: Attacker recon — identify highest-value targets
 * - Pass 1 (Feynman): First-principles logic interrogation
 * - Pass 2 (State Inconsistency): Coupled state variable desynchronization
 * - Iteration: Feed State findings back into targeted Feynman re-interrogation (max 2 extra)
 * - Multi-transaction tracing: Adversarial trigger sequences for critical findings
 */

import { chatCompletion, chatCompletionJSON } from '@/lib/openrouter/client';
import type { AuditFinding, IssueSeverity, IssueCategory } from '../types';

const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';
const MAX_ITERATIONS = 2;

export interface NemesisFinding extends AuditFinding {
  source: 'nemesis';
  triggerSequence?: string;
  feynmanSuspect?: boolean;
  stateInconsistency?: boolean;
}

export interface NemesisReport {
  findings: NemesisFinding[];
  reconSummary: string;
  feynmanSuspects: string[];
  stateGaps: string[];
  iterations: number;
}

interface RawNemesisFinding {
  title: string;
  description: string;
  severity: string;
  location: string;
  recommendation: string;
  triggerSequence?: string;
  isFeynmanSuspect?: boolean;
  isStateInconsistency?: boolean;
}

interface FeynmanResult {
  suspects: string[];
  findings: RawNemesisFinding[];
  summary: string;
}

interface StateResult {
  stateGaps: string[];
  findings: RawNemesisFinding[];
  newSuspects: string[];
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const RECON_SYSTEM = `You are an attacker performing reconnaissance on a Solidity smart contract before exploitation.
Identify the highest-value attack targets: functions that handle funds, privileged operations, state-changing logic, and external calls.
Return a concise plain-text summary of: top 5 attack surface areas, the most dangerous functions, and the critical state variables to track.`;

const FEYNMAN_SYSTEM = `You are the Feynman Auditor. Apply first-principles interrogation to every function in the contract.
For each function, systematically question:
1. PURPOSE — What is this function supposed to do? Can it be misused?
2. ORDERING — Are state updates ordered correctly relative to external calls?
3. CONSISTENCY GUARDS — Does it enforce all required preconditions and invariants?
4. ASSUMPTIONS — What assumptions does it make about callers, inputs, or state?
5. BOUNDARY CONDITIONS — What happens at edge cases (zero, max, empty, repeated calls)?
6. RETURN/ERROR HANDLING — Are errors propagated correctly? Are return values checked?
7. CALL REORDER — Could reordering calls within this function lead to a different outcome?

Return JSON: {
  "suspects": string[],  // function names flagged for further scrutiny
  "summary": string,
  "findings": [{ "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "recommendation": string, "isFeynmanSuspect": true }]
}`;

const STATE_SYSTEM = `You are the State Inconsistency Auditor. Your job is to find desynchronization gaps between coupled state variables.
Steps:
1. MAP all state variables and identify which ones are logically coupled (e.g., totalSupply + balances, shares + assets, locked + amount).
2. For each function, check: does it update ALL sides of every coupled pair it touches? Or does it leave some stale?
3. Find PARTIAL OPERATIONS where only part of a coupled pair is updated.
4. Use the provided Feynman suspects as high-priority targets — re-examine them for state desync.
5. Identify multi-transaction attack sequences that exploit these gaps.

Return JSON: {
  "stateGaps": string[],  // descriptions of identified state variable coupling gaps
  "newSuspects": string[],  // new function names uncovered by state analysis
  "findings": [{ "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "recommendation": string, "triggerSequence": string, "isStateInconsistency": true }]
}`;

const TARGETED_FEYNMAN_SYSTEM = `You are the Feynman Auditor performing a targeted deep-dive.
You have been given specific suspect functions and state gaps discovered in a previous analysis pass.
Apply rigorous first-principles interrogation ONLY to the provided suspects.
Focus on finding new issues not already captured, especially issues that arise from the state desynchronization gaps.

Return JSON: {
  "suspects": string[],
  "summary": string,
  "findings": [{ "title": string, "description": string, "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFORMATIONAL", "location": string, "recommendation": string, "triggerSequence": string, "isFeynmanSuspect": true }]
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSeverity(raw: string): IssueSeverity {
  const s = (raw || '').toUpperCase();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  if (s === 'MEDIUM') return 'MEDIUM';
  if (s === 'LOW') return 'LOW';
  return 'INFORMATIONAL';
}

function rawToNemesisFinding(raw: RawNemesisFinding, idx: number): NemesisFinding {
  const severity = normalizeSeverity(raw.severity);
  const category: IssueCategory = severity === 'CRITICAL' || severity === 'HIGH' ? 'SECURITY' : 'LOGIC';

  return {
    id: `nemesis-${idx}`,
    severity,
    category,
    title: raw.title || 'Unnamed Nemesis Finding',
    description: raw.description || '',
    location: { code: raw.location || undefined },
    recommendation: raw.recommendation || '',
    source: 'nemesis',
    triggerSequence: raw.triggerSequence,
    feynmanSuspect: raw.isFeynmanSuspect === true,
    stateInconsistency: raw.isStateInconsistency === true,
  };
}

function deduplicateNemesisFindings(findings: NemesisFinding[]): NemesisFinding[] {
  const seen = new Map<string, NemesisFinding>();
  for (const f of findings) {
    const key = f.title.toLowerCase().replace(/\s+/g, '-').substring(0, 50);
    if (!seen.has(key)) {
      seen.set(key, f);
    } else {
      // Prefer the one with a trigger sequence or the higher severity
      const existing = seen.get(key)!;
      const existingSev = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFORMATIONAL: 0 }[existing.severity];
      const newSev = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFORMATIONAL: 0 }[f.severity];
      if ((f.triggerSequence && !existing.triggerSequence) || newSev > existingSev) {
        seen.set(key, f);
      }
    }
  }
  return Array.from(seen.values());
}

// ─── Main Analyzer ────────────────────────────────────────────────────────────

/**
 * Run the Nemesis dual-methodology iterative audit.
 */
export async function runNemesisAnalyzer(
  sourceCode: string,
  model: string = DEFAULT_MODEL
): Promise<NemesisReport> {
  console.log('[NemesisAnalyzer] Starting dual-methodology iterative audit');

  const truncatedSource = sourceCode.substring(0, 50000);

  // ── Phase 0: Attacker Recon ───────────────────────────────────────────────
  let reconSummary = '';
  try {
    reconSummary = await chatCompletion(
      model,
      RECON_SYSTEM,
      `Perform attacker reconnaissance on this contract:\n\n\`\`\`solidity\n${truncatedSource}\n\`\`\``,
      { temperature: 0.15, max_tokens: 800 }
    );
    console.log('[NemesisAnalyzer] Phase 0 recon complete');
  } catch (err) {
    console.error('[NemesisAnalyzer] Recon failed:', err);
    reconSummary = 'Recon unavailable';
  }

  // ── Pass 1: Feynman Interrogation ─────────────────────────────────────────
  let feynmanResult: FeynmanResult = { suspects: [], findings: [], summary: '' };
  try {
    feynmanResult = await chatCompletionJSON<FeynmanResult>(
      model,
      FEYNMAN_SYSTEM,
      `Contract source:\n\`\`\`solidity\n${truncatedSource}\n\`\`\`\n\nAttacker recon:\n${reconSummary}`,
      { temperature: 0.1, max_tokens: 3000 }
    );
    console.log(`[NemesisAnalyzer] Pass 1 Feynman: ${feynmanResult.findings?.length || 0} findings, ${feynmanResult.suspects?.length || 0} suspects`);
  } catch (err) {
    console.error('[NemesisAnalyzer] Feynman pass failed:', err);
  }

  const feynmanFindings: RawNemesisFinding[] = Array.isArray(feynmanResult?.findings) ? feynmanResult.findings : [];
  const feynmanSuspects: string[] = Array.isArray(feynmanResult?.suspects) ? feynmanResult.suspects : [];

  // ── Pass 2: State Inconsistency Mapping ───────────────────────────────────
  let stateResult: StateResult = { stateGaps: [], findings: [], newSuspects: [] };
  try {
    const stateUserPrompt = `Contract source:\n\`\`\`solidity\n${truncatedSource}\n\`\`\`\n\nFeynman suspects (high-priority targets):\n${feynmanSuspects.join(', ') || 'none identified'}\n\nFeynman findings summary:\n${feynmanResult.summary || ''}`;

    stateResult = await chatCompletionJSON<StateResult>(
      model,
      STATE_SYSTEM,
      stateUserPrompt,
      { temperature: 0.1, max_tokens: 3000 }
    );
    console.log(`[NemesisAnalyzer] Pass 2 State: ${stateResult.findings?.length || 0} findings, ${stateResult.stateGaps?.length || 0} gaps`);
  } catch (err) {
    console.error('[NemesisAnalyzer] State pass failed:', err);
  }

  const stateFindings: RawNemesisFinding[] = Array.isArray(stateResult?.findings) ? stateResult.findings : [];
  const stateGaps: string[] = Array.isArray(stateResult?.stateGaps) ? stateResult.stateGaps : [];
  const newSuspects: string[] = Array.isArray(stateResult?.newSuspects) ? stateResult.newSuspects : [];

  // ── Iteration: Targeted Feynman Re-interrogation ──────────────────────────
  let allFindings: RawNemesisFinding[] = [...feynmanFindings, ...stateFindings];
  let iterations = 0;
  let currentSuspects = [...new Set([...feynmanSuspects, ...newSuspects])];
  let currentGaps = stateGaps;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (currentSuspects.length === 0 && currentGaps.length === 0) break;
    if (stateFindings.length === 0) break; // No new state findings to feed back

    try {
      const targetedPrompt = `Contract source:\n\`\`\`solidity\n${truncatedSource}\n\`\`\`\n\nSuspect functions:\n${currentSuspects.slice(0, 10).join(', ')}\n\nState gaps to investigate:\n${currentGaps.slice(0, 5).join('\n')}`;

      const iterResult = await chatCompletionJSON<FeynmanResult>(
        model,
        TARGETED_FEYNMAN_SYSTEM,
        targetedPrompt,
        { temperature: 0.1, max_tokens: 2000 }
      );

      const iterFindings: RawNemesisFinding[] = Array.isArray(iterResult?.findings) ? iterResult.findings : [];
      if (iterFindings.length === 0) break; // No new findings, stop iterating

      allFindings = [...allFindings, ...iterFindings];
      currentSuspects = Array.isArray(iterResult?.suspects) ? iterResult.suspects : [];
      iterations++;
      console.log(`[NemesisAnalyzer] Iteration ${i + 1}: ${iterFindings.length} new findings`);
    } catch (err) {
      console.error(`[NemesisAnalyzer] Iteration ${i + 1} failed:`, err);
      break;
    }
  }

  // ── Convert and deduplicate ───────────────────────────────────────────────
  const converted = allFindings.map((raw, idx) => rawToNemesisFinding(raw, idx));
  const deduped = deduplicateNemesisFindings(converted);

  console.log(`[NemesisAnalyzer] Complete: ${allFindings.length} raw → ${deduped.length} deduped findings (${iterations} extra iterations)`);

  return {
    findings: deduped,
    reconSummary,
    feynmanSuspects,
    stateGaps,
    iterations,
  };
}
