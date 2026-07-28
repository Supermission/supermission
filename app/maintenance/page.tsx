import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Under Maintenance — SUPERMISSION',
  description: 'SUPERMISSION is undergoing scheduled maintenance. We will be back shortly.',
  robots: { index: false, follow: false },
};

const FONT_DISPLAY = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono), 'IBM Plex Mono', 'SF Mono', monospace";

export default function MaintenancePage() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      style={{ fontFamily: FONT_DISPLAY, background: '#f5f5f5', color: '#000' }}
    >
      {/* fine grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* logo — absolutely positioned so it doesn't compress the headline */}
      <img
        src="/waitlist.png"
        alt="Supermission"
        aria-hidden
        className="pointer-events-none absolute right-4 top-[38%] hidden -translate-y-1/2 object-contain sm:right-10 lg:block lg:h-80 xl:h-96"
        style={{ filter: 'drop-shadow(0 28px 56px rgba(0,0,0,0.16))' }}
      />

      {/* main */}
      <main className="relative flex flex-1 flex-col items-start justify-center px-6 sm:px-10">
        <div className="w-full max-w-6xl">
          <span
            className="inline-block text-[11px] uppercase tracking-[0.3em]"
            style={{ fontFamily: FONT_MONO, color: 'rgba(0,0,0,0.5)' }}
          >
            [ scheduled maintenance ]
          </span>

          <h1
            className="mt-6 text-[clamp(48px,11vw,168px)] font-medium leading-[0.92] tracking-[-0.04em]"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            Be right
            <br />
            <span className="italic font-light">back.</span>
          </h1>

          <p
            className="mt-8 max-w-xl text-base sm:text-lg leading-relaxed"
            style={{ color: 'rgba(0,0,0,0.7)' }}
          >
            We&rsquo;re tightening a few bolts under the hood. SUPERMISSION will
            return shortly with everything in its place.
          </p>

          <div
            className="mt-12 flex flex-col gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:gap-10"
            style={{ fontFamily: FONT_MONO }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-black/40">
                Updates
              </div>
              <a
                href="https://x.com/missiondotfun"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm underline-offset-4 hover:underline"
              >
                @missiondotfun
              </a>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-black/40">
                Docs
              </div>
              <a
                href="https://docs.supermission.fun"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm underline-offset-4 hover:underline"
              >
                docs.supermission.fun
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* footer */}
      <footer
        className="relative flex items-center justify-between border-t border-black/10 px-6 py-4 sm:px-10"
        style={{ fontFamily: FONT_MONO }}
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-black/60">
          © SUPERMISSION
        </span>
        <span className="text-[11px] uppercase tracking-[0.22em] text-black/60">
          v.maintenance
        </span>
      </footer>
    </div>
  );
}
