// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// The API routes (/api/agent-economy/*) remain active for external agent consumers.
// Do not add new features or link to these pages until agent economy is re-enabled.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Menu, X, LayoutGrid, Users, Handshake, Swords, ArrowLeftRight, Cpu, ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/layout/footer';
import { RequireAuth } from '@/components/auth/require-auth';

const UnifiedWalletConnect = dynamic(
  () => import('@/components/wallet/unified-connect').then(mod => mod.UnifiedWalletConnect),
  { ssr: false }
);

export default function AgentEconomyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = [
    { href: '/agent-economy', label: 'Overview', exact: true, Icon: LayoutGrid },
    { href: '/agent-economy/marketplace', label: 'Agents', Icon: Users },
    { href: '/agent-economy/collaborate', label: 'Collaborate', Icon: Handshake },
    { href: '/agent-economy/compete', label: 'Compete', Icon: Swords },
    { href: '/agent-economy/transactions', label: 'Transactions', Icon: ArrowLeftRight },
    { href: '/agent-economy/compute', label: 'Mission Compute', comingSoon: true, Icon: Cpu },
  ];

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href) && pathname !== '/agent-economy';
  };

  return (
    <RequireAuth>
    <div className="min-h-screen flex flex-col bg-white">
      {/* Back to Supermission bar (replaces the main header) */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#e5e7eb]">
        <div className="px-4 sm:px-6 md:px-8">
          <div className="flex h-14 sm:h-16 items-center">
            {/* Hamburger button - mobile only */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-[8px] border border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors flex-shrink-0 mr-3"
            >
              {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
            </button>

            {/* Back to Supermission — desktop only */}
            <Link
              href="/"
              className="hidden lg:flex group items-center gap-2 text-[11px] sm:text-xs font-bold text-black transition-all duration-300 flex-shrink-0"
              style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform flex-shrink-0" />
              <span>Back to Supermission</span>
            </Link>

            {/* Left spacer */}
            <div className="flex-1" />

            {/* Centre nav items — desktop */}
            <div className="hidden lg:flex items-center rounded-[8px] overflow-hidden border border-[#e5e7eb]">
              {navItems.map((item) => {
                const active = isActive(item);
                return item.comingSoon ? (
                  <span
                    key={item.href}
                    className="h-9 sm:h-10 px-3 md:px-4 border-r border-[#e5e7eb] last:border-r-0 text-[10px] sm:text-xs font-semibold flex items-center gap-2 bg-white text-[#d1d5db] cursor-default"
                    style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                  >
                    <item.Icon size={13} />
                    <span>{item.label}</span>
                    <span className="text-[7px] tracking-widest font-bold px-1 py-px bg-black/5 text-black/30 rounded">SOON</span>
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`h-9 sm:h-10 px-3 md:px-4 border-r border-[#e5e7eb] last:border-r-0 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition-all duration-200 ${
                      active
                        ? 'bg-[#3a3a3a] text-white'
                        : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7]'
                    }`}
                    style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                  >
                    <item.Icon size={13} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Right spacer */}
            <div className="flex-1" />

            {/* Wallet — far right */}
            <div className="hidden lg:block">
              <UnifiedWalletConnect />
            </div>

            {/* Mobile wallet only */}
            <div className="lg:hidden">
              <UnifiedWalletConnect />
            </div>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-[#e5e7eb] bg-white">
            <nav className="px-4 py-3 flex flex-col gap-1">
              {navItems.map((item) => item.comingSoon ? (
                <span
                  key={item.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-white text-[#d1d5db] cursor-default select-none"
                >
                  <item.Icon size={15} />
                  <span className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                    {item.label}
                    <span className="text-[8px] tracking-widest font-bold px-1.5 py-0.5 bg-black/10 text-black/40 rounded">SOON</span>
                  </span>
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all duration-200 ${isActive(item)
                    ? 'bg-[#3a3a3a] text-white'
                    : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black'
                    }`}
                >
                  <item.Icon size={15} />
                  <span className="text-sm font-semibold flex-1" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                    {item.label}
                  </span>
                  {isActive(item) && (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  )}
                </Link>
              ))}

              {/* Back to Supermission — mobile */}
              <Link
                href="/"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-[8px] text-[#9ca3af] hover:text-black hover:bg-[#f7f7f7] transition-all duration-200 mt-1"
              >
                <ArrowLeft size={15} />
                <span className="text-sm font-semibold" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                  Back to Supermission
                </span>
              </Link>
            </nav>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 pt-14 sm:pt-16 pb-0">
        {children}
      </main>

      <Footer />
    </div>
    </RequireAuth>
  );
}
