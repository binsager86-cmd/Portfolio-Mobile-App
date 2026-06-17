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
import {
  getWhaleTrackerCandles,
  type WhaleTrackerCandle,
} from "@/services/api/analytics/whaleTracker";
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
  ticker?: string;
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
  confidence_yesterday?: number | null;  // Yesterday's cached confidence (before today's refresh)
  thesis: string;
  continue_rising?: boolean;
  continue_rising_badge?: string | null;
  continue_rising_label?: string | null;
  continue_rising_reason?: string | null;
  continue_rising_exhaustion_count?: number | null;
  continue_rising_exhaustion_signals?: string[] | null;
  risk_warning_score?: number | null;
  risky_near_resistance?: boolean;
  risk_reward_ratio?: number | null;
  entry_primary?: number | null;
  stop_loss?: number | null;
  tp1?: number | null;
  last_price?: number | null;
  book_value_per_share?: number | null;
  pe_ratio?: number | null;
  computed_at?: string | null;
  volume_context?: VolumeContext | null;
  ml_band?: MLBandItem | null;
}

export interface ScannerResponse {
  status: string;
  count: number;
  stocks: RatedStock[];
  progress_phase?: string | null;
  progress_message?: string | null;
  progress_current?: number | null;
  progress_total?: number | null;
  progress_percent?: number | null;
}

export interface FullStockAnalysis {
  ticker: string;
  name_en: string;
  sector: string;
  stage: string;
  rating: string;
  confidence: number;
  thesis: string;
  continue_rising?: boolean;
  continue_rising_badge?: string | null;
  continue_rising_label?: string | null;
  continue_rising_reason?: string | null;
  continue_rising_exhaustion_count?: number | null;
  continue_rising_exhaustion_signals?: string[] | null;
  risk_warning_score?: number | null;
  risky_near_resistance?: boolean;
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

export interface DnaWindowProfile {
  horizon_days: number;
  setup_count: number;
  history_status: string;
  confidence_floor: number;
  confidence_tier: "ESTABLISHED" | "BUILDING" | "EARLY" | "TOO_THIN" | string;
  confidence_label: string;
  percentages_visible: boolean;
  threshold_profiles: ThresholdProfile[];
}

export interface DnaSetupObservation {
  date: string;
  signal: string;
  label: string;
  detail: string;
  value?: number | null;
}

export interface DnaSetupForwardOutcome {
  horizon_days: number;
  completed: boolean;
  max_gain_pct?: number | null;
  max_gain_date?: string | null;
  threshold_hits: number[];
}

export interface DnaSetupBar {
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  rel_volume?: number | null;
  rsi?: number | null;
  macd_line?: number | null;
  macd_signal?: number | null;
  macd_histogram?: number | null;
  adx?: number | null;
  plus_di?: number | null;
  minus_di?: number | null;
}

export interface DnaSetupExample {
  setup_date: string;
  setup_window_start_date: string;
  setup_window_end_date: string;
  setup_bar_index: number;
  setup_window_start_index: number;
  setup_window_end_index: number;
  available_forward_bars: number;
  bars: DnaSetupBar[];
  observations: DnaSetupObservation[];
  forward_outcomes: Record<string, DnaSetupForwardOutcome>;
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

export interface PullbackEntryProfile {
  median_pullback_pct: number;
  max_pullback_pct: number;
  pullback_within_days: number;
  recovery_days: number;
  pullback_success_rate: number;
  sample_count: number;
}

export interface HistoricalTargetCluster {
  gain_pct_from_entry: number;
  cluster_strength: number;
  avg_days_to_reach: number;
  hit_rate: number;
}

export interface CycleProfile {
  period_days: number;
  std_days: number;
  period_confidence: "STRONG" | "MODERATE" | "WEAK" | "IRREGULAR" | string;
  sample_count: number;
  days_since_last: number;
  days_to_next: number;
}

export interface SimilarSetup {
  date: string | null;
  similarity: number;
  primary_label: number | null;
  max_excursion_pct: number | null;
}

export interface SimilarSetupsResponse {
  ticker: string;
  status: "ok" | "no_index" | "insufficient_data" | string;
  as_of?: string;
  feature_count?: number;
  setups: SimilarSetup[];
}

export interface PreDropSignal {
  signal: string;
  label: string;
  description: string;
  fired_before_drop_pct: number;
  avg_bars_before_drop: number;
  sample_count: number;
}

export interface PostDropBehavior {
  classification: "STRONG_BOUNCER" | "CONTINUATION_SELLER" | "MIXED" | string;
  bounce_rate_pct: number;
  avg_recovery_days: number;
  avg_continuation_pct: number;
  bounce_window_days: number;
  sample_count: number;
  classification_reason: string;
}

export interface ExitSignalProfile {
  drop_threshold_pct: number;
  historical_drop_events: number;
  avg_drop_magnitude_pct: number;
  avg_days_peak_to_trough: number;
  pre_drop_signals: PreDropSignal[];
  post_drop_behavior: PostDropBehavior | null;
}

export interface BehavioralDNA {
  ticker: string;
  total_events_analyzed: number;
  history_status?: string | null;
  setup_signals?: string[];
  setup_horizon_days?: number | null;
  default_window_days?: number | null;
  available_window_days?: number[];
  confidence_floor?: number;
  most_reliable_signals: string[];
  signal_stats?: SignalReliabilityStat[];
  threshold_profiles: ThresholdProfile[];
  window_profiles?: DnaWindowProfile[];
  setup_examples?: DnaSetupExample[];
  dominant_pattern?: string | null;
  computed_at?: string | null;
  pre_move_volume_profile?: VolumeProfile | null;
  fakeout_volume_profile?: VolumeProfile | null;
  cycle_profile?: CycleProfile | null;
  optimal_hold_window_days?: number | null;
  avg_entry_quality_score?: number | null;
  pullback_entry_profile?: PullbackEntryProfile | null;
  historical_target_clusters?: HistoricalTargetCluster[];
  exit_signal_profile?: ExitSignalProfile | null;
}

export interface DNAResponse {
  status: string;
  message?: string;
  ticker?: string;
  data?: BehavioralDNA;
}

export interface DnaRecentBarsResponse {
  ticker: string;
  bars: DnaSetupBar[];
  fetched_at: string;
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
  scanner: (filters?: ScannerFilters) => [...eagleEyeKeys.all, "scanner", "v3", filters ?? {}] as const,
  stock: (ticker: string, portfolioKwd?: number) =>
    [...eagleEyeKeys.all, "stock", ticker.toUpperCase(), portfolioKwd ?? 0] as const,
  dna: (ticker: string) => [...eagleEyeKeys.all, "dna", ticker.toUpperCase()] as const,
  dnaRecentBars: (ticker: string) => [...eagleEyeKeys.all, "dna-recent-bars-v2", ticker.toUpperCase()] as const,
  similarSetups: (ticker: string) => [...eagleEyeKeys.all, "similar-setups", ticker.toUpperCase()] as const,
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

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function computeSimpleMovingAverage(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length === 0 || period <= 0) return out;

  let rollingSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    rollingSum += values[index];
    if (index >= period) {
      rollingSum -= values[index - period];
    }
    if (index >= period - 1) {
      out[index] = rollingSum / period;
    }
  }
  return out;
}

function computeEMA(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;

  let seed = 0;
  for (let index = 0; index < period; index += 1) {
    seed += values[index];
  }

  let prev = seed / period;
  out[period - 1] = prev;
  const alpha = 2 / (period + 1);

  for (let index = period; index < values.length; index += 1) {
    prev = values[index] * alpha + prev * (1 - alpha);
    out[index] = prev;
  }

  return out;
}

function computeRSI(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = closes[index] - closes[index - 1];
    avgGain += Math.max(delta, 0);
    avgLoss += Math.max(-delta, 0);
  }
  avgGain /= period;
  avgLoss /= period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

function computeMACD(closes: number[]): {
  macdLine: Array<number | null>;
  signalLine: Array<number | null>;
  histogram: Array<number | null>;
} {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: Array<number | null> = closes.map((_, index) => {
    if (ema12[index] == null || ema26[index] == null) return null;
    return (ema12[index] as number) - (ema26[index] as number);
  });

  const signalLine: Array<number | null> = new Array(closes.length).fill(null);
  const histogram: Array<number | null> = new Array(closes.length).fill(null);
  const alpha = 2 / (9 + 1);
  let prevSignal: number | null = null;

  for (let index = 0; index < macdLine.length; index += 1) {
    const value = macdLine[index];
    if (value == null) continue;
    if (prevSignal == null) {
      prevSignal = value;
      signalLine[index] = value;
    } else {
      prevSignal = value * alpha + prevSignal * (1 - alpha);
      signalLine[index] = prevSignal;
    }
    histogram[index] = value - (signalLine[index] as number);
  }

  return { macdLine, signalLine, histogram };
}

function computeADX(candles: WhaleTrackerCandle[], period = 14): {
  adx: Array<number | null>;
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
} {
  const count = candles.length;
  const adx: Array<number | null> = new Array(count).fill(null);
  const plusDi: Array<number | null> = new Array(count).fill(null);
  const minusDi: Array<number | null> = new Array(count).fill(null);

  if (count <= period) {
    return { adx, plusDi, minusDi };
  }

  const tr = new Array<number>(count).fill(0);
  const plusDm = new Array<number>(count).fill(0);
  const minusDm = new Array<number>(count).fill(0);
  const dx: Array<number | null> = new Array(count).fill(null);

  for (let index = 1; index < count; index += 1) {
    const current = candles[index];
    const prev = candles[index - 1];
    const upMove = current.high - prev.high;
    const downMove = prev.low - current.low;

    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;

    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - prev.close);
    const lowClose = Math.abs(current.low - prev.close);
    tr[index] = Math.max(highLow, highClose, lowClose);
  }

  let trSmooth = 0;
  let plusSmooth = 0;
  let minusSmooth = 0;

  for (let index = 1; index <= period; index += 1) {
    trSmooth += tr[index];
    plusSmooth += plusDm[index];
    minusSmooth += minusDm[index];
  }

  for (let index = period; index < count; index += 1) {
    if (index > period) {
      trSmooth = trSmooth - trSmooth / period + tr[index];
      plusSmooth = plusSmooth - plusSmooth / period + plusDm[index];
      minusSmooth = minusSmooth - minusSmooth / period + minusDm[index];
    }

    if (trSmooth <= 0) continue;

    const plus = (100 * plusSmooth) / trSmooth;
    const minus = (100 * minusSmooth) / trSmooth;
    plusDi[index] = plus;
    minusDi[index] = minus;

    const denom = plus + minus;
    if (denom > 0) {
      dx[index] = (100 * Math.abs(plus - minus)) / denom;
    }
  }

  const firstAdxIndex = period * 2 - 1;
  if (firstAdxIndex < count) {
    let seed = 0;
    let seedCount = 0;
    for (let index = period; index <= firstAdxIndex; index += 1) {
      if (dx[index] != null) {
        seed += dx[index] as number;
        seedCount += 1;
      }
    }

    if (seedCount === period) {
      let prevAdx = seed / period;
      adx[firstAdxIndex] = prevAdx;

      for (let index = firstAdxIndex + 1; index < count; index += 1) {
        if (dx[index] == null) continue;
        prevAdx = ((prevAdx * (period - 1)) + (dx[index] as number)) / period;
        adx[index] = prevAdx;
      }
    }
  }

  return { adx, plusDi, minusDi };
}

function buildDnaBarsFromCandles(candles: WhaleTrackerCandle[]): DnaSetupBar[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const sorted = [...candles]
    .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close))
    .sort((left, right) => left.date.localeCompare(right.date));

  if (sorted.length === 0) return [];

  const closes = sorted.map((candle) => candle.close);
  const volumes = sorted.map((candle) => candle.volume);
  const rsi = computeRSI(closes, 14);
  const { macdLine, signalLine, histogram } = computeMACD(closes);
  const { adx, plusDi, minusDi } = computeADX(sorted, 14);
  const avgVolume20 = computeSimpleMovingAverage(volumes, 20);

  return sorted.map((candle, index) => {
    const prevClose = index > 0 ? sorted[index - 1].close : candle.close;
    const avgVol = avgVolume20[index];
    const relVol = avgVol != null && avgVol > 0 ? candle.volume / avgVol : null;

    return {
      date: candle.date.slice(0, 10),
      open: candle.open > 0 ? candle.open : prevClose,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      rel_volume: relVol,
      rsi: rsi[index],
      macd_line: macdLine[index],
      macd_signal: signalLine[index],
      macd_histogram: histogram[index],
      adx: adx[index],
      plus_di: plusDi[index],
      minus_di: minusDi[index],
    };
  });
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useEagleEyeScanner
 * GET /api/v1/eagle-eye/scanner
 *
 * Always fetches the full universe (no min_confidence sent to the server).
 * All confidence/buy/breakout filtering is done client-side in the scanner
 * screen's useMemo so filter chip changes are instant with zero extra
 * network round trips.
 *
 * staleTime: 10 minutes
 */
export function useEagleEyeScanner(_filters?: ScannerFilters, enabled = true) {
  // Only sector/tier are forwarded to the server — they narrow the universe
  // at the DB level. Confidence and rating filters are client-side only.
  const serverFilters: ScannerFilters = {
    sector: _filters?.sector,
    tier: _filters?.tier,
    // Always force full-universe fetch for production parity, even if backend
    // defaults differ across environments or older deployments.
    min_confidence: 0,
    limit: 500,
  };
  return useQuery<ScannerResponse>({
    // Key does NOT include min_confidence so filter chips hit the cache
    queryKey: eagleEyeKeys.scanner(serverFilters),
    queryFn: async () => {
      const { data } = await api.get<ScannerResponse>(buildScannerUrl(serverFilters));
      return data;
    },
    staleTime: 10 * 60_000,   // 10 min — data changes only on nightly recompute
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
    placeholderData: (prev) => prev,
    // Always re-check the live backend on mount so persisted stale responses
    // (for example, a pre-deploy 66-row cache) cannot survive a release.
    refetchOnMount: "always",
    // Auto-poll frequently while warmup is active so progress looks real-time
    refetchInterval: (query) =>
      (query.state.data as ScannerResponse | undefined)?.status === "warming_up"
        ? 2_000
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
 * useEagleEyeDnaRecentBars
 * Fetches recent candles and computes the same indicator stack used in DNA setup charts.
 */
export function useEagleEyeDnaRecentBars(ticker: string, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<DnaRecentBarsResponse>({
    queryKey: eagleEyeKeys.dnaRecentBars(t),
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to);
      // Pull ~2+ years so the DNA screen can support up to a 2Y visual range.
      from.setDate(from.getDate() - 780);

      const candles = await getWhaleTrackerCandles({
        // Use explicit Kuwait suffix to avoid accidental .US fallback symbol resolution.
        symbol: `${t}.KW`,
        exchange: "KW",
        country: "KW",
        from: formatIsoDate(from),
        to: formatIsoDate(to),
      });

      const bars = buildDnaBarsFromCandles(candles).slice(-560);
      return {
        ticker: t,
        bars,
        fetched_at: new Date().toISOString(),
      };
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    enabled: enabled && !!t,
    placeholderData: (prev) => prev,
  });
}

/**
 * useSimilarSetups
 * GET /api/v1/eagle-eye/stocks/{ticker}/similar-setups
 *
 * Finds the top-K historical dates whose indicator fingerprint most resembles
 * the current market state using cosine similarity (ML pattern store).
 * staleTime: 30 minutes — recalculates once per session at most.
 */
export function useSimilarSetups(ticker: string, topK = 5, enabled = true) {
  const t = ticker.toUpperCase().trim();
  return useQuery<SimilarSetupsResponse>({
    queryKey: eagleEyeKeys.similarSetups(t),
    queryFn: async () => {
      const { data } = await api.get<SimilarSetupsResponse>(
        `/api/v1/eagle-eye/stocks/${encodeURIComponent(t)}/similar-setups?top_k=${topK}`
      );
      return data;
    },
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    enabled: enabled && !!t,
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
    staleTime: 10 * 60_000,  // kill-switch state changes rarely; 10 min is safe
    gcTime: 30 * 60_000,
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
