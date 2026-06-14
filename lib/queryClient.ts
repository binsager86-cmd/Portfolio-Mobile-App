/**
 * React Query client — shared singleton with MMKV offline persistence.
 *
 * Default options:
 *  - staleTime: 5 min (data stays fresh before background refetch)
 *  - gcTime: 30 min  (keep unused query data in memory for a shorter window)
 *  - retry: 1 retry with a fixed 1s delay
 *  - refetchOnWindowFocus: false (stop aggressive foreground refetches)
 *  - refetchOnReconnect: true
 *
 * Stale-while-revalidate: screens render cached data instantly from MMKV,
 * then silently refresh in the background. Combined with placeholderData
 * on filtered queries, users almost never see blank screens.
 *
 * Persistence: MMKV on native, localStorage on web — queries survive
 * app restarts so screens render immediately while background refetches.
 */

import { QueryClient } from "@tanstack/react-query";
import { focusManager } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

// ── MMKV storage (native) or localStorage (web) ─────────────────────

function createStorage() {
  if (Platform.OS === "web") {
    // Web: use localStorage directly (guard for SSR where it doesn't exist)
    const hasLocalStorage = typeof localStorage !== "undefined";
    return {
      getItem: (key: string) =>
        hasLocalStorage ? localStorage.getItem(key) ?? undefined : undefined,
      setItem: (key: string, value: string) => {
        if (hasLocalStorage) localStorage.setItem(key, value);
      },
      removeItem: (key: string) => {
        if (hasLocalStorage) localStorage.removeItem(key);
      },
    };
  }

  const runtimeInfo = Constants as {
    appOwnership?: string;
    executionEnvironment?: string;
  };
  const isExpoGoRuntime =
    runtimeInfo.appOwnership === "expo" ||
    runtimeInfo.executionEnvironment === "storeClient";
  const mem = new Map<string, string>();

  type MMKVStore = {
    getString: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
  };

  let mmkvStore: MMKVStore | null | undefined;
  const getMMKVStore = (): MMKVStore | null => {
    if (isExpoGoRuntime) return null;
    if (mmkvStore !== undefined) return mmkvStore;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MMKV } = require("react-native-mmkv") as {
        MMKV: new (cfg: { id: string }) => MMKVStore;
      };
      mmkvStore = new MMKV({ id: "react-query" });
    } catch {
      mmkvStore = null;
    }
    return mmkvStore;
  };

  return {
    getItem: (key: string) => {
      const store = getMMKVStore();
      if (store) {
        try {
          return store.getString(key) ?? mem.get(key) ?? undefined;
        } catch {
          return mem.get(key) ?? undefined;
        }
      }
      return mem.get(key) ?? undefined;
    },
    setItem: (key: string, value: string) => {
      const store = getMMKVStore();
      if (store) {
        try {
          store.set(key, value);
          return;
        } catch {
          // Fall through to in-memory fallback.
        }
      }
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      const store = getMMKVStore();
      if (store) {
        try {
          store.delete(key);
          return;
        } catch {
          // Fall through to in-memory fallback.
        }
      }
      mem.delete(key);
    },
  };
}

// ── Query client ────────────────────────────────────────────────────

const THIRTY_MINUTES_MS = 30 * 60_000;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: THIRTY_MINUTES_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: 1_000,
      structuralSharing: true,
    },
  },
});

// ── Persist cache to storage ────────────────────────────────────────

const persister = createSyncStoragePersister({
  storage: createStorage(),
  throttleTime: 500,
});
persistQueryClient({ queryClient, persister, maxAge: ONE_DAY_MS });

// ── Focus manager — auto-refetch stale queries on app focus ─────────
// Web: React Query handles visibilitychange automatically.
// Native: wire AppState to React Query's focusManager so queries refetch
// when the user returns from background.

if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => subscription.remove();
  });
}
