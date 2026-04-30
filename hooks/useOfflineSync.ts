import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { replay } from "@/lib/mutationQueue";

/**
 * Monitors network connectivity and syncs TanStack Query state.
 *
 * - On disconnect: marks all active queries as stale for offline cache use.
 * - On reconnect: replays the MMKV-backed offline mutation queue (failed
 *   mutations that were enqueued while the device was unreachable), then
 *   invalidates stale queries so fresh data is fetched.
 *
 * Returns `true` when the device has no network connection.
 */
export const useOfflineSync = () => {
  const [isOffline, setIsOffline] = useState(false);
  const wasOfflineRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);

      if (offline && !wasOfflineRef.current) {
        // Going offline — mark queries stale so cached data is served
        queryClient.invalidateQueries({ refetchType: "none" });
      } else if (!offline && wasOfflineRef.current) {
        // Coming back online:
        //  1. Replay any mutations that failed while offline
        //  2. Invalidate stale queries to pull fresh server state
        replay(() => {
          // After each successful mutation replay, invalidate the caches
          // that the mutation affects. A broad invalidation is safe here
          // because we just came back online and a full refresh is expected.
          queryClient.invalidateQueries();
        }).catch(console.error);

        queryClient.invalidateQueries({ stale: true });
      }

      wasOfflineRef.current = offline;
    });
    return unsubscribe;
  }, [queryClient]);

  return isOffline;
};
