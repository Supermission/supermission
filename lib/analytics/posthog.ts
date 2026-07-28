/**
 * PostHog Analytics (OPTIONAL)
 *
 * Tracks feature usage and user behavior for product insights.
 * Gracefully degrades if not configured.
 *
 * Free tier: 1M events/month
 * Docs: https://posthog.com/docs
 */

// Check if PostHog is enabled
export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: check env vars
    return !!(
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      process.env.NEXT_PUBLIC_POSTHOG_HOST
    );
  }

  // Client-side: check if PostHog is loaded
  return typeof (window as any).posthog !== 'undefined';
}

/**
 * Track dashboard tab navigation
 */
export function trackTabView(tab: string): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('dashboard_tab_viewed', {
        tab,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.warn('[Analytics] Track tab view failed:', error);
  }
}

/**
 * Track premium feature unlock attempts
 */
export function trackPremiumUnlock(feature: string, price: string, success: boolean): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('premium_unlock_attempt', {
        feature,
        price,
        success,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.warn('[Analytics] Track premium unlock failed:', error);
  }
}

/**
 * Track API errors for monitoring
 */
export function trackAPIError(endpoint: string, error: string): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('api_error', {
        endpoint,
        error,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.warn('[Analytics] Track API error failed:', error);
  }
}

/**
 * Track wallet connection
 */
export function trackWalletConnected(address: string): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      // Don't send full address for privacy
      const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

      (window as any).posthog.capture('wallet_connected', {
        address: shortAddress,
        timestamp: Date.now()
      });

      // Identify user for session tracking (anonymized)
      (window as any).posthog.identify(shortAddress);
    }
  } catch (error) {
    console.warn('[Analytics] Track wallet connected failed:', error);
  }
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(
  feature: string,
  metadata?: Record<string, any>
): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('feature_used', {
        feature,
        ...metadata,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.warn('[Analytics] Track feature usage failed:', error);
  }
}

/**
 * Report a rendering error from an error boundary or global-error.
 * Sends to PostHog if available, always falls back to console.error so the
 * stack is visible in dev and in runtime logs on Vercel.
 */
export function reportError(
  scope: string,
  error: Error & { digest?: string },
  metadata?: Record<string, any>,
): void {
  console.error(`[${scope}] Render error:`, error);

  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('render_error', {
        scope,
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        ...metadata,
        timestamp: Date.now(),
      });
    }
  } catch (captureError) {
    console.warn('[Analytics] reportError capture failed:', captureError);
  }
}

/**
 * Track page views
 */
export function trackPageView(path: string): void {
  if (!isAnalyticsEnabled()) return;

  try {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('$pageview', {
        $current_url: path,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.warn('[Analytics] Track page view failed:', error);
  }
}
