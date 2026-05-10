/**
 * Trade Signals API client.
 */

import { isAxiosError } from "axios";
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

export interface KuwaitSignalConfluence {
  total_score: number;
  regime: string;
  regime_confidence: number | null;
  auction_intensity: number | null;
  sub_scores: KuwaitSignalSubScores;
  raw_sub_scores: KuwaitSignalSubScores;
  liquidity_passed: boolean;
  liquidity_details: KuwaitSignalLiquidityDetails;
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
}

export interface KuwaitSignal {
  timestamp: string;
  stock_code: string;
  segment: string;
  signal: "STRONG_BUY" | "BUY" | "SELL" | "NEUTRAL";
  setup_type: string;
  execution: KuwaitSignalExecution;
  risk_metrics: KuwaitSignalRisk;
  probabilities: KuwaitSignalProbabilities;
  confluence_details: KuwaitSignalConfluence;
  entry_trigger: KuwaitEntryTrigger;
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

const SIGNAL_ENGINE_UNAVAILABLE_MESSAGE =
  "Signal engine is temporarily unavailable. Please try again shortly.";

function sanitizeSignalEngineError(err: unknown): unknown {
  if (!isAxiosError(err)) return err;
  const detail = err.response?.data?.detail;
  if (typeof detail !== "string") return err;
  const lower = detail.toLowerCase();
  if (
    lower.includes("importerror")
    || lower.includes("cannot import name")
    || lower.includes("module not found")
    || lower.includes("/workspace/")
  ) {
    if (err.response?.data && typeof err.response.data === "object") {
      (err.response.data as { detail?: string }).detail = SIGNAL_ENGINE_UNAVAILABLE_MESSAGE;
    }
  }
  return err;
}

/** Fetch a Kuwait multi-factor technical signal from the signal engine. */
export async function getKuwaitSignal(params: KuwaitSignalParams): Promise<KuwaitSignal> {
  try {
    const { data } = await api.get<{ status: string; data: KuwaitSignal }>(
      "/api/v1/trade-signals/kuwait-signal",
      { params },
    );
    return data.data;
  } catch (err) {
    throw sanitizeSignalEngineError(err);
  }
}

// ── Technical Batch (Daily Scores) ─────────────────────────────────────────

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
  overall_score: number | null;
  raw_technical_score: number | null;
  risk_adjusted_score: number | null;
  score_gap?: number | null;
  action_recommendation?: "EXECUTE" | "HOLD" | "WATCH" | "AVOID" | "FLAG" | null;
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
      timeout: runInBackground ? undefined : 20 * 60 * 1000,
    },
  );
  return data.data;
}

// ── Exit Signal (used by Holdings position monitor) ─────────────────────────

export interface ExitSignalParams {
  entry_price: number;
  bars_held: number;
  exchange?: string;
}

export interface ExitSignal {
  timestamp: string;
  action: "HOLD" | "TRIM" | "EXIT";
  confidence: number | null;
  suggested_trim_pct: number | null;
  reason: string;
  notes: string[];
}

export interface PositionMonitor {
  symbol: string;
  shares: number;
  entry_price: number;
  current_price: number;
  pnl_pct: number;
  exit_signal: ExitSignal;
}

function fallbackExitSignal(reason: string): ExitSignal {
  return {
    timestamp: new Date().toISOString(),
    action: "HOLD",
    confidence: null,
    suggested_trim_pct: null,
    reason,
    notes: [],
  };
}

function mapKuwaitSignalToExitSignal(signal: KuwaitSignal): ExitSignal {
  const raw = String(signal.signal ?? "NEUTRAL").toUpperCase();
  const action: ExitSignal["action"] =
    raw === "SELL" ? "EXIT" : raw === "NEUTRAL" ? "TRIM" : "HOLD";

  const confidenceScore = Number(signal.confluence_details?.total_score ?? NaN);
  const confidence = Number.isFinite(confidenceScore)
    ? Math.max(0, Math.min(100, Math.round(confidenceScore)))
    : null;

  const suggestedTrim = action === "TRIM" ? 25 : null;
  const notes = Array.isArray(signal.alerts) ? signal.alerts.filter(Boolean) : [];
  const reason = notes[0] ?? `Signal ${raw} from technical model`;

  return {
    timestamp: signal.timestamp ?? new Date().toISOString(),
    action,
    confidence,
    suggested_trim_pct: suggestedTrim,
    reason,
    notes,
  };
}

/**
 * Fetch an exit signal for holdings monitor.
 *
 * 1) Try dedicated backend endpoint when available.
 * 2) Fallback to Kuwait signal mapping.
 * 3) Never throw for monitor-only UI; return HOLD fallback instead.
 */
export async function getExitSignal(symbol: string, params: ExitSignalParams): Promise<ExitSignal> {
  try {
    const { data } = await api.get<{ status: string; data: ExitSignal }>(
      "/api/v1/trade-signals/exit-signal",
      { params: { symbol, ...params } },
    );
    return data.data;
  } catch {
    try {
      const signal = await getKuwaitSignal({
        symbol,
        exchange: params.exchange,
      });
      return mapKuwaitSignalToExitSignal(signal);
    } catch {
      return fallbackExitSignal("Exit signal is temporarily unavailable.");
    }
  }
}
