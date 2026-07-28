'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

const db = supabase;
const CACHE_KEY = 'watchlist_cache';

export interface WatchlistEntry {
  condition_id: string;
  created_at: string;
}

function readCache(userAddress: string): Set<string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (parsed.address?.toLowerCase() === userAddress.toLowerCase() && Array.isArray(parsed.ids)) {
      return new Set(parsed.ids);
    }
  } catch {}
  return new Set();
}

function readEntriesCache(userAddress: string): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.address?.toLowerCase() === userAddress.toLowerCase() && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch {}
  return [];
}

function writeCache(userAddress: string, ids: Set<string>, entries: WatchlistEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      address: userAddress.toLowerCase(),
      ids: Array.from(ids),
      entries,
    }));
  } catch {}
}

export function useWatchlist(userAddress: string | undefined) {
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !userAddress) return new Set();
    return readCache(userAddress);
  });
  const [entries, setEntries] = useState<WatchlistEntry[]>(() => {
    if (typeof window === 'undefined' || !userAddress) return [];
    return readEntriesCache(userAddress);
  });
  const [loading, setLoading] = useState(false);

  // Fetch watchlist on mount, using localStorage as immediate fallback
  useEffect(() => {
    if (!userAddress) {
      setWatchlist(new Set());
      setEntries([]);
      return;
    }

    // Read cache immediately for instant display
    const cached = readCache(userAddress);
    if (cached.size > 0) {
      setWatchlist(cached);
      setEntries(readEntriesCache(userAddress));
    }

    setLoading(true);
    db
      .from('user_watchlists')
      .select('condition_id, created_at')
      .eq('user_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const fresh = new Set(data.map((d) => d.condition_id));
          const freshEntries: WatchlistEntry[] = data.map((d) => ({
            condition_id: d.condition_id,
            created_at: d.created_at || '',
          }));
          setWatchlist(fresh);
          setEntries(freshEntries);
          writeCache(userAddress, fresh, freshEntries);
        }
        setLoading(false);
      });
  }, [userAddress]);

  // Stable toggle function - use ref for watchlist to avoid recreating on every render
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const toggle = useCallback(async (conditionId: string) => {
    if (!userAddress) return;

    const addr = userAddress.toLowerCase();
    const currentWatchlist = watchlistRef.current;
    const currentEntries = entriesRef.current;
    const isWatched = currentWatchlist.has(conditionId);

    // Optimistic update
    setWatchlist(prev => {
      const next = new Set(prev);
      if (isWatched) {
        next.delete(conditionId);
      } else {
        next.add(conditionId);
      }
      const nextEntries = isWatched
        ? currentEntries.filter(e => e.condition_id !== conditionId)
        : [{ condition_id: conditionId, created_at: new Date().toISOString() }, ...currentEntries];
      setEntries(nextEntries);
      writeCache(userAddress, next, nextEntries);
      return next;
    });

    try {
      if (isWatched) {
        await db
          .from('user_watchlists')
          .delete()
          .eq('user_address', addr)
          .eq('condition_id', conditionId);
      } else {
        await db
          .from('user_watchlists')
          .insert({ user_address: addr, condition_id: conditionId });
      }
    } catch {
      // Revert on failure
      setWatchlist(prev => {
        const next = new Set(prev);
        if (isWatched) {
          next.add(conditionId);
        } else {
          next.delete(conditionId);
        }
        const revertedEntries = isWatched
          ? [{ condition_id: conditionId, created_at: new Date().toISOString() }, ...currentEntries]
          : currentEntries.filter(e => e.condition_id !== conditionId);
        setEntries(revertedEntries);
        writeCache(userAddress, next, revertedEntries);
        return next;
      });
    }
  }, [userAddress]);

  const isWatched = useCallback((conditionId: string) => {
    return watchlist.has(conditionId);
  }, [watchlist]);

  return { watchlist, entries, loading, toggle, isWatched };
}
