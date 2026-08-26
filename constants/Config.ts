/**
 * App-wide configuration constants.
 *
 * Production: Set EXPO_PUBLIC_API_URL env var to your deployed backend URL.
 *   - DigitalOcean: set in .do/app.yaml envs
 *   - Vercel: set in Project → Settings → Environment Variables
 *   - EAS:    set in eas.json per build profile
 *
 * Development:
 *   Web → 127.0.0.1:8005
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

const ENV_ENABLE_SIMULATOR =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_ENABLE_SIMULATOR : undefined;

export function isSimulatorFeatureEnabled(): boolean {
  const raw = (ENV_ENABLE_SIMULATOR ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const SIMULATOR_UI_ENABLED = isSimulatorFeatureEnabled();

export function hasSimulatorIntegrityIssue(integrity?: { projection_stale?: boolean; projection_status?: string; seal_verification?: { pass?: boolean } }): boolean {
  if (!integrity) return true;
  const stale = integrity.projection_stale === true || integrity.projection_status === "STALE";
  const sealFailure = integrity.seal_verification?.pass !== true;
  return stale || sealFailure;
}

// ── Local dev fallbacks ─────────────────────────────────────────────
// Change LAN IP if testing on a physical device over Wi-Fi
const LOCAL_WEB_API = "http://127.0.0.1:8005";
const LOCAL_ANDROID_EMULATOR_API = "http://10.0.2.2:8005";

function normalizedEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLoopbackOrEmulatorHost(urlValue: string): boolean {
  try {
    const parsed = new URL(urlValue);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "10.0.2.2";
  } catch {
    const lower = urlValue.toLowerCase();
    return (
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes("::1") ||
      lower.includes("10.0.2.2")
    );
  }
}

function resolveWebApiUrl(isLocalDevWeb: boolean): string {
  const webEnv = normalizedEnvValue(ENV_API_URL_WEB);
  const globalEnv = normalizedEnvValue(ENV_API_URL);
  const configured = webEnv ?? globalEnv;

  if (configured) {
    // Production web should never target device/emulator loopback hosts.
    if (!isLocalDevWeb && isLoopbackOrEmulatorHost(configured)) {
      console.error(
        "[Config] Ignoring loopback/emulator API URL for production web build:",
        configured,
      );
      return "";
    }
    return configured;
  }

  return isLocalDevWeb ? LOCAL_WEB_API : "";
}

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

    return `http://${host}:8005`;
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

  if (ENV_API_URL && ENV_API_URL !== "") {
    return ENV_API_URL.trim();
  }

  return inferred ?? LOCAL_ANDROID_EMULATOR_API;
}

/**
 * Backend API base URL.
 *
 * Priority:
 *   1. Android: EXPO_PUBLIC_API_URL_ANDROID (with physical-device safeguards)
 *   2. Web: EXPO_PUBLIC_API_URL_WEB
 *   3. iOS: EXPO_PUBLIC_API_URL_IOS
 *   4. Global platform fallback: EXPO_PUBLIC_API_URL
 *   5. Local/platform fallbacks
 */
const isLocalDev =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

export const API_BASE_URL: string =
  Platform.OS === "android"
    ? resolveAndroidApiUrl()
    : Platform.OS === "web"
      ? resolveWebApiUrl(isLocalDev)
      : (ENV_API_URL_IOS && ENV_API_URL_IOS.trim() !== "")
        ? ENV_API_URL_IOS.trim()
        : (ENV_API_URL != null && ENV_API_URL.trim() !== "")
          ? ENV_API_URL.trim()
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
