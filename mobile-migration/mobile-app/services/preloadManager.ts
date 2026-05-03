import type { QueryClient } from "@tanstack/react-query";

import api from "@/services/api";
import { OfflineCache } from "@/services/offlineCache";

const CRITICAL_KEYS: Array<readonly [string, string]> = [
  ["portfolio", "overview"],
  ["portfolio", "holdings"],
  ["market", "overview"],
  ["news", "feed"],
];

const PREWARM_INTERVAL_MS = 30 * 60 * 1000;

function endpointForKey(key: readonly [string, string]): string {
  if (key[0] === "market" && key[1] === "overview") {
    return "/api/v1/market/summary";
  }
  if (key[0] === "news" && key[1] === "feed") {
    return "/api/v1/news/feed?limit=20";
  }
  if (key[0] === "portfolio" && key[1] === "overview") {
    return "/api/v1/portfolio/overview";
  }
  if (key[0] === "portfolio" && key[1] === "holdings") {
    return "/api/v1/portfolio/holdings";
  }
  return `/api/v1/${key.join("/")}`;
}

export async function prewarmCriticalQueries(queryClient: QueryClient) {
  const promises = CRITICAL_KEYS.map(async (key) => {
    try {
      if (key[0] === "portfolio" && key[1] === "holdings") {
        const cached = OfflineCache.getHoldingsSync();
        if (cached.length > 0) {
          queryClient.setQueryData(key, cached);
          return;
        }
      }

      if (key[0] === "news") {
        const cached = OfflineCache.getNewsSync(20);
        if (cached.length > 0) {
          queryClient.setQueryData(key, cached);
          return;
        }
      }

      const res = await api.get(endpointForKey(key));
      queryClient.setQueryData(key, res.data?.data ?? res.data);
    } catch {
      // Prewarm is best-effort only.
    }
  });

  await Promise.allSettled(promises);
}

export function startBackgroundPrewarm(
  queryClient: QueryClient,
  syncFn?: () => Promise<void>,
): () => void {
  const id = setInterval(() => {
    prewarmCriticalQueries(queryClient).catch(() => {});
    if (syncFn) {
      syncFn().catch(() => {});
    }
  }, PREWARM_INTERVAL_MS);

  return () => clearInterval(id);
}
