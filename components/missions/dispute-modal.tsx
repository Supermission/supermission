'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';

interface DisputeModalProps {
  missionId: string;
  deliverableURI: string;
  agentName: string;
  totalAmount: number;
  onSubmit: (claim: string) => Promise<void>;
  onCancel: () => void;
}

export function DisputeModal({
  missionId,
  deliverableURI,
  agentName,
  totalAmount,
  onSubmit,
  onCancel,
}: DisputeModalProps) {
  const [claim, setClaim] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const handleSubmit = async () => {
    if (!claim.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(claim);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Suggested dispute reasons
  const suggestedClaims = [
    {
      title: 'Incomplete Deliverable',
      template:
        'The deliverable does not meet the requirements specified in the mission. Missing: [specify what is missing]',
    },
    {
      title: 'Quality Issues',
      template:
        'The quality of work is below acceptable standards. Issues: [describe specific quality problems]',
    },
    {
      title: 'Off-Brand/Off-Brief',
      template:
        'The deliverable does not align with the brief provided. Deviations: [specify deviations from brief]',
    },
    {
      title: 'Technical Issues',
      template:
        'The deliverable has technical problems that prevent its use. Problems: [list technical issues]',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white border-4 border-black p-6 sm:p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              DISPUTE DELIVERABLE
            </h2>
            {/* Info Icon */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="w-8 h-8 border-2 border-black hover:bg-black hover:text-white transition-colors flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>

          <p className="font-mono text-xs sm:text-sm text-black/60">
            Escalate to UMA Optimistic Oracle for decentralized dispute resolution
          </p>

          {/* Info Dropdown */}
          {showInfo && (
            <div className="mt-4 border-2 border-black p-3 bg-gray-50">
              <p className="font-mono text-xs leading-relaxed mb-2">
                <span className="font-bold">How UMA Dispute Resolution Works:</span>
              </p>
              <ul className="font-mono text-xs space-y-1 opacity-90">
                <li>• You submit a claim describing the issue</li>
                <li>• Claim is posted to UMA Optimistic Oracle V3</li>
                <li>• Disputers review and verify your claim (48h window)</li>
                <li>• If claim is valid, escrow is refunded to you</li>
                <li>• If claim is invalid, payment goes to agent</li>
                <li>• Economic game theory ensures fairness</li>
              </ul>
            </div>
          )}
        </div>

        {/* Mission Info */}
        <div className="border-2 border-black p-4 mb-6 bg-gray-50">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-mono text-xs uppercase opacity-60 mb-1">Mission ID</div>
              <div className="font-mono text-xs">{missionId.slice(0, 20)}...</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase opacity-60 mb-1">Agent</div>
              <div className="font-mono text-xs font-bold">{agentName}</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase opacity-60 mb-1">Amount at Stake</div>
              <div className="font-mono text-sm font-black">${totalAmount} USDC</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase opacity-60 mb-1">Deliverable</div>
              <a
                href={deliverableURI}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs hover:underline truncate block"
              >
                View
              </a>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="border-2 border-orange-500 bg-orange-50 p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-bold text-sm text-orange-800 mb-1">IMPORTANT</p>
              <p className="font-mono text-xs text-orange-700 leading-relaxed">
                Disputes are resolved on-chain by UMA. False claims may result in you losing your
                bond. Only proceed if you have legitimate concerns about deliverable quality.
              </p>
            </div>
          </div>
        </div>

        {/* Suggested Claims */}
        <div className="mb-6">
          <label className="font-bold text-xs uppercase tracking-wide mb-3 block">
            COMMON DISPUTE REASONS (Click to use)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {suggestedClaims.map((suggested) => (
              <button
                key={suggested.title}
                onClick={() => setClaim(suggested.template)}
                disabled={isSubmitting}
                className="border-2 border-black p-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="font-bold text-xs uppercase mb-1">{suggested.title}</div>
                <div className="font-mono text-xs opacity-60 line-clamp-2">
                  {suggested.template.substring(0, 60)}...
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Claim Input */}
        <div className="mb-6">
          <label className="font-bold text-xs uppercase tracking-wide mb-2 block">
            DISPUTE CLAIM (Required)
          </label>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="Describe the specific issues with the deliverable. Be clear and factual. This will be reviewed by UMA disputers."
            className="w-full px-4 py-3 border-2 border-black font-mono text-sm focus:outline-none min-h-[150px] resize-y"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="font-mono text-xs text-black/60">
              {claim.length}/500 characters (minimum 50)
            </p>
            {claim.length < 50 && claim.length > 0 && (
              <p className="font-mono text-xs text-red-600">Claim too short</p>
            )}
          </div>
        </div>

        {/* Cost Summary */}
        <div className="border-2 border-black p-4 bg-red-50 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs uppercase">DISPUTE BOND</span>
            <span className="font-black text-lg">TBD by UMA</span>
          </div>
          <p className="font-mono text-xs text-black/60 leading-relaxed">
            UMA requires a bond to prevent spam. If your claim is valid, the bond is returned. If
            invalid, you may lose the bond. Bond amount is determined by UMA Oracle.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
            CANCEL
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!claim.trim() || claim.length < 50 || isSubmitting}
            className="flex-1 bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <Loader size="sm" />
                SUBMITTING...
              </div>
            ) : (
              'SUBMIT DISPUTE'
            )}
          </Button>
        </div>

        {/* On-chain notice */}
        <p className="text-center font-mono text-xs text-black/60 mt-4">
          This will create an on-chain assertion via UMA Optimistic Oracle V3
        </p>
      </div>
    </div>
  );
}
