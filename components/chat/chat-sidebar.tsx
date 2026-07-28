'use client';

import { useChatStore, type ChatSession } from '@/lib/store/chat';
import { useUIStore } from '@/lib/store/ui';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { formatRelativeTime } from '@/lib/utils';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useAccount } from 'wagmi';
import { Trash2, X, Check, ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';

interface ChatSidebarProps {
  agentIdFilter?: string;
  embedded?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export function ChatSidebar({ agentIdFilter, embedded, isOpen: externalIsOpen, onToggle }: ChatSidebarProps = {}) {
  const [mounted, setMounted] = useState(false);
  const { sidebarOpen: globalIsOpen, setSidebarOpen: globalSetIsOpen } = useUIStore();
  const isOpen = embedded ? (externalIsOpen ?? false) : globalIsOpen;
  const setIsOpen = embedded ? (open: boolean) => onToggle?.(open) : globalSetIsOpen;
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { address: walletAddress } = useAccount();
  const sessions = useChatStore((state) => state.sessions);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const createNewSession = useChatStore((state) => state.createNewSession);
  const switchSession = useChatStore((state) => state.switchSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const renameSession = useChatStore((state) => state.renameSession);

  const sessionsList = useMemo(() => {
    return Object.values(sessions)
      .filter((s) => agentIdFilter ? s.selectedAgentId === agentIdFilter : true)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [sessions, agentIdFilter]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const filteredSessions = useMemo(() => {
    if (!isSearching) return sessionsList;
    return sessionsList.filter((s) => {
      if (s.title.toLowerCase().includes(trimmedQuery)) return true;
      return s.messages.some((m) => m.content.toLowerCase().includes(trimmedQuery));
    });
  }, [sessionsList, trimmedQuery, isSearching]);

  const groupedSessions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = startOfToday - 30 * 24 * 60 * 60 * 1000;

    const groups: { label: string; items: ChatSession[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous 7 days', items: [] },
      { label: 'Previous 30 days', items: [] },
      { label: 'Older', items: [] },
    ];

    for (const s of filteredSessions) {
      const t = s.lastMessageAt;
      if (t >= startOfToday) groups[0].items.push(s);
      else if (t >= startOfYesterday) groups[1].items.push(s);
      else if (t >= sevenDaysAgo) groups[2].items.push(s);
      else if (t >= thirtyDaysAgo) groups[3].items.push(s);
      else groups[4].items.push(s);
    }

    return groups.filter((g) => g.items.length > 0);
  }, [filteredSessions]);

  const startRename = (session: ChatSession) => {
    setRenamingId(session.id);
    setRenameDraft(session.title);
  };

  const commitRename = (session: ChatSession) => {
    const next = renameDraft.trim().slice(0, 100);
    if (next && next !== session.title) {
      renameSession(session.id, next);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const startNewChat = () => {
    const existingEmpty = sessionsList.find(
      (s) => s.title === 'New Chat' && s.messages.length === 0,
    );
    if (existingEmpty) {
      switchSession(existingEmpty.id);
    } else {
      createNewSession(agentIdFilter ?? undefined, walletAddress);
    }
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(sessionsList.map((s) => s.id)));
  };

  const exitBulkMode = () => {
    setBulkDeleteMode(false);
    setSelectedIds(new Set());
  };

  const confirmBulkDelete = () => {
    selectedIds.forEach((id) => deleteSession(id));
    exitBulkMode();
    setShowBulkConfirm(false);
  };

  // Wait for hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Global keyboard shortcuts (Cmd/Ctrl+Shift+O, Cmd/Ctrl+B, /) — must bind to window.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target?.isContentEditable ?? false);

      if (mod && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault();
        startNewChat();
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsOpen(!isOpen);
        return;
      }

      if (e.key === '/' && !mod && !e.altKey && !isTyping) {
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, setIsOpen, sessionsList, agentIdFilter, walletAddress, createNewSession, switchSession]);

  const renderSessionRow = (session: ChatSession) => {
    const isSelected = selectedIds.has(session.id);
    const isRenaming = renamingId === session.id;
    return (
      <div
        key={session.id}
        className={`group relative p-2.5 border cursor-pointer transition-colors ${
          bulkDeleteMode && isSelected
            ? 'border-red-400 bg-red-50 rounded-[8px]'
            : session.id === currentSessionId
            ? 'bg-[#f5f3f0] border border-[#e8e4df] rounded-[8px]'
            : 'border-transparent hover:bg-[#f7f7f7] bg-white rounded-[8px]'
        }`}
        onClick={() => {
          if (isRenaming) return;
          if (bulkDeleteMode) {
            toggleSelect(session.id);
            return;
          }
          switchSession(session.id);
          if (window.innerWidth < 1024) {
            setIsOpen(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          {bulkDeleteMode && (
            <div
              className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center mt-0.5 rounded-[4px] ${
                isSelected
                  ? 'bg-red-500 border-red-500 text-white'
                  : 'border-black/30'
              }`}
            >
              {isSelected && <Check size={10} />}
            </div>
          )}
          {isRenaming ? (
            <input
              type="text"
              value={renameDraft}
              autoFocus
              maxLength={100}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename(session);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={() => commitRename(session)}
              className="text-[13px] font-semibold flex-1 leading-tight bg-white border border-[#e5e7eb] rounded-[4px] px-1.5 py-0.5 outline-none focus:border-[#1a1a1a]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            />
          ) : (
            <h3
              className="text-[13px] font-semibold line-clamp-2 flex-1 leading-tight"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              onDoubleClick={(e) => {
                if (bulkDeleteMode) return;
                e.stopPropagation();
                startRename(session);
              }}
            >
              {session.title}
            </h3>
          )}
          {!bulkDeleteMode && !isRenaming && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(session);
                }}
                className={`w-5 h-5 flex items-center justify-center transition-all hover:bg-[#e8e4df] border border-[#e5e7eb] rounded-[4px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
                  session.id === currentSessionId
                    ? 'border-[#d1cdc8] text-[#6b7280]'
                    : 'text-[#6b7280]'
                }`}
                title="Rename chat"
                aria-label="Rename chat"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteSessionId(session.id);
                }}
                data-chat-delete-button
                className={`w-5 h-5 flex items-center justify-center transition-all hover:bg-red-500 hover:text-white border border-[#e5e7eb] rounded-[4px] ${
                  session.id === currentSessionId
                    ? 'border-[#d1cdc8] text-[#6b7280] hover:text-white'
                    : 'text-[#6b7280]'
                }`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span className="text-[#9ca3af]">
            {formatRelativeTime(session.lastMessageAt)}
          </span>
        </div>

        {session.messages.length > 0 && (
          <p className="font-mono text-[10px] text-[#9ca3af] line-clamp-1">
            {session.messages[session.messages.length - 1].content}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop Overlay (Mobile Only) */}
      {isOpen && (
        <div
          className={`lg:hidden fixed inset-0 bg-black/10 z-[60] ${embedded ? 'top-0' : 'top-14 sm:top-16'}`}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        data-chat-sidebar
        className={`${isOpen ? 'translate-x-0' : '-translate-x-full'
          } ${embedded
            ? 'lg:translate-x-0 fixed lg:relative top-0 left-0 bottom-2 h-[calc(100dvh-0.5rem)] lg:bottom-0 lg:h-full w-[80vw] lg:w-72 bg-white border-r border-[#e5e7eb] dark:border-r-0 transition-transform duration-300 z-[70] lg:z-auto flex flex-col overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] lg:shadow-none'
            : 'lg:translate-x-0 fixed lg:relative top-14 sm:top-16 lg:top-0 left-0 bottom-0 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] lg:h-full w-[80vw] lg:w-72 bg-white border-r border-[#e5e7eb] dark:border-r-0 transition-transform duration-300 z-[70] lg:z-auto flex flex-col overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)] lg:shadow-none'
          }`}
      >
        {/* Header */}
        <div className="border-b border-[#e5e7eb] p-3 relative">
          {/* Close Button (Mobile Only) */}
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden absolute top-3 right-3 p-1 hover:bg-[#f7f7f7] rounded-[4px] transition-colors z-10 dark:text-white dark:hover:bg-white/[0.08]"
            aria-label="Close menu"
          >
            <X size={20} className="text-black dark:text-white" />
          </button>

          {/* Back to home — mobile only */}
          <Link
            href="/"
            className="lg:hidden flex items-center gap-2 px-2 py-2 mb-2 text-[12px] font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors rounded-[6px] hover:bg-[#f7f7f7]"
            style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
          >
            <ArrowLeft size={13} />
            Back to Supermission
          </Link>

          {bulkDeleteMode ? (
            <div className="flex gap-2 pr-8 lg:pr-0">
              <Button
                onClick={() => {
                  if (selectedIds.size > 0) setShowBulkConfirm(true);
                }}
                disabled={selectedIds.size === 0}
                className="flex-1 h-9 text-[11px] font-bold uppercase bg-red-600 hover:bg-red-700 disabled:opacity-40"
                size="sm"
              >
                DELETE ({selectedIds.size})
              </Button>
              <Button
                onClick={selectAll}
                variant="outline"
                data-chat-sidebar-control
                className="h-9 text-[11px] font-bold uppercase px-2 dark:border-transparent dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.10]"
                size="sm"
              >
                ALL
              </Button>
              <Button
                onClick={exitBulkMode}
                variant="outline"
                data-chat-sidebar-control
                className="h-9 text-[11px] font-bold uppercase px-2 dark:border-transparent dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.10]"
                size="sm"
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pr-8 lg:pr-0">
              <Button
                onClick={startNewChat}
                className="flex-1 h-9 text-[11px] font-bold uppercase"
                size="sm"
              >
                + NEW CHAT
              </Button>
              {sessionsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBulkDeleteMode(true)}
                  data-chat-delete-button
                  className="h-9 px-2 rounded-[8px] border border-[#e5e7eb] dark:border-transparent bg-transparent dark:bg-white/[0.06] text-[#3a3a3a] dark:text-white hover:bg-[#f7f7f7] dark:hover:bg-white/[0.10] inline-flex items-center justify-center transition-colors"
                  title="Delete chats"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1 border-b border-[#f0ede8]">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full min-h-[36px] bg-transparent text-[13px] text-[#1a1a1a] placeholder:text-[#9ca3af] border-0 border-b border-transparent focus:border-[#e5e7eb] focus:outline-none px-0 py-2 transition-colors"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          />
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {!mounted ? (
            <div className="p-4 flex justify-center">
              <Loader size="md" />
            </div>
          ) : sessionsList.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                No conversations yet
              </p>
            </div>
          ) : isSearching && filteredSessions.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                No results
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {isSearching
                ? filteredSessions.map((session) => renderSessionRow(session))
                : groupedSessions.map((group) => (
                    <div key={group.label} className="space-y-1">
                      <div className="px-2 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-[#9ca3af]">
                        {group.label}
                      </div>
                      {group.items.map((session) => renderSessionRow(session))}
                    </div>
                  ))}
            </div>
          )}
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deleteSessionId && (
        <ConfirmModal
          title="DELETE CHAT?"
          message="This action cannot be undone. All messages in this chat will be permanently deleted."
          confirmText="DELETE"
          cancelText="CANCEL"
          onConfirm={() => {
            deleteSession(deleteSessionId);
            setDeleteSessionId(null);
          }}
          onCancel={() => setDeleteSessionId(null)}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <ConfirmModal
          title={`DELETE ${selectedIds.size} CHAT${selectedIds.size > 1 ? 'S' : ''}?`}
          message={`This will permanently delete ${selectedIds.size} chat${selectedIds.size > 1 ? 's' : ''}. This action cannot be undone.`}
          confirmText="DELETE ALL SELECTED"
          cancelText="CANCEL"
          onConfirm={confirmBulkDelete}
          onCancel={() => setShowBulkConfirm(false)}
        />
      )}
    </>
  );
}
