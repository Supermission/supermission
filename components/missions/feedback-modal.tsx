'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { toast } from 'sonner';

interface FeedbackModalProps {
  missionId: string;
  agentName: string;
  agentId: string; // ERC-8004 agent ID
  agentAddress: string; // Agent wallet address
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onSkip: () => void;
}

export function FeedbackModal({ missionId, agentName, agentId, agentAddress, onSubmit, onSkip }: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      return; // Require at least 1 star
    }

    setIsSubmitting(true);
    try {
      await onSubmit(rating, comment);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#f5f5f5] border border-black max-w-lg w-full">
        {/* Header */}
        <div className="border-b border-black p-3 bg-black text-white">
          <h2 className="font-black text-sm uppercase">RATE YOUR EXPERIENCE</h2>
          <p className="font-mono text-xs text-white mt-1">
            How was your experience with {agentName}?
          </p>
        </div>

        <div className="p-4">{/* Content wrapper */}

        {/* Star Rating */}
        <div className="mb-3">
          <div className="flex gap-2 justify-center mb-2">
            {stars.map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="text-3xl transition-all duration-200 hover:scale-110"
                disabled={isSubmitting}
              >
                {(hoveredRating >= star || rating >= star) ? '★' : '☆'}
              </button>
            ))}
          </div>
          <p className="text-center font-mono text-[9px] opacity-60 uppercase">
            {rating === 0 && 'CLICK TO RATE'}
            {rating === 1 && 'POOR - NOT SATISFIED'}
            {rating === 2 && 'FAIR - BELOW EXPECTATIONS'}
            {rating === 3 && 'GOOD - MET EXPECTATIONS'}
            {rating === 4 && 'VERY GOOD - EXCEEDED EXPECTATIONS'}
            {rating === 5 && 'EXCELLENT - OUTSTANDING!'}
          </p>
        </div>

        {/* Comment (Optional) */}
        <div className="mb-3">
          <label className="block font-mono text-[9px] uppercase opacity-40 mb-2">
            Feedback (Optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience..."
            className="w-full h-24 px-3 py-2 border border-black bg-white font-mono text-xs resize-none focus:outline-none"
            disabled={isSubmitting}
            maxLength={500}
          />
          <p className="text-[9px] font-mono opacity-40 mt-1">
            {comment.length}/500 characters
          </p>
        </div>

        {/* Info */}
        <div className="mb-3 p-3 border border-black bg-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-purple-500 text-white font-bold text-[9px] uppercase border border-purple-500">
              ERC-8004 ON-CHAIN REPUTATION
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px]">
              {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(agentAddress);
                toast.success('Address copied!');
              }}
              className="w-5 h-5 border border-black hover:bg-blue-500 hover:border-blue-500 hover:text-white transition-colors flex items-center justify-center"
              title="Copy address"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button
              onClick={() => window.open(`https://basescan.org/address/${agentAddress}`, '_blank')}
              className="w-5 h-5 border border-black hover:bg-purple-500 hover:border-purple-500 hover:text-white transition-colors flex items-center justify-center"
              title="View on BaseScan"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            disabled={isSubmitting}
            className="flex-1 h-10 border border-black bg-[#f5f5f5] hover:bg-black hover:text-white transition-colors font-bold text-[10px] uppercase disabled:opacity-50"
          >
            SKIP
          </button>
          <Button
            onClick={handleSubmit}
            className="flex-1 h-10 text-[10px]"
            disabled={rating === 0 || isSubmitting}
            isLoading={isSubmitting}
          >
            {isSubmitting ? 'SUBMITTING...' : 'SUBMIT RATING'}
          </Button>
        </div>
        </div>{/* End content wrapper */}
      </div>
    </div>
  );
}
