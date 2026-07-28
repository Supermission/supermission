import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/store/chat';

interface UseChatAutoScrollOptions {
  messages: Message[];
  sessionId: string | null;
  /** Extra dep that re-triggers scroll evaluation during streaming */
  streamingContent?: string;
  isLoading?: boolean;
}

/**
 * Auto-scroll behavior for chat UIs.
 *
 * - Tracks whether the user is near the bottom of the scroll container.
 * - On new assistant messages: only scrolls if already at bottom; otherwise bumps unreadCount.
 * - On new user messages or session switch: always scrolls (intentional action).
 * - Exposes a scrollToBottom handler for a manual "N new messages ↓" pill.
 */
export function useChatAutoScroll({
  messages,
  sessionId,
  streamingContent,
  isLoading,
}: UseChatAutoScrollOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAtBottomRef = useRef(true);
  isAtBottomRef.current = isAtBottom;

  const prevMessagesLengthRef = useRef(0);
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let frame = 0;
    const handle = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom));
      });
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => {
      el.removeEventListener('scroll', handle);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (isAtBottom) setUnreadCount(0);
  }, [isAtBottom]);

  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    const curLen = messages.length;
    const sessionSwitched =
      prevSessionIdRef.current !== null && prevSessionIdRef.current !== sessionId;
    const lastMsg = curLen > 0 ? messages[curLen - 1] : null;
    const isUserMessage = lastMsg?.role === 'user';
    const grew = curLen > prevLen;

    if (sessionSwitched) {
      setUnreadCount(0);
      setIsAtBottom(true);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      });
    } else if (isUserMessage || isAtBottomRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: isUserMessage ? ('instant' as ScrollBehavior) : 'smooth',
        });
      });
    } else if (grew && lastMsg?.role === 'assistant') {
      setUnreadCount((c) => c + (curLen - prevLen));
    }

    prevMessagesLengthRef.current = curLen;
    prevSessionIdRef.current = sessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, sessionId, streamingContent, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return { scrollContainerRef, messagesEndRef, isAtBottom, unreadCount, scrollToBottom };
}
