/**
 * Deposit mutation hooks — create / update / delete with:
 *
 *   • Optimistic cache updates on every mutate call (onMutate)
 *   • Automatic rollback on error (onError)
 *   • Full cache invalidation on success (onSettled)
 *   • Offline queue: network errors are enqueued for replay on reconnect
 */

import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  createDeposit,
  updateDeposit,
  deleteDeposit,
  type CashDepositCreate,
  type CashDepositListResponse,
} from "@/services/api";
import { enqueue, isNetworkError, registerMutationFn } from "@/lib/mutationQueue";

// ── Register functions for offline queue replay ─────────────────────
registerMutationFn("deposits.create", (v) => createDeposit(v as CashDepositCreate));
registerMutationFn("deposits.update", (v) => {
  const { id, payload } = v as { id: number; payload: Partial<CashDepositCreate> };
  return updateDeposit(id, payload);
});
registerMutationFn("deposits.delete", (v) => deleteDeposit(v as number));

// ── Shared cache keys ────────────────────────────────────────────────

const DEPOSIT_DEPENDENT_KEYS = [
  "deposits",
  "deposits-total",
  "portfolio-overview",
  "cash-balances",
  "holdings",
  "snapshots",
  "snapshots-chart",
  "tracker-data",
] as const;

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Create a cash deposit with optimistic count increment.
 *
 * The paginated deposit list gets its count bumped immediately; on
 * success or error the server state is reconciled via invalidation.
 */
export function useCreateDeposit(onSuccessCallback?: () => void) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: CashDepositCreate) => createDeposit(payload),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["deposits"] });
      const snapshots = qc.getQueriesData<CashDepositListResponse>({ queryKey: ["deposits"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<CashDepositListResponse>(key, {
          ...data,
          count: data.count + 1,
          pagination: {
            ...data.pagination,
            total_items: data.pagination.total_items + 1,
          },
        });
      }
      return { snapshots };
    },
    onError: (err: unknown, variables, ctx) => {
      // Rollback
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          qc.setQueryData(key, data);
        }
      }
      if (isNetworkError(err)) {
        enqueue("deposits.create", variables);
      }
    },
    onSettled: () => {
      for (const key of DEPOSIT_DEPENDENT_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onSuccessCallback?.();
    },
  });
}

/**
 * Update a cash deposit with optimistic field patch.
 */
export function useUpdateDeposit(onSuccessCallback?: () => void) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CashDepositCreate> }) =>
      updateDeposit(id, payload),
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: ["deposits"] });
      const snapshots = qc.getQueriesData<CashDepositListResponse>({ queryKey: ["deposits"] });
      for (const [key, data] of snapshots) {
        if (!data?.deposits) continue;
        qc.setQueryData<CashDepositListResponse>(key, {
          ...data,
          deposits: data.deposits.map((d) =>
            d.id === id ? { ...d, ...payload } : d,
          ),
        });
      }
      return { snapshots };
    },
    onError: (err: unknown, variables, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          qc.setQueryData(key, data);
        }
      }
      if (isNetworkError(err)) {
        enqueue("deposits.update", variables);
      }
    },
    onSettled: () => {
      for (const key of DEPOSIT_DEPENDENT_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onSuccessCallback?.();
    },
  });
}

/**
 * Delete a cash deposit with optimistic list removal.
 *
 * The item is removed from the list cache immediately and restored
 * on failure. On success the full dependency tree is invalidated.
 */
export function useDeleteDeposit(onSuccessCallback?: () => void) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteDeposit(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["deposits"] });
      const snapshots = qc.getQueriesData<CashDepositListResponse>({ queryKey: ["deposits"] });
      for (const [key, data] of snapshots) {
        if (!data?.deposits) continue;
        const removed = data.deposits.find((d) => d.id === id);
        qc.setQueryData<CashDepositListResponse>(key, {
          ...data,
          deposits: data.deposits.filter((d) => d.id !== id),
          count: Math.max(0, data.count - 1),
          total_kwd: removed
            ? Math.max(0, data.total_kwd - removed.amount)
            : data.total_kwd,
          pagination: {
            ...data.pagination,
            total_items: Math.max(0, data.pagination.total_items - 1),
          },
        });
      }
      return { snapshots };
    },
    onError: (err: unknown, id, ctx) => {
      // Rollback optimistic removal
      if (ctx?.snapshots) {
        for (const [key, data] of ctx.snapshots) {
          qc.setQueryData(key, data);
        }
      }
      if (isNetworkError(err)) {
        enqueue("deposits.delete", id);
      }
    },
    onSettled: () => {
      for (const key of DEPOSIT_DEPENDENT_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      onSuccessCallback?.();
    },
  });
}
