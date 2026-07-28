'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * PostHog Analytics Provider
 *
 * OPTIONAL: Only works if NEXT_PUBLIC_POSTHOG_KEY is set.
 * Loads PostHog via CDN script tag (CSP-safe, no eval/new Function).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

    if (!apiKey || typeof window === 'undefined') return;
    if ((window as any).posthog) return; // Already loaded

    // Load PostHog via script tag — avoids eval/new Function (CSP-safe)
    const script = document.createElement('script');
    script.src = 'https://us-assets.i.posthog.com/static/array.js';
    script.async = true;
    script.onload = () => {
      const ph = (window as any).posthog;
      if (ph && typeof ph.init === 'function') {
        ph.init(apiKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: false,
          disable_session_recording: true,
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  // Track route changes
  useEffect(() => {
    if (pathname && typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('$pageview');
    }
  }, [pathname]);

  return <>{children}</>;
}
