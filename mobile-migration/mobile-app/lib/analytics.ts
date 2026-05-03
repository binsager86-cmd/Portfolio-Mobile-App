/**
 * Analytics & Error Tracking
 *
 * Provides a unified analytics API. When @sentry/react-native is
 * installed and EXPO_PUBLIC_SENTRY_DSN is set, errors and breadcrumbs
 * are forwarded to Sentry. Otherwise everything is console-only.
 *
 * To enable Sentry:
 *   1. npm install @sentry/react-native @sentry/core
 *   2. Set EXPO_PUBLIC_SENTRY_DSN in your env
 *
 * Usage:
 *   analytics.logEvent("registration_attempted", { method: "email" });
 *   analytics.captureError(error, { screen: "holdings" });
 */

type EventParams = Record<string, string | number | boolean | undefined>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSentry(): any {
  if (Sentry) return Sentry;
  try {
    // Avoid static module resolution by Metro for optional runtime dependency.
    // eslint-disable-next-line no-new-func
    const dynamicRequire = new Function("moduleName", "return require(moduleName);") as (
      moduleName: string,
    ) => unknown;
    const pkg = "@sentry/" + "react-native";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Sentry = dynamicRequire(pkg) as any;
    return Sentry;
  } catch {
    return null;
  }
}

/** Call once at app startup (before navigation mounts). */
async function init(): Promise<void> {
  if (globalThis.__APP_SENTRY_INITIALIZED__) {
    return;
  }

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) console.info("[Analytics] No EXPO_PUBLIC_SENTRY_DSN — Sentry disabled");
    return;
  }

  try {
    const runtimeSentry = loadSentry();
    if (!runtimeSentry) {
      if (__DEV__) console.warn("[Analytics] @sentry/react-native not installed — skipping");
      Sentry = null;
      return;
    }

    runtimeSentry.init({
      dsn,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
      enableAutoSessionTracking: true,
      debug: __DEV__,
    });
  } catch {
    if (__DEV__) console.warn("[Analytics] @sentry/react-native not installed — skipping");
    Sentry = null;
  }
}

/** Fire a named analytics event with optional key-value parameters. */
function logEvent(name: string, params?: EventParams): void {
  if (__DEV__) {
    console.info(`[Analytics] ${name}`, params ?? "");
  }
  Sentry?.addBreadcrumb({ category: "event", message: name, data: params });
}

/** Convenience wrapper that logs a `screen_view` event. */
function logScreenView(screenName: string): void {
  logEvent("screen_view", { screen_name: screenName });
}

/** Capture an error to Sentry with optional extra context. */
function captureError(error: unknown, context?: Record<string, string>): void {
  if (__DEV__) console.error("[Analytics] captureError", error);
  if (Sentry) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}

/** Identify the current user for error/event attribution. */
function setUser(id: string, email?: string): void {
  Sentry?.setUser({ id, email });
}

/** Clear user identity on logout. */
function clearUser(): void {
  Sentry?.setUser(null);
}

export const analytics = {
  init,
  logEvent,
  logScreenView,
  captureError,
  setUser,
  clearUser,
} as const;
