import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--font-bricolage), sans-serif',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 48 }}>
          <Image
            src="/new.png"
            alt="Supermission"
            width={24}
            height={24}
            style={{ borderRadius: 5, filter: 'brightness(0) invert(1)' }}
            unoptimized
          />
          <span
            style={{
              fontFamily: 'var(--font-bricolage), sans-serif',
              fontWeight: 700,
              fontSize: 15,
              color: '#ededed',
              letterSpacing: '-0.01em',
            }}
          >
            Supermission
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-montserrat), Montserrat, sans-serif',
            fontSize: 160,
            fontWeight: 900,
            lineHeight: 1,
            color: '#ededed',
            letterSpacing: '-0.04em',
            marginBottom: 16,
          }}
        >
          404
        </div>

        <div
          style={{
            width: 40,
            height: 2,
            background: 'rgba(255,255,255,0.6)',
            marginBottom: 20,
            borderRadius: 1,
          }}
        />

        <p
          style={{
            fontFamily: 'var(--font-bricolage), sans-serif',
            fontSize: 16,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.78)',
            marginBottom: 6,
            textAlign: 'center',
          }}
        >
          This market doesn&apos;t exist.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            color: 'rgba(255,255,255,0.45)',
            marginBottom: 40,
            textAlign: 'center',
          }}
        >
          The page you&apos;re looking for was moved, removed, or never existed.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 24px',
            background: '#ededed',
            color: '#0a0a0a',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-bricolage), sans-serif',
            borderRadius: 8,
            textDecoration: 'none',
            transition: 'opacity 0.2s',
          }}
        >
          Back to trading
        </Link>

        <Link
          href="/markets"
          style={{
            marginTop: 14,
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.18)',
            paddingBottom: 1,
            transition: 'color 0.2s',
          }}
        >
          or explore markets
        </Link>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 24,
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 10,
          color: 'rgba(255,255,255,0.25)',
        }}
      >
        supermission.fun
      </div>
    </div>
  );
}
