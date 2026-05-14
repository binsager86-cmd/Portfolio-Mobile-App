/**
 * Eagle Eye React Query hooks.
 *
 * Wraps all 6 backend Eagle Eye endpoints with standard query/mutation
 * patterns matching the existing hooks/queries/* conventions.
 *
 * All requests go through the shared Axios client (JWT auth attached
 * automatically by the request interceptor in services/api/client.ts).
 */

import api from "@/services/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Type definitions ─────────────────────────────────────────────────────────

export interface ScannerFilters {
  sector?: string;
  tier?: string;
  min_confidence?: number;
  limit?: number;
}

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  method: string;
}

export interface SignalItem {
  signal: string;
  fired: boolean;
  value?: number | null;
  description?: string | null;
}

export interface RatedStock {
  ticker: string;
  name_en: string;
  sector: string;
  stage: string;
  rating: string;
  confidence: number;
  thesis: string;
  entry_primary?: number | null;
  stop_loss?: number | null;
  tp1?: number | null;
  last_price?: number | null;
  computed_at?: string | null;
}

export interface ScannerResponse {
  status: string;
  count: number;
  stocks: RatedStock[];
}

export interface FullStockAnalysis {
  ticker: string;
  name_en: string;
  sector: string;
  stage: string;
  rating: string;
  confidence: number;
  thesis: string;
  supports: SupportResistanceLevel[];
  resistances: SupportResistanceLevel[];
  entry_primary?: number | null;
  entry_aggressive?: number | null;
  entry_conservative?: number | null;
  stop_loss?: number | null;
  tp1?: number | null;
  tp1_probability?: number | null;
  tp2?: number | null;
  tp2_probability?: number | null;
  tp3?: number | null;
  tp3_probability?: number | null;
  position_size_pct?: number | null;
  position_size_kwd?: number | null;
  liquidity_capped?: boolean | null;
  requires_confirmation?: boolean | null;
  last_price?: number | null;
  signals: SignalItem[];
  computed_at?: string | null;
  days_of_history?: number | null;
}

export interface StockAnalysisResponse {
  status: string;
  data: FullStockAnalysis;
}

export interface ThresholdProfile {
  threshold_pct: number;
  success_rate: number;
  sample_count: number;
  median_bars_to_hit?: number | null;
  avg_win_pct?: number | null;
  avg_loss_pct?: number | null;
}

export interface BehavioralDNA {
  ticker: string;
  total_events_analyzed: number;
  most_reliable_signals: string[];
  threshold_profiles: ThresholdProfile[];
  dominant_pattern?: string | null;
  computed_at?: string | null;
}

export interface DNAResponse {
  status: string;
  message?: string;
  ticker?: string;
  data?: BehavioralDNA;
}

export interface MoveEvent {
  date: string;
  event_type: string;
  magnitude_pct: number;
  duration_bars: number;
  volume_confirmation: boolean;
  description?: string | null;
}

export interface EventsListResponse {
  status: string;
  ticker: string;
  count: number;
  events: MoveEvent[];
}

export interface RegimeResponse {
  status: string;
  regime: string;
  pmi_trend?: string | null;
  brent_trend?: string | null;
  breadth_pct_above_50ma?: number | null;
  last_updated?: string | null;
}

export interface RefreshRequest {
  tickers: string[];
}

export interface RefreshResponse {
  status: string;
  job_id: string;
  tickers_queued: number;
  estimated_minutes: number;
}

// ── Query key factory ────────────────────────────────────────────────────────

export const eagleEyeKeys = {
  all: ["eagle-eye"] as const,
  scanner: (filters?: ScannerFilters) => [...eagleEyeKeys.all, "scanner", filters ?? {}] as const,
  stock: (ticker: string, portfolioKwd?: number) =>
    [...eagleEyeKeys.all, "stock", ticker.toUpperCase(), portfolioKwd ?? 0] as const,
  dna: (ticker: string) => [...eagleEyeKeys.all, "dna", ticker.toUpperCase()] as const,
  events: (ticker: string) => [...eagleEyeKeys.all, "events", ticker.toUpperCase()] as const,
  regime: () => [...eagleEyeKeys.all, "regime"] as const,
} as const;

// ── API helpers ──────────────────────────────────────────────────────────────

function buildScannerUrl(filters?: ScannerFilters): string {
  const params = new URLSearchParams();
  if (filters?.sector) params.set("sector", filters.sector);
  if (filters?.tier) params.set("tier", filters.tier);
  if (filters?.min_confidence != null)
    params.set("min_confidence", String(filters.min_confidence));
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return `/api/v1/eagle-eye/scanner${qs ? `?${qs}` : ""}`;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useEagleEyeScanner
 * GET /api/v1/eagle-eye/scanner
 * staleTime: 5 minutes
 */
export function useEagleEyeScanner(filters?: ScannerFilters, enabled = true) {
  return useQuery<ScannerResponse>({
    queryKey: eagleEyeKeys.scanner(filters),
    queryFn: async () => {
      const { data } = await api.get<ScannerResponse>(buildScannerUrl(filters));
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 2,
    enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * useEagleEyeStock
 * GET /api/v1/eagle-eye/stocks/{ticker}
 * staleTime: 5 minutes
 */
export function useEagleEyeStock(ticker: string, portfolioKwd = 0, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<StockAnalysisResponse>({
    queryKey: eagleEyeKeys.stock(t, portfolioKwd),
    queryFn: async () => {
      const params = portfolioKwd > 0 ? `?portfolio_kwd=${portfolioKwd}` : "";
      const { data } = await api.get<StockAnalysisResponse>(
        `/api/v1/eagle-eye/stocks/${encodeURIComponent(t)}${params}`
      );
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled: enabled && !!t,
    placeholderData: (prev) => prev,
  });
}

/**
 * useEagleEyeDna
 * GET /api/v1/eagle-eye/stocks/{ticker}/dna
 * staleTime: 60 minutes (DNA changes only on weekly retrain)
 */
export function useEagleEyeDna(ticker: string, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<DNAResponse>({
    queryKey: eagleEyeKeys.dna(t),
    queryFn: async () => {
      const { data } = await api.get<DNAResponse>(
        `/api/v1/eagle-eye/stocks/${encodeURIComponent(t)}/dna`
      );
      return data;
    },
    staleTime: 60 * 60_000,
    gcTime: 4 * 60 * 60_000,
    retry: 2,
    enabled: enabled && !!t,
    placeholderData: (prev) => prev,
  });
}

/**
 * useEagleEyeEvents
 * GET /api/v1/eagle-eye/stocks/{ticker}/events
 * staleTime: 60 minutes
 */
export function useEagleEyeEvents(ticker: string, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<EventsListResponse>({
    queryKey: eagleEyeKeys.events(t),
    queryFn: async () => {
      const { data } = await api.get<EventsListResponse>(
        `/api/v1/eagle-eye/stocks/${encodeURIComponent(t)}/events`
      );
      return data;
    },
    staleTime: 60 * 60_000,
    gcTime: 4 * 60 * 60_000,
    retry: 2,
    enabled: enabled && !!t,
  });
}

/**
 * useEagleEyeRegime
 * GET /api/v1/eagle-eye/regime
 * staleTime: 10 minutes
 */
export function useEagleEyeRegime(enabled = true) {
  return useQuery<RegimeResponse>({
    queryKey: eagleEyeKeys.regime(),
    queryFn: async () => {
      const { data } = await api.get<RegimeResponse>("/api/v1/eagle-eye/regime");
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * useEagleEyeRefresh
 * POST /api/v1/eagle-eye/refresh
 * On success: invalidates scanner and stock queries
 */
export function useEagleEyeRefresh() {
  const queryClient = useQueryClient();
  return useMutation<RefreshResponse, Error, RefreshRequest>({
    mutationFn: async (body) => {
      const { data } = await api.post<RefreshResponse>("/api/v1/eagle-eye/refresh", body);
      return data;
    },
    onSuccess: () => {
      // Invalidate scanner and all stock analyses so they recompute
      queryClient.invalidateQueries({ queryKey: eagleEyeKeys.scanner() });
      queryClient.invalidateQueries({ queryKey: [...eagleEyeKeys.all, "stock"] });
    },
  });
}
