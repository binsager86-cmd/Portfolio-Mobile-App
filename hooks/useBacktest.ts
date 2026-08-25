/**
 * Eagle Eye Strategy Backtester — React Query hooks.
 *
 * Covers backtester endpoints:
 *   POST /api/v1/eagle-eye/simulations   — run simulation
 *   GET  /api/v1/eagle-eye/simulations/{run_id}/result
 *   GET  /api/v1/eagle-eye/simulations   — list runs
 */

import api from "@/services/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BacktestRequest {
  start_date: string;
  end_date: string;
  initial_cash?: number;
  max_positions?: number;
  position_sizing_mode?: "equal" | "fixed" | "percentage";
  commission_pct?: number;
  slippage_pct?: number;
  execution_rule?: "next_open";
  allow_pyramiding?: boolean;
  universe?: string[] | null;
}

export interface BacktestSummary {
  run_id: string;
  status: "COMPLETED" | "FAILED" | "RUNNING";
  signal_data_status: string;
  error_message?: string | null;
  ending_equity?: number | null;
  ending_cash?: number | null;
  total_return_pct?: number | null;
  max_drawdown_pct?: number | null;
  trades_count?: number | null;
  win_rate_pct?: number | null;
  profit_factor?: number | null;
  buy_signals_executed?: number | null;
  sell_signals_executed?: number | null;
  cash_reconciliation_ok?: boolean | null;
  equity_reconciliation_ok?: boolean | null;
  validation_warnings?: string[] | null;
  created_at?: string | null;
  execution_seconds?: number | null;
}

export interface DailyLedgerRow {
  date: string;
  cash: string;
  invested_value: string;
  total_equity: string;
  positions_count: number;
}

export interface TradeLedgerRow {
  symbol: string;
  entry_date: string;
  entry_price: string;
  exit_date?: string | null;
  exit_price?: string | null;
  quantity: string;
  realized_pnl_gross: string;
  realized_pnl_pct: string;
  holding_days: number;
}

export interface BacktestResult extends BacktestSummary {
  summary?: {
    ending_equity: string | null;
    total_return_pct: string | null;
    max_drawdown_pct: string | null;
    trades_count: number | null;
    win_rate_pct: string | null;
    profit_factor: string | null;
    cash_reconciliation_ok: boolean | null;
    equity_reconciliation_ok: boolean | null;
  };
  daily_ledger?: DailyLedgerRow[];
  trades?: TradeLedgerRow[];
}

export interface RecentSimulation {
  run_id: string;
  status: string;
  ending_equity: string | null;
  total_return_pct: string | null;
  trades_count: number | null;
  created_at: string;
}

// ── Run a new backtest ────────────────────────────────────────────────────────

export function useRunBacktest() {
  const qc = useQueryClient();
  return useMutation<BacktestSummary, Error, BacktestRequest>({
    mutationFn: (body) =>
      api.post("/eagle-eye/simulations", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ee-backtest-list"] });
    },
  });
}

// ── Get full result for a run ─────────────────────────────────────────────────

export function useBacktestResult(runId: string | null) {
  return useQuery<BacktestResult>({
    queryKey: ["ee-backtest-result", runId],
    queryFn: () =>
      api.get(`/eagle-eye/simulations/${runId}/result`).then((r) => r.data),
    enabled: !!runId,
    staleTime: 1000 * 60 * 5,
  });
}

// ── List recent simulations ───────────────────────────────────────────────────

export function useBacktestList(limit = 10) {
  return useQuery<{ count: number; simulations: RecentSimulation[] }>({
    queryKey: ["ee-backtest-list", limit],
    queryFn: () =>
      api
        .get("/eagle-eye/simulations", { params: { limit } })
        .then((r) => r.data),
    staleTime: 1000 * 30,
  });
}
