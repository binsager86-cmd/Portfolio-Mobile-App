import { useCallback, useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";

import api from "@/services/api";
import { OfflineCache } from "@/services/offlineCache";
import { clearQueue, getQueue } from "@/services/offlineQueue";

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

export function useOfflineSyncEngine() {
  const queryClient = useQueryClient();
  const syncLock = useRef(false);

  const sync = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    OfflineCache.updateMeta({ status: "syncing" });

    try {
      const queue = getQueue();
      let conflictCount = OfflineCache.getMeta().conflictCount;

      for (const item of queue) {
        try {
          await api.post(`/api/v1/${item.mutationKey.join("/")}`, item.payload);
        } catch {
          conflictCount += 1;
        }
      }
      if (queue.length) clearQueue();

      const [holdingsRes, newsRes] = await Promise.all([
        api.get("/api/v1/portfolio/holdings"),
        api.get("/api/v1/news/feed?limit=50"),
      ]);

      const holdingsPayload =
        holdingsRes.data?.data ||
        holdingsRes.data?.holdings ||
        [];
      const newsPayload =
        newsRes.data?.data ||
        newsRes.data?.items ||
        [];

      OfflineCache.upsertHoldings(Array.isArray(holdingsPayload) ? holdingsPayload : []);
      OfflineCache.upsertNews(Array.isArray(newsPayload) ? newsPayload : []);

      OfflineCache.updateMeta({
        lastSync: new Date().toISOString(),
        status: "idle",
        conflictCount,
      });

      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["news"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
    } catch {
      const meta = OfflineCache.getMeta();
      OfflineCache.updateMeta({
        status: "error",
        conflictCount: meta.conflictCount + 1,
      });
    } finally {
      syncLock.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (
        state.isConnected &&
        state.isInternetReachable &&
        OfflineCache.getMeta().status === "error"
      ) {
        sync();
      }
    });
    return () => unsubscribe();
  }, [sync]);

  useEffect(() => {
    const id = setInterval(() => {
      sync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sync]);

  return { sync, meta: OfflineCache.getMeta() };
}
