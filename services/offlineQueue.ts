import NetInfo from "@react-native-community/netinfo";

import {
  clearQueuedEntries,
  enqueue,
  getQueuedEntries,
  replay,
  type QueueEntry,
} from "@/lib/mutationQueue";

export interface QueuedMutation {
  id: string;
  mutationKey: string[];
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

function toRegistryKey(mutationKey: string[]): string {
  return mutationKey.join(".");
}

function fromQueueEntry(entry: QueueEntry): QueuedMutation {
  return {
    id: entry.id,
    mutationKey: entry.key.split("."),
    payload: (entry.variables as Record<string, unknown>) ?? {},
    timestamp: entry.enqueuedAt,
    retries: entry.retries,
    maxRetries: entry.maxRetries,
  };
}

export function getQueue(): QueuedMutation[] {
  return getQueuedEntries().map(fromQueueEntry);
}

export function addToQueue(
  mutation: Omit<QueuedMutation, "id" | "timestamp" | "retries">,
): void {
  enqueue(
    toRegistryKey(mutation.mutationKey),
    mutation.payload,
    mutation.maxRetries,
  );
}

export function clearQueue(): void {
  clearQueuedEntries();
}

/**
 * Compatibility wrapper over the existing MMKV-backed mutation replay system.
 *
 * The app already replays registered mutation functions via `lib/mutationQueue`.
 * `executeFn` is accepted for API compatibility with the requested patch, but
 * replay uses the registered mutation registry so every feature shares the same
 * queue and back-off behavior.
 */
export async function initOfflineSync(
  _executeFn?: (mutation: QueuedMutation) => Promise<void>,
): Promise<() => void> {
  const replayQueuedMutations = async () => {
    const state = await NetInfo.fetch();
    if (!state.isConnected || state.isInternetReachable === false) return;

    // Registry-backed replay remains the source of truth so we don't run
    // queued mutations twice through two different execution paths.
    await replay();
  };

  await replayQueuedMutations();

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      replayQueuedMutations().catch(console.error);
    }
  });

  return unsubscribe;
}
