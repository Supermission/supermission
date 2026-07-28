'use client';

import { useState, useCallback } from 'react';

interface ComplianceResult {
  safe: boolean;
  screened: boolean;
  riskLevel?: string;
  riskScore?: number;
  flags?: string[];
  reason?: string;
}

export function useComplianceCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [lastResult, setLastResult] = useState<ComplianceResult | null>(null);

  const checkAddress = useCallback(async (
    address: string,
    chainId: number = 8453
  ): Promise<ComplianceResult> => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/circle/compliance/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, chainId }),
      });

      const result = await res.json();
      setLastResult(result);
      return result;
    } catch {
      const fallback = { safe: true, screened: false };
      setLastResult(fallback);
      return fallback;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { checkAddress, isChecking, lastResult };
}
