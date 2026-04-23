/**
 * Notification Preferences Sync — keeps the per-device toggles in
 * mobile-app/src/store/userPrefsStore.ts mirrored to the backend so the
 * server can suppress pushes for categories the user has disabled.
 *
 * Backend endpoints:
 *   GET  /api/v1/notifications/preferences
 *   PUT  /api/v1/notifications/preferences   (partial allowed)
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

export interface NotificationPrefsPayload {
  newsNotifications?: boolean;
  portfolioUpdates?: boolean;
  priceAlerts?: boolean;
  dailyPriceUpdates?: boolean;
}

const ENDPOINT = `/api/v1/notifications/preferences`;

/** Push the current preferences to the backend (fire-and-forget safe). */
export async function pushNotificationPrefs(
  prefs: NotificationPrefsPayload,
): Promise<boolean> {
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
        console.warn("[Prefs] sync failed:", resp.status, txt);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (__DEV__) console.warn("[Prefs] sync error:", err);
    return false;
  }
}

/** Fetch the latest preferences from the backend (returns null on failure). */
export async function pullNotificationPrefs(): Promise<NotificationPrefsPayload | null> {
  try {
    const jwt = await getToken();
    if (!jwt) return null;

    const resp = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as NotificationPrefsPayload;
  } catch (err) {
    if (__DEV__) console.warn("[Prefs] pull error:", err);
    return null;
  }
}
