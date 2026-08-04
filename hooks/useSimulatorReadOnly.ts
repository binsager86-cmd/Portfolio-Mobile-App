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
  book?: SimulatorBook | null;
  lifecycle: string;
  tier: string;
  session: string | null;
  source: "decision_log" | "day_zero_inventory";
  last_kind?: string | null;
  last_disposition?: string | null;
  confidence?: number | null;
  gates_passing?: number | null;
  gates?: Array<Record<string, unknown>> | null;
  soft_conditions?: Record<string, unknown> | null;
  hard_refs?: Record<string, unknown> | null;
  base?: Record<string, unknown> | null;
  entry_paths?: Record<string, unknown> | null;
  exit_watch?: Record<string, unknown> | null;
}

export interface SimulatorScannerColumn {
  key: string;
  label: string;
  source: string;
}

export interface SimulatorScannerChip {
  key: string;
  label: string;
}

export interface SimulatorSymbolEvent {
  id: number;
  symbol: string;
  decision_session: string;
  created_at: string;
  kind: string;
  disposition: string;
  payload: {
    created_at?: string | null;
    decision_session?: string | null;
    portfolio?: SimulatorBook | null;
    reason?: string | null;
    veto_tier?: string | null;
    would_have_entry_reason?: string | null;
    state_snapshot?: Record<string, unknown>;
    frozen_action?: Record<string, unknown>;
  };
}

export interface SimulatorCycle {
  id: number;
  book: SimulatorBook;
  symbol: string;
  base_start: string | null;
  base_end: string | null;
  entry_date: string | null;
  entry_path: string | null;
  entry_price: number;
  peak_mfe: number;
  shakeout_dates: string[];
  exit_date: string | null;
  exit_reason: string | null;
  exit_price: number | null;
  pnl_pct: number;
}

export interface SimulatorTrace {
  symbol: string;
  state: SimulatorSymbolState | null;
  events: SimulatorSymbolEvent[];
  cycles: SimulatorCycle[];
}

export interface SimulatorScannerColumnsResponse {
  columns: SimulatorScannerColumn[];
  chips: SimulatorScannerChip[];
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
  projection_status?: "FRESH" | "STALE" | string;
  projection_stale?: boolean;
  projection_stale_reason?: string | null;
  projection_row_count_match?: boolean;
  projection_checksum_match?: boolean;
  row_counts: Record<string, number>;
  source_row_counts?: Record<string, number>;
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
  trace: (symbol: string) => [...simulatorReadOnlyKeys.all, "trace", symbol] as const,
  events: (symbol: string, limit: number) => [...simulatorReadOnlyKeys.all, "events", symbol, limit] as const,
  cycles: (symbol: string) => [...simulatorReadOnlyKeys.all, "cycles", symbol] as const,
  scannerColumns: () => [...simulatorReadOnlyKeys.all, "scanner-columns"] as const,
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

export function useReadOnlySimulatorTrace(symbol: string, enabled = true) {
  const normalized = symbol.trim().toUpperCase();
  return useQuery({
    queryKey: simulatorReadOnlyKeys.trace(normalized),
    queryFn: async () => {
      const { data } = await api.get<SimulatorTrace>(`/api/v2/simulator/symbols/${encodeURIComponent(normalized)}/trace`);
      return data;
    },
    staleTime: 30_000,
    enabled: enabled && !!normalized,
  });
}

export function useReadOnlySimulatorSymbolEvents(symbol: string, limit = 50, enabled = true) {
  const normalized = symbol.trim().toUpperCase();
  return useQuery({
    queryKey: simulatorReadOnlyKeys.events(normalized, limit),
    queryFn: async () => {
      const { data } = await api.get<{ events: SimulatorSymbolEvent[]; count: number }>(
        `/api/v2/simulator/symbols/${encodeURIComponent(normalized)}/events`,
        { params: { limit } },
      );
      return data.events;
    },
    staleTime: 30_000,
    enabled: enabled && !!normalized,
  });
}

export function useReadOnlySimulatorSymbolCycles(symbol: string, enabled = true) {
  const normalized = symbol.trim().toUpperCase();
  return useQuery({
    queryKey: simulatorReadOnlyKeys.cycles(normalized),
    queryFn: async () => {
      const { data } = await api.get<{ cycles: SimulatorCycle[]; count: number }>(
        `/api/v2/simulator/symbols/${encodeURIComponent(normalized)}/cycles`,
      );
      return data.cycles;
    },
    staleTime: 30_000,
    enabled: enabled && !!normalized,
  });
}

export function useReadOnlySimulatorScannerColumns(enabled = true) {
  return useQuery({
    queryKey: simulatorReadOnlyKeys.scannerColumns(),
    queryFn: async () => {
      const { data } = await api.get<SimulatorScannerColumnsResponse>("/api/v2/simulator/scanner/v2-columns");
      return data;
    },
    staleTime: 5 * 60_000,
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