/**
 * Lightweight analytics logger.
 *
 * Currently logs to console in dev. Swap the implementation for
 * Firebase Analytics, Mixpanel, Amplitude, or PostHog when ready.
 *
 * Usage:
 *   analytics.logEvent("registration_attempted", { method: "email" });
 */

type EventParams = Record<string, string | number | boolean | undefined>;

function logEvent(name: string, params?: EventParams): void {
  if (__DEV__) {
    console.log(`[Analytics] ${name}`, params ?? "");
  }

  // TODO: Replace with real analytics SDK call, e.g.:
  // FirebaseAnalytics.logEvent(name, params);
  // mixpanel.track(name, params);
}

function logScreenView(screenName: string): void {
  logEvent("screen_view", { screen_name: screenName });
}

export const analytics = { logEvent, logScreenView } as const;
