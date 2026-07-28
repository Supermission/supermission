'use client';

import { useEffect } from 'react';

/**
 * Auto-reload on chunk-load / MIME-blocked-asset errors.
 *
 * After a Vercel deploy, the previous deployment's /_next/static/* chunks are
 * eventually evicted. Browsers that still hold the old HTML (bfcache, tab
 * switch, back navigation, stale service worker) will request those chunks,
 * get 404 + text/plain, and strict MIME checking will block them. The page
 * boots with nothing rendered. A single hard reload picks up the current
 * deployment's HTML and fixes it.
 *
 * Session flag prevents infinite reload loops if the reload itself keeps
 * failing (network issue, hard outage). Flag clears after 10s so a genuine
 * follow-up error after that window can still trigger a retry.
 */
const RELOAD_FLAG = 'sm:chunk-reload-at';
const COOLDOWN_MS = 10_000;

function looksLikeChunkError(raw: unknown): boolean {
  const msg = typeof raw === 'string' ? raw : (raw as { message?: string })?.message || '';
  if (!msg) return false;
  return (
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /MIME type \('text\/plain'\)/i.test(msg) ||
    /Refused to apply style/i.test(msg) ||
    /Refused to execute script/i.test(msg)
  );
}

function maybeReload(raw: unknown) {
  if (!looksLikeChunkError(raw)) return;
  const last = Number(sessionStorage.getItem(RELOAD_FLAG) || '0');
  if (Date.now() - last < COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  window.location.reload();
}

export function ChunkErrorReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      maybeReload(e.message || e.error?.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      maybeReload(reason?.message ?? reason);
    };
    // Static resources that fail to load (script/link/img/css) fire a non-bubbling
    // 'error' event on the element itself — capture it at the window level.
    const onResourceError = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === 'SCRIPT' || tag === 'LINK') {
        const src = (t as HTMLScriptElement).src || (t as HTMLLinkElement).href || '';
        if (src.includes('/_next/static/')) {
          maybeReload('ChunkLoadError: ' + src);
        }
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // capture:true is required because resource errors don't bubble
    window.addEventListener('error', onResourceError, true);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onResourceError, true);
    };
  }, []);
  return null;
}
