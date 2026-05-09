/**
 * Trade Signals API client.
 */

import api from "../client";

export type Quarter = "q1" | "q2" | "q3" | "q4";
export type QuarterRow = Record<Quarter, number | null>;

export interface PEQuarterlyVerdict {
  verdict: "overvalued" | "undervalued" | "fair" | "unknown";
  scale: 0 | 1 | 2 | 3 | 4;
  scaleLabel: "n/a" | "minimal" | "mild" | "strong" | "extreme";
  diffPct: number | null;
  diffAbs: number | null;
}

export interface PEQuarterlyResponse {
  symbol: string;
  company_name: string | null;
  yf_ticker: string | null;
  years: number[];
  pe_table: Record<string, QuarterRow>;
  growth_table: Record<string, QuarterRow>;
  averages: QuarterRow;
  current_pe: number | null;
  current_quarter: Quarter;
  compare_quarter_avg: number | null;
  verdict: PEQuarterlyVerdict;
  source: string;
}

/** Fetch quarterly P/E history + verdict for a fundamental-analysis stock. */
export async function getPEQuarterly(stockId: number): Promise<PEQuarterlyResponse> {
  const { data } = await api.get<{ status: string; data: PEQuarterlyResponse }>(
    `/api/v1/trade-signals/pe-quarterly/${stockId}`,
  );
  return data.data;
}

// ── Kuwait Multi-Factor Signal Engine ─────────────────────────────────────────

export interface KuwaitSignalTPMethods {
  rr_1_5x?: number | null;
  rr_3_0x?: number | null;
  rr_4_0x?: number | null;
  fib_127?: number | null;
  fib_161?: number | null;
  fib_261?: number | null;
  atr_1_5x?: number | null;
  atr_2_5x?: number | null;
  atr_4_0x?: number | null;
  hvn_nearest?: number | null;
  volume_poc?: number | null;
  swing_retest?: number | null;
  psychological?: number | null;
  fifty_two_week?: number | null;
}

export interface KuwaitSignalTPMethodsAll {
  tp1: KuwaitSignalTPMethods | null;
  tp2: KuwaitSignalTPMethods | null;
  tp3: KuwaitSignalTPMethods | null;
  tp1_confluence: number | null;
  tp2_confluence: number | null;
  tp3_confluence: number | null;
}

export interface KuwaitSignalExecution {
  entry_zone_fils: [number | null, number | null];
  stop_loss_fils: number | null;
  tp1_fils: number | null;
  tp2_fils: number | null;
  tp3_fils: number | null;
  tp_methods: KuwaitSignalTPMethodsAll | null;
  tick_alignment: string;
  preferred_order_type: string;
}

export interface KuwaitSignalRisk {
  risk_per_share_fils: number | null;
  risk_reward_ratio: number | null;
  position_size_percent: number | null;
  cvar_95_fils: number | null;
  liquidity_adjustment_factor: number | null;
}

export interface KuwaitSignalProbabilities {
  p_tp1_before_sl: number | null;
  p_tp2_before_sl: number | null;
  p_tp3_before_sl: number | null;
  confidence_interval_95: [number, number] | null;
  expected_return_r_multiple: number | null;
  calibration_method: string;
}

export interface KuwaitSignalSubScores {
  trend: number;
  momentum: number;
  volume_flow: number;
  support_resistance: number;
  risk_reward: number;
}

export interface TrendScoreDetail {
  base_raw: number;
  final_adjusted: number;
  adjustment_factor: number;
  multipliers: {
    efficiency_ratio: number;
    trend_age: number;
    ema_stretch: number;
    sector_lead_lag: number;
  };
  // Legacy fields kept for backward compatibility
  raw_score?: number;
  ema_alignment_pts?: number;
  adx_pts?: number;
  swing_structure_pts?: number;
}

export interface IndicatorBreakdownTrend extends TrendScoreDetail {
  ema_pts: number;
  ema_desc: string;
  adx_pts: number;
  adx_desc: string;
  swing_pts: number;
  swing_desc: string;
  raw_score: number;
}

export interface IndicatorBreakdownMomentum {
  rsi_pts: number;
  rsi_desc: string;
  macd_pts: number;
  macd_desc: string;
  roc_pts: number;
  roc_desc: string;
  stoch_pts: number;
  stoch_desc: string;
  raw_score: number;
}

export interface IndicatorBreakdownVolume {
  cmf_pts: number;
  cmf_desc: string;
  obv_pts: number;
  obv_desc: string;
  rvol_pts: number;
  rvol_desc: string;
  auction_pts: number;
  auction_desc: string;
  auction_intensity: number;
  raw_score: number;
}

export interface IndicatorBreakdownSR {
  support_proximity_pts: number | null;
  resistance_clearance_pts: number | null;
  volume_profile_pts: number | null;
  nearest_support: number | null;
  nearest_resistance: number | null;
  volume_poc: number | null;
  anchored_vwap: number | null;
  raw_score: number;
}

export interface KuwaitIndicatorBreakdown {
  trend: IndicatorBreakdownTrend | null;
  momentum: IndicatorBreakdownMomentum | null;
  volume: IndicatorBreakdownVolume | null;
  sr: IndicatorBreakdownSR | null;
}

export interface KuwaitSignalLiquidityDetails {
  adtv_20d_kd: number | null;
  spread_proxy_pct: number | null;
  active_days_30d_pct: number | null;
  volume_concentration: number | null;
  pass_adtv: boolean;
  pass_spread: boolean;
  pass_active_days: boolean;
  pass_concentration: boolean;
}

export interface KuwaitHurstFilter {
  h_value: number;
  h_std_error: number;
  threshold: number;
  confidence_penalty: number;
  action: "proceed" | "skip_or_downgrade" | "skip_signal";
  description: string;
}

export interface KuwaitOrderBookMetrics {
  imbalance_ratio: number | null;
  liquidity_wall: {
    side: "bid" | "ask";
    price: number;
    volume: number;
    strength: string;
  } | null;
  available: boolean;
}

export interface KuwaitBankingLeadLag {
  active: boolean;
  multiplier: number;
  banking_trend_raw: number;
}

export type FourScoreTier = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

export interface FourScoreComponent {
  score: number;
  tier: FourScoreTier;
  description: string;
}

export interface FourScoreRisk {
  score: number;
  risk_level: "Low Risk" | "Moderate Risk" | "High Risk";
  description: string;
}

export interface FourScoreOverall {
  base_score: number;
  score: number;
  adjustment_factor: number;
  tier: FourScoreTier;
  description: string;
  risk_multiplier?: number;
}

export interface FourScorePositionAction {
  action: string;
  label: string;
  max_position_pct: number;
}

export interface FourScores {
  potential: FourScoreComponent;
  timing: FourScoreComponent;
  risk: FourScoreRisk;
  overall: FourScoreOverall;
  position_action: FourScorePositionAction;
}

export interface KuwaitSignalConfluence {
  total_score: number;
  total_score_raw: number | null;
  regime: string;
  regime_confidence: number | null;
  auction_intensity: number | null;
  hurst_filter: KuwaitHurstFilter | null;
  orderbook_metrics: KuwaitOrderBookMetrics | null;
  banking_lead_lag: KuwaitBankingLeadLag | null;
  sub_scores: KuwaitSignalSubScores;
  raw_sub_scores: KuwaitSignalSubScores;
  liquidity_passed: boolean;
  liquidity_details: KuwaitSignalLiquidityDetails;
  circuit_proximity: {
    is_near_limit: boolean;
    direction: "upper" | "lower" | "both" | null;
    distance_to_upper_pct: number | null;
    distance_to_lower_pct: number | null;
  } | null;
  circuit_breaker: {
    penalty_multiplier: number;
    severity: "severe" | "moderate" | "light" | "none";
    nearest_circuit_pct: number | null;
    is_near_upper_circuit: boolean | null;
    description: string;
  } | null;
  /** Nearest support price levels (fils), sorted descending (closest first) */
  support_levels: number[];
  /** Nearest resistance price levels (fils), sorted ascending (closest first) */
  resistance_levels: number[];
  /** Anchored VWAP price in fils, if available */
  vwap: number | null;
  /** Rich typed S/R map from multi-method engine */
  rich_sr: KuwaitRichSR | null;
  /** Volume profile summary */
  volume_profile: KuwaitVolumeProfile | null;
  /** Four-score architecture: Potential, Timing, Risk, Overall */
  four_scores: FourScores | null;
  /** Per-indicator breakdown for Score Drill-Down UI */
  indicator_breakdown: KuwaitIndicatorBreakdown | null;
}

export type SRLevelStrength = "very_strong" | "strong" | "moderate" | "weak";
export type SRLevelType =
  | "Swing High" | "Swing Low"
  | `Fib ${string}` | `Fib Ext ${string}`
  | "Pivot R1" | "Pivot R2" | "Pivot R3"
  | "Pivot S1" | "Pivot S2" | "Pivot S3"
  | "EMA 20" | "EMA 50" | "SMA 100"
  | "Psychological"
  | "Volume POC" | "HVN" | "LVN"
  | string;

export interface KuwaitSRLevel {
  price: number;
  type: SRLevelType;
  strength: SRLevelStrength;
  strength_score: number;
  volume_cluster: boolean;
  distance_from_entry_pct: number;
}

export interface KuwaitRichSR {
  resistance: KuwaitSRLevel[];
  support: KuwaitSRLevel[];
  nearest_resistance: number | null;
  nearest_support: number | null;
}

export interface KuwaitVolumeProfile {
  poc: number | null;
  value_area_high: number | null;
  value_area_low: number | null;
  hvn_levels: number[];
  lvn_levels: number[];
}

export interface KuwaitEntryTriggerDetector {
  triggered: boolean;
  reason: string;
  strength: number;
}

export interface KuwaitAccumulationState {
  state: "active" | "building" | "absent";
  obv_slope_pct: number | null;
  cmf: number | null;
}

export interface KuwaitEntryTrigger {
  action: "ENTER" | "WATCH" | "HOLD";
  trigger: "pullback" | "breakout" | "accumulation_only" | "none";
  pullback: KuwaitEntryTriggerDetector;
  breakout: KuwaitEntryTriggerDetector;
  accumulation: KuwaitAccumulationState;
  triggered: boolean;
  trigger_type: "pullback" | "breakout" | null;
  trigger_strength: number;
  accumulation_state: "active" | "building" | "absent";
  recommended_state: "BUY" | "WATCH" | "HOLD" | string;
  details: Record<string, unknown>;
}

export interface KuwaitSignal {
  timestamp: string;
  stock_code: string;
  segment: string;
  signal: "STRONG_BUY" | "BUY" | "SELL" | "NEUTRAL" | "WATCH" | "HOLD";
  setup_type: string;

  // ── Score transparency ─────────────────────────────────────────────────
  /** Weighted technical score BEFORE circuit / CVaR penalties. null for NEUTRAL. */
  raw_technical_score: number | null;
  /** Score after all penalties applied. null for NEUTRAL. */
  risk_adjusted_score: number | null;
  /** Combined score using trend directional adjustment. */
  combined_score_adjusted_directional?: number | null;
  /** Companion combined score without trend directional adjustment. */
  combined_score_unadjusted_directional?: number | null;
  /** Breakdown of how the final score was derived from penalties */
  score_breakdown: {
    raw_technical: number;
    circuit_penalty_pct: number;
    cvar_penalty_pct: number;
    age_decay_applied: boolean;
    final_risk_adjusted: number;
  } | null;
  /** Per-component raw, weighted, and weight_pct */
  component_scores: {
    trend: { raw: number | null; weighted: number | null; weight_pct: number | null };
    momentum: { raw: number | null; weighted: number | null; weight_pct: number | null };
    volume_flow: { raw: number | null; weighted: number | null; weight_pct: number | null };
    support_resistance: { raw: number | null; weighted: number | null; weight_pct: number | null };
    risk_reward: { raw: number | null; weighted: number | null; weight_pct: number | null };
  } | null;

  // ── Block reason (populated only for NEUTRAL signals) ─────────────────
  reason: string | null;
  reason_description: string | null;
  failed_gates: string[];
  details: Record<string, unknown>;
  technical_scores_debug: Record<string, number> | null;
  entry_trigger: KuwaitEntryTrigger;

  execution: KuwaitSignalExecution;
  risk_metrics: KuwaitSignalRisk;
  probabilities: KuwaitSignalProbabilities;
  confluence_details: KuwaitSignalConfluence;
  alerts: string[];
  metadata: {
    model_version: string;
    data_as_of: string;
    walk_forward_window: string;
    statistical_confidence: number | null;
  };
}

export interface KuwaitSignalParams {
  symbol: string;
  exchange?: string;
  segment?: string;
  account_equity?: number;
  delay_hours?: number;
  wins?: number;
  total_trades?: number;
}

/** Fetch a Kuwait multi-factor technical signal from the signal engine. */
export async function getKuwaitSignal(params: KuwaitSignalParams): Promise<KuwaitSignal> {
  const { data } = await api.get<{ status: string; data: KuwaitSignal }>(
    "/api/v1/trade-signals/kuwait-signal",
    { params },
  );
  return data.data;
}

export interface TechnicalBatchRun {
  id: number;
  started_at: number | null;
  finished_at: number | null;
  status: "running" | "completed" | "failed" | string;
  triggered_by: string;
  requested_by_user_id: number | null;
  segment: string;
  total_symbols: number;
  processed_symbols: number;
  success_count: number;
  failed_count: number;
  message: string | null;
}

export interface TechnicalBatchRow {
  symbol: string;
  company_name: string | null;
  segment: string | null;
  signal: string | null;
  reason: string | null;
  trend_directional: number;
  speed_momentum: number;
  buying_pressure: number;
  key_price_level: number;
  /** Legacy display/ranking fallback, aligned to combined_score_with_adjustment on new runs. */
  overall_score: number | null;
  /** Combined score without directional trend adjustment. */
  raw_technical_score: number | null;
  /** Combined score with directional trend adjustment. */
  risk_adjusted_score: number | null;
  /** Gap = combined score without directional adjustment - with directional adjustment. */
  score_gap?: number | null;
  /** Derived action from score gap and adjusted thresholds. */
  action_recommendation?: "EXECUTE" | "HOLD" | "WATCH" | "AVOID" | "FLAG" | null;
  /** Human-readable rule explanation for the action recommendation. */
  action_note?: string | null;
  action_priority?: number | null;
  error: string | null;
}

export interface TechnicalBatchSnapshot {
  run: TechnicalBatchRun | null;
  rows: TechnicalBatchRow[];
}

export interface RunTechnicalBatchParams {
  background?: boolean;
  segment?: string;
  max_concurrency?: number;
  limit?: number;
}

export interface RunTechnicalBatchResponse {
  accepted: boolean;
  already_running: boolean;
  run: TechnicalBatchRun | null;
  summary?: {
    run_id: number;
    status: string;
    total_symbols: number;
    processed_symbols: number;
    success_count: number;
    failed_count: number;
    message: string;
  };
  message: string;
}

/** Fetch latest daily technical batch run snapshot. */
export async function getTechnicalBatchLatest(limit = 300): Promise<TechnicalBatchSnapshot> {
  const { data } = await api.get<{ status: string; data: TechnicalBatchSnapshot }>(
    "/api/v1/trade-signals/technical-batch/latest",
    { params: { limit } },
  );
  return data.data;
}

/** Fetch a specific technical batch run snapshot. */
export async function getTechnicalBatchRunById(runId: number, limit = 300): Promise<TechnicalBatchSnapshot> {
  const { data } = await api.get<{ status: string; data: TechnicalBatchSnapshot }>(
    `/api/v1/trade-signals/technical-batch/${runId}`,
    { params: { limit } },
  );
  return data.data;
}

/** Trigger technical scoring for the full Kuwait stock universe. */
export async function runTechnicalBatchScan(params: RunTechnicalBatchParams = {}): Promise<RunTechnicalBatchResponse> {
  const runInBackground = params.background ?? true;
  const { data } = await api.post<{ status: string; data: RunTechnicalBatchResponse }>(
    "/api/v1/trade-signals/technical-batch/run",
    null,
    {
      params: {
        background: runInBackground,
        segment: params.segment ?? "PREMIER",
        max_concurrency: params.max_concurrency ?? 4,
        limit: params.limit,
      },
      // Foreground full-universe scan can take several minutes.
      timeout: runInBackground ? undefined : 20 * 60 * 1000,
    },
  );
  return data.data;
}

export type ExitAction = "HOLD" | "TRIM" | "EXIT";
export type ExitUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ExitSignal {
  symbol: string;
  action: ExitAction;
  urgency: ExitUrgency;
  reasons: string[];
  current_price: number;
  entry_price: number;
  pnl_pct: number;
  trailing_stop: number;
  distance_to_stop_pct: number;
  momentum_exhaustion_score: number;
  distribution_detected: boolean;
  parabolic_extension: boolean;
  near_circuit: boolean;
  suggested_trim_pct: number;
  timestamp: string;
}

export interface PositionMonitor {
  symbol: string;
  shares: number;
  entry_price: number;
  current_price: number;
  pnl_pct: number;
  exit_signal: ExitSignal;
}

export interface ExitSignalParams {
  entry_price: number;
  bars_held?: number;
  exchange?: string;
  country?: string;
}

/** Fetch exit monitoring signal for an open position. */
export async function getExitSignal(symbol: string, params: ExitSignalParams): Promise<ExitSignal> {
  const { data } = await api.get<{ status: string; data: ExitSignal }>(
    `/api/v1/positions/${encodeURIComponent(symbol)}/exit-signal`,
    {
      params: {
        entry_price: params.entry_price,
        bars_held: params.bars_held ?? 0,
        exchange: params.exchange ?? "KSE",
        country: params.country,
      },
    },
  );
  return data.data;
}
