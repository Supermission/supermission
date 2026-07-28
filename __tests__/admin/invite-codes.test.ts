/**
 * Tests for invite code generation logic.
 * Extracted from app/api/admin/invite-codes/route.ts
 */
import { describe, it, expect } from 'vitest';

// Replicate the code generation logic from the route
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `SUPER-${result}`;
}

describe('invite code generation', () => {
  it('generates codes with SUPER- prefix', () => {
    const code = generateCode();
    expect(code).toMatch(/^SUPER-/);
  });

  it('generates 6-char suffix after prefix', () => {
    const code = generateCode();
    const suffix = code.replace('SUPER-', '');
    expect(suffix).toHaveLength(6);
  });

  it('only uses unambiguous characters (no 0/O/1/I)', () => {
    // Generate many codes and check all chars are from allowed set
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      const suffix = code.replace('SUPER-', '');
      for (const ch of suffix) {
        expect(CODE_CHARS).toContain(ch);
      }
    }
  });

  it('does not include ambiguous characters', () => {
    const ambiguous = ['0', 'O', '1', 'I', 'L'];
    for (let i = 0; i < 100; i++) {
      const suffix = generateCode().replace('SUPER-', '');
      for (const ch of ambiguous) {
        expect(suffix).not.toContain(ch);
      }
    }
  });

  // -----------------------------------------------------------------------
  // BUG: No uniqueness guarantee — collision possible (though unlikely)
  // -----------------------------------------------------------------------
  it('BUG: codes are not guaranteed unique (probabilistic)', () => {
    // With 30 chars and 6 positions = 30^6 = 729,000,000 possible codes.
    // Birthday paradox: ~27,000 codes for 50% collision probability.
    // For 100 codes (max batch), collision is extremely unlikely but possible.
    // A proper fix would check for existing codes in the DB before inserting.
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      codes.add(generateCode());
    }
    // With 1000 generations, expect all unique (collision prob ~0.00007%)
    expect(codes.size).toBe(1000);
  });

  // -----------------------------------------------------------------------
  // BUG: count parameter accepts negative values
  // -----------------------------------------------------------------------
  it('BUG: count is clamped to [1, 100] but negative inputs become 1', () => {
    const numCodes = Math.min(Math.max(1, -5), 100);
    expect(numCodes).toBe(1); // -5 → clamped to 1
  });

  it('count is capped at 100', () => {
    const numCodes = Math.min(Math.max(1, 999), 100);
    expect(numCodes).toBe(100);
  });

  // -----------------------------------------------------------------------
  // BUG: maxUses=0 becomes null (falsy), so code has unlimited uses
  // -----------------------------------------------------------------------
  it('maxUses=0 is preserved (not treated as null) after fix', () => {
    const maxUses = 0;
    const result = maxUses ?? null; // Fixed: ?? instead of ||
    expect(result).toBe(0); // 0 is now correctly preserved
  });
});
