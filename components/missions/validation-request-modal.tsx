'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { formatAddress } from '@/lib/utils';
import type { Address } from 'viem';

interface Validator {
  id: string;
  erc8004AgentId: string;
  name: string;
  address: Address;
  reputationScore: number;
  validationCount?: number;
  approvalRate?: number;
  specialties: string[];
}

interface ValidationRequestModalProps {
  missionId: string;
  deliverableURI: string;
  onSubmit: (validatorAgentId: string, stake: number) => Promise<void>;
  onCancel: () => void;
}

export function ValidationRequestModal({
  missionId,
  deliverableURI,
  onSubmit,
  onCancel,
}: ValidationRequestModalProps) {
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number>(10); // Default 10 USDC
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // In production, fetch available validators from API
  // For now, using mock validators
  const availableValidators: Validator[] = [
    {
      id: 'validator-1',
      erc8004AgentId: '5',
      name: 'QualityCheck AI',
      address: '0x1234567890123456789012345678901234567890' as Address,
      reputationScore: 95,
      validationCount: 150,
      approvalRate: 82,
      specialties: ['Design', 'Branding', 'UI/UX'],
    },
    {
      id: 'validator-2',
      erc8004AgentId: '6',
      name: 'CodeReview Pro',
      address: '0x2345678901234567890123456789012345678901' as Address,
      reputationScore: 92,
      validationCount: 200,
      approvalRate: 88,
      specialties: ['Code', 'Security', 'Performance'],
    },
    {
      id: 'validator-3',
      erc8004AgentId: '7',
      name: 'ContentGuard',
      address: '0x3456789012345678901234567890123456789012' as Address,
      reputationScore: 89,
      validationCount: 120,
      approvalRate: 85,
      specialties: ['Copy', 'Marketing', 'SEO'],
    },
  ];

  const handleSubmit = async () => {
    if (!selectedValidator) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedValidator.erc8004AgentId, stakeAmount);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white border-4 border-black p-6 sm:p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              REQUEST VALIDATION
            </h2>
            {/* Info Icon */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="w-8 h-8 border-2 border-black hover:bg-black hover:text-white transition-colors flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>

          <p className="font-mono text-xs sm:text-sm text-black/60">
            Hire an independent validator to verify deliverable quality
          </p>

          {/* Info Dropdown */}
          {showInfo && (
            <div className="mt-4 border-2 border-black p-3 bg-gray-50">
              <p className="font-mono text-xs leading-relaxed mb-2">
                <span className="font-bold">How ERC-8004 Validation Works:</span>
              </p>
              <ul className="font-mono text-xs space-y-1 opacity-90">
                <li>• Select trusted validator agent</li>
                <li>• Validator stakes tokens to ensure honesty</li>
                <li>• Validator checks deliverable quality</li>
                <li>• You receive approval/rejection with proof</li>
                <li>• Validator earns reputation for accuracy</li>
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

        {/* Stake Amount */}
        <div className="mb-6">
          <label className="font-bold text-xs uppercase tracking-wide mb-2 block">
            VALIDATION STAKE (USDC)
          </label>
          <input
            type="number"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(Number(e.target.value))}
            min={1}
            max={1000}
            className="w-full px-4 py-3 border-2 border-black font-mono text-lg focus:outline-none"
            disabled={isSubmitting}
          />
          <p className="font-mono text-xs text-black/60 mt-2">
            Stake incentivizes honest validation. Higher stake = higher validator commitment.
          </p>
        </div>

        {/* Validator Selection */}
        <div className="mb-6">
          <label className="font-bold text-xs uppercase tracking-wide mb-3 block">
            SELECT VALIDATOR
          </label>

          <div className="space-y-3">
            {availableValidators.map((validator) => (
              <button
                key={validator.id}
                onClick={() => setSelectedValidator(validator)}
                disabled={isSubmitting}
                className={`w-full border-2 border-black p-4 text-left transition-all ${
                  selectedValidator?.id === validator.id
                    ? 'bg-black text-white'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold uppercase text-sm mb-1">
                      {validator.name}
                    </h3>
                    <p className="font-mono text-xs opacity-80">
                      {formatAddress(validator.address)} • ID #{validator.erc8004AgentId}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs opacity-60">SCORE</div>
                    <div className="font-black text-lg">{validator.reputationScore}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs">
                  <div>
                    <span className="opacity-60">Validations:</span>{' '}
                    <span className="font-bold">{validator.validationCount}</span>
                  </div>
                  <div>
                    <span className="opacity-60">Approval Rate:</span>{' '}
                    <span className="font-bold">{validator.approvalRate}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {validator.specialties.map((specialty) => (
                    <Badge
                      key={specialty}
                      variant="outline"
                      className={
                        selectedValidator?.id === validator.id
                          ? 'border-white text-white'
                          : 'border-black'
                      }
                    >
                      {specialty}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cost Summary */}
        {selectedValidator && (
          <div className="border-2 border-black p-4 bg-blue-50 mb-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase">TOTAL COST</span>
              <span className="font-black text-2xl">${stakeAmount} USDC</span>
            </div>
            <p className="font-mono text-xs text-black/60 mt-2">
              Stake will be held until validation completes. Returned if validation is accurate.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedValidator || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <Loader size="sm" />
                REQUESTING...
              </div>
            ) : (
              'REQUEST VALIDATION'
            )}
          </Button>
        </div>

        {/* On-chain notice */}
        <p className="text-center font-mono text-xs text-black/60 mt-4">
          This will create an on-chain transaction via ERC-8004 Validation Registry
        </p>
      </div>
    </div>
  );
}
