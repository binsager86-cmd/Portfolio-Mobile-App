/**
 * Deposit query hooks — paginated list.
 */

import { useQuery } from "@tanstack/react-query";
import { getAllDeposits, getDeposits, type CashDepositListResponse, type CashDepositRecord } from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const depositKeys = {
  list: (page?: number, portfolio?: string) =>
    ["deposits", page, portfolio] as const,
  all: () => ["deposits", "all"] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Paginated deposits with optional portfolio filter. */
export function useDeposits(params: {
  page?: number;
  pageSize?: number;
  portfolio?: string;
}) {
  return useQuery<CashDepositListResponse>({
    queryKey: depositKeys.list(params.page, params.portfolio),
    queryFn: () =>
      getDeposits({
        page: params.page,
        page_size: params.pageSize ?? 25,
        portfolio: params.portfolio,
      }),
    placeholderData: (prev) => prev,
  });
}

/** Full deposits table (all pages) for yearly analytics/charting. */
export function useAllDeposits() {
  return useQuery<CashDepositRecord[]>({
    queryKey: depositKeys.all(),
    queryFn: () => getAllDeposits({ page_size: 200 }),
    staleTime: 5 * 60 * 1000,
  });
}
