/**
 * App-wide configuration constants.
 *
 * Production: Set EXPO_PUBLIC_API_URL env var to your deployed backend URL.
 *   - DigitalOcean: set in .do/app.yaml envs
 *   - Vercel: set in Project → Settings → Environment Variables
 *   - EAS:    set in eas.json per build profile
 *
 * Development:
 *   Web → 127.0.0.1:8004
 *   Mobile (physical device) → LAN IP
 */

import { Platform } from "react-native";

// ── Override via env var for production builds ──────────────────────
const ENV_API_URL =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;

const ENV_API_URL_WEB =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL_WEB : undefined;

const ENV_API_URL_ANDROID =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL_ANDROID : undefined;

const ENV_API_URL_IOS =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL_IOS : undefined;

// ── Local dev fallbacks ─────────────────────────────────────────────
// Change LAN IP if testing on a physical device over Wi-Fi
const LOCAL_WEB_API = "http://127.0.0.1:8004";
const LOCAL_ANDROID_EMULATOR_API = "http://10.0.2.2:8004";

function isAndroidPhysicalDevice(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device = require("expo-device");
    return Boolean(Device?.isDevice);
  } catch {
    return false;
  }
}

function inferNativeDevApiUrl(): string | null {
  // Expo Go / dev client usually exposes hostUri like "192.168.1.5:8081".
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default;
    const hostUri: string | undefined =
      Constants?.expoConfig?.hostUri ??
      Constants?.manifest2?.extra?.expoGo?.debuggerHost ??
      Constants?.manifest?.debuggerHost;

    if (!hostUri) return null;
    const host = String(hostUri).split(":")[0]?.trim();
    if (!host) return null;

    // Android emulator cannot reach host loopback directly.
    if (Platform.OS === "android" && (host === "localhost" || host === "127.0.0.1")) {
      return LOCAL_ANDROID_EMULATOR_API;
    }

    return `http://${host}:8004`;
  } catch {
    return null;
  }
}

function resolveAndroidApiUrl(): string {
  const inferred = inferNativeDevApiUrl();

  if (ENV_API_URL_ANDROID && ENV_API_URL_ANDROID !== "") {
    const configured = ENV_API_URL_ANDROID.trim();
    const looksLikeEmulatorLoopback =
      configured.includes("10.0.2.2") ||
      configured.includes("localhost:") ||
      configured.includes("127.0.0.1:");

    // Expo Go on a real phone cannot reach emulator loopback addresses.
    if (isAndroidPhysicalDevice() && looksLikeEmulatorLoopback && inferred) {
      return inferred;
    }

    return configured;
  }

  return inferred ?? LOCAL_ANDROID_EMULATOR_API;
}

/**
 * Backend API base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL env var (set in DO / Vercel / EAS / CI)
 *   2. Production web: "" (empty) → relative paths (same domain on DO)
 *   3. Dev web: localhost:8003
 *   4. Dev mobile: LAN IP (must set EXPO_PUBLIC_API_URL)
 */
const isLocalDev =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

const webHostFallbackApi =
  Platform.OS === "web" && typeof window !== "undefined"
    ? `http://${window.location.hostname}:8004`
    : LOCAL_WEB_API;

const envWebApiLooksLoopback =
  !!ENV_API_URL_WEB &&
  (ENV_API_URL_WEB.includes("127.0.0.1") || ENV_API_URL_WEB.includes("localhost"));

const shouldUseWebHostFallback =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  !isLocalDev &&
  envWebApiLooksLoopback;

export const API_BASE_URL: string =
  // Explicit override always wins (EAS build, CI, Vercel, etc.)
  (ENV_API_URL != null && ENV_API_URL !== "")
    ? ENV_API_URL
    : Platform.OS === "web"
      ? (ENV_API_URL_WEB && ENV_API_URL_WEB !== "")
        ? (shouldUseWebHostFallback ? webHostFallbackApi : ENV_API_URL_WEB)
        : isLocalDev
          ? LOCAL_WEB_API      // Dev web: localhost backend
          : webHostFallbackApi // Dev/LAN web: same host, backend on :8004
      : Platform.OS === "android"
        ? resolveAndroidApiUrl()
        : (ENV_API_URL_IOS && ENV_API_URL_IOS !== "")
          ? ENV_API_URL_IOS
          : inferNativeDevApiUrl() ?? LOCAL_WEB_API;

/** How long (ms) to wait before timing out API calls. */
export const API_TIMEOUT = 60_000;

/**
 * Google OAuth Web Client ID.
 *
 * NOTE: OAuth client IDs are intentionally public (they appear in redirect
 * URLs). The client *secret* must never be in client code — it lives only
 * on the backend which performs the token exchange.
 *
 * Create one at https://console.cloud.google.com → APIs & Services → Credentials.
 * Type: "Web application". Add your redirect URIs (localhost + production).
 * Must be set via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID env var.
 */
const ENV_GOOGLE_CLIENT_ID =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined"
    ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    : undefined;

export const GOOGLE_WEB_CLIENT_ID: string = ENV_GOOGLE_CLIENT_ID ?? "";

const ENV_SENTRY_DSN =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_SENTRY_DSN : undefined;

export const Config = {
  SENTRY_DSN: ENV_SENTRY_DSN ?? "",
} as const;

if (__DEV__ && !GOOGLE_WEB_CLIENT_ID) {
  console.warn(
    "[Config] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set. Google Sign-In will be disabled.",
  );
}
