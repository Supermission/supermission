'use client';

import { useState } from 'react';
import { usePriceAlerts, type CreateAlertParams } from '@/lib/hooks/use-price-alerts';

interface AlertManagerProps {
  userAddress: string;
  conditionId?: string;
  tokenId?: string;
  outcome?: string;
}

export default function AlertManager({
  userAddress,
  conditionId: defaultConditionId,
  tokenId: defaultTokenId,
  outcome: defaultOutcome,
}: AlertManagerProps) {
  const { alerts, loading, createAlert, deleteAlert, toggleAlert } = usePriceAlerts(userAddress);

  // Form state
  const [conditionId, setConditionId] = useState(defaultConditionId || '');
  const [tokenId, setTokenId] = useState(defaultTokenId || '');
  const [outcome, setOutcome] = useState(defaultOutcome || '');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState('50');
  const [isRecurring, setIsRecurring] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const params: CreateAlertParams = {
      conditionId,
      tokenId,
      outcome,
      direction,
      threshold: parseFloat(threshold),
      isRecurring,
    };
    await createAlert(params);
    // Reset threshold after creation
    setThreshold('50');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-[#6b7280]">
        Price Alerts
      </h3>

      {/* Create Alert Form */}
      <form onSubmit={handleSubmit} className="mb-6 space-y-3">
        {/* Condition ID (hidden if pre-filled) */}
        {!defaultConditionId && (
          <input
            type="text"
            placeholder="Condition ID"
            value={conditionId}
            onChange={(e) => setConditionId(e.target.value)}
            className="w-full rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-sm text-[#3a3a3a] placeholder-[#9ca3af] focus:border-[#d1d5db] focus:outline-none"
            required
          />
        )}

        {/* Token ID (hidden if pre-filled) */}
        {!defaultTokenId && (
          <input
            type="text"
            placeholder="Token ID"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            className="w-full rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-sm text-[#3a3a3a] placeholder-[#9ca3af] focus:border-[#d1d5db] focus:outline-none"
            required
          />
        )}

        {/* Outcome (hidden if pre-filled) */}
        {!defaultOutcome && (
          <input
            type="text"
            placeholder="Outcome (e.g. Yes, No)"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-sm text-[#3a3a3a] placeholder-[#9ca3af] focus:border-[#d1d5db] focus:outline-none"
            required
          />
        )}

        {/* Direction + Threshold row */}
        <div className="flex items-center gap-2">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'above' | 'below')}
            className="rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-sm text-[#3a3a3a] focus:border-[#d1d5db] focus:outline-none"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>

          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="Threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 pr-8 text-sm text-[#3a3a3a] placeholder-[#9ca3af] focus:border-[#d1d5db] focus:outline-none"
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">
              c
            </span>
          </div>
        </div>

        {/* Recurring toggle */}
        <label className="flex items-center gap-2 text-sm text-[#6b7280]">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="rounded border-[#e5e7eb] bg-white text-emerald-500 focus:ring-0 focus:ring-offset-0"
          />
          Recurring (re-triggers after each match)
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[8px] bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Alert'}
        </button>
      </form>

      {/* Alerts List */}
      <div className="space-y-2">
        {alerts.length === 0 && (
          <p className="py-4 text-center text-sm text-[#9ca3af]">No alerts configured</p>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-[8px] border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {/* Direction icon */}
              <span
                className={`text-base ${alert.direction === 'above' ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {alert.direction === 'above' ? '\u25B2' : '\u25BC'}
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-[#3a3a3a]" title={alert.outcome}>
                    {alert.outcome.length > 24
                      ? alert.outcome.slice(0, 24) + '...'
                      : alert.outcome}
                  </span>
                  <span className="text-sm font-mono text-[#3a3a3a]">
                    {alert.threshold}c
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                  {/* Status badge */}
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      alert.is_active
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-[#f8fafc] text-[#9ca3af]'
                    }`}
                  >
                    {alert.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {alert.is_recurring && (
                    <span className="text-[#9ca3af]">recurring</span>
                  )}
                  <span>{formatDate(alert.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-2">
              {/* Toggle switch */}
              <button
                onClick={() => toggleAlert(alert.id, !alert.is_active)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  alert.is_active ? 'bg-emerald-600' : 'bg-[#d1d5db]'
                }`}
                title={alert.is_active ? 'Deactivate' : 'Activate'}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    alert.is_active ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              {/* Delete button */}
              <button
                onClick={() => deleteAlert(alert.id)}
                className="rounded p-1 text-[#9ca3af] transition-colors hover:bg-[#f8fafc] hover:text-red-400"
                title="Delete alert"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
