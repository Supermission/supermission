'use client';

import { useSyncExternalStore } from 'react';

/**
 * Shared 1-second timer for all countdown components.
 * One setInterval for the entire app instead of N per visible card.
 */

let now = Date.now();
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  if (interval) return;
  interval = setInterval(() => {
    now = Date.now();
    for (const cb of listeners) cb();
  }, 1000);
}

function stopTimer() {
  if (interval && listeners.size === 0) {
    clearInterval(interval);
    interval = null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  startTimer();
  return () => {
    listeners.delete(cb);
    stopTimer();
  };
}

function getSnapshot() {
  return now;
}

export function useSharedNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
