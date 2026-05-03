/**
 * Shared transaction mutation hooks with consistent
 * cache invalidation and cash-impact feedback.
 *
 * Every transaction CRUD (create / update / delete / restore) returns
 * cash_balance + total_value from the backend. These hooks:
 *   1. Apply optimistic cache updates (onMutate) with rollback on failure
 *   2. Invalidate all dependent query caches in parallel on success
 *   3. Surface a non-blocking toast with the updated cash balance
 *   4. Trigger haptic feedback on native for tactile confirmation
 *   5. Enqueue to the offline mutation queue on network failures
 */

import { useToast } from "@/components/ui/ToastProvider";
import { formatCurrency } from "@/lib/currency";
import { showErrorAlert } from "@/lib/errorHandling";
import { enqueue, isNetworkError, registerMutationFn } from "@/lib/mutationQueue";
import {
    createTransaction,
    deleteTransaction,
    restoreTransaction,
    TransactionCreate,
  TransactionListResponse,
    TransactionMutationResponse,
    updateTransaction,
} from "@/services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

// ── Register API functions for offline queue replay ────────────────
registerMutationFn("transactions.create", (v) => createTransaction(v as TransactionCreate));
registerMutationFn("transactions.update", (v) => {
  const { txnId, payload } = v as { txnId: number; payload: Partial<TransactionCreate> };
  return updateTransaction(txnId, payload);
});
registerMutationFn("transactions.delete", (v) => deleteTransaction(v as number));
registerMutationFn("transactions.restore", (v) => restoreTransaction(v as number));

// ── Query keys invalidated after any transaction mutation ──────────

export const TXN_DEPENDENT_QUERY_KEYS = [
  "portfolio-overview",
  "cash-balances",
  "transactions",
  "holdings",
  "performance",
  "risk-metrics",
  "realized-profit",
  "trading-summary",
  "deposits",
  "deposits-total",
  "snapshots",
  "snapshots-chart",
  "tracker-data",
] as const;

/** Invalidate all caches that depend on transaction data.
 * Uses invalidateQueries (not refetchQueries) so that INACTIVE queries
 * on other tabs are also marked stale and will refetch on next mount.
 */
async function invalidateTransactionCaches(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all(
    TXN_DEPENDENT_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    )
  );
}

// ── User feedback helper ────────────────────────────────────────────

function buildCashMessage(
  message: string,
  cashBalance: number | null | undefined,
): string {
  const cashLine =
    cashBalance != null
      ? ` · Cash: ${formatCurrency(cashBalance, "KWD")}`
      : "";
  return `${message}${cashLine}`;
}

/** Fire haptic feedback on native (no-op on web). */
async function hapticSuccess(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Haptics = await import("expo-haptics");
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    );
  } catch {
    // Haptics unavailable — swallow silently
  }
}

// ── Hooks ───────────────────────────────────────────────────────────

/**
 * Create transaction mutation.
 *
 * @param onSuccessCallback – optional extra callback (e.g. navigate back)
 */
export function useCreateTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<
    TransactionMutationResponse,
    Error,
    TransactionCreate,
    { previousCaches: Array<[readonly unknown[], TransactionListResponse | undefined]> }
  >({
    mutationFn: createTransaction,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });
      const previousCaches = queryClient.getQueriesData<TransactionListResponse>({
        queryKey: ["transactions"],
      });
      // Optimistically increment the visible count on every cached page so
      // pagination totals stay consistent before the server responds.
      for (const [key, data] of previousCaches) {
        if (data) {
          queryClient.setQueryData(key, { ...data, count: (data.count ?? 0) + 1 });
        }
      }
      return { previousCaches };
    },
    onSuccess: async (result) => {
      onSuccessCallback?.();
      toast.success(
        buildCashMessage("Transaction added successfully!", result.cash_balance),
      );
      hapticSuccess();
      // Invalidate after navigation so frozen-tab refetches don't block the callback
      invalidateTransactionCaches(queryClient);
    },
    onError: (err, variables, context) => {
      // Rollback optimistic count increment
      if (context?.previousCaches) {
        for (const [key, data] of context.previousCaches) {
          queryClient.setQueryData(key, data);
        }
      }
      // Queue for offline replay if this was a connectivity failure
      if (isNetworkError(err)) {
        enqueue("transactions.create", variables);
      } else {
        showErrorAlert("Error", err);
      }
    },
  });
}

/**
 * Update transaction mutation.
 */
export function useUpdateTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<
    TransactionMutationResponse,
    Error,
    { txnId: number; payload: Partial<TransactionCreate> },
    { previousCaches: Array<[readonly unknown[], TransactionListResponse | undefined]> }
  >({
    mutationFn: ({ txnId, payload }) => updateTransaction(txnId, payload),
    onMutate: async ({ txnId, payload }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions"] });
      const previousCaches = queryClient.getQueriesData<TransactionListResponse>({
        queryKey: ["transactions"],
      });
      // Optimistically patch the matching transaction in every cached page.
      // TransactionCreate and TransactionRecord share field names so a
      // shallow merge is safe.
      for (const [key, data] of previousCaches) {
        if (data?.transactions) {
          queryClient.setQueryData<TransactionListResponse>(key, {
            ...data,
            transactions: data.transactions.map((t) =>
              t.id === txnId ? { ...t, ...payload } : t,
            ),
          });
        }
      }
      return { previousCaches };
    },
    onSuccess: async (result) => {
      onSuccessCallback?.();
      toast.success(
        buildCashMessage("Transaction updated.", result.cash_balance),
      );
      hapticSuccess();
      // Invalidate after navigation so frozen-tab refetches don't block the callback
      invalidateTransactionCaches(queryClient);
    },
    onError: (err, variables, context) => {
      // Rollback optimistic patch
      if (context?.previousCaches) {
        for (const [key, data] of context.previousCaches) {
          queryClient.setQueryData(key, data);
        }
      }
      if (isNetworkError(err)) {
        enqueue("transactions.update", variables);
      } else {
        showErrorAlert("Error", err);
      }
    },
  });
}

/**
 * Delete (soft-delete) transaction mutation.
 */
export function useDeleteTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<
    TransactionMutationResponse,
    Error,
    number,
    { previousCaches: Array<[readonly unknown[], TransactionListResponse | undefined]> }
  >({
    mutationFn: deleteTransaction,
    onMutate: async (txnId) => {
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      // Snapshot all transaction list caches (paginated, so multiple entries)
      const previousCaches = queryClient.getQueriesData<TransactionListResponse>({
        queryKey: ["transactions"],
      });

      // Optimistically remove the transaction from every cached page
      for (const [key, data] of previousCaches) {
        if (data?.transactions) {
          queryClient.setQueryData(key, {
            ...data,
            transactions: data.transactions.filter((t) => t.id !== txnId),
            count: Math.max(0, (data.count ?? 0) - 1),
            pagination: data.pagination
              ? { ...data.pagination, total_items: Math.max(0, data.pagination.total_items - 1) }
              : data.pagination,
          });
        }
      }
      return { previousCaches };
    },
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);
      onSuccessCallback?.();
      toast.info(
        buildCashMessage("Transaction deleted.", result.cash_balance),
      );
      hapticSuccess();
    },
    onError: (err, txnId, context) => {
      // Revert optimistic removal on failure
      if (context?.previousCaches) {
        for (const [key, data] of context.previousCaches) {
          queryClient.setQueryData(key, data);
        }
      }
      if (isNetworkError(err)) {
        enqueue("transactions.delete", txnId);
      } else {
        toast.error("Failed to delete, reverted changes");
        showErrorAlert("Error", err);
      }
    },
  });
}

/**
 * Restore a soft-deleted transaction.
 */
export function useRestoreTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<TransactionMutationResponse, Error, number>({
    mutationFn: restoreTransaction,
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);
      onSuccessCallback?.();
      toast.success(
        buildCashMessage("Transaction restored.", result.cash_balance),
      );
      hapticSuccess();
    },
    onError: (err) => showErrorAlert("Error", err),
  });
}
