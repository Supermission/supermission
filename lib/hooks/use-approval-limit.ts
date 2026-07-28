import { useState, useCallback } from 'react';

const STORAGE_KEY = 'supermission-approval-limit';
const DEFAULT_APPROVAL = 100;

export function useApprovalLimit() {
  const [maxApproval, setMaxApprovalState] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_APPROVAL;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
    return DEFAULT_APPROVAL;
  });

  const setMaxApproval = useCallback((value: number) => {
    if (isNaN(value) || value <= 0) return;
    setMaxApprovalState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value.toString());
    } catch {}
  }, []);

  return { maxApproval, setMaxApproval };
}
