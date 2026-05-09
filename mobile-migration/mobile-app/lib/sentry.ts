import { Config } from "@/constants/Config";

type SentryModule = {
  init: (options: Record<string, unknown>) => void;
  reactNavigationIntegration: () => unknown;
  replayIntegration: () => unknown;
};

let sentryModule: SentryModule | null = null;

function loadSentryModule(): SentryModule | null {
  if (sentryModule) return sentryModule;
  try {
    // Avoid static module resolution by Metro for optional runtime dependency.
    // eslint-disable-next-line no-new-func
    const dynamicRequire = new Function("moduleName", "return require(moduleName);") as (
      moduleName: string,
    ) => unknown;
    const pkg = "@sentry/" + "react-native";
    sentryModule = dynamicRequire(pkg) as SentryModule;
    return sentryModule;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __APP_SENTRY_INITIALIZED__: boolean | undefined;
}

export const initSentry = () => {
  if (__DEV__) return;
  if (!Config.SENTRY_DSN) return;
  if (globalThis.__APP_SENTRY_INITIALIZED__) return;

  const Sentry = loadSentryModule();
  if (!Sentry) {
    if (__DEV__) console.warn("[Sentry] @sentry/react-native not available at runtime.");
    return;
  }

  Sentry.init({
    dsn: Config.SENTRY_DSN,
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.reactNavigationIntegration(),
      Sentry.replayIntegration(),
    ],
    beforeSend(event: Record<string, any>) {
      if (event.exception?.values?.[0]?.stacktrace?.frames) {
        event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames.map((f: Record<string, any>) => ({
          ...f,
          filename: f.filename?.replace(/\/var\/folders\/.+\//, ""),
        }));
      }
      return event;
    },
  });

  globalThis.__APP_SENTRY_INITIALIZED__ = true;
};
