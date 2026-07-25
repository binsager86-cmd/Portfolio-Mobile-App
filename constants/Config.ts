/**
 * App-wide configuration constants.
 *
 * Production: Set EXPO_PUBLIC_API_URL env var to your deployed backend URL.
 *   - Vercel: set in Project → Settings → Environment Variables
 *   - EAS:    set in eas.json per build profile
 *
 * Development:
 *   Web → localhost:8002
 *   Mobile (physical device) → LAN IP
 */

import { Platform } from "react-native";

// ── Override via env var for production builds ──────────────────────
const ENV_API_URL =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL?.trim() : undefined;

// ── Production URL ──────────────────────────────────────────────────
const PRODUCTION_API = "https://backend-api-app-hfc2n.ondigitalocean.app";

// ── Local dev fallbacks ─────────────────────────────────────────────
// Change LAN IP if testing on a physical device over Wi-Fi
const LOCAL_LAN_API = "http://192.168.1.5:8002";
const LOCAL_WEB_API = "http://localhost:8002";
const PLACEHOLDER_API_PATTERN = /YOUR-BACKEND|example\.com/i;

/**
 * Backend API base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL env var (set in Vercel / EAS / CI)
 *   2. Production URL (for deployed web builds)
 *   3. localhost (web) or LAN IP (native) for dev
 */
const isLocalDev =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location?.hostname === "localhost";

const isDevBuild = typeof __DEV__ !== "undefined" && __DEV__;

if (ENV_API_URL && PLACEHOLDER_API_PATTERN.test(ENV_API_URL)) {
  throw new Error("EXPO_PUBLIC_API_URL contains a placeholder backend URL.");
}

if (!isDevBuild && Platform.OS !== "web" && !ENV_API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL is required for native preview/release builds.");
}

export const API_BASE_URL: string =
  ENV_API_URL ||
  (Platform.OS === "web"
    ? isLocalDev
      ? LOCAL_WEB_API
      : PRODUCTION_API
    : LOCAL_LAN_API);

/** How long (ms) to wait before timing out API calls. */
export const API_TIMEOUT = 60_000;
