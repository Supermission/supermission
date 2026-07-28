'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import Image from 'next/image';
import { useUIStore } from '@/lib/store/ui';
import { useAuth } from '@/components/auth/require-auth';
import { SettingsDropdown } from '@/components/layout/SettingsDropdown';
import { useAgentStatusStore, type AgentId } from '@/lib/stores/agent-status';



const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const WalletSkeleton = () => (
  <div className="h-10 w-[106px] rounded-[10px] bg-[#1a1a1a]/10 animate-pulse" />
);

const UnifiedWalletConnect = dynamic(
  () => import('@/components/wallet/unified-connect').then(mod => mod.UnifiedWalletConnect),
  { ssr: false, loading: WalletSkeleton }
);

const AGENT_ITEMS: Array<{
  href: string; label: string; desc: string; color: string; avatar: string; statusId: AgentId;
}> = [
  { href: '/defai', label: 'Delphi', desc: 'DeFi Agent', color: '#10b981', avatar: '/avatars/delphi.svg', statusId: 'delphi' },
  { href: '/markets?tab=agent', label: 'Oracle', desc: 'Prediction Markets', color: '#6366f1', avatar: '/avatars/oracle.svg', statusId: 'oracle' },
  { href: '/security', label: 'Securo', desc: 'Security Audit', color: '#f59e0b', avatar: '/avatars/securo.svg', statusId: 'securo' },
  { href: '/perps?tab=hyperion', label: 'Hyperion', desc: 'Perpetual Trading', color: '#7c3aed', avatar: '/avatars/hyperion.svg', statusId: 'hyperion' },
  { href: '/roro', label: 'Roro', desc: 'Stocks & Options', color: '#22c55e', avatar: '/avatars/roro.svg', statusId: 'roro' },
];

const TERMINAL_ITEMS: Array<{ href: string; label: string; desc: string; icon?: ReactNode }> = [
  {
    href: '/markets', label: 'Markets', desc: 'Prediction markets',
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-[#f5f3f0] flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
          <path d="M4 20V11M10 20V4M16 20v-6M4 20h16" />
        </svg>
      </div>
    ),
  },
  {
    href: '/perps', label: 'Perps', desc: 'Perpetual trading',
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-[#f5f3f0] flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
          <path d="M8 3v4M8 15v6" /><rect x="5.5" y="7" width="5" height="8" rx="1" />
          <path d="M16 3v6M16 17v4" /><rect x="13.5" y="9" width="5" height="8" rx="1" />
        </svg>
      </div>
    ),
  },
  {
    href: '/dashboard', label: 'Dashboard', desc: 'Portfolio overview',
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_rgba(0,0,0,0.18)]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7.5" height="9" rx="1.6" fill="#fff" />
          <rect x="13.5" y="3" width="7.5" height="5" rx="1.6" fill="#fff" fillOpacity="0.62" />
          <rect x="13.5" y="11" width="7.5" height="10" rx="1.6" fill="#fff" />
          <rect x="3" y="15" width="7.5" height="6" rx="1.6" fill="#fff" fillOpacity="0.62" />
        </svg>
      </div>
    ),
  },
];

const RESOURCE_ITEMS: Array<{ href: string; label: string; desc: string; external?: boolean; icon?: ReactNode }> = [
  {
    href: '/how-it-works', label: 'How It Works', desc: 'Product walkthrough',
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-[#f5f3f0] flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
          <circle cx="12" cy="12" r="9" /><path d="M10 8.5l6 3.5-6 3.5z" />
        </svg>
      </div>
    ),
  },
  {
    href: '/blog', label: 'Blog', desc: 'Updates & research',
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-[#f5f3f0] flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
          <path d="M5 5h14M5 10h14M5 15h9M5 20h6" />
        </svg>
      </div>
    ),
  },
  {
    href: 'https://docs.supermission.fun', label: 'Docs', desc: 'Developer documentation', external: true,
    icon: (
      <div className="w-8 h-8 rounded-[9px] bg-[#f5f3f0] flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      </div>
    ),
  },
];

function NavDropdown({ label, items, isActive }: {
  label: string;
  items: Array<{ href: string; label: string; desc: string; external?: boolean; icon?: ReactNode }>;
  isActive: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(!open)}
        className={`text-[15px] font-semibold px-4 py-2 rounded-[8px] transition-all duration-200 flex items-center gap-1.5 ${
          isActive
            ? 'bg-[#f5f3f0] border border-[#e8e4df] text-[#1a1a1a]'
            : 'text-[#3a3a3a] hover:bg-[#f5f3f0] hover:text-[#1a1a1a]'
        }`}
        style={{ fontFamily: FONT }}
      >
        {label}
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          paddingTop: 6,
          transform: open ? 'translateX(-50%) scale(1)' : 'translateX(-50%) translateY(-4px) scale(0.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100,
          width: 240,
        }}
      >
        <div
          data-site-dropdown-panel=""
          style={{
            background: '#ffffff',
            border: '1px solid #e8e4df',
            borderRadius: 14,
            padding: 6,
            boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {items.map((item, i) => {
            const active = !item.external && pathname === item.href;
            const rowClassName = `flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-200 group ${
              active ? 'bg-[#f5f3f0]' : 'hover:bg-[#fafaf8]'
            }`;
            const rowStyle = { transitionDelay: open ? `${i * 40}ms` : '0ms' };
            const rowBody = (
              <>
                {item.icon && <div className="flex-shrink-0">{item.icon}</div>}
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-[#1a1a1a] block" style={{ fontFamily: FONT }}>
                    {item.label}
                  </span>
                  <span className="text-[11px] text-[#999] mt-0.5 block">{item.desc}</span>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                  className="opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-x-1 group-hover:translate-x-0 flex-shrink-0"
                >
                  <path d="M5 3l4 4-4 4" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            );

            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-site-dropdown-row=""
                  onClick={() => setOpen(false)}
                  className={rowClassName}
                  style={rowStyle}
                >
                  {rowBody}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                data-site-dropdown-row=""
                data-active={active ? 'true' : undefined}
                onClick={() => setOpen(false)}
                className={rowClassName}
                style={rowStyle}
              >
                {rowBody}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgentsDropdown({ isActive }: { isActive: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const agentStatuses = useAgentStatusStore(s => s.statuses);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(!open)}
        className={`text-[15px] font-semibold px-4 py-2 rounded-[8px] transition-all duration-200 flex items-center gap-1.5 ${
          isActive
            ? 'bg-[#f5f3f0] border border-[#e8e4df] text-[#1a1a1a]'
            : 'text-[#3a3a3a] hover:bg-[#f5f3f0] hover:text-[#1a1a1a]'
        }`}
        style={{ fontFamily: FONT }}
      >
        Agents
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          paddingTop: 6,
          transform: open ? 'translateX(-50%) scale(1)' : 'translateX(-50%) translateY(-4px) scale(0.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100,
          width: 260,
        }}
      >
        <div
          data-site-dropdown-panel=""
          style={{
            background: '#ffffff',
            border: '1px solid #e8e4df',
            borderRadius: 14,
            padding: 6,
            boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {AGENT_ITEMS.map((agent, i) => {
            const hrefPath = agent.href.split('?')[0];
            const active = pathname.startsWith(hrefPath);
            return (
              <Link
                key={agent.href}
                href={agent.href}
                data-site-dropdown-row=""
                data-active={active ? 'true' : undefined}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-[10px] transition-all duration-200 group ${
                  active ? 'bg-[#f5f3f0]' : 'hover:bg-[#fafaf8]'
                }`}
                style={{
                  transitionDelay: open ? `${i * 40}ms` : '0ms',
                }}
              >
                <div
                  style={{
                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                  className="group-hover:scale-110 flex-shrink-0"
                >
                  <Image src={agent.avatar} alt={agent.label} width={32} height={32} className="rounded-[6px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-semibold text-[#1a1a1a]"
                      style={{ fontFamily: FONT }}
                    >
                      {agent.label}
                    </span>
                    {active && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: agent.color,
                          display: 'inline-block',
                          boxShadow: `0 0 6px ${agent.color}50`,
                        }}
                      />
                    )}
                    {agentStatuses[agent.statusId] !== 'unknown' && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: agentStatuses[agent.statusId] === 'ok' ? '#22c55e' : '#ef4444',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] text-[#999] mt-0.5 block">{agent.desc}</span>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                  className="opacity-0 group-hover:opacity-100 transition-all duration-200 -translate-x-1 group-hover:translate-x-0"
                >
                  <path d="M5 3l4 4-4 4" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  autoOpenWallet?: boolean;
  variant?: 'default' | 'dashboard';
  /** Optional node rendered immediately before the wallet button (e.g. a theme toggle). */
  rightExtra?: React.ReactNode;
  /** Render `rightExtra` after the wallet pill (used by dashboard for balance). */
  rightExtraAfterWallet?: boolean;
  /** Hide the default settings cog (use when passing a custom SettingsDropdown via rightExtra). */
  hideSettings?: boolean;
}

export function Header({ autoOpenWallet = false, variant = 'default', rightExtra, rightExtraAfterWallet = false, hideSettings = false }: HeaderProps = {}) {
  const pathname = usePathname();
  const { setSidebarOpen } = useUIStore();
  const auth = useAuth();
  // Full nav shows for any signed-in user (waitlist removed — sign-in is the only gate).
  const isApproved = !!auth?.authenticated;

  const isActive = (path: string) => pathname === path;
  const isAgentActive = pathname === '/defai' || pathname === '/security';
  const isTerminalActive = pathname.startsWith('/markets') || pathname.startsWith('/perps') || pathname.startsWith('/spot') || pathname.startsWith('/dashboard');
  const isResourcesActive = pathname === '/how-it-works' || pathname.startsWith('/blog');

  const publicNavLinks = [
    { href: '__resources__', label: 'Resources' },
    { href: '/mission', label: '$MISSION' },
  ];
  const gatedNavLinks = [
    { href: '__terminal__', label: 'Terminal' },
    { href: '__agents__', label: 'Agents' },
  ];
  const navLinks = isApproved ? [...gatedNavLinks, ...publicNavLinks] : publicNavLinks;

  const isChatPage = pathname === '/security' || pathname === '/defai';

  const [dashMenuOpen, setDashMenuOpen] = useState(false);

  // Navbar is flat at the top of the page and only gains its rounded bottom +
  // shadow once scrolled (see .site-navbar[data-scrolled] in globals.css).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (variant === 'dashboard') {
    return (
      <header data-scrolled={scrolled ? 'true' : 'false'} className="fixed top-0 left-0 right-0 z-50 site-navbar">
        <div className="px-4 sm:px-6 md:px-8">
          <div className="flex h-14 sm:h-16 items-center">
            {/* Mobile: sidebar toggle + hamburger only */}
            <div className="flex sm:hidden items-center gap-2">
              {isChatPage && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors"
                  aria-label="Open chat history"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setDashMenuOpen(!dashMenuOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-[8px] border border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors"
                aria-label="Menu"
              >
                {dashMenuOpen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                )}
              </button>
            </div>

            {/* Desktop: Back link on chat pages, logo otherwise */}
            {isChatPage ? (
              <Link
                href="/"
                className="hidden sm:flex group items-center gap-2 text-[11px] sm:text-xs font-bold text-black transition-all duration-300 flex-shrink-0"
                style={{ fontFamily: FONT }}
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
                  className="group-hover:-translate-x-0.5 transition-transform flex-shrink-0"
                >
                  <path d="m12 19-7-7 7-7" />
                  <path d="M19 12H5" />
                </svg>
                <span>Back to Supermission</span>
              </Link>
            ) : (
              <Link
                href="/"
                className="hidden sm:flex group items-center gap-2 transition-all duration-300"
              >
                <div className="relative w-7 h-7 flex-shrink-0 rounded-[6px] overflow-hidden">
                  <Image
                    src="/logo-blue.jpg"
                    alt="SUPERMISSION"
                    fill
                    className="object-cover"
                  />
                </div>
                <span className="text-lg sm:text-xl font-bold text-[#1a1a1a] tracking-tight leading-none" style={{ fontFamily: FONT }}>
                  Supermission
                </span>
              </Link>
            )}

            {/* Desktop: Sidebar toggle */}
            {isChatPage && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden sm:flex lg:hidden ml-2 p-1.5 hover:bg-[#f7f7f7] rounded-[6px] transition-colors"
                aria-label="Open chat history"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                </svg>
              </button>
            )}

            <div className="flex-1" />

            {/* Desktop Navigation — same links as the landing navbar */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                if (link.href === '__agents__') {
                  return <AgentsDropdown key="agents" isActive={isAgentActive} />;
                }
                if (link.href === '__terminal__') {
                  return <NavDropdown key="terminal" label="Terminal" items={TERMINAL_ITEMS} isActive={isTerminalActive} />;
                }
                if (link.href === '__resources__') {
                  return <NavDropdown key="resources" label="Resources" items={RESOURCE_ITEMS} isActive={isResourcesActive} />;
                }
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-site-nav-active={isActive(link.href) ? 'true' : undefined}
                    className={`text-[14px] font-semibold px-3 py-2 rounded-[8px] transition-all duration-200 ${
                      isActive(link.href)
                        ? 'bg-[#f5f3f0] border border-[#e8e4df] text-[#1a1a1a]'
                        : 'text-[#3a3a3a] hover:bg-[#f5f3f0] hover:text-[#1a1a1a]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-1" />

            {/* Wallet — far right (optional rightExtra rendered before it) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!rightExtraAfterWallet && rightExtra}
              <UnifiedWalletConnect autoOpen={autoOpenWallet} />
              {rightExtraAfterWallet && rightExtra}
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu — matches Oracle/Markets hamburger style */}
        <AnimatePresence>
          {dashMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="lg:hidden border-t border-[#e5e7eb] bg-white overflow-hidden"
            >
              <nav className="px-4 py-3 flex flex-col gap-1">
                {pathname === '/perps' ? (
                  <>
                    <Link
                      href="/perps/BTC"
                      onClick={() => setDashMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black transition-all duration-200"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M7 20V10M12 20V4M17 20V14"/></svg>
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: FONT }}>Perps Markets</span>
                    </Link>
                    <Link
                      href="/perps/BTC?mode=spot"
                      onClick={() => setDashMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black transition-all duration-200"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 15h.01M15 9l-6 6"/></svg>
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: FONT }}>Spot</span>
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setDashMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black transition-all duration-200"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: FONT }}>Dashboard</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/markets"
                      onClick={() => setDashMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black transition-all duration-200"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: FONT }}>Markets</span>
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setDashMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black transition-all duration-200"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: FONT }}>Dashboard</span>
                    </Link>
                  </>
                )}
                <Link
                  href="/"
                  onClick={() => setDashMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-[8px] text-[#9ca3af] hover:text-black hover:bg-[#f7f7f7] transition-all duration-200 mt-1"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                  <span className="text-sm font-semibold" style={{ fontFamily: FONT }}>Back to Supermission</span>
                </Link>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    );
  }

  return (
      <header data-scrolled={scrolled ? 'true' : 'false'} className="fixed top-0 left-0 right-0 z-50 w-full site-navbar">
        <div className="container mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex h-16 sm:h-[72px] items-center justify-between">
            {/* Left: Logo + sidebar toggle on chat pages */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="group flex items-center gap-2 transition-all duration-300"
              >
                <div className="relative w-8 h-8 flex-shrink-0 rounded-[6px] overflow-hidden">
                  <Image
                    src="/logo-blue.jpg"
                    alt="SUPERMISSION"
                    fill
                    className="object-cover"
                  />
                </div>
                <span className={`${isChatPage ? 'hidden sm:inline' : ''} text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-tight leading-none`} style={{ fontFamily: FONT }}>
                  Supermission
                </span>
              </Link>
              {isChatPage && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-1.5 hover:bg-[#f5f3f0] rounded-[6px] transition-colors"
                  aria-label="Open chat history"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                </button>
              )}
            </div>

            {/* Desktop Navigation — public links always, gated links only for approved users */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                if (link.href === '__agents__') {
                  return <AgentsDropdown key="agents" isActive={isAgentActive} />;
                }
                if (link.href === '__terminal__') {
                  return <NavDropdown key="terminal" label="Terminal" items={TERMINAL_ITEMS} isActive={isTerminalActive} />;
                }
                if (link.href === '__resources__') {
                  return <NavDropdown key="resources" label="Resources" items={RESOURCE_ITEMS} isActive={isResourcesActive} />;
                }
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-site-nav-active={isActive(link.href) ? 'true' : undefined}
                    className={`text-[15px] font-semibold px-4 py-2 rounded-[8px] transition-all duration-200 ${
                      isActive(link.href)
                        ? 'bg-[#f5f3f0] border border-[#e8e4df] text-[#1a1a1a]'
                        : 'text-[#3a3a3a] hover:bg-[#f5f3f0] hover:text-[#1a1a1a]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right: Auth buttons + settings cog */}
            <div className="flex items-center gap-2 sm:gap-3">
              {!rightExtraAfterWallet && rightExtra}
              <UnifiedWalletConnect autoOpen={autoOpenWallet} />
              {rightExtraAfterWallet && rightExtra}
              {!hideSettings && <SettingsDropdown />}
            </div>
          </div>
        </div>
      </header>
  );
}
