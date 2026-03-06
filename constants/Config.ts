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
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;

// ── Production URL (used by EAS mobile builds to reach API directly) ─
const PRODUCTION_API = "https://backend-api-app-hfc2n.ondigitalocean.app";

// ── Local dev fallbacks ─────────────────────────────────────────────
// Change LAN IP if testing on a physical device over Wi-Fi
const LOCAL_LAN_API = "http://192.168.1.5:8002";
const LOCAL_WEB_API = "http://localhost:8002";

/**
 * Backend API base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL env var (set in Vercel / EAS / CI)
 *   2. Production web: "" (empty) → relative paths (same domain on DO)
 *   3. Dev web: localhost:8002
 *   4. Dev mobile: LAN IP
 */
const isLocalDev =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location?.hostname === "localhost";

export const API_BASE_URL: string =
  // Explicit override always wins (EAS build, CI, Vercel, etc.)
  (ENV_API_URL != null && ENV_API_URL !== "")
    ? ENV_API_URL
    : Platform.OS === "web"
      ? isLocalDev
        ? LOCAL_WEB_API        // Dev: http://localhost:8002
        : ""                   // Production web: relative paths (same domain)
      : PRODUCTION_API;        // Mobile native: full URL to backend

/** How long (ms) to wait before timing out API calls. */
export const API_TIMEOUT = 60_000;

/**
 * Google OAuth Web Client ID.
 *
 * Create one at https://console.cloud.google.com → APIs & Services → Credentials.
 * Type: "Web application". Add your redirect URIs (localhost + production).
 * Set via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID env var or hardcode below.
 */
const ENV_GOOGLE_CLIENT_ID =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined"
    ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    : undefined;

// Hardcoded fallback — the client ID is public (appears in every OAuth URL).
// Ensures production builds work even if the env var isn't injected.
const FALLBACK_GOOGLE_CLIENT_ID =
  "549902495569-6kbcenrhcir2iqskj377fm561e8e6l50.apps.googleusercontent.com";

export const GOOGLE_WEB_CLIENT_ID: string =
  ENV_GOOGLE_CLIENT_ID || FALLBACK_GOOGLE_CLIENT_ID;
