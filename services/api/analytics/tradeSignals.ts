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

export interface KuwaitSignalExecution {
  entry_zone_fils: [number | null, number | null];
  stop_loss_fils: number | null;
  tp1_fils: number | null;
  tp2_fils: number | null;
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
}

export interface KuwaitSignal {
  timestamp: string;
  stock_code: string;
  segment: string;
  signal: "BUY" | "SELL" | "NEUTRAL";
  setup_type: string;
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
