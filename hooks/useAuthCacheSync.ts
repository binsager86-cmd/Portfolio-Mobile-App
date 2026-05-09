/**
 * useAuthCacheSync — Zustand ↔ React Query cache sync.
 *
 * On logout (token → null): clears the entire query cache so stale
 * user data never leaks to a subsequent session.
 * On login  (null → token): invalidates active queries to trigger
 * fresh fetches with the new credential.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/services/authStore";

export function useAuthCacheSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (prevState.token && !state.token) {
        // Logout — wipe everything
        queryClient.clear();
      } else if (!prevState.token && state.token) {
        // Login — refetch user-scoped data only (avoid nuking shared caches)
        queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey[0];
            return key === "portfolio" || key === "portfolio-overview"
              || key === "holdings" || key === "transactions"
              || key === "news" || key === "deposits"
              || key === "dividends" || key === "user";
          },
        });
      }
    });
    return unsubscribe;
  }, [queryClient]);
}
