import api from "@/services/api/client";
import { useQuery } from "@tanstack/react-query";

export type SimulatorBook = "BUY" | "WATCHLIST";

export interface SimulatorPortfolioSummary {
  book: SimulatorBook;
  nav_kwd: number;
  cash_kwd: number;
  invested_kwd: number;
  open_position_count: number;
  total_pnl_kwd: number;
  change_since_inception_pct: number;
  inception_date: string | null;
}

export interface SimulatorNavPoint {
  session: string | null;
  nav_kwd: number;
  cash_kwd: number;
  invested_kwd: number;
}

export interface SimulatorPosition {
  symbol: string;
  entry_date: string | null;
  entry_price: number;
  entry_reason: string | null;
  sessions_held: number | null;
  last_close: number;
  unrealized_pnl_pct: number;
  unrealized_pnl_kwd: number;
  current_lifecycle: string | null;
  avoid_tier: string;
}

export interface SimulatorTransaction {
  id: number;
  created_at: string;
  portfolio: SimulatorBook;
  transaction_type: "BUY" | "SELL" | "VOID";
  symbol: string;
  quantity: number;
  price: number;
  gross_value_kwd: number;
  commission_kwd: number;
  net_cash_delta_kwd: number;
  decision_session: string;
  fill_session: string;
  reason: string;
  status: "POSTED" | "VOID";
  voids_transaction_id: number | null;
  suspension_gap_sessions: number;
}

export interface SimulatorDecision {
  id: number;
  symbol: string;
  decision_session: string;
  kind: string;
  reason: string;
  portfolio: SimulatorBook | null;
  veto_tier: string | null;
  would_have_entry_reason: string | null;
  disposition: string;
  tier: string | null;
  state_snapshot: Record<string, unknown>;
  frozen_action: Record<string, unknown>;
}

export interface SimulatorSymbolState {
  symbol: string;
  lifecycle: string;
  tier: string;
  session: string | null;
  source: "decision_log" | "day_zero_inventory";
}

export interface SimulatorIntegrity {
  seal_verification: {
    pass: boolean;
    checked_at: string;
    duration_ms: number;
    code_entries: number;
    failures: Array<{ path: string; reason: string }>;
  };
  guard_trips_count: number;
  last_session_processed: string | null;
  row_counts: Record<string, number>;
  ledger_sha256: string;
}

export const simulatorReadOnlyKeys = {
  all: ["simulator-read-only"] as const,
  portfolios: () => [...simulatorReadOnlyKeys.all, "portfolios"] as const,
  nav: (book: string, days: number) => [...simulatorReadOnlyKeys.all, "nav", book, days] as const,
  positions: (book: string) => [...simulatorReadOnlyKeys.all, "positions", book] as const,
  transactions: (book?: string, symbol?: string, limit?: number) =>
    [...simulatorReadOnlyKeys.all, "transactions", book ?? "all", symbol ?? "all", limit ?? 100] as const,
  decisions: (symbol?: string, limit?: number) =>
    [...simulatorReadOnlyKeys.all, "decisions", symbol ?? "all", limit ?? 100] as const,
  states: () => [...simulatorReadOnlyKeys.all, "states"] as const,
  integrity: () => [...simulatorReadOnlyKeys.all, "integrity"] as const,
};

export function useReadOnlySimulatorPortfolios(enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.portfolios(),
    queryFn: async () => {
      const { data } = await api.get<{ portfolios: SimulatorPortfolioSummary[] }>("/api/v2/simulator/portfolios");
      return data.portfolios;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorNav(book: SimulatorBook, days = 60, enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.nav(book, days),
    queryFn: async () => {
      const { data } = await api.get<{ series: SimulatorNavPoint[] }>(`/api/v2/simulator/portfolios/${book}/nav`, { params: { days } });
      return data.series;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorPositions(book: SimulatorBook, enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.positions(book),
    queryFn: async () => {
      const { data } = await api.get<{ positions: SimulatorPosition[] }>(`/api/v2/simulator/portfolios/${book}/positions`);
      return data.positions;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorTransactions(book?: SimulatorBook, symbol?: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.transactions(book, symbol, limit),
    queryFn: async () => {
      const { data } = await api.get<{ transactions: SimulatorTransaction[] }>("/api/v2/simulator/transactions", {
        params: { book, symbol, limit },
      });
      return data.transactions;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorDecisions(symbol?: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.decisions(symbol, limit),
    queryFn: async () => {
      const { data } = await api.get<{ decisions: SimulatorDecision[] }>("/api/v2/simulator/decisions", {
        params: { symbol, limit },
      });
      return data.decisions;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorSymbolStates(enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.states(),
    queryFn: async () => {
      const { data } = await api.get<{ symbols: Record<string, SimulatorSymbolState> }>("/api/v2/simulator/symbols/state");
      return data.symbols;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useReadOnlySimulatorIntegrity(enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.integrity(),
    queryFn: async () => {
      const { data } = await api.get<SimulatorIntegrity>("/api/v2/simulator/system/integrity");
      return data;
    },
    staleTime: 0,
    enabled,
  });
}