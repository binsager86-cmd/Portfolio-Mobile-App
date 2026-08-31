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

export interface TrendHoldBookNavPoint {
  nav_date: string;
  cash_kwd: number;
  equity_kwd: number;
  open_position_count: number;
}

export interface TrendHoldBookNavHistoryResponse {
  points: TrendHoldBookNavPoint[];
}

export interface TrendHoldDecisionLogEntry {
  ticker: string;
  trade_date: string;
  decision: "BUY" | "HOLD" | "SCALE_OUT" | "SELL_SIGNAL" | "WAIT";
  reason?: string | null;
  position_state?: string | null;
  close?: number | null;
  structural_stop?: number | null;
}

export interface TrendHoldDecisionLogResponse {
  entries: TrendHoldDecisionLogEntry[];
}

export interface TrendHoldBookLesson {
  ticker: string;
  trade_date: string;
  side: "SCALE_OUT" | "EXIT";
  classification: string;
  outcome: "WIN" | "LOSS" | "PARTIAL" | "UNKNOWN";
  mae_pct?: number | null;
  mfe_pct?: number | null;
  giveback_pct?: number | null;
  holding_days?: number | null;
  reason: string;
  enhancement: string;
}

export interface TrendHoldBookLessonsResponse {
  lessons: TrendHoldBookLesson[];
}

export interface TrendHoldBookLessonsSummary {
  total_closed: number;
  by_classification: Record<string, number>;
  by_outcome: Record<string, number>;
  avg_loss_mae_pct?: number | null;
  avg_win_giveback_pct?: number | null;
}

export interface TrendHoldBookPerformance {
  total_closed: number;
  win_count: number;
  loss_count: number;
  win_rate_pct?: number | null;
  total_realized_pnl_kwd: number;
  max_profit_kwd?: number | null;
  max_loss_kwd?: number | null;
  avg_win_kwd?: number | null;
  avg_loss_kwd?: number | null;
  profit_factor?: number | null;
  expectancy_kwd?: number | null;
  total_commission_paid_kwd: number;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const trendHoldBookKeys = {
  all: ["trend-hold-book"] as const,
  portfolio: () => [...trendHoldBookKeys.all, "portfolio"] as const,
  positions: () => [...trendHoldBookKeys.all, "positions"] as const,
  trades: () => [...trendHoldBookKeys.all, "trades"] as const,
  navHistory: () => [...trendHoldBookKeys.all, "nav-history"] as const,
  decisionLog: () => [...trendHoldBookKeys.all, "decision-log"] as const,
  lessons: () => [...trendHoldBookKeys.all, "lessons"] as const,
  lessonsSummary: () => [...trendHoldBookKeys.all, "lessons-summary"] as const,
  performance: () => [...trendHoldBookKeys.all, "performance"] as const,
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

/**
 * useTrendHoldBookNavHistory
 * GET /api/v1/trend-hold-book/nav-history
 *
 * Daily equity snapshots -- feeds the equity curve chart.
 */
export function useTrendHoldBookNavHistory(days = 180, enabled = true) {
  return useQuery<TrendHoldBookNavHistoryResponse>({
    queryKey: [...trendHoldBookKeys.navHistory(), days],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookNavHistoryResponse>(
        `/api/v1/trend-hold-book/nav-history?days=${days}`
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldDecisionLog
 * GET /api/v1/trend-hold-book/decision-log
 *
 * The trend-hold engine's full decision history (BUY/HOLD/SCALE_OUT/
 * SELL_SIGNAL, and WAIT when includeWait=true) -- independent of the
 * book's trade ledger, this is every decision the engine made, not just
 * the ones the book acted on. Lets the user learn from/audit the engine
 * over time, not just see today's snapshot.
 */
export function useTrendHoldDecisionLog(limit = 200, includeWait = false, enabled = true) {
  return useQuery<TrendHoldDecisionLogResponse>({
    queryKey: [...trendHoldBookKeys.decisionLog(), limit, includeWait],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldDecisionLogResponse>(
        `/api/v1/trend-hold-book/decision-log?limit=${limit}&include_wait=${includeWait}`
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldBookLessons
 * GET /api/v1/trend-hold-book/lessons
 *
 * Post-trade "autopsy" for each closed leg (SCALE_OUT/EXIT) -- an
 * auditable, rule-based classification (not a black box) explaining why
 * a trade won or lost, using the realized price path, plus a suggested
 * enhancement. See app/services/eagle_eye_v2/trend_hold_lessons.py.
 */
export function useTrendHoldBookLessons(limit = 200, enabled = true) {
  return useQuery<TrendHoldBookLessonsResponse>({
    queryKey: [...trendHoldBookKeys.lessons(), limit],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookLessonsResponse>(
        `/api/v1/trend-hold-book/lessons?limit=${limit}`
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldBookLessonsSummary
 * GET /api/v1/trend-hold-book/lessons/summary
 *
 * Aggregate rollup of the lessons log -- the evidence to look at before
 * deciding whether a trend_hold_engine.py parameter actually needs to
 * change, rather than reacting to any single trade.
 */
export function useTrendHoldBookLessonsSummary(enabled = true) {
  return useQuery<TrendHoldBookLessonsSummary>({
    queryKey: trendHoldBookKeys.lessonsSummary(),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookLessonsSummary>(
        "/api/v1/trend-hold-book/lessons/summary"
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useTrendHoldBookPerformance
 * GET /api/v1/trend-hold-book/performance
 *
 * Standard trading scorecard (win rate, max profit/loss, profit factor,
 * expectancy) computed directly from realized P&L -- populated as soon
 * as any trade closes, independent of the lessons classifier.
 */
export function useTrendHoldBookPerformance(enabled = true) {
  return useQuery<TrendHoldBookPerformance>({
    queryKey: trendHoldBookKeys.performance(),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPerformance>(
        "/api/v1/trend-hold-book/performance"
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}
