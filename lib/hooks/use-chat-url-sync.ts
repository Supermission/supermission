'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useChatStore } from '@/lib/store/chat';

interface UseChatUrlSyncOptions {
  /** Only adopt URL chat ids belonging to this agent */
  agentId: string;
  /** Wait for Supabase hydration before consuming the URL param */
  ready: boolean;
}

/**
 * Two-way sync between `?chat=<id>` and the current chat session.
 * - Adopts a valid URL chat id once hydration is ready.
 * - Reflects subsequent session switches back into the URL via shallow router.replace.
 */
export function useChatUrlSync({ agentId, ready }: UseChatUrlSyncOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get('chat');

  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const switchSession = useChatStore((s) => s.switchSession);

  // URL → state: when URL chat id differs from state, adopt it if it's a valid agent session.
  useEffect(() => {
    if (!ready || !urlChatId || urlChatId === currentSessionId) return;
    const session = useChatStore.getState().sessions[urlChatId];
    if (session && session.selectedAgentId === agentId) {
      switchSession(urlChatId);
    }
  }, [ready, urlChatId, currentSessionId, agentId, switchSession]);

  // state → URL: push currentSessionId into the URL. Skip on first render until we've
  // had a chance to consume the URL param; otherwise we'd overwrite it with a stale state.
  const hasSyncedFromUrlRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!hasSyncedFromUrlRef.current) {
      hasSyncedFromUrlRef.current = true;
      if (urlChatId) return;
    }
    if (!currentSessionId || currentSessionId === urlChatId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('chat', currentSessionId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentSessionId]);
}
