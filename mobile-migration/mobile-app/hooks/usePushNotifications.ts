import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { queryClient } from "@/lib/queryClient";

/**
 * Centralized push behavior:
 * - foreground presentation
 * - Android channel setup for portfolio-news
 * - deep-link handling on notification taps
 */
export function usePushNotifications(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("portfolio-news", {
        name: "Portfolio News",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      }).catch((err) => { if (__DEV__) console.warn("[Push] Channel setup failed:", err); });
    }

    const routeFromData = (payload: Record<string, unknown> | undefined) => {
      if (!payload) return;
      const type = typeof payload.type === "string" ? payload.type : null;
      const newsId = payload.news_id;

      if (type === "portfolio_news" && (typeof newsId === "string" || typeof newsId === "number")) {
        try {
          router.push(`/(tabs)/news/${String(newsId)}` as never);
          return;
        } catch (err) {
          if (__DEV__) console.warn("[Push] Deep link to news item failed:", err);
        }
      }

      if (type === "news" || type === "portfolio_news") {
        try {
          router.push("/(tabs)/news" as never);
          return;
        } catch (err) {
          if (__DEV__) console.warn("[Push] Deep link to news failed:", err);
        }
      }

      if (type === "price_alert" || type === "portfolio_update") {
        try {
          router.push("/(tabs)" as never);
        } catch (err) {
          if (__DEV__) console.warn("[Push] Deep link to portfolio failed:", err);
        }
      }
    };

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
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
      .catch((err) => { if (__DEV__) console.warn("[Push] Initial response check failed:", err); });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      droppedSub.remove();
    };
  }, []);
}
