export function safeParseInt(value: string | null, fallback: number, min?: number, max?: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (isNaN(parsed)) return fallback;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

export function safeParseFloat(value: string | null, fallback: number, min?: number, max?: number): number {
  const parsed = parseFloat(value ?? '');
  if (isNaN(parsed)) return fallback;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}
