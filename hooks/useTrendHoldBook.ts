/**
 * Paper Book React Query hooks.
 *
 * Wraps the read-only backend endpoints for BOTH virtual-money paper-
 * trading books:
 *   - "trend_hold" : mechanically fills trend_hold_engine's BUY/SCALE_OUT/
 *     SELL_SIGNAL decisions (/api/v1/trend-hold-book/*)
 *   - "v1_rating"  : mechanically fills the V1 rating engine's BUY/SELL
 *     decisions (/api/v1/v1-rating-book/*)
 * Run side by side, own starting capital, own cash, own positions, own
 * trades -- so the two strategies' real performance can be compared
 * directly (see useBookComparison). Independent of the real portfolio
 * (useHoldings/useTrading) and of the unrelated eagle-eye/simulator
 * screens (a different, already-existing 3-symbol backtest system).
 *
 * Every hook below defaults to `book: "trend_hold"` so existing call
 * sites keep working unchanged; pass `"v1_rating"` for the second book.
 *
 * All requests go through the shared Axios client (JWT auth attached
 * automatically by the request interceptor in services/api/client.ts).
 */

import api from "@/services/api/client";
import { useQuery } from "@tanstack/react-query";

export type PaperBookId = "trend_hold" | "v1_rating";

function bookPrefix(book: PaperBookId): string {
  return book === "trend_hold" ? "/api/v1/trend-hold-book" : "/api/v1/v1-rating-book";
}

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
  // 0-100 signal-strength score at the moment this decision fired.
  // BUY/EXIT only -- null for SCALE_OUT (a fixed profit-milestone rule,
  // not a judged signal).
  confidence?: number | null;
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
  confidence?: number | null;
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

export interface BookComparisonResponse {
  trend_hold: TrendHoldBookPerformance;
  v1_rating: TrendHoldBookPerformance;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const trendHoldBookKeys = {
  all: ["trend-hold-book"] as const,
  portfolio: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "portfolio"] as const,
  positions: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "positions"] as const,
  trades: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "trades"] as const,
  navHistory: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "nav-history"] as const,
  decisionLog: () => [...trendHoldBookKeys.all, "decision-log"] as const,
  lessons: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "lessons"] as const,
  lessonsSummary: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "lessons-summary"] as const,
  performance: (book: PaperBookId) => [...trendHoldBookKeys.all, book, "performance"] as const,
  comparison: () => [...trendHoldBookKeys.all, "comparison"] as const,
} as const;

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useTrendHoldBookPortfolio
 * GET /api/v1/{book}/portfolio
 *
 * staleTime: 10 minutes — data changes only on each book's daily
 * scheduler step.
 */
export function useTrendHoldBookPortfolio(book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookPortfolio>({
    queryKey: trendHoldBookKeys.portfolio(book),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPortfolio>(`${bookPrefix(book)}/portfolio`);
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
 * GET /api/v1/{book}/positions
 */
export function useTrendHoldBookPositions(book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookPositionsResponse>({
    queryKey: trendHoldBookKeys.positions(book),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPositionsResponse>(`${bookPrefix(book)}/positions`);
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
 * GET /api/v1/{book}/trades
 */
export function useTrendHoldBookTrades(limit = 300, book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookTradesResponse>({
    queryKey: [...trendHoldBookKeys.trades(book), limit],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookTradesResponse>(
        `${bookPrefix(book)}/trades?limit=${limit}`
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
 * GET /api/v1/{book}/nav-history
 *
 * Daily equity snapshots -- feeds the equity curve chart.
 */
export function useTrendHoldBookNavHistory(days = 180, book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookNavHistoryResponse>({
    queryKey: [...trendHoldBookKeys.navHistory(book), days],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookNavHistoryResponse>(
        `${bookPrefix(book)}/nav-history?days=${days}`
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
 * the ones the book acted on. Trend-Hold-only -- no V1 equivalent exists
 * yet, so this hook has no `book` parameter.
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
 * GET /api/v1/{book}/lessons
 *
 * Post-trade "autopsy" for each closed leg -- an auditable, rule-based
 * classification (not a black box) explaining why a trade won or lost,
 * using the realized price path, plus a suggested enhancement. See
 * app/services/eagle_eye_v2/trend_hold_lessons.py (signal-source-agnostic,
 * shared by both books).
 */
export function useTrendHoldBookLessons(limit = 200, book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookLessonsResponse>({
    queryKey: [...trendHoldBookKeys.lessons(book), limit],
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookLessonsResponse>(
        `${bookPrefix(book)}/lessons?limit=${limit}`
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
 * GET /api/v1/{book}/lessons/summary
 */
export function useTrendHoldBookLessonsSummary(book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookLessonsSummary>({
    queryKey: trendHoldBookKeys.lessonsSummary(book),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookLessonsSummary>(`${bookPrefix(book)}/lessons/summary`);
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
 * GET /api/v1/{book}/performance
 *
 * Standard trading scorecard (win rate, max profit/loss, profit factor,
 * expectancy) computed directly from realized P&L -- populated as soon
 * as any trade closes, independent of the lessons classifier.
 */
export function useTrendHoldBookPerformance(book: PaperBookId = "trend_hold", enabled = true) {
  return useQuery<TrendHoldBookPerformance>({
    queryKey: trendHoldBookKeys.performance(book),
    queryFn: async () => {
      const { data } = await api.get<TrendHoldBookPerformance>(`${bookPrefix(book)}/performance`);
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

/**
 * useBookComparison
 * GET /api/v1/v1-rating-book/compare
 *
 * Both books' performance scorecards side by side -- the direct
 * "which one is best" answer.
 */
export function useBookComparison(enabled = true) {
  return useQuery<BookComparisonResponse>({
    queryKey: trendHoldBookKeys.comparison(),
    queryFn: async () => {
      const { data } = await api.get<BookComparisonResponse>("/api/v1/v1-rating-book/compare");
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}
