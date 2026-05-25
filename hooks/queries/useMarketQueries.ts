/**
 * React Query hooks for Market Data.
 */

import { marketApi, type MarketData } from "@/services/market/marketApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const MARKET_KEYS = {
  all: ["market"] as const,
  summary: () => [...MARKET_KEYS.all, "summary"] as const,
};

export function useMarketSummary(enabled = true) {
  return useQuery<MarketData>({
    queryKey: MARKET_KEYS.summary(),
    queryFn: () => marketApi.getSummary(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    // Keep last successful payload visible while refetching so the
    // Market screen never flashes a skeleton when the user navigates
    // back to it within gcTime.
    placeholderData: (prev) => prev,
  });
}

export function useMarketRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => marketApi.refresh(),
    onSuccess: (data) => {
      queryClient.setQueryData(MARKET_KEYS.summary(), data);
    },
  });
}
