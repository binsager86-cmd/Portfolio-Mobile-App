/**
 * Portfolio domain query hooks — overview, holdings, cash balances,
 * accounts, and deposit totals.
 */

import {
    getAccounts,
    getCashBalances,
    getDeposits,
    getHoldings,
    getOverview,
    getPerformance,
    getRealizedProfit,
    getRiskMetrics,
    getSnapshots,
    type HoldingsResponse,
    type OverviewData,
    type PerformanceData,
    type PortfolioCashBalance,
    type RealizedProfitData,
    type RiskMetrics,
} from "@/services/api";
import { useQueries, useQuery } from "@tanstack/react-query";

// ── Query key constants ─────────────────────────────────────────────

export const portfolioKeys = {
  overview: (userId?: number) => ["portfolio-overview", userId] as const,
  holdings: (portfolio?: string) => ["holdings", portfolio] as const,
  cashBalances: () => ["cash-balances"] as const,
  accounts: () => ["accounts"] as const,
  depositTotal: (portfolio: string) => ["deposits-total", portfolio] as const,
  performance: (portfolio?: string, period?: string) => ["performance", portfolio, period] as const,
  snapshotsChart: () => ["snapshots-chart"] as const,
  realizedProfit: () => ["realized-profit"] as const,
  riskMetrics: (rfRate?: number | null) => ["risk-metrics", rfRate] as const,
} as const;

const DASHBOARD_STALE_TIME_MS = 45_000;
const DASHBOARD_GC_TIME_MS = 5 * 60_000;

// ── Hooks ───────────────────────────────────────────────────────────

/** Portfolio overview — cached 30 s, refetches on mount & focus. */
export function usePortfolioOverview(userId?: number) {
  return useQuery<OverviewData>({
    queryKey: portfolioKeys.overview(userId),
    queryFn: getOverview,
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    refetchOnMount: true,
    // Dashboard data must be fresh when the user switches back to the app.
    refetchOnWindowFocus: true,
    // Longer back-off cap (30 s) than the 10 s global default — the
    // overview endpoint is expensive so we give the server more breathing
    // room before each retry.
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    // Keep showing the last successful payload while the background
    // refetch runs so navigating back to the dashboard never flashes a
    // blank skeleton.
    placeholderData: (prev) => prev,
  });
}

/** Holdings with optional portfolio filter — cached 30 s. */
export function useHoldings(portfolio?: string) {
  return useQuery<HoldingsResponse>({
    queryKey: portfolioKeys.holdings(portfolio),
    queryFn: () => getHoldings(portfolio),
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    placeholderData: (prev) => prev,
  });
}

/** Computed cash balances for all portfolios. */
export function useCashBalances() {
  return useQuery<Record<string, PortfolioCashBalance>>({
    queryKey: portfolioKeys.cashBalances(),
    queryFn: () => getCashBalances(),
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    placeholderData: (prev) => prev,
  });
}

/** Account/cash balance summaries. */
export function useAccounts() {
  return useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => getAccounts(),
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    placeholderData: (prev) => prev,
  });
}

/** Deposit totals for all three portfolios (KFH, BBYN, USA). */
export function useDepositTotals() {
  const kfh = useQuery({
    queryKey: portfolioKeys.depositTotal("KFH"),
    queryFn: () => getDeposits({ portfolio: "KFH", page_size: 9999 }),
  });
  const bbyn = useQuery({
    queryKey: portfolioKeys.depositTotal("BBYN"),
    queryFn: () => getDeposits({ portfolio: "BBYN", page_size: 9999 }),
  });
  const usa = useQuery({
    queryKey: portfolioKeys.depositTotal("USA"),
    queryFn: () => getDeposits({ portfolio: "USA", page_size: 9999 }),
  });
  return { kfh, bbyn, usa };
}

/** Performance, snapshots-chart, and realized-profit — fire in parallel once overview loads. */
export function useOverviewDependentQueries(overviewLoaded: boolean) {
  return useQueries({
    queries: [
      {
        queryKey: portfolioKeys.performance(undefined, "all"),
        queryFn: () => getPerformance({ period: "all" }),
        enabled: overviewLoaded,
        staleTime: DASHBOARD_STALE_TIME_MS,
        gcTime: DASHBOARD_GC_TIME_MS,
        // Keep the previous payload visible during background refetch
        // (e.g. window focus) so metric cards never flash "—" momentarily.
        placeholderData: (prev: PerformanceData | undefined) => prev,
      },
      {
        queryKey: portfolioKeys.snapshotsChart(),
        queryFn: () => getSnapshots(),
        enabled: overviewLoaded,
        staleTime: DASHBOARD_STALE_TIME_MS,
        gcTime: DASHBOARD_GC_TIME_MS,
        placeholderData: (prev: unknown) => prev,
      },
      {
        queryKey: portfolioKeys.realizedProfit(),
        queryFn: () => getRealizedProfit(),
        enabled: overviewLoaded,
        staleTime: DASHBOARD_STALE_TIME_MS,
        gcTime: DASHBOARD_GC_TIME_MS,
        placeholderData: (prev: RealizedProfitData | undefined) => prev,
      },
    ],
  });
}

/** Performance data with optional portfolio + period. */
export function usePerformance(portfolio?: string, period?: string) {
  return useQuery<PerformanceData>({
    queryKey: portfolioKeys.performance(portfolio, period),
    queryFn: () => getPerformance({ portfolio, period }),
    placeholderData: (prev) => prev,
  });
}

/** Risk metrics — optionally supply rf_rate (percentage, e.g. 4.25). */
export function useRiskMetrics(rfRate?: number | null, enabled = true) {
  return useQuery<RiskMetrics>({
    queryKey: portfolioKeys.riskMetrics(rfRate ?? null),
    queryFn: () => getRiskMetrics({ rf_rate: (rfRate ?? 0) / 100 }),
    enabled,
  });
}

/** Realized profit breakdown. */
export function useRealizedProfit() {
  return useQuery<RealizedProfitData>({
    queryKey: portfolioKeys.realizedProfit(),
    queryFn: () => getRealizedProfit(),
    staleTime: DASHBOARD_STALE_TIME_MS,
    gcTime: DASHBOARD_GC_TIME_MS,
    placeholderData: (prev) => prev,
  });
}
