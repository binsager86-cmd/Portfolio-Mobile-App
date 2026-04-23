/**
 * Trading summary query hooks.
 */

import { useQuery } from "@tanstack/react-query";
import { getTradingSummary, type TradingSummaryResponse } from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const tradingKeys = {
  summary: (...filters: unknown[]) => ["trading-summary", ...filters] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Trading summary with filters and pagination. */
export function useTradingSummary(params: {
  portfolios?: string[];
  txnTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery<TradingSummaryResponse>({
    queryKey: tradingKeys.summary(
      params.portfolios,
      params.txnTypes,
      params.dateFrom,
      params.dateTo,
      params.search,
      params.page,
    ),
    queryFn: () => {
      // Only send a date if it looks like a complete YYYY-MM-DD
      const isCompleteDate = (d?: string) =>
        !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      return getTradingSummary({
        portfolio:
          params.portfolios?.length === 1 ? params.portfolios[0] : undefined,
        txn_type:
          params.txnTypes?.length === 1 ? params.txnTypes[0] : undefined,
        date_from: isCompleteDate(params.dateFrom) ? params.dateFrom : undefined,
        date_to: isCompleteDate(params.dateTo) ? params.dateTo : undefined,
        search: params.search?.trim() || undefined,
        page: params.page,
        page_size: params.pageSize ?? 100,
      });
    },
    placeholderData: (prev) => prev,
  });
}
