'use client';

import { useState, useRef, useEffect } from 'react';
import { usePriceAlerts } from '@/lib/hooks/use-price-alerts';
import { useTradingStore } from '@/lib/store/trading';

interface NotificationCenterProps {
  userAddress: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationCenter({ userAddress }: NotificationCenterProps) {
  const { notifications, markAsRead, refresh } = usePriceAlerts(userAddress);
  const unreadCount = useTradingStore((s) => s.unreadNotifications);
  const markNotificationsRead = useTradingStore((s) => s.markNotificationsRead);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/alerts/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress, markAllRead: true }),
      });
      if (res.ok) {
        markNotificationsRead();
        await refresh();
      }
    } catch (err) {
      console.error('[NotificationCenter] markAllRead error:', err);
    }
  };

  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      await markAsRead(notificationId);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell icon button */}
      <button
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-[#6b7280] transition-colors hover:bg-[#f7f7f7] hover:text-[#3a3a3a]"
        title="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3">
            <span className="text-sm font-semibold text-[#3a3a3a]">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#9ca3af]">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif.id, notif.is_read)}
                  className={`w-full border-b border-[#e5e7eb] px-4 py-3 text-left transition-colors hover:bg-[#f7f7f7] ${
                    notif.is_read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    {!notif.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    )}
                    <div className={`min-w-0 ${notif.is_read ? 'pl-4' : ''}`}>
                      <p className="text-sm text-[#3a3a3a]">{notif.message}</p>
                      <p className="mt-0.5 text-xs text-[#9ca3af]">
                        {timeAgo(notif.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
