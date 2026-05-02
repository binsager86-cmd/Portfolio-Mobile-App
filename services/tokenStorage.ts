/**
 * Token storage abstraction.
 *
 * Web    → sessionStorage for access tokens (cleared when tab closes),
 *          localStorage for refresh tokens (persistent across tabs).
 * Native → expo-secure-store (encrypted on-device keychain/keystore)
 *
 * Uses crash-safe timestamp-based expiry tracking instead of JWT decode.
 * Clock-skew tolerance: 60 s buffer for network/device clock drift.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ── Constants ───────────────────────────────────────────────────────

const CLOCK_SKEW_MS = 60_000; // 60s buffer for network/device clock drift

// SSR guards — sessionStorage/localStorage may not exist during
// Expo Router's Node.js server-side render pass.
const hasSessionStorage = typeof sessionStorage !== "undefined";
const hasLocalStorage = typeof localStorage !== "undefined";

// ── In-memory token cache ───────────────────────────────────────────
// Reading from expo-secure-store on Android is a JNI call into the
// Keystore that costs ~10-30 ms each time. Without caching, every API
// request adds that latency, which adds up fast on screens that fire
// half a dozen queries in parallel. We keep the access + refresh tokens
// in memory once loaded; the cache is invalidated whenever the tokens
// change or are cleared. `undefined` means "never read yet", `null`
// means "confirmed empty".

let cachedAccessToken: string | null | undefined = undefined;
let cachedRefreshToken: string | null | undefined = undefined;
let cachedExpiresAt: string | null | undefined = undefined;

function primeCache(
  access: string | null,
  refresh: string | null,
  expiresAt: string | null,
) {
  cachedAccessToken = access;
  cachedRefreshToken = refresh;
  cachedExpiresAt = expiresAt;
}

// ── New API ─────────────────────────────────────────────────────────

export const setTokens = async (
  access: string,
  refresh: string,
  expiresIn?: number,
): Promise<void> => {
  const expiresAt = expiresIn ? String(Date.now() + expiresIn * 1000) : null;
  primeCache(access, refresh, expiresAt);
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.setItem("access_token", access);
    if (hasLocalStorage) {
      localStorage.setItem("refresh_token", refresh);
      if (expiresAt) localStorage.setItem("token_expires_at", expiresAt);
    }
  } else {
    await SecureStore.setItemAsync("access_token", access);
    await SecureStore.setItemAsync("refresh_token", refresh);
    if (expiresAt) await SecureStore.setItemAsync("token_expires_at", expiresAt);
  }
};

export const getTokens = async () => {
  if (Platform.OS === "web") {
    return {
      access: hasSessionStorage
        ? sessionStorage.getItem("access_token")
        : null,
      refresh: hasLocalStorage
        ? localStorage.getItem("refresh_token")
        : null,
      expiresAt: hasLocalStorage
        ? localStorage.getItem("token_expires_at")
        : null,
    };
  }
  if (
    cachedAccessToken !== undefined &&
    cachedRefreshToken !== undefined &&
    cachedExpiresAt !== undefined
  ) {
    return {
      access: cachedAccessToken,
      refresh: cachedRefreshToken,
      expiresAt: cachedExpiresAt,
    };
  }
  const [access, refresh, expiresAt] = await Promise.all([
    SecureStore.getItemAsync("access_token"),
    SecureStore.getItemAsync("refresh_token"),
    SecureStore.getItemAsync("token_expires_at"),
  ]);
  primeCache(access, refresh, expiresAt);
  return { access, refresh, expiresAt };
};

export const clearTokens = async (): Promise<void> => {
  primeCache(null, null, null);
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.removeItem("access_token");
    if (hasLocalStorage) {
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("token_expires_at");
    }
  } else {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
    await SecureStore.deleteItemAsync("token_expires_at");
  }
};

export const getStoredAccessToken = async (): Promise<string | null> => {
  if (Platform.OS === "web") {
    return hasSessionStorage
      ? sessionStorage.getItem("access_token")
      : null;
  }
  if (cachedAccessToken !== undefined) return cachedAccessToken;
  const value = await SecureStore.getItemAsync("access_token");
  cachedAccessToken = value;
  return value;
};

// ── Expiry checking ─────────────────────────────────────────────────

// Legacy JWT decode helper — kept for backward compat with hydrate/session guard.
interface JwtPayload {
  exp: number;
  iat: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1];
    if (!base64) return null;
    const padded = base64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const parsed = JSON.parse(json);
    if (typeof parsed?.exp !== "number") return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

const CLOCK_SKEW_SECONDS = 30;

/**
 * Check if a token or expiry timestamp indicates expiration.
 *
 * Supports two calling conventions:
 *   - `isTokenExpired(expiresAt)` — new: checks a stored ms-timestamp string
 *   - `isTokenExpired(jwt, bufferSeconds)` — legacy: decodes a JWT payload
 *
 * Detection: if `bufferSeconds` is provided or the string contains dots
 * (JWT format), uses JWT decode. Otherwise treats as a numeric timestamp.
 */
export function isTokenExpired(
  tokenOrExpiresAt: string | null,
  bufferSeconds?: number,
): boolean {
  if (!tokenOrExpiresAt) return true;

  // Legacy path: JWT decode (when bufferSeconds given, or string looks like JWT)
  if (bufferSeconds !== undefined || tokenOrExpiresAt.includes(".")) {
    const payload = decodeJwtPayload(tokenOrExpiresAt);
    if (!payload?.exp) return true;
    const nowSec = Date.now() / 1000;
    const buffer = bufferSeconds ?? 60;
    return payload.exp - nowSec < buffer + CLOCK_SKEW_SECONDS;
  }

  // New path: stored timestamp
  const expiry = Number(tokenOrExpiresAt);
  if (isNaN(expiry)) return true;
  return Date.now() >= expiry - CLOCK_SKEW_MS;
}

// ── Backward-compatible API ─────────────────────────────────────────
// These aliases allow existing consumers (authStore hydrate, useSessionGuard,
// newsApi, marketApi, etc.) to work without changes.

export async function getToken(): Promise<string | null> {
  return getStoredAccessToken();
}

export async function setToken(token: string): Promise<void> {
  cachedAccessToken = token;
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.setItem("access_token", token);
  } else {
    await SecureStore.setItemAsync("access_token", token);
  }
}

export async function removeToken(): Promise<void> {
  cachedAccessToken = null;
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.removeItem("access_token");
  } else {
    await SecureStore.deleteItemAsync("access_token");
  }
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return hasLocalStorage ? localStorage.getItem("refresh_token") : null;
  }
  if (cachedRefreshToken !== undefined) return cachedRefreshToken;
  const value = await SecureStore.getItemAsync("refresh_token");
  cachedRefreshToken = value;
  return value;
}

export async function setRefreshToken(token: string): Promise<void> {
  cachedRefreshToken = token;
  if (Platform.OS === "web") {
    if (hasLocalStorage) localStorage.setItem("refresh_token", token);
  } else {
    await SecureStore.setItemAsync("refresh_token", token);
  }
}

export async function removeRefreshToken(): Promise<void> {
  cachedRefreshToken = null;
  cachedExpiresAt = null;
  if (Platform.OS === "web") {
    if (hasLocalStorage) {
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("token_expires_at");
    }
  } else {
    await SecureStore.deleteItemAsync("refresh_token");
    await SecureStore.deleteItemAsync("token_expires_at");
  }
}
