import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { queryClient } from "@/lib/queryClient";

/**
 * Centralized push behavior:
 * - Android channel setup for all notification categories
 * - deep-link handling on notification taps
 *
 * NOTE: setNotificationHandler is set at module level in _layout.tsx
 * so it is active before any component renders (including cold-start).
 */

// Android LED notification light colors (native hardware — not UI tokens)
 
const LED_PURPLE = "#8a2be2";
 
const LED_GREEN = "#00d4aa";
 
const LED_RED = "#ff4444";

// All notification channels — mirrors backend channelId values.
// Each channel maps to a category the user can individually mute in
// Android Settings → App notifications.
type AndroidChannelWithId = Notifications.NotificationChannelInput & { id: string };

const ANDROID_CHANNELS: AndroidChannelWithId[] = [
  {
    id: "news",
    name: "Market News",
    importance: Notifications.AndroidImportance.HIGH,
    description: "Breaking news about stocks you hold",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: LED_PURPLE,
    sound: "default",
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  },
  {
    id: "portfolio-news",
    name: "Portfolio News Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    description: "News specifically matching companies in your portfolio",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: LED_PURPLE,
    sound: "default",
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  },
  {
    id: "portfolio-updates",
    name: "Portfolio Updates",
    importance: Notifications.AndroidImportance.HIGH,
    description: "Significant moves in your total portfolio value",
    vibrationPattern: [0, 300, 200, 300],
    lightColor: LED_GREEN,
    sound: "default",
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  },
  {
    id: "price-alerts",
    name: "Price Alerts",
    importance: Notifications.AndroidImportance.MAX,
    description: "Urgent alerts when a stock hits your target price",
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: LED_RED,
    sound: "default",
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  },
  {
    id: "daily-updates",
    name: "Daily Portfolio Summary",
    importance: Notifications.AndroidImportance.DEFAULT,
    description: "End-of-day portfolio value summary",
    vibrationPattern: [0, 150],
    lightColor: LED_PURPLE,
    sound: "default",
    enableLights: false,
    enableVibrate: false,
    showBadge: true,
  },
];

export function usePushNotifications(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Create all Android notification channels so the user can
    // individually control each category from Android Settings.
    if (Platform.OS === "android") {
      for (const ch of ANDROID_CHANNELS) {
        const { id, ...channel } = ch;
        Notifications.setNotificationChannelAsync(id, channel).catch((err) => {
          if (__DEV__) console.warn(`[PushNotifications] channel "${id}" setup failed:`, err);
        });
      }
    }

    const routeFromData = (payload: Record<string, unknown> | undefined) => {
      if (!payload) return;
      const type = typeof payload.type === "string" ? payload.type : null;
      const newsId = payload.news_id ?? payload.newsId;

      if (type === "portfolio_news" && (typeof newsId === "string" || typeof newsId === "number")) {
        try {
          router.push(`/(tabs)/news/${String(newsId)}` as never);
          return;
        } catch {
          // fall through
        }
      }

      if (type === "news" || type === "portfolio_news") {
        try {
          router.push("/(tabs)/news" as never);
          return;
        } catch {
          // no-op
        }
      }

      if (type === "price_alert" || type === "portfolio_update" || type === "daily_update") {
        try {
          router.push("/(tabs)" as never);
        } catch {
          // no-op
        }
      }
    };

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
      // Increment badge counter for received notifications
      Notifications.getBadgeCountAsync()
        .then((count) => Notifications.setBadgeCountAsync(count + 1))
        .catch((err) => {
          if (__DEV__) console.warn("[PushNotifications] badge update failed:", err);
        });
      // If it's a portfolio notification, also refresh portfolio data
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === "portfolio_update" || data?.type === "daily_update") {
        queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data as
        | Record<string, unknown>
        | undefined;
      queryClient.invalidateQueries({ queryKey: ["news"] });
      routeFromData(data);
    });

    const droppedSub = Notifications.addNotificationsDroppedListener(() => {
      // Best effort telemetry hook can be added here if needed.
    });

    Notifications.getLastNotificationResponseAsync()
      .then((initial) => {
        const data = initial?.notification?.request?.content?.data as
          | Record<string, unknown>
          | undefined;
        routeFromData(data);
      })
      .catch((err) => {
        if (__DEV__) console.warn("[PushNotifications] initial notification read failed:", err);
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      droppedSub.remove();
    };
  }, []);
}

