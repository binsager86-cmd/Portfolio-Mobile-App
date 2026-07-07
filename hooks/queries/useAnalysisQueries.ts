/**
 * Fundamental Analysis query hooks — stocks, statements, metrics,
 * growth, scores, and valuations.
 */

import type { ScoreCategoryPreferenceItem } from "@/services/api";
import {
    getAnalysisStocks,
    getGrowthAnalysis,
    getPeerMultiples,
    getScoreCategoryPreferences,
    getScoreHistory,
    getStatements,
    getStockMetrics,
    getStockScore,
    getValuationDefaults,
    getValuations,
    updateScoreCategoryPreferences,
} from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const STOCK_LIST_STALE_TIME = 30 * 1000;
const TAB_DATA_STALE_TIME = 2 * 60 * 1000;

function hasValidStockId(stockId: number) {
  return Number.isFinite(stockId) && stockId > 0;
}

// ── Query key constants ─────────────────────────────────────────────

export const analysisKeys = {
  stocks: (search?: string) => ["analysis-stocks", search] as const,
  statements: (stockId: number, type?: string) =>
    ["analysis-statements", stockId, type] as const,
  metrics: (stockId: number) => ["analysis-metrics", stockId] as const,
  growth: (stockId: number) => ["analysis-growth", stockId] as const,
  score: (stockId: number) => ["analysis-score", stockId] as const,
  scoreHistory: (stockId: number) =>
    ["analysis-score-history", stockId] as const,
  scoreCategoryPreferences: (stockId: number) =>
    ["analysis-score-category-preferences", stockId] as const,
  valuations: (stockId: number) =>
    ["analysis-valuations", stockId] as const,
  valuationDefaults: (stockId: number) =>
    ["analysis-valuation-defaults", stockId] as const,
  peerMultiples: (stockId: number) =>
    ["analysis-peer-multiples", stockId] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Analysis stock list with optional search. */
export function useAnalysisStocks(search?: string) {
  return useQuery({
    queryKey: analysisKeys.stocks(search),
    queryFn: () => getAnalysisStocks({ search: search || undefined }),
    staleTime: STOCK_LIST_STALE_TIME,
  });
}

/** Financial statements for a stock, optionally filtered by type. */
export function useStatements(stockId: number, statementType?: string) {
  return useQuery({
    queryKey: analysisKeys.statements(stockId, statementType),
    queryFn: () => getStatements(stockId, statementType),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Metrics for a stock. */
export function useStockMetrics(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.metrics(stockId),
    queryFn: () => getStockMetrics(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Growth analysis for a stock. */
export function useGrowthAnalysis(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.growth(stockId),
    queryFn: () => getGrowthAnalysis(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Composite score for a stock. */
export function useStockScore(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.score(stockId),
    queryFn: () => getStockScore(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** Score history for a stock. */
export function useScoreHistory(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.scoreHistory(stockId),
    queryFn: () => getScoreHistory(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Saved valuations for a stock. */
export function useValuations(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.valuations(stockId),
    queryFn: () => getValuations(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Auto-computed valuation defaults for a stock. */
export function useValuationDefaults(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.valuationDefaults(stockId),
    queryFn: () => getValuationDefaults(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Peer comparable multiples from yfinance. */
export function usePeerMultiples(stockId: number, enabled = false) {
  return useQuery({
    queryKey: analysisKeys.peerMultiples(stockId),
    queryFn: () => getPeerMultiples(stockId),
    staleTime: 10 * 60 * 1000,
    enabled: enabled && hasValidStockId(stockId),
  });
}

/** Score category inclusion preferences with pro-rata weights. */
export function useScoreCategoryPreferences(stockId: number) {
  return useQuery({
    queryKey: analysisKeys.scoreCategoryPreferences(stockId),
    queryFn: () => getScoreCategoryPreferences(stockId),
    enabled: hasValidStockId(stockId),
    staleTime: TAB_DATA_STALE_TIME,
  });
}

/** Mutation to update score category inclusion preferences. */
export function useUpdateScoreCategoryPreferences(stockId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: ScoreCategoryPreferenceItem[]) =>
      updateScoreCategoryPreferences(stockId, preferences),
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: analysisKeys.scoreCategoryPreferences(stockId) });
      await queryClient.cancelQueries({ queryKey: analysisKeys.score(stockId) });

      const previousPrefs = queryClient.getQueryData<{
        preferences: Record<string, boolean>;
        pro_rata_weights: Record<string, number>;
      }>(analysisKeys.scoreCategoryPreferences(stockId));
      const previousScore = queryClient.getQueryData<Record<string, unknown>>(analysisKeys.score(stockId));

      const optimisticPrefs = preferences.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.category_key] = item.included;
        return acc;
      }, {});

      queryClient.setQueryData(analysisKeys.scoreCategoryPreferences(stockId), {
        preferences: optimisticPrefs,
        pro_rata_weights: previousPrefs?.pro_rata_weights ?? {},
      });

      queryClient.setQueryData(analysisKeys.score(stockId), (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          metric_category_preferences: optimisticPrefs,
        };
      });

      return { previousPrefs, previousScore };
    },
    onError: (_err, _preferences, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(analysisKeys.scoreCategoryPreferences(stockId), context.previousPrefs);
      }
      if (context?.previousScore) {
        queryClient.setQueryData(analysisKeys.score(stockId), context.previousScore);
      }
    },
    onSuccess: (data) => {
      // Write through server-confirmed preferences directly to avoid UI bounce
      // caused by immediate invalidation/refetch returning stale backend state.
      queryClient.setQueryData(analysisKeys.scoreCategoryPreferences(stockId), data);
      queryClient.setQueryData(analysisKeys.score(stockId), (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          metric_category_preferences: data.preferences,
          metric_category_weights: data.pro_rata_weights,
        };
      });
    },
  });
}
