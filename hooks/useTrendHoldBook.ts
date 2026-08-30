/**
 * Trend-Hold Book React Query hooks.
 *
 * Wraps the 3 read-only backend endpoints for the Trend-Hold Book — a
 * virtual-money paper-trading ledger that mechanically fills the
 * trend_hold_engine's BUY/SCALE_OUT/SELL_SIGNAL decisions. Independent of
 * the real portfolio (useHoldings/useTrading) and of the unrelated
 * eagle-eye/simulator screens (a different, already-existing 3-symbol
 * backtest system).
 *
 * All requests go through the shared Axios client (JWT auth attached
 * automatically by the request interceptor in services/api/client.ts).
 */

import api from "@/services/api/client";
import { useQuery } from "@tanstack/react-query";

// ── Type definitions ─────────────────────────────────────────────────────────

export interface TrendHoldBookPortfolio {
  cash_kwd: number;
  starting_capital_kwd: number;
  equity_kwd: number;
  total_return_pct: number;
  open_position_count: number;
  as_of?: string | null;
}

export interface TrendHoldBookPosition {
  ticker: string;
  quantity: number;
  avg_cost: number;
  latest_close?: number | null;
  market_value_kwd?: number | null;
  unrealized_pnl_kwd?: number | null;
  opened_date?: string | null;
}

export interface TrendHoldBookPositionsResponse {
  positions: TrendHoldBookPosition[];
}

export interface TrendHoldBookTrade {
  id: number;
  ticker: string;
  side: "BUY" | "SCALE_OUT" | "EXIT";
  trade_date: string;
  quantity: number;
  price: number;
  gross_kwd: number;
  commission_kwd: number;
  realized_pnl_kwd?: number | null;
  reason?: string | null;
}

export interface TrendHoldBookTradesResponse {
  trades: TrendHoldBookTrade[];
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const trendHoldBookKeys = {
  all: ["trend-hold-book"] as const,
  portfolio: () => [...trendHoldBookKeys.all, "portfolio"] as const,
  positions: () => [...trendHoldBookKeys.all, "positions"] as const,
  trades: () => [...trendHoldBookKeys.all, "trades"] as const,
} as const;

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useTrendHoldBookPortfolio
 * GET /api/v1/trend-hold-book/portfolio
 *
 * staleTime: 10 minutes — data changes only on the 14:18 Asia/Kuwait
 * scheduler step, matching the scanner/trend-hold data cadence.
 */
export function useTrendHoldBookPortfolio(enabled = true) {
  return useQuery<TrendHoldBookPortfolio>({
    queryKey: trendHoldBookKeys.portfolio(),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPortfolio>("/api/v1/trend-hold-book/portfolio");
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldBookPositions
 * GET /api/v1/trend-hold-book/positions
 */
export function useTrendHoldBookPositions(enabled = true) {
  return useQuery<TrendHoldBookPositionsResponse>({
    queryKey: trendHoldBookKeys.positions(),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPositionsResponse>("/api/v1/trend-hold-book/positions");
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldBookTrades
 * GET /api/v1/trend-hold-book/trades
 */
export function useTrendHoldBookTrades(limit = 300, enabled = true) {
  return useQuery<TrendHoldBookTradesResponse>({
    queryKey: [...trendHoldBookKeys.trades(), limit],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookTradesResponse>(
        `/api/v1/trend-hold-book/trades?limit=${limit}`
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}
