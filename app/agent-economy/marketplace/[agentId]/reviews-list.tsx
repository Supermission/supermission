'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Star } from 'lucide-react';
import { formatAddress } from '@/lib/utils';

const fontStyle = { fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;

interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewerAddress: string;
  createdAt: string;
}

export function ReviewsList({ reviews }: { reviews: Review[] }) {
  const [expandedReview, setExpandedReview] = useState<string | null>(null);

  return (
    <div className="border border-[#e7e9eb] bg-[#fafbfc] rounded-[16px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.04)] overflow-hidden" style={fontStyle}>
      <div className="px-5 py-3 border-b border-[#e7e9eb] flex items-center justify-between">
        <h2 className="font-bold text-sm text-[#3a3a3a]">Reviews</h2>
        <span className="text-[12px] text-[#6b7280]">{reviews.length}</span>
      </div>

      <div>
        {reviews.map((review, index) => (
          <div key={review.id}>
            <button
              onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
              className={`w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#f1f3f4] transition-colors text-left ${
                index < reviews.length - 1 && expandedReview !== review.id ? 'border-b border-[#e7e9eb]' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-[#e7e9eb]'}`}
                    />
                  ))}
                </div>
                <span className="text-[13px] text-[#48484b]">{formatAddress(review.reviewerAddress)}</span>
                <span className="text-[12px] text-[#6b7280]">
                  {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#6b7280] transition-transform ${expandedReview === review.id ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {expandedReview === review.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className={`px-5 pb-4 ${index < reviews.length - 1 ? 'border-b border-[#e7e9eb]' : ''}`}>
                    <div className="bg-[#f1f3f4] p-4 rounded-[8px] border-l-2 border-[#e7e9eb]">
                      <p className="text-[13px] text-[#48484b] leading-relaxed">{review.comment}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
