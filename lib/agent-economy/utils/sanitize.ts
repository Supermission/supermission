/**
 * Input Sanitization Utility
 * HTML-entity-escapes dangerous characters instead of stripping tags.
 * This prevents XSS while preserving readable content.
 */

const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const ESCAPE_RE = /[&<>"']/g;

/**
 * Sanitize user input by HTML-entity-escaping dangerous characters.
 * Returns an empty string for nullish values.
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(ESCAPE_RE, (ch) => ENTITY_MAP[ch] || ch);
}
