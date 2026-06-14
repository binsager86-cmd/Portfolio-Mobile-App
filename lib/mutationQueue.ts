/**
 * MMKV-backed offline mutation queue.
 *
 * When a mutation fails due to a network error (no server response),
 * callers can enqueue the operation for replay. On reconnect
 * (detected by useOfflineSync), call `replay()` to re-attempt every
 * queued mutation with exponential back-off.
 *
 * Architecture:
 *   1. Each mutation type registers its API function via registerMutationFn().
 *   2. On a network failure in onError, call enqueue(key, variables).
 *   3. useOfflineSync calls replay() when the device comes back online.
 *
 * Storage: MMKV on native (fast, synchronous), localStorage on web.
 * Entries older than 24 h are pruned automatically.
 */

import { AxiosError } from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

// ── Types ───────────────────────────────────────────────────────────

export interface QueueEntry {
  /** Unique entry identifier. */
  id: string;
  /** Key used to look up the registered mutation function. */
  key: string;
  /** Serialised arguments to pass to the mutation function. */
  variables: unknown;
  /** Number of failed replay attempts so far. */
  retries: number;
  /** Maximum allowed retries before the entry is dropped. */
  maxRetries: number;
  /** Unix timestamp (ms) when the entry was first enqueued. */
  enqueuedAt: number;
}

// ── Constants ───────────────────────────────────────────────────────

const STORAGE_KEY = "offline_mutation_queue";
const MAX_AGE_MS  = 24 * 60 * 60 * 1_000; // 24 hours

// ── Storage backend (lazy singleton) ───────────────────────────────

type KVStore = {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
};

let _store: KVStore | null = null;

function getStore(): KVStore {
  if (_store) return _store;

  if (Platform.OS === "web") {
    _store = {
      get: (k) => (typeof localStorage !== "undefined" ? localStorage.getItem(k) : null),
      set: (k, v) => { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); },
    };
    return _store;
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
      mmkvStore = new MMKV({ id: "mutation-queue" });
    } catch {
      mmkvStore = null;
    }
    return mmkvStore;
  };

  _store = {
    get: (k) => {
      const store = getMMKVStore();
      if (store) {
        try {
          return store.getString(k) ?? mem.get(k) ?? null;
        } catch {
          return mem.get(k) ?? null;
        }
      }
      return mem.get(k) ?? null;
    },
    set: (k, v) => {
      const store = getMMKVStore();
      if (store) {
        try {
          store.set(k, v);
          return;
        } catch {
          // Fall through to in-memory fallback.
        }
      }
      mem.set(k, v);
    },
  };

  return _store!;
}

// ── Queue persistence helpers ───────────────────────────────────────

function load(): QueueEntry[] {
  try {
    const raw = getStore().get(STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as QueueEntry[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return entries.filter((e) => e.enqueuedAt > cutoff);
  } catch {
    return [];
  }
}

function save(entries: QueueEntry[]): void {
  try {
    getStore().set(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage write failure is non-fatal; the mutation will just not be replayed.
  }
}

/** Return the current persisted queue contents (after max-age pruning). */
export function getQueuedEntries(): QueueEntry[] {
  return load();
}

/** Remove every pending entry from the persistent queue. */
export function clearQueuedEntries(): void {
  save([]);
}

// ── Function registry ───────────────────────────────────────────────

const registry = new Map<string, (variables: unknown) => Promise<unknown>>();

/**
 * Register a mutation function under a stable string key.
 * Call this at module level in each mutation-hook file so the function
 * is available before the first replay attempt.
 *
 * @example
 *   registerMutationFn("deposits.delete", (id) => deleteDeposit(id as number));
 */
export function registerMutationFn(
  key: string,
  fn: (variables: unknown) => Promise<unknown>,
): void {
  registry.set(key, fn);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Add a failed mutation to the persistent queue for later replay.
 *
 * @param key        - Registered mutation key (must match a registerMutationFn call).
 * @param variables  - Serialisable arguments for the mutation function.
 * @param maxRetries - How many replay attempts before the entry is discarded (default 3).
 */
export function enqueue(key: string, variables: unknown, maxRetries = 3): void {
  const entries = load();
  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    variables,
    retries: 0,
    maxRetries,
    enqueuedAt: Date.now(),
  });
  save(entries);
}

/** Remove a specific entry from the queue. */
export function dequeue(id: string): void {
  save(load().filter((e) => e.id !== id));
}

/** Number of pending entries (useful for a badge / debug overlay). */
export function queueSize(): number {
  return load().length;
}

/**
 * Attempt to replay all queued mutations.
 *
 * - Applies exponential back-off: entries whose `retries` count has not
 *   yet exceeded a time-based threshold are skipped until next call.
 * - Entries whose `retries` exceed `maxRetries` are permanently dropped.
 * - On each successful replay, calls `onSuccess()` so the caller can
 *   invalidate affected query caches.
 *
 * Call this when the device comes back online (see useOfflineSync).
 */
export async function replay(onSuccess?: () => void): Promise<void> {
  const entries = load();
  if (entries.length === 0) return;

  const remaining: QueueEntry[] = [];

  for (const entry of entries) {
    const fn = registry.get(entry.key);
    if (!fn) {
      // Function not yet registered — keep for the next replay cycle.
      remaining.push(entry);
      continue;
    }

    // Exponential back-off: require at least 2^retries * 1s since enqueue.
    const backoffMs = Math.min(1_000 * 2 ** entry.retries, 30_000);
    const age = Date.now() - entry.enqueuedAt;
    if (age < backoffMs) {
      remaining.push(entry);
      continue;
    }

    try {
      await fn(entry.variables);
      // Success — don't carry this entry forward.
      onSuccess?.();
    } catch {
      if (entry.retries < entry.maxRetries) {
        remaining.push({ ...entry, retries: entry.retries + 1 });
      }
      // Exhausted retries — silently drop.
    }
  }

  save(remaining);
}

// ── Network error detection helper ─────────────────────────────────

/**
 * Returns true when the error is a network-level failure (no HTTP response
 * was received). Used in mutation `onError` handlers to decide whether to
 * enqueue rather than surface an error to the user.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    // No response property means the request never reached the server.
    return error.response === undefined;
  }
  // Generic objects — check for typical network-error properties.
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string };
    if (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED") return true;
    if (e.message === "Network Error") return true;
  }
  return false;
}
