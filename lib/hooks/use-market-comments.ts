import { useMemo, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchComments } from '@/lib/polymarket/api';
import type { Comment } from '@/lib/polymarket/api';

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

interface UseMarketCommentsResult {
  comments: Comment[];
  threads: CommentThread[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
}

export function useMarketComments(conditionId: string): UseMarketCommentsResult {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['market-comments', conditionId],
    queryFn: ({ pageParam }) => fetchComments(conditionId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!conditionId,
  });

  const comments = useMemo(
    () => data?.pages.flatMap((page) => page.comments) ?? [],
    [data],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Group comments into threads: top-level parents with nested replies
  const threads = useMemo(() => {
    const parentMap = new Map<string, Comment>();
    const replyMap = new Map<string, Comment[]>();

    // First pass: identify parents and replies
    for (const c of comments) {
      if (!c.parentId) {
        parentMap.set(c.id, c);
      } else {
        const existing = replyMap.get(c.parentId) || [];
        existing.push(c);
        replyMap.set(c.parentId, existing);
      }
    }

    // Build threads from top-level comments
    const result: CommentThread[] = [];
    for (const c of comments) {
      if (!c.parentId) {
        result.push({
          comment: c,
          replies: (replyMap.get(c.id) || []).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        });
      }
    }

    // Also include orphan replies (parent not in current page) as standalone threads
    for (const c of comments) {
      if (c.parentId && !parentMap.has(c.parentId)) {
        result.push({ comment: c, replies: [] });
      }
    }

    return result;
  }, [comments]);

  return {
    comments,
    threads,
    loading: isLoading || isFetchingNextPage,
    error: error ? (error instanceof Error ? error.message : 'Failed to load comments') : null,
    loadMore,
    hasMore: !!hasNextPage,
  };
}
