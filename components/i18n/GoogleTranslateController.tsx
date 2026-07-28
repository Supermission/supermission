'use client';

import { useEffect, useRef } from 'react';
import { useUIStore, type Language } from '@/lib/store/ui';

/**
 * Whole-site DOM translator.
 *
 * Google's free Website Translate widget is retired for our domain
 * (confirmed by `[gt] .goog-te-combo never appeared` in browser
 * console), so we translate every visible text node directly:
 *
 *   1. Walk `document.body` for text nodes that contain human copy
 *      (skips `<script>`, `<style>`, anything inside `translate="no"`,
 *      anything inside editable fields, and numeric-only strings).
 *   2. Record the original text on the node's parent via
 *      `data-i18n-original` so we can restore English later.
 *   3. For each text, look up `trans:<lang>:<hash>` in localStorage.
 *      Hit → replace instantly. Miss → fetch MyMemory
 *      (free, no API key, anonymous 5 KB/day IP cap — fine for
 *      first-visit-per-language bursts, cached forever after).
 *   4. MutationObserver watches the DOM for new text nodes (e.g.
 *      when users navigate SPA routes) and translates them the same
 *      way.
 *   5. Switching back to English restores originals from
 *      `data-i18n-original` — no API calls.
 *
 * Production note: swap `translateOne()` to call a paid backend proxy
 * (DeepL / Google Cloud Translation) when you want reliable rate
 * limits + better quality. The rest of this controller stays
 * identical.
 */

// Our codes → MyMemory / ISO codes.
const LANG_CODE: Record<Language, string> = {
  en: 'en',
  hi: 'hi',
  es: 'es',
  pt: 'pt',
  fr: 'fr',
  de: 'de',
  ja: 'ja',
  zh: 'zh-CN',
  ar: 'ar',
  ru: 'ru',
};

const ORIGINAL_ATTR = 'data-i18n-original';
const CACHE_PREFIX = 'trans:';
const MAX_CONCURRENT = 4;

// Skip text inside these tags — never translate them.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE',
  'INPUT', 'TEXTAREA', 'CODE', 'PRE',
  'SVG', 'PATH', 'CIRCLE', 'RECT', 'POLYGON',
]);

function shouldTranslateNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest('[translate="no"]')) return false;
  if (parent.closest('[contenteditable]')) return false;
  const text = node.textContent?.trim() ?? '';
  if (text.length < 2) return false;
  // Skip pure numbers / currency / tickers — they're universal.
  if (!/[a-zA-Z]/.test(text)) return false;
  return true;
}

function cacheKey(text: string, lang: string): string {
  // Short key — lang + first 128 chars is enough collision-resistance
  // for realistic copy and keeps localStorage happy.
  const slice = text.length > 128 ? text.slice(0, 128) : text;
  return `${CACHE_PREFIX}${lang}:${slice}`;
}

function getCached(text: string, lang: string): string | null {
  try {
    return window.localStorage.getItem(cacheKey(text, lang));
  } catch {
    return null;
  }
}

function setCached(text: string, lang: string, value: string): void {
  try {
    window.localStorage.setItem(cacheKey(text, lang), value);
  } catch {
    /* quota blown — fine, memory cache below still helps */
  }
}

const inflight = new Map<string, Promise<string>>();

/** Translate a single snippet via MyMemory's free API. */
async function translateOne(text: string, target: string): Promise<string> {
  const cached = getCached(text, target);
  if (cached != null) return cached;

  const key = cacheKey(text, target);
  const existing = inflight.get(key);
  if (existing) return existing;

  const req = (async () => {
    try {
      const url =
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
        `&langpair=en|${target}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`mymemory ${res.status}`);
      const json: { responseData?: { translatedText?: string }; responseStatus?: number } =
        await res.json();
      const translated = json?.responseData?.translatedText;
      if (translated && typeof translated === 'string' && translated.trim().length > 0) {
        setCached(text, target, translated);
        return translated;
      }
      return text;
    } catch {
      return text;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, req);
  return req;
}

/** Walk every text node under `root` that needs translation. */
function collectNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      shouldTranslateNode(node as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Simple N-at-a-time concurrency runner for async tasks. */
async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++;
      await tasks[idx]();
    }
  });
  await Promise.all(workers);
}

/** Store original + swap to translated. Idempotent. */
function applyTranslation(node: Text, target: string): Promise<void> {
  const text = node.textContent ?? '';
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve();

  // Persist the English original on the parent so we can restore later.
  // We store it on the parent because text nodes themselves can't carry
  // attributes. If siblings collide we fall back to the first text.
  const parent = node.parentElement;
  if (parent && !parent.hasAttribute(ORIGINAL_ATTR)) {
    parent.setAttribute(ORIGINAL_ATTR, text);
  }

  return translateOne(trimmed, target).then((translated) => {
    if (translated && translated !== trimmed && node.textContent !== translated) {
      // Preserve surrounding whitespace from the original.
      const leading = text.match(/^\s*/)?.[0] ?? '';
      const trailing = text.match(/\s*$/)?.[0] ?? '';
      node.textContent = `${leading}${translated}${trailing}`;
    }
  });
}

/** Restore all previously-captured originals. No network calls. */
function restoreOriginals(): void {
  const elems = document.querySelectorAll<HTMLElement>(`[${ORIGINAL_ATTR}]`);
  for (const el of Array.from(elems)) {
    const original = el.getAttribute(ORIGINAL_ATTR);
    if (original == null) continue;
    // Find the FIRST text-node child and reset it — the rest of the
    // tree stays untouched. This mirrors how `applyTranslation`
    // captured the original in the first place.
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = original;
        break;
      }
    }
  }
}

export function GoogleTranslateController() {
  // Kept the old filename so layout.tsx import stays stable — this is
  // now the generic DOM translator.
  const language = useUIStore((s) => s.language);
  const activeLangRef = useRef<Language>('en');

  // Main translate/restore effect.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = LANG_CODE[language] ?? 'en';
    activeLangRef.current = language;

    if (target === 'en') {
      restoreOriginals();
      return;
    }

    const nodes = collectNodes(document.body);
    const tasks = nodes.map((n) => () => applyTranslation(n, target));
    runLimited(tasks, MAX_CONCURRENT).catch(() => {
      /* API errors already swallowed inside translateOne */
    });
  }, [language]);

  // Observe DOM for new nodes (route changes, modals, dropdowns) and
  // translate them on the fly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      const target = LANG_CODE[activeLangRef.current] ?? 'en';
      if (target === 'en') return;

      const fresh: Text[] = [];
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            fresh.push(...collectNodes(added as HTMLElement));
          } else if (added.nodeType === Node.TEXT_NODE && shouldTranslateNode(added as Text)) {
            fresh.push(added as Text);
          }
        }
      }
      if (fresh.length === 0) return;
      const tasks = fresh.map((n) => () => applyTranslation(n, target));
      runLimited(tasks, MAX_CONCURRENT).catch(() => {
        /* noop */
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Nothing to render — this is a DOM side-effect controller.
  return null;
}

export default GoogleTranslateController;
