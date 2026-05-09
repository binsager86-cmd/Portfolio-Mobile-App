import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
    DarkTheme as NavDark,
    DefaultTheme as NavLight,
    ThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, I18nManager, Platform, View } from "react-native";
import { PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/ui/ErrorBoundary";
import { NetworkBanner } from "@/components/ui/NetworkBanner";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useAuthCacheSync } from "@/hooks/useAuthCacheSync";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useOfflineSyncEngine } from "@/hooks/useOfflineSyncEngine";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { analytics } from "@/lib/analytics";
import i18n from "@/lib/i18n/config";
import { queryClient } from "@/lib/queryClient";
import { initSentry } from "@/lib/sentry";
import { prewarmCriticalQueries, startBackgroundPrewarm } from "@/services/preloadManager";
import { getHoldings, getOverview, getStockList } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
import { marketApi } from "@/services/market/marketApi";
import { newsApi } from "@/services/news/newsApi";
import { registerForPushNotificationsAsync } from "@/services/pushTokenService";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import { useAppTheme } from "@/theme";

// ── Critical: set notification handler at module load time ───────────
// Must be called synchronously before any component renders so notifications
// delivered when the app is backgrounded / cold-started are handled correctly.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export {
    ErrorBoundary
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

// ── Navigation themes derived from our palette ──────────────────────

function buildNavTheme(theme: ReturnType<typeof useAppTheme>) {
  const base = theme.isDark ? NavDark : NavLight;
  if (theme.isDark) {
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.onSurface,
        border: theme.colors.outline,
        primary: theme.colors.primary,
      },
    };
  }
  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outline,
      primary: theme.colors.primary,
    },
  };
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const token = useAuthStore((s) => s.token);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateUserPrefs = useUserPrefsStore((s) => s.hydrate);
  const pullRemoteUserPrefs = useUserPrefsStore((s) => s.pullRemote);
  const language = useUserPrefsStore((s) => s.preferences.language);
  const theme = useAppTheme();

  // ── Session guard: periodic heartbeat + focus re-validation ────
  useSessionGuard();
  usePushNotifications();

  // Clear badge count when the user opens the app (foreground)
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // ── Google Analytics: track page views on route changes (web) ──
  usePageViewTracking();

  // ── Single init effect: theme → OAuth hash check → hydration ───
  // Must be one sequential async flow so nothing can redirect
  // before auth state is fully resolved.
  useEffect(() => {
    async function init() {
      initSentry();
      hydrateTheme();
      hydrateUserPrefs();
      analytics.init();

      // Check for Google OAuth redirect (web only)
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash;
        if (hash && hash.includes("access_token=")) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const returnedState = params.get("state");
          // CSRF defence: only accept the token if we initiated an OAuth
          // request in this session AND the returned state matches the
          // value we stashed in lib/googleAuth.ts. Drop everything
          // otherwise — protects against attacker-crafted hash injection.
          let expectedState: string | null = null;
          // Read from localStorage first; fall back to sessionStorage for
          // backward compatibility with any in-flight legacy requests.
          try { expectedState = window.localStorage.getItem("google_oauth_state"); } catch { /* storage may be disabled */ }
          if (!expectedState) {
            try { expectedState = window.sessionStorage.getItem("google_oauth_state"); } catch { /* storage may be disabled */ }
          }
          // Always clean the URL so the token isn't visible / replayable.
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          try { window.localStorage.removeItem("google_oauth_state"); } catch { /* noop */ }
          try { window.sessionStorage.removeItem("google_oauth_state"); } catch { /* noop */ }
          if (
            accessToken &&
            expectedState &&
            returnedState &&
            expectedState === returnedState
          ) {
            // Retry the backend exchange up to 3 attempts total.
            // The server may be cold-starting on DigitalOcean (spin-up adds
            // 15-25s), causing the first attempt to hit the backend's internal
            // Google-verification timeout and return a 401. A warm retry
            // almost always succeeds, avoiding a needless round-trip back
            // through the Google consent screen.
            let ok = false;
            for (let attempt = 0; attempt < 3 && !ok; attempt++) {
              if (attempt > 0) {
                // Wait before retry: 2 s after 1st failure, 4 s after 2nd.
                await new Promise<void>((resolve) => {
                  setTimeout(resolve, attempt * 2000);
                });
              }
              ok = await googleSignIn(accessToken);
            }
            if (ok) {
              return; // skip hydration — googleSignIn already set session
            }
            // All retries exhausted — fall through to normal hydration.
            // The error is already stored in authStore; the login screen
            // will surface it so the user understands what happened.
          }
          if (__DEV__ && accessToken) {
            console.warn("[OAuth] Discarded callback: state mismatch or no pending request.");
          }
        }
      }

      // Normal path: hydrate from stored tokens (awaited so redirect
      // effect cannot fire before hydration finishes)
      await hydrateAuth();
    }
    init();
  }, []);

  // Sync i18n language + RTL direction when userPrefsStore language changes
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
    const shouldBeRTL = language === "ar";
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  }, [language]);



  // Prefetch critical data on login so first screens render instantly
  useEffect(() => {
    if (!token) return; // only after login

    const prefetchIfStale = <T,>(opts: {
      queryKey: readonly unknown[];
      queryFn: () => Promise<T>;
      staleTime: number;
    }) => {
      const state = queryClient.getQueryState(opts.queryKey);
      const updatedAt = state?.dataUpdatedAt ?? 0;
      if (updatedAt > 0 && Date.now() - updatedAt < opts.staleTime) return;
      queryClient.prefetchQuery(opts).catch(() => {});
    };

    // Pull the user's server-side preferences so expertise level / language
    // / feature flags follow the account across devices and re-installs.
    void pullRemoteUserPrefs();

    // Portfolio overview — the first thing the user sees
    prefetchIfStale({
      queryKey: ["portfolio-overview", undefined],
      queryFn: getOverview,
      staleTime: 30_000,
    });

    // Stock reference lists (static data) so dropdowns load instantly
    prefetchIfStale({
      queryKey: ["stock-list", "kuwait"],
      queryFn: () => getStockList({ market: "kuwait" }),
      staleTime: Infinity,
    });
    prefetchIfStale({
      queryKey: ["stock-list", "us"],
      queryFn: () => getStockList({ market: "us" }),
      staleTime: Infinity,
    });

    // Next-likely screens. Keep web startup lean to avoid refresh jank.
    prefetchIfStale({
      queryKey: ["holdings", undefined],
      queryFn: () => getHoldings(),
      staleTime: 30_000,
    });

    if (Platform.OS !== "web") {
      prefetchIfStale({
        queryKey: ["news", "feed", {}],
        queryFn: () => newsApi.getFeed({ limit: 15 }),
        staleTime: 5 * 60_000,
      });
      prefetchIfStale({
        queryKey: ["market", "summary"],
        queryFn: () => marketApi.getSummary(),
        staleTime: 5 * 60_000,
      });
    }

    // Register push token for real-time news notifications
    registerForPushNotificationsAsync().catch((err) => {
      analytics.logEvent("push_registration_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, [token]);

  // Keep backend token registration fresh if Expo rotates the push token
  // while the app is running.
  useEffect(() => {
    if (!token || Platform.OS === "web") return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        sub = Notifications.addPushTokenListener(() => {
          registerForPushNotificationsAsync().catch((err) => {
            analytics.logEvent("push_token_rollover_registration_failed", {
              message: err instanceof Error ? err.message : String(err),
            });
          });
        });
      } catch {
        // expo-notifications unavailable in this runtime
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [token]);

  return (
    <SafeAreaProvider>
    <View style={{ flex: 1, direction: language === "ar" ? "rtl" : "ltr" }}>
    <StatusBar style={theme.isDark ? "light" : "dark"} />
    <QueryClientProvider client={queryClient}>
      <OfflineSyncProvider />
      <SyncEngineProvider />
      <AuthCacheSyncProvider />
      <PaperProvider theme={theme}>
        <ThemeProvider value={buildNavTheme(theme)}>
          <AppErrorBoundary>
            <ToastProvider>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: "modal" }} />
              </Stack>
            </ToastProvider>
          </AppErrorBoundary>
        </ThemeProvider>
      </PaperProvider>
    </QueryClientProvider>
    </View>
    </SafeAreaProvider>
  );
}

/** Runs useAuthCacheSync inside the QueryClientProvider tree. */
function AuthCacheSyncProvider() {
  useAuthCacheSync();
  return null;
}

/** Runs useOfflineSync + renders NetworkBanner inside QueryClientProvider. */
function OfflineSyncProvider() {
  const isOffline = useOfflineSync();
  return <NetworkBanner isOffline={isOffline} />;
}

/** Runs offline sync engine + startup prewarm inside QueryClientProvider. */
function SyncEngineProvider() {
  const queryClient = useQueryClient();
  const { sync } = useOfflineSyncEngine();

  useEffect(() => {
    // Defer startup prewarm + offline sync so they don't compete with the
    // first paint on Android. Without this they kick off network requests
    // and React Query writes during initial mount, which makes the first
    // screen feel sluggish.
    const handle = setTimeout(() => {
      prewarmCriticalQueries(queryClient).catch(() => {});
      sync().catch(() => {});
    }, 600);

    const stopPrewarm = startBackgroundPrewarm(queryClient, sync);
    return () => {
      clearTimeout(handle);
      stopPrewarm();
    };
  }, [queryClient, sync]);

  return null;
}