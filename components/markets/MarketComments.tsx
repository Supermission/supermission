'use client';

import React from 'react';
import { useMarketComments } from '@/lib/hooks/use-market-comments';
import type { CommentThread } from '@/lib/hooks/use-market-comments';
import type { Comment } from '@/lib/polymarket/api';
import { shortAddress } from '@/components/ui/contract-address';

interface MarketCommentsProps {
  conditionId: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  if (isNaN(then)) return '';

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function SkeletonComment({ indented = false }: { indented?: boolean }) {
  return (
    <div className={`animate-pulse ${indented ? 'ml-6 border-l border-[#e5e7eb] pl-4' : ''}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-3 w-20 bg-[#f8fafc]" />
        <div className="h-3 w-10 bg-[#f8fafc]" />
      </div>
      <div className="h-4 w-full max-w-xs bg-[#f8fafc] mb-1" />
      <div className="h-4 w-2/3 bg-[#f8fafc]" />
    </div>
  );
}

function CommentItem({ comment, indented = false }: { comment: Comment; indented?: boolean }) {
  return (
    <div
      className={`py-3 ${
        indented ? 'ml-6 border-l border-[#e5e7eb] pl-4' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono font-semibold text-[#6b7280]">
          {shortAddress(comment.author) || 'Anonymous'}
        </span>
        <span className="text-[9px] font-mono text-[#9ca3af]">
          {relativeTime(comment.createdAt)}
        </span>
        {comment.likes > 0 && (
          <span className="text-[9px] font-mono text-[#9ca3af] ml-auto flex items-center gap-0.5">
            <LikeIcon />
            {comment.likes}
          </span>
        )}
      </div>
      <p className="text-[11px] text-[#6b7280] leading-relaxed whitespace-pre-wrap break-words">
        {comment.content}
      </p>
    </div>
  );
}

function LikeIcon() {
  return (
    <svg
      className="w-3 h-3 inline-block"
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z" />
    </svg>
  );
}

function ThreadView({ thread }: { thread: CommentThread }) {
  return (
    <div className="border-b border-[#e5e7eb] last:border-b-0">
      <CommentItem comment={thread.comment} />
      {thread.replies.map((reply) => (
        <CommentItem key={reply.id} comment={reply} indented />
      ))}
    </div>
  );
}

export default function MarketComments({ conditionId }: MarketCommentsProps) {
  const { threads, loading, error, loadMore, hasMore } = useMarketComments(conditionId);

  return (
    <div>
      <span className="block text-[10px] font-bold text-[#9ca3af] mb-3">
        Comments
      </span>

      {error && (
        <p className="text-[11px] font-mono text-rose-500 mb-2">{error}</p>
      )}

      {loading && threads.length === 0 ? (
        <div className="space-y-4">
          <SkeletonComment />
          <SkeletonComment indented />
          <SkeletonComment />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-[11px] text-[#9ca3af] py-6 text-center">No comments yet</p>
      ) : (
        <div>
          <div className="border border-[#e5e7eb] rounded-[8px] overflow-hidden">
            <div className="divide-y divide-black/[0.06]">
              {threads.map((thread) => (
                <ThreadView key={thread.comment.id} thread={thread} />
              ))}
            </div>
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="mt-3 w-full border border-[#e5e7eb] rounded-[8px] bg-white px-3 py-2.5 text-[10px] font-bold text-[#9ca3af] hover:text-black hover:border-[#d1d5db] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Load more comments'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
