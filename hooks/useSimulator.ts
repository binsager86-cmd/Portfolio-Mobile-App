/**
 * Eagle Eye Simulator — React Query hooks.
 *
 * Covers all simulator endpoints:
 *   GET  /eagle-eye/simulator/portfolios
 *   GET  /eagle-eye/simulator/compare
 *   GET  /eagle-eye/simulator/portfolios/:strategy
 *   GET  /eagle-eye/simulator/portfolios/:strategy/trades
 *   GET  /eagle-eye/simulator/portfolios/:strategy/performance
 *   GET  /eagle-eye/simulator/activity
 *   POST /eagle-eye/simulator/positions/:id/close
 *   POST /eagle-eye/simulator/run
 */

import api from "@/services/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export type StrategyName = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";

export interface EquityPoint {
  date: string;
  value: number;
  return_pct: number;
}

export interface SimPortfolioSummary {
  id: number;
  strategy_name: StrategyName;
  starting_capital_kwd: number;
  cash_balance_kwd: number;
  total_value_kwd: number;
  cumulative_return_pct: number;
  open_positions_count: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  profit_factor: number;
  max_drawdown_pct: number;
  equity_curve: EquityPoint[];
}

export interface SimPosition {
  id: number;
  portfolio_id: number;
  ticker: string;
  status: "OPEN" | "CLOSED" | "OVERRIDDEN";
  entry_date: string | null;
  entry_price: number | null;
  shares: number | null;
  shares_remaining: number | null;
  size_kwd: number | null;
  size_pct_of_portfolio: number | null;
  entry_confidence: number | null;
  entry_stage: string | null;
  entry_rating: string | null;
  entry_thesis: string | null;
  entry_signal_breakdown: Record<string, unknown> | null;
  entry_accumulation_score: number | null;
  entry_indicators_snapshot: Record<string, unknown> | null;
  planned_stop_loss: number | null;
  planned_tp1: number | null;
  planned_tp2: number | null;
  planned_tp3: number | null;
  tp1_hit: number;
  tp2_hit: number;
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pnl_kwd: number | null;
  pnl_pct: number | null;
  days_held: number | null;
  max_unrealized_gain_pct: number | null;
  max_unrealized_loss_pct: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DailySnapshot {
  date: string;
  cash_balance_kwd: number | null;
  open_positions_value_kwd: number | null;
  total_value_kwd: number | null;
  daily_pnl_kwd: number | null;
  cumulative_return_pct: number | null;
  drawdown_from_peak_pct: number | null;
  open_position_count: number | null;
}

export interface BreakdownRow {
  entry_stage?: string;
  stage?: string;
  trades: number;
  wins: number;
  win_rate: number;
  avg_pnl_pct?: number;
  avg_pnl?: number;
}

export interface ExitReasonRow {
  exit_reason: string;
  count: number;
  avg_pnl: number;
}

export interface SimPortfolioDetail {
  summary: SimPortfolioSummary;
  equity_curve: DailySnapshot[];
  open_positions: SimPosition[];
  recent_closed_trades: SimPosition[];
  considered_not_taken_count: number;
  breakdown_by_stage: BreakdownRow[];
  breakdown_by_exit_reason: ExitReasonRow[];
}

export interface ConfidenceBand {
  band: string;
  trades: number;
  wins: number;
  win_rate: number;
  avg_pnl_pct: number;
}

export interface SimPerformance {
  strategy_name: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  avg_trade_duration_days: number;
  sharpe_like_ratio: number;
  by_confidence_band: ConfidenceBand[];
  by_stage: BreakdownRow[];
  by_exit_reason: ExitReasonRow[];
}

export interface TradesPage {
  total: number;
  page: number;
  page_size: number;
  trades: SimPosition[];
}

export interface ActivityItem {
  action: "ENTRY" | "EXIT";
  strategy_name: string;
  ticker: string;
  event_date?: string;
  exit_date?: string;
  entry_date?: string;
  exit_reason?: string;
  pnl_kwd?: number;
  pnl_pct?: number;
  entry_stage?: string;
  size_kwd?: number;
  entry_confidence?: number;
}

export interface CompareResponse {
  strategies: Record<StrategyName, SimPortfolioSummary>;
}

// ── Query key factory ────────────────────────────────────────────────────────

export const simKeys = {
  all: ["eagle-eye", "simulator"] as const,
  portfolios: () => [...simKeys.all, "portfolios"] as const,
  compare: () => [...simKeys.all, "compare"] as const,
  portfolio: (strategy: string) => [...simKeys.all, "portfolio", strategy] as const,
  trades: (strategy: string, page?: number, status?: string) =>
    [...simKeys.all, "trades", strategy, page ?? 1, status ?? "all"] as const,
  performance: (strategy: string) => [...simKeys.all, "performance", strategy] as const,
  activity: () => [...simKeys.all, "activity"] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useSimulatorPortfolios() {
  return useQuery({
    queryKey: simKeys.portfolios(),
    queryFn: async () => {
      const res = await api.get<{ portfolios: SimPortfolioSummary[] }>(
        "/eagle-eye/simulator/portfolios"
      );
      return res.data.portfolios;
    },
    staleTime: 60_000,
  });
}

export function useSimulatorCompare() {
  return useQuery({
    queryKey: simKeys.compare(),
    queryFn: async () => {
      const res = await api.get<CompareResponse>("/eagle-eye/simulator/compare");
      return res.data.strategies;
    },
    staleTime: 60_000,
  });
}

export function useSimulatorPortfolioDetail(strategy: string) {
  return useQuery({
    queryKey: simKeys.portfolio(strategy),
    queryFn: async () => {
      const res = await api.get<{ status: string } & SimPortfolioDetail>(
        `/eagle-eye/simulator/portfolios/${strategy}`
      );
      return res.data;
    },
    staleTime: 60_000,
    enabled: !!strategy,
  });
}

export function useSimulatorTrades(
  strategy: string,
  page = 1,
  status?: string,
  ticker?: string
) {
  return useQuery({
    queryKey: simKeys.trades(strategy, page, status),
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (status) params.status = status;
      if (ticker) params.ticker = ticker;
      const res = await api.get<{ status: string } & TradesPage>(
        `/eagle-eye/simulator/portfolios/${strategy}/trades`,
        { params }
      );
      return res.data;
    },
    staleTime: 60_000,
    enabled: !!strategy,
  });
}

export function useSimulatorPerformance(strategy: string) {
  return useQuery({
    queryKey: simKeys.performance(strategy),
    queryFn: async () => {
      const res = await api.get<{ status: string } & SimPerformance>(
        `/eagle-eye/simulator/portfolios/${strategy}/performance`
      );
      return res.data;
    },
    staleTime: 300_000,
    enabled: !!strategy,
  });
}

export function useSimulatorActivity(limit = 20) {
  return useQuery({
    queryKey: simKeys.activity(),
    queryFn: async () => {
      const res = await api.get<{ feed: ActivityItem[] }>(
        "/eagle-eye/simulator/activity",
        { params: { limit } }
      );
      return res.data.feed;
    },
    staleTime: 60_000,
  });
}

export function useCloseSimulatorPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      positionId,
      currentPrice,
    }: {
      positionId: number;
      currentPrice: number;
    }) => {
      const res = await api.post(
        `/eagle-eye/simulator/positions/${positionId}/close`,
        { current_price: currentPrice }
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: simKeys.all });
    },
  });
}

export function useRunSimulatorNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post("/eagle-eye/simulator/run");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: simKeys.all });
    },
  });
}
