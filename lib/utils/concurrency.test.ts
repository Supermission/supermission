import { describe, it, expect } from 'vitest';
import { mapWithLimit } from './concurrency';

describe('mapWithLimit', () => {
  it('produces results in the same order as input', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithLimit(items, 2, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithLimit(items, 3, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
    });

    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it('handles empty array', async () => {
    const results = await mapWithLimit([], 5, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it('propagates errors', async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');
  });

  it('works when limit exceeds item count', async () => {
    const results = await mapWithLimit([1, 2], 100, async (n) => n * 2);
    expect(results).toEqual([2, 4]);
  });
});
