'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { reportError } from '@/lib/analytics/posthog';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError('GlobalError', error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            minHeight: '100vh',
            background: '#fafafa',
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 48,
              }}
            >
              <Image
                src="/new.png"
                alt="Supermission"
                width={24}
                height={24}
                style={{ borderRadius: 5 }}
                unoptimized
              />
              <span
                style={{
                  fontFamily: 'var(--font-bricolage), sans-serif',
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#1a1a1a',
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
                color: '#121212',
                letterSpacing: '-0.04em',
                marginBottom: 16,
              }}
            >
              500
            </div>

            <div
              style={{
                width: 40,
                height: 2,
                background: '#1a1a1a',
                marginBottom: 20,
                borderRadius: 1,
              }}
            />

            <p
              style={{
                fontFamily: 'var(--font-bricolage), sans-serif',
                fontSize: 16,
                fontWeight: 500,
                color: '#3a3a3a',
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              Something broke on our side.
            </p>
            <p
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                color: '#9a9a9a',
                marginBottom: 40,
                textAlign: 'center',
              }}
            >
              We&apos;re looking into it. You can retry or head back home.
            </p>

            <button
              onClick={() => reset()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 24px',
                background: '#121212',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font-bricolage), sans-serif',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              Try again
            </button>

            <a
              href="/"
              style={{
                marginTop: 14,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 11,
                color: '#999',
                textDecoration: 'none',
                borderBottom: '1px solid #ddd',
                paddingBottom: 1,
                transition: 'color 0.2s',
              }}
            >
              or go home
            </a>
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: 24,
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              color: '#ccc',
            }}
          >
            supermission.fun
          </div>
        </div>
      </body>
    </html>
  );
}
