import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="bg-white pt-12 sm:pt-16 pb-8">
      <div className="container mx-auto px-4 sm:px-6 md:px-8">
        <div className="max-w-[1240px] mx-auto">

          {/* ── MOBILE FOOTER (hidden on md+) ───────────────────────── */}
          <div className="md:hidden">
            {/* Logo row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-[4.66px]">
                <div className="relative w-6 h-6 flex-shrink-0 rounded-[5px] overflow-hidden">
                  <Image src="/logo-blue.jpg" alt="Super Mission" fill className="object-cover" />
                </div>
                <span className="text-[14px] font-semibold text-[#121212] leading-none">Supermission</span>
              </div>
              {/* Social icons inline */}
              <div className="flex items-center gap-4">
                <a href="https://x.com/missiondotfun" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a]/60 hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="X (Twitter)">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/supermission" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a]/60 hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="LinkedIn">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://t.me/supermissiondotfun" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a]/60 hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="Telegram">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
                <a href="https://discord.gg/6bwN64PW5f" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a]/60 hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="Discord">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                </a>
                <a href="https://github.com/Supermission" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a]/60 hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="GitHub">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              </div>
            </div>

            {/* Compact 2-col link grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-5 border-t border-[#f0efed] pt-4">
              {[
                { href: '/defai', label: 'Start a Mission' },
                { href: '/privacy', label: 'Privacy Policy' },
                // { href: '/agent-economy', label: 'Browse Agents' },
                { href: '/terms', label: 'Terms & Conditions' },
                { href: '/markets', label: 'Markets' },
                { href: '/blog', label: 'Blog' },
                { href: '/how-it-works', label: 'How It Works' },
                { href: '/faq', label: 'FAQ' },
                { href: '/media', label: 'Media Kit' },
                { href: 'https://docs.supermission.fun', label: 'Docs' },
              ].map(({ href, label }) => (
                <Link key={label} href={href} className="text-xs text-[#3a3a3a]/70 hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 py-0.5">
                  {label}
                </Link>
              ))}
            </div>

            {/* Copyright */}
            <div className="border-t border-[#f0efed] pt-4">
              <p className="text-[11px] text-[#3a3a3a]/50 leading-4">
                &copy; {new Date().getFullYear()} SuperMission. All rights reserved.
              </p>
            </div>
          </div>

          {/* ── DESKTOP FOOTER (hidden on mobile) ───────────────────── */}
          <div className="hidden md:block">
            {/* Headers row */}
            <div className="grid grid-cols-[1fr_120px_120px_140px] gap-8 lg:gap-12 mb-3">
              <div className="flex items-center gap-[4.66px]">
                <div className="relative w-8 h-8 flex-shrink-0 rounded-[6px] overflow-hidden">
                  <Image src="/logo-blue.jpg" alt="Super Mission" fill className="object-cover" />
                </div>
                <span className="text-[16.3px] font-semibold text-[#121212] leading-none">Supermission</span>
              </div>
              <h4 className="text-base font-medium text-[#1a1a1a] tracking-[0.04px] leading-5">Explore</h4>
              <h4 className="text-base font-medium text-[#1a1a1a] tracking-[0.04px] leading-5">About</h4>
              <h4 className="text-base font-medium text-[#1a1a1a] tracking-[0.04px] leading-5">Others</h4>
            </div>

            {/* Content row */}
            <div className="grid grid-cols-[1fr_120px_120px_140px] gap-8 lg:gap-12 mb-10">
              <p className="text-sm text-[#3a3a3a] leading-5 tracking-[0.035px]">
                Share your grand vision with us, and we&apos;ll bring it to life! At Supermission, we carefully evaluate your needs, suggest the ideal agents for the job, and you only pay when the results exceed your expectations. Let&apos;s collaborate to craft something truly remarkable! Together, we can achieve greatness and make your dreams a reality.
              </p>

              {/* Explore links */}
              <ul className="space-y-[12px]">
                <li><Link href="/defai" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Start a Mission</Link></li>
                <li><a href="https://docs.supermission.fun" target="_blank" rel="noopener noreferrer" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Docs</a></li>
                <li><Link href="/media" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Media Kit</Link></li>
              </ul>

              {/* About links */}
              <ul className="space-y-[12px]">
                <li><Link href="/" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">About Us</Link></li>
                <li><Link href="/how-it-works" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">How It Works</Link></li>
                <li><Link href="/blog" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Blog</Link></li>
              </ul>

              {/* Others links */}
              <ul className="space-y-[12px]">
                <li><Link href="/privacy" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">Terms &amp; Conditions</Link></li>
                <li><Link href="/faq" className="text-sm text-[#3a3a3a] hover:text-[#1a1a1a] hover:underline underline-offset-[3px] transition-colors leading-5 tracking-[0.035px]">FAQ</Link></li>
              </ul>
            </div>

            {/* Copyright bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#3a3a3a] opacity-90 leading-5 tracking-[0.035px]" style={{ fontFamily: 'Plus Jakarta Sans, var(--font-sans)' }}>
                Copyright &copy; {new Date().getFullYear()}. SuperMission. All rights reserved.
              </p>
              <div className="flex items-center gap-6">
                <a href="https://x.com/missiondotfun" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a] hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="X (Twitter)">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/supermission" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a] hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="LinkedIn">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://t.me/supermissiondotfun" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a] hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="Telegram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
                <a href="https://discord.gg/6bwN64PW5f" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a] hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="Discord">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                </a>
                <a href="https://github.com/Supermission" target="_blank" rel="noopener noreferrer" className="text-[#3a3a3a] hover:text-[#1a1a1a] transition-all dark:hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-label="GitHub">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}
