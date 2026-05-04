/**
 * Push Token Service — registers the device's Expo push token with the backend.
 *
 * Called at app startup (after login) to enable server-initiated push notifications
 * for real-time news alerts on holding stocks.
 */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

/**
 * Resolve the EAS projectId required by getExpoPushTokenAsync() in
 * production builds. Falls back to expo config in dev (Expo Go).
 */
function resolveProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

function isPermissionGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === "ios") {
    const iosStatus = status.ios?.status;
    return (
      status.granted ||
      iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
    );
  }
  return status.granted || status.status === "granted";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExpoPushTokenWithRetry(projectId: string, attempts = 3): Promise<string | null> {
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      return tokenData.data;
    } catch (err) {
      lastError = err;
      // Retry transient HTTPS/network failures with small backoff.
      if (i < attempts - 1) {
        await wait(1200 * (i + 1));
      }
    }
  }

  console.warn("[Push] Failed to fetch Expo push token after retries:", lastError);
  return null;
}

async function registerTokenWithBackend(
  pushToken: string,
  jwt: string,
  platform: "ios" | "android" | "web",
  attempts = 3,
): Promise<boolean> {
  let lastStatus = 0;
  let lastBody = "";

  for (let i = 0; i < attempts; i += 1) {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/notifications/register-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ token: pushToken, platform }),
      });

      if (resp.ok) return true;

      lastStatus = resp.status;
      lastBody = await resp.text();

      if (resp.status < 500) {
        break;
      }
    } catch {
      // keep retrying below
    }

    if (i < attempts - 1) {
      await wait(1200 * (i + 1));
    }
  }

  console.warn("[Push] Backend registration failed:", lastStatus, lastBody, "API:", API_BASE_URL);
  return false;
}

/**
 * Register for push notifications and send the token to the backend.
 *
 * - Requests notification permissions
 * - Gets the Expo push token
 * - POSTs it to /api/v1/notifications/register-token
 */
export async function registerPushToken(): Promise<string | null> {
  // Web uses a different notification flow
  if (Platform.OS === "web") {
    if (__DEV__) console.info("[Push] Web platform — skipping Expo push token");
    return null;
  }

  // Remote Expo push notifications are not supported in Expo Go.
  // Use a development build / production build to receive backend pushes.
  if ((Constants as { appOwnership?: string }).appOwnership === "expo") {
    console.warn("[Push] Expo Go detected — remote push notifications are disabled. Use a dev build.");
    return null;
  }

  if (!Device.isDevice) {
    if (__DEV__) console.warn("[Push] Physical device required for remote push notifications");
    return null;
  }

  // Ensure all Android notification channels exist (required on Android 8+).
  // We create them here (during registration) and also in usePushNotifications
  // so they exist regardless of which code path runs first.
  if (Platform.OS === "android") {
    // Android LED light color (native hardware — not a UI token)
     
    const LED_PURPLE = "#8a2be2";
    const channels: { id: string; name: string; importance: number; description: string }[] = [
      { id: "news",              name: "Market News",              importance: Notifications.AndroidImportance.HIGH,    description: "Breaking news about stocks you hold" },
      { id: "portfolio-news",   name: "Portfolio News Alerts",    importance: Notifications.AndroidImportance.HIGH,    description: "News matching companies in your portfolio" },
      { id: "portfolio-updates",name: "Portfolio Updates",        importance: Notifications.AndroidImportance.HIGH,    description: "Significant moves in your portfolio value" },
      { id: "price-alerts",     name: "Price Alerts",             importance: Notifications.AndroidImportance.MAX,     description: "Urgent alerts when a stock hits your target price" },
      { id: "daily-updates",    name: "Daily Portfolio Summary",  importance: Notifications.AndroidImportance.DEFAULT, description: "End-of-day portfolio value summary" },
    ];
    for (const ch of channels) {
      try {
        await Notifications.setNotificationChannelAsync(ch.id, {
          name: ch.name,
          importance: ch.importance,
          description: ch.description,
          vibrationPattern: ch.importance >= Notifications.AndroidImportance.HIGH ? [0, 250, 250, 250] : [0, 150],
          lightColor: LED_PURPLE,
          sound: "default",
          enableLights: ch.importance >= Notifications.AndroidImportance.HIGH,
          enableVibrate: ch.importance >= Notifications.AndroidImportance.HIGH,
          showBadge: true,
        });
      } catch (e) {
        if (__DEV__) console.warn("[Push] setNotificationChannelAsync failed:", ch.id, e);
      }
    }
  }

  // Request permissions
  const existing = await Notifications.getPermissionsAsync();
  let granted = isPermissionGranted(existing);

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    granted = isPermissionGranted(requested);
  }

  if (!granted) {
    if (__DEV__) console.info("[Push] Permission not granted");
    return null;
  }

  // Get the Expo push token
  try {
    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn("[Push] Missing EAS projectId — cannot fetch push token in production build");
      return null;
    }
    const pushToken = await getExpoPushTokenWithRetry(projectId);
    if (!pushToken) return null;

    if (__DEV__) console.info("[Push] Token:", pushToken);

    // Send to backend
    const jwt = await getToken();
    if (!jwt) {
      if (__DEV__) console.info("[Push] No auth token — skipping registration");
      return pushToken;
    }

    const platform =
      Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

    const ok = await registerTokenWithBackend(pushToken, jwt, platform);

    if (ok) {
      if (__DEV__) console.info("[Push] Token registered with backend");
      // After the device is known to the backend, sync the user's current
      // notification preferences so the dispatcher can honor disabled toggles.
      try {
        const { useUserPrefsStore } = await import("@/src/store/userPrefsStore");
        const { pushNotificationPrefs } = await import("./notificationPrefsService");
        const notifPrefs = useUserPrefsStore.getState().preferences.notifications;
        void pushNotificationPrefs(notifPrefs);
      } catch (err) {
        if (__DEV__) console.warn("[Push] prefs sync after register failed:", err);
      }
    } else {
      return null;
    }

    return pushToken;
  } catch (error) {
    console.warn("[Push] Registration error:", error);
    return null;
  }
}

/**
 * Unregister push token from the backend (e.g., on logout).
 */
export async function unregisterPushToken(pushToken: string): Promise<void> {
  try {
    const jwt = await getToken();
    if (!jwt) return;

    await fetch(`${API_BASE_URL}/api/v1/notifications/unregister-token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: pushToken }),
    });
  } catch (error) {
    console.warn("[Push] Unregister error:", error);
  }
}
