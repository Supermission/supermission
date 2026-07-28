import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Redis client before importing cachedFetch
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock('./client', () => ({
  redis: {
    get: (...args: any[]) => mockGet(...args),
    set: (...args: any[]) => mockSet(...args),
    del: (...args: any[]) => mockDel(...args),
  },
}));

import { cachedFetch, invalidateCache } from './cache';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: set succeeds
  mockSet.mockResolvedValue('OK');
});

describe('cachedFetch', () => {
  it('returns cached value on Redis hit', async () => {
    mockGet.mockResolvedValue({ price: 3500 });

    const fetcher = vi.fn();
    const result = await cachedFetch('price:eth', 60, fetcher);

    expect(result).toEqual({ price: 3500 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('price:eth');
  });

  it('calls fetcher and stores result on Redis miss', async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue({ price: 3500 });

    const result = await cachedFetch('price:eth', 60, fetcher);

    expect(result).toEqual({ price: 3500 });
    expect(fetcher).toHaveBeenCalledOnce();
    // set is fire-and-forget, wait a tick
    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'price:eth',
        JSON.stringify({ price: 3500 }),
        { ex: 60 },
      );
    });
  });

  it('falls through to fetcher when Redis GET fails', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'));
    const fetcher = vi.fn().mockResolvedValue({ fallback: true });

    const result = await cachedFetch('key', 30, fetcher);

    expect(result).toEqual({ fallback: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('still returns fresh data even when Redis SET fails', async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockRejectedValue(new Error('write error'));
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

    const result = await cachedFetch('key', 30, fetcher);

    expect(result).toEqual({ data: 'fresh' });
  });

  it('propagates fetcher errors (does not swallow them)', async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'));

    await expect(cachedFetch('key', 30, fetcher)).rejects.toThrow('API down');
  });

  it('treats undefined cache value as a miss', async () => {
    mockGet.mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue('hello');

    const result = await cachedFetch('key', 10, fetcher);

    expect(result).toBe('hello');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('passes correct TTL to Redis SET', async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue('x');

    await cachedFetch('k', 300, fetcher);

    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('k', JSON.stringify('x'), { ex: 300 });
    });
  });
});

describe('invalidateCache', () => {
  it('deletes the key from Redis', async () => {
    mockDel.mockResolvedValue(1);

    await invalidateCache('price:eth');

    expect(mockDel).toHaveBeenCalledWith('price:eth');
  });

  it('does not throw when Redis DEL fails', async () => {
    mockDel.mockRejectedValue(new Error('connection refused'));

    await expect(invalidateCache('key')).resolves.toBeUndefined();
  });
});
