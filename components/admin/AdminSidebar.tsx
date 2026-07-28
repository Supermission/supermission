'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Markets', href: '/admin/market' },
  { label: 'Perps', href: '/admin/perps' },
  { label: 'AI Performance', href: '/admin/ai' },
  { label: 'Agent Economy', href: '/admin/agents' },
  { label: 'Revenue', href: '/admin/revenue' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Activity', href: '/admin/activity' },
  { label: 'System Health', href: '/admin/system' },
  { label: 'Waitlist', href: '/admin/waitlist' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeLabel =
    NAV_ITEMS.find(
      (i) => pathname === i.href || pathname.startsWith(i.href + '/'),
    )?.label ?? 'Admin';

  const navContent = (
    <>
      <div className="px-5 py-5 border-b border-[#e5e7eb]">
        <Link
          href="/admin/market"
          onClick={() => setOpen(false)}
          className="flex items-center"
        >
          <span className="text-[13px] font-bold text-[#1a1a1a] tracking-tight">
            Admin
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-semibold transition-all ${
                active
                  ? 'bg-[#1a1a1a] text-white shadow-sm'
                  : 'text-gray-500 hover:text-[#1a1a1a] hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[#e5e7eb]">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-3 py-2 text-[12px] text-gray-400 hover:text-[#1a1a1a] transition-colors font-medium"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to App
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-12 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          className="p-1.5 -ml-1.5 text-[#1a1a1a]"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="text-[13px] font-bold tracking-tight text-[#1a1a1a]">
          {activeLabel}
        </span>
        <span className="w-5" />
      </div>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-[#e5e7eb] bg-white min-h-screen flex-col">
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white border-r border-[#e5e7eb] flex flex-col shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
