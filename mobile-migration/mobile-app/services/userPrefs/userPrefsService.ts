/**
 * User Preferences Sync — keeps the per-device toggles in
 * mobile-app/src/store/userPrefsStore.ts mirrored to the backend so the
 * user's expertise level / language / feature flags follow them across
 * devices and re-installs.
 *
 * Backend endpoints:
 *   GET  /api/v1/users/me/preferences
 *   PUT  /api/v1/users/me/preferences   (partial allowed)
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

export interface UserPrefsPayload {
  expertiseLevel?: "normal" | "intermediate" | "advanced";
  language?: "en" | "ar";
  showAdvancedMetrics?: boolean;
  enableShariaFilter?: boolean;
  dividendFocus?: boolean;
}

const ENDPOINT = `/api/v1/users/me/preferences`;

/** Push the current preferences to the backend (fire-and-forget safe). */
export async function pushUserPrefs(prefs: UserPrefsPayload): Promise<boolean> {
  try {
    const jwt = await getToken();
    if (!jwt) return false;

    const resp = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(prefs),
    });

    if (!resp.ok) {
      if (__DEV__) {
        const txt = await resp.text();
        console.warn("[UserPrefs] sync failed:", resp.status, txt);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefs] sync error:", err);
    return false;
  }
}

/** Fetch the latest preferences from the backend (returns null on failure). */
export async function pullUserPrefs(): Promise<UserPrefsPayload | null> {
  try {
    const jwt = await getToken();
    if (!jwt) return null;

    const resp = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as UserPrefsPayload;
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefs] pull error:", err);
    return null;
  }
}
