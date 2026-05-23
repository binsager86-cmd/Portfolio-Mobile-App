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

export interface VolumeContext {
  relative_volume: number;
  liquidity_tier: "TRADEABLE" | "WATCH_ONLY" | "ILLIQUID";
  is_volume_confirmed: boolean;
  volume_character: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
  volume_trend_5d: "EXPANDING" | "CONTRACTING" | "NEUTRAL";
}

export interface MLBandItem {
  ticker: string;
  band: string | null;
  color: string | null;
  emoji: string | null;
  short_label: string | null;
  as_of?: string | null;
  calibrated_prob?: number | null;
}

export interface MLBandsResponse {
  enabled: boolean;
  disclaimer: string;
  bands: MLBandItem[];
}

export interface MLDisplayStateResponse {
  enabled: boolean;
  config_enabled: boolean;
  auto_disabled: boolean;
  disabled_reason: string | null;
}

export interface MLMethodologySection {
  heading: string;
  body: string;
}

export interface MLMethodologyResponse {
  title: string;
  phase: string;
  status: string;
  disclaimer: string;
  sections: MLMethodologySection[];
}

export interface MLBandCard {
  ticker: string;
  enabled: boolean;
  band: string | null;
  color?: string | null;
  emoji?: string | null;
  calibrated_prob?: number | null;
  raw_prob?: number | null;
  band_low_threshold?: number | null;
  band_high_threshold?: number | null;
  rule_stage?: string | null;
  verdict?: string | null;
  as_of?: string | null;
  disclaimer: string;
  methodology_link?: string | null;
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
  volume_context?: VolumeContext | null;
  ml_band?: MLBandItem | null;
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
  plan_state?: "ACTIVE" | "DECLINED" | "CONDITIONAL";
  plan_reason?: string | null;
  conditional_entry?: number | null;
  stop_loss?: number | null;
  tp1?: number | null;
  tp1_probability?: number | null;
  tp2?: number | null;
  tp2_probability?: number | null;
  tp3?: number | null;
  tp3_probability?: number | null;
  risk_reward_ratio?: number | null;
  gain_pct_to_tp1?: number | null;
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
  total_count?: number | null;
  hits?: number | null;
  total_setups?: number | null;
  median_bars_to_hit?: number | null;
  avg_win_pct?: number | null;
  avg_loss_pct?: number | null;
  avg_gain_all_pct?: number | null;
  avg_gain_on_hits_pct?: number | null;
}

export interface SignalReliabilityStat {
  signal: string;
  reliability_pct?: number | null;
  presence_pct?: number | null;
  fired_count: number;
  total_events?: number | null;
  total_setups?: number | null;
  avg_lead_days?: number | null;
  false_positive_rate?: number | null;
  discriminative_power?: number | null;
}

export interface VolumeProfile {
  avg_rel_vol_t90?: number | null;
  avg_rel_vol_t60?: number | null;
  avg_rel_vol_t30?: number | null;
  avg_rel_vol_t14?: number | null;
  avg_rel_vol_t7?: number | null;
  avg_rel_vol_t3?: number | null;
  avg_rel_vol_t0?: number | null;
  volume_pattern?: "GRADUAL_BUILD" | "LATE_SPIKE" | "EARLY_SIGNAL" | "NO_CLEAR_PATTERN" | null;
  min_rel_vol_for_real_move?: number | null;
}

export interface BehavioralDNA {
  ticker: string;
  total_events_analyzed: number;
  history_status?: string | null;
  setup_signals?: string[];
  setup_horizon_days?: number | null;
  most_reliable_signals: string[];
  signal_stats?: SignalReliabilityStat[];
  threshold_profiles: ThresholdProfile[];
  dominant_pattern?: string | null;
  computed_at?: string | null;
  pre_move_volume_profile?: VolumeProfile | null;
  fakeout_volume_profile?: VolumeProfile | null;
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
  mlDisplayState: () => [...eagleEyeKeys.all, "ml-display-state"] as const,
  mlBands: () => [...eagleEyeKeys.all, "ml-bands"] as const,
  mlBandForTicker: (ticker: string) => [...eagleEyeKeys.all, "ml-band", ticker.toUpperCase()] as const,
  mlMethodology: () => [...eagleEyeKeys.all, "ml-methodology"] as const,
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
    // Auto-poll every 30 s while the backend is still warming up
    refetchInterval: (query) =>
      (query.state.data as ScannerResponse | undefined)?.status === "warming_up"
        ? 30_000
        : false,
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

// ── Phase 3 ML hooks ─────────────────────────────────────────────────────────

/**
 * useMLDisplayState
 * GET /api/v1/eagle-eye/ml/display-state
 * Checks kill-switch + auto-disable state.
 */
export function useMLDisplayState(enabled = true) {
  return useQuery<MLDisplayStateResponse>({
    queryKey: eagleEyeKeys.mlDisplayState(),
    queryFn: async () => {
      const { data } = await api.get<MLDisplayStateResponse>("/api/v1/eagle-eye/ml/display-state");
      return data;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * useMLBands
 * GET /api/v1/eagle-eye/ml/bands
 * Returns ML band labels for all 14 SHADOW-roster stocks.
 * staleTime: 10 minutes (refreshes with market data, not real-time)
 */
export function useMLBands(enabled = true) {
  return useQuery<MLBandsResponse>({
    queryKey: eagleEyeKeys.mlBands(),
    queryFn: async () => {
      const { data } = await api.get<MLBandsResponse>("/api/v1/eagle-eye/ml/bands");
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
 * useMLBandForTicker
 * GET /api/v1/eagle-eye/ml/bands/{ticker}
 * Full ML band card for a single stock.
 */
export function useMLBandForTicker(ticker: string, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<MLBandCard>({
    queryKey: eagleEyeKeys.mlBandForTicker(t),
    queryFn: async () => {
      const { data } = await api.get<MLBandCard>(
        `/api/v1/eagle-eye/ml/bands/${encodeURIComponent(t)}`
      );
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    enabled: enabled && !!t,
    placeholderData: (prev) => prev,
  });
}

/**
 * useMLMethodology
 * GET /api/v1/eagle-eye/ml/methodology
 * Human-readable methodology for the band display.
 */
export function useMLMethodology(enabled = true) {
  return useQuery<MLMethodologyResponse>({
    queryKey: eagleEyeKeys.mlMethodology(),
    queryFn: async () => {
      const { data } = await api.get<MLMethodologyResponse>("/api/v1/eagle-eye/ml/methodology");
      return data;
    },
    staleTime: 60 * 60_000,
    gcTime: 4 * 60 * 60_000,
    retry: 1,
    enabled,
  });
}
