/**
 * Whale Flow Decision Engine
 * --------------------------
 * Pure TypeScript port of the institutional accumulation/distribution
 * scoring spec. Operates on EODHD OHLCV candles and outputs a calibrated,
 * auditable alert payload.
 *
 * Data quality is "estimated" because EODHD EOD does not expose tick-level
 * aggressor data. Signed flow is derived from the Accumulation/Distribution
 * multiplier (((C-L)-(H-C))/(H-L)), the same proxy used by Marc Chaikin's
 * A/D Line and Money Flow indicators.
 */

import type { WhaleTrackerCandle } from "@/services/api/analytics/whaleTracker";

// ── Types ───────────────────────────────────────────────────────────

export type Bias = "Accumulation" | "Distribution" | "Neutral";
export type Action = "BUY" | "SELL" | "WAIT";
export type Alignment = "aligned" | "mixed" | "conflicting";
export type AlertLevel = "STRONG" | "MODERATE" | "WEAK";
export type Timeframe = "daily" | "weekly";

export interface AnchoredVwapInfo {
  value: number;
  slope_5d: number;
  bounces_10d: number;
}

export interface History90d {
  net_liquidity: number[];
  rel_volume: number[];
  ad_slope: number[];
  range_atr_ratio: number[];
  vwap_position: number[];
  vwap_bounces: number[];
  vwap_slope: number[];
}

export interface EngineInput {
  ticker: string;
  timeframe: Timeframe;
  current_price: number;
  total_traded_value: number;
  net_liquidity_3d_avg: number;
  volume_today: number;
  volume_20d_avg: number;
  atr_20d: number;
  price_range_today: number;
  anchored_vwap: AnchoredVwapInfo;
  ad_line_slope_5d: number;
  cmf_10d: number;
  history_90d: History90d;
  data_quality: "direct" | "estimated";
  higher_timeframe_bias: Bias | "accumulation" | "neutral" | "distribution";
}

export interface FactorBreakdown {
  N: number;
  V: number;
  W: number;
  A: number;
  C: number;
  R: number;
  contributions: { name: string; weight: number; points: number }[];
}

export interface AlertPayload {
  alert_level: AlertLevel;
  bias: Bias;
  action: Action;
  primary_driver: string;
  confirmation_signals: string[];
  estimated_institutional_flow: string;
  timeframe_alignment: Alignment;
  key_level: string;
  invalidation: string;
  suggested_action: string;
}

export interface EngineOutput {
  ticker: string;
  timeframe: Timeframe;
  accumulation_score: number;
  distribution_score: number;
  bias: Bias;
  action: Action;
  estimated_flow_range: [number, number];
  confidence: number;
  alignment: Alignment;
  factors: FactorBreakdown;
  alert: AlertPayload;
}

// ── 1. Percentile Normalizer ────────────────────────────────────────

/**
 * Returns a 0–1 normalized score using percentile ranking against history.
 * Output is clipped to [0.05, 0.95] to dampen extreme outliers.
 */
export function normalizeFactor(
  rawValue: number,
  history: number[],
  volatilityAdjust = false,
  atr?: number,
): number {
  if (!Number.isFinite(rawValue)) return 0.5;

  let value = rawValue;
  if (volatilityAdjust && atr && atr > 0) {
    value = rawValue / atr;
  }

  const sample = history.filter((v) => Number.isFinite(v));
  if (sample.length === 0) return 0.5;

  const below = sample.filter((v) => v < value).length;
  const equal = sample.filter((v) => v === value).length;
  const pct = (below + 0.5 * equal) / sample.length;

  return Math.max(0.05, Math.min(0.95, pct));
}

// ── 2. Anchored VWAP Strength Composite ─────────────────────────────

export function calculateVwapStrength(
  price: number,
  vwap: AnchoredVwapInfo,
  history: History90d,
): number {
  // Position: distance above VWAP, ATR-normalized via percentile of history.vwap_position
  const positionRaw = vwap.value > 0 ? (price - vwap.value) / vwap.value : 0;
  const positionScore = normalizeFactor(positionRaw, history.vwap_position);

  const bounceScore = normalizeFactor(vwap.bounces_10d, history.vwap_bounces);
  const slopeScore = normalizeFactor(vwap.slope_5d, history.vwap_slope);

  return 0.4 * positionScore + 0.3 * bounceScore + 0.3 * slopeScore;
}

// ── 3. Score Calculation ────────────────────────────────────────────

export function calculateScores(
  N: number,
  V: number,
  W: number,
  A: number,
  C: number,
  R: number,
): { accumulation: number; distribution: number } {
  const accumulation = 25 * N + 20 * V + 20 * W + 15 * A + 10 * C + 10 * R;
  const distribution =
    25 * (1 - N) + 20 * (1 - V) + 20 * (1 - W) + 15 * (1 - A) + 10 * (1 - C) + 10 * (1 - R);
  return {
    accumulation: Math.round(accumulation * 100) / 100,
    distribution: Math.round(distribution * 100) / 100,
  };
}

// ── 4. Sigmoid Participation Estimation ─────────────────────────────

export function estimateParticipationRatio(
  score: number,
  k = 0.12,
  midpoint = 65,
): number {
  return 1 / (1 + Math.exp(-k * (score - midpoint)));
}

// ── 5. Confidence Factor ────────────────────────────────────────────

export function calculateConfidenceFactor(
  dataQuality: "direct" | "estimated",
  alignment: Alignment,
): number {
  const qualityMul = dataQuality === "direct" ? 1.0 : 0.8;
  const alignMul = alignment === "aligned" ? 1.0 : alignment === "mixed" ? 0.85 : 0.7;
  return Math.max(0.7, Math.min(1.0, qualityMul * alignMul));
}

// ── 6. Timeframe Alignment ──────────────────────────────────────────

export function determineAlignment(dailyScore: number, weeklyBias: string): Alignment {
  const wb = String(weeklyBias).toLowerCase();
  if (dailyScore >= 70) {
    if (wb === "accumulation") return "aligned";
    if (wb === "distribution") return "conflicting";
    return "mixed";
  }
  if (dailyScore < 40) {
    if (wb === "distribution") return "aligned";
    if (wb === "accumulation") return "conflicting";
    return "mixed";
  }
  return "mixed";
}

// ── 7. Action Decision ──────────────────────────────────────────────

export function determineAction(
  accumScore: number,
  distScore: number,
  price: number,
  anchoredVwap: number,
  adSlope: number,
  alignment: Alignment,
): Action {
  if (
    accumScore >= 70 &&
    price > anchoredVwap &&
    adSlope > 0 &&
    alignment !== "conflicting"
  ) {
    return "BUY";
  }
  if (
    distScore >= 70 &&
    price < anchoredVwap &&
    adSlope < 0 &&
    alignment !== "conflicting"
  ) {
    return "SELL";
  }
  return "WAIT";
}

// ── 8. Alert Payload ────────────────────────────────────────────────

const FACTOR_LABELS: Record<keyof Omit<FactorBreakdown, "contributions">, string> = {
  N: "Net Liquidity",
  V: "Relative Volume",
  W: "VWAP Strength",
  A: "A/D Trend",
  C: "Money Flow (CMF)",
  R: "Range Compression",
};

function buildContributions(N: number, V: number, W: number, A: number, C: number, R: number, isAccum: boolean) {
  const weights = { N: 25, V: 20, W: 20, A: 15, C: 10, R: 10 };
  const norm = isAccum
    ? { N, V, W, A, C, R }
    : { N: 1 - N, V: 1 - V, W: 1 - W, A: 1 - A, C: 1 - C, R: 1 - R };
  return (Object.keys(weights) as (keyof typeof weights)[])
    .map((k) => ({
      name: FACTOR_LABELS[k],
      weight: weights[k],
      points: Math.round(weights[k] * norm[k] * 10) / 10,
    }))
    .sort((a, b) => b.points - a.points);
}

export function generateAlert(
  ticker: string,
  price: number,
  accumScore: number,
  distScore: number,
  factors: FactorBreakdown,
  estimatedFlowRange: [number, number],
  confidence: number,
  alignment: Alignment,
  action: Action,
  vwapLevel: number,
): AlertPayload {
  const dominantScore = Math.max(accumScore, distScore);
  const alertLevel: AlertLevel =
    dominantScore >= 80 ? "STRONG" : dominantScore >= 70 ? "MODERATE" : "WEAK";

  const bias: Bias = accumScore > distScore ? "Accumulation" : "Distribution";

  const sortedContribs = factors.contributions;
  const primaryDriver = sortedContribs[0]?.name ?? "—";
  const confirmationSignals = sortedContribs.slice(1, 4).map((c) => `${c.name} (+${c.points})`);

  const flowFmt = (v: number) => formatCompact(v);
  const estimatedInstitutionalFlow = `${flowFmt(estimatedFlowRange[0])}–${flowFmt(estimatedFlowRange[1])} (${Math.round(confidence * 100)}% confidence)`;

  const keyLevel =
    bias === "Accumulation"
      ? `Break above ${(price * 1.02).toFixed(2)} on volume >2× avg confirms`
      : `Break below ${(price * 0.98).toFixed(2)} on volume >2× avg confirms`;

  const invalidationLevel =
    bias === "Accumulation" ? vwapLevel * 0.99 : vwapLevel * 1.01;
  const invalidation = `Close ${bias === "Accumulation" ? "below" : "above"} ${invalidationLevel.toFixed(2)} negates setup`;

  let suggestedAction: string;
  if (action === "BUY") {
    suggestedAction = `Initiate long on pullback to ${vwapLevel.toFixed(2)} (anchored VWAP). Stop ${(vwapLevel * 0.99).toFixed(2)}.`;
  } else if (action === "SELL") {
    suggestedAction = `Reduce/short on retest of ${vwapLevel.toFixed(2)} (anchored VWAP). Stop ${(vwapLevel * 1.01).toFixed(2)}.`;
  } else {
    suggestedAction = `Wait for confirmation. Watch ${vwapLevel.toFixed(2)} for directional break.`;
  }

  return {
    alert_level: alertLevel,
    bias,
    action,
    primary_driver: primaryDriver,
    confirmation_signals: confirmationSignals,
    estimated_institutional_flow: estimatedInstitutionalFlow,
    timeframe_alignment: alignment,
    key_level: keyLevel,
    invalidation,
    suggested_action: suggestedAction,
  };
}

// ── 9. Main Orchestrator ────────────────────────────────────────────

export function runWhaleEngine(input: EngineInput): EngineOutput {
  // Normalize factors
  const N = normalizeFactor(input.net_liquidity_3d_avg, input.history_90d.net_liquidity);
  // Relative volume is a dimensionless ratio (today / 20d avg); rank vs history of
  // the same ratio. Do NOT divide by ATR (price units ≠ volume units).
  const relVol = input.volume_20d_avg > 0 ? input.volume_today / input.volume_20d_avg : 1;
  const V = normalizeFactor(relVol, input.history_90d.rel_volume);
  const W = calculateVwapStrength(input.current_price, input.anchored_vwap, input.history_90d);
  const A = normalizeFactor(input.ad_line_slope_5d, input.history_90d.ad_slope);
  // CMF direct mapping: typical range -0.3..+0.3 → 0..1
  const C = Math.max(0.05, Math.min(0.95, (input.cmf_10d + 0.3) / 0.6));
  // Range compression: smaller range relative to ATR = tighter coil = bullish prep
  const compressionRaw = 1 / ((input.price_range_today / Math.max(input.atr_20d, 1e-6)) + 0.01);
  const R = normalizeFactor(compressionRaw, input.history_90d.range_atr_ratio);

  const { accumulation, distribution } = calculateScores(N, V, W, A, C, R);

  // Bias requires >20-pt differential, else Neutral
  const diff = accumulation - distribution;
  const bias: Bias = diff > 20 ? "Accumulation" : diff < -20 ? "Distribution" : "Neutral";

  const dominantScore = Math.max(accumulation, distribution);
  const participation = estimateParticipationRatio(dominantScore);

  const alignment = determineAlignment(accumulation, input.higher_timeframe_bias);
  const confidence = calculateConfidenceFactor(input.data_quality, alignment);

  const baseFlow = input.total_traded_value * participation * confidence;
  const flowRange: [number, number] = [baseFlow * 0.85, baseFlow * 1.15];

  const action = determineAction(
    accumulation,
    distribution,
    input.current_price,
    input.anchored_vwap.value,
    input.ad_line_slope_5d,
    alignment,
  );

  const isAccumDominant = accumulation >= distribution;
  const factors: FactorBreakdown = {
    N,
    V,
    W,
    A,
    C,
    R,
    contributions: buildContributions(N, V, W, A, C, R, isAccumDominant),
  };

  const alert = generateAlert(
    input.ticker,
    input.current_price,
    accumulation,
    distribution,
    factors,
    flowRange,
    confidence,
    alignment,
    action,
    input.anchored_vwap.value,
  );

  return {
    ticker: input.ticker,
    timeframe: input.timeframe,
    accumulation_score: Math.round(accumulation),
    distribution_score: Math.round(distribution),
    bias,
    action,
    estimated_flow_range: flowRange,
    confidence,
    alignment,
    factors,
    alert,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

// ────────────────────────────────────────────────────────────────────
// Engine input builder — derives every metric from raw OHLCV candles.
// Pure: no API calls. Caller fetches candles via getWhaleTrackerCandles.
// ────────────────────────────────────────────────────────────────────

interface EngineBuilderOptions {
  ticker: string;
  candles: WhaleTrackerCandle[];
  timeframe?: Timeframe;
  higherTimeframeBias?: Bias | "accumulation" | "neutral" | "distribution";
  vwapAnchorOffset?: number; // bars back from latest to anchor VWAP (default 30)
}

/**
 * Accumulation/Distribution multiplier — Chaikin standard.
 * Range: -1 (full distribution day) … +1 (full accumulation day).
 */
export function adMultiplier(c: WhaleTrackerCandle): number {
  const range = c.high - c.low;
  if (range <= 0) return 0;
  return ((c.close - c.low) - (c.high - c.close)) / range;
}

/** Money Flow Volume (Chaikin): A/D multiplier × volume. */
export function moneyFlowVolume(c: WhaleTrackerCandle): number {
  return adMultiplier(c) * c.volume;
}

/** Estimated signed dollar flow per session (proxy for net buy − sell value). */
export function signedDollarFlow(c: WhaleTrackerCandle): number {
  return adMultiplier(c) * c.volume * c.close;
}

/** Average True Range over `period` bars. */
export function calculateATR(candles: WhaleTrackerCandle[], period: number): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

/** Linear regression slope (least-squares) of y values across evenly spaced x. */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Anchored VWAP from `anchorIdx` to end of array. */
export function anchoredVwap(candles: WhaleTrackerCandle[], anchorIdx: number): number[] {
  const out: number[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i < anchorIdx) {
      out.push(NaN);
      continue;
    }
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    out.push(cumV > 0 ? cumPV / cumV : c.close);
  }
  return out;
}

/**
 * Count VWAP support-bounces within `window` bars.
 *
 * Definition (industry-standard): a bounce is a session where price was
 * above VWAP, intrabar wicked down to test it (low ≤ VWAP), and closed
 * back above (close ≥ VWAP). Demand defended the level.
 */
export function countVwapBounces(
  candles: WhaleTrackerCandle[],
  vwap: number[],
  window: number,
): number {
  const start = Math.max(1, candles.length - window);
  let bounces = 0;
  for (let i = start; i < candles.length; i++) {
    const v = vwap[i];
    const vPrev = vwap[i - 1];
    if (!Number.isFinite(v) || !Number.isFinite(vPrev)) continue;
    const priorAbove = candles[i - 1].close > vPrev;
    const tested = candles[i].low <= v;
    const heldAbove = candles[i].close >= v;
    if (priorAbove && tested && heldAbove) bounces++;
  }
  return bounces;
}

/** Chaikin Money Flow over `period` bars. */
export function chaikinMoneyFlow(candles: WhaleTrackerCandle[], period: number): number {
  const slice = candles.slice(-period);
  let mfv = 0;
  let vol = 0;
  for (const c of slice) {
    mfv += moneyFlowVolume(c);
    vol += c.volume;
  }
  return vol > 0 ? mfv / vol : 0;
}

/** Resample daily candles to weekly (ISO week) buckets. */
export function resampleWeekly(candles: WhaleTrackerCandle[]): WhaleTrackerCandle[] {
  if (candles.length === 0) return [];
  const buckets = new Map<string, WhaleTrackerCandle[]>();
  for (const c of candles) {
    const d = new Date(c.date);
    if (Number.isNaN(d.getTime())) continue;
    // ISO week key: year + week number
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
    const key = `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
      return {
        date: sorted[sorted.length - 1].date,
        open: sorted[0].open,
        high: Math.max(...sorted.map((c) => c.high)),
        low: Math.min(...sorted.map((c) => c.low)),
        close: sorted[sorted.length - 1].close,
        volume: sorted.reduce((s, c) => s + c.volume, 0),
      };
    });
}

/**
 * Build a complete EngineInput from raw OHLCV candles.
 * Requires at least ~30 candles; ideally 90+ for reliable percentile ranking.
 */
export function buildEngineInput(opts: EngineBuilderOptions): EngineInput | null {
  const { ticker, candles, timeframe = "daily", vwapAnchorOffset = 30 } = opts;
  if (candles.length < 25) return null;

  const tail90 = candles.slice(-90);
  const last = tail90[tail90.length - 1];

  const atr20 = calculateATR(tail90, 20);
  const vol20Avg =
    tail90.slice(-20).reduce((s, c) => s + c.volume, 0) / Math.min(20, tail90.length);

  const anchorIdx = Math.max(0, tail90.length - 1 - vwapAnchorOffset);
  const vwapSeries = anchoredVwap(tail90, anchorIdx);
  const vwapValid = vwapSeries.filter((v) => Number.isFinite(v));
  const vwapLast = vwapValid[vwapValid.length - 1] ?? last.close;
  const vwapSlope5 = linearSlope(vwapValid.slice(-5));
  const vwapBounces = countVwapBounces(tail90, vwapSeries, 10);

  // Cumulative A/D line for slope
  let cum = 0;
  const adLine: number[] = [];
  for (const c of tail90) {
    cum += moneyFlowVolume(c);
    adLine.push(cum);
  }
  const adSlope5 = linearSlope(adLine.slice(-5));

  const cmf10 = chaikinMoneyFlow(tail90, 10);

  const last3 = tail90.slice(-3);
  const netLiq3d =
    last3.reduce((s, c) => s + signedDollarFlow(c), 0) / Math.max(last3.length, 1);

  // Build 90d history arrays — rolling factor values for percentile ranking
  const history: History90d = {
    net_liquidity: [],
    rel_volume: [],
    ad_slope: [],
    range_atr_ratio: [],
    vwap_position: [],
    vwap_bounces: [],
    vwap_slope: [],
  };

  for (let i = 5; i < tail90.length; i++) {
    const window = tail90.slice(0, i + 1);
    const c = tail90[i];

    // 3-day net liq
    const w3 = window.slice(-3);
    history.net_liquidity.push(
      w3.reduce((s, x) => s + signedDollarFlow(x), 0) / Math.max(w3.length, 1),
    );

    // rel volume vs trailing 20-day avg (dimensionless; do not normalize by ATR)
    const w20 = window.slice(-21, -1);
    const avg = w20.length > 0 ? w20.reduce((s, x) => s + x.volume, 0) / w20.length : c.volume;
    const atrI = calculateATR(window, 20);
    const rel = avg > 0 ? c.volume / avg : 1;
    history.rel_volume.push(rel);

    // a/d slope over last 5 days of cumulative line
    const adWin: number[] = [];
    let cw = 0;
    for (const x of window) {
      cw += moneyFlowVolume(x);
      adWin.push(cw);
    }
    history.ad_slope.push(linearSlope(adWin.slice(-5)));

    // range / ATR — smaller is tighter coil
    const rangeRaw = c.high - c.low;
    const compress = 1 / (rangeRaw / Math.max(atrI, 1e-6) + 0.01);
    history.range_atr_ratio.push(compress);

    // vwap position
    const vIdx = Math.max(0, window.length - 1 - vwapAnchorOffset);
    const vSeries = anchoredVwap(window, vIdx);
    const vLast = vSeries[vSeries.length - 1];
    if (Number.isFinite(vLast) && vLast > 0) {
      history.vwap_position.push((c.close - vLast) / vLast);
      history.vwap_slope.push(
        linearSlope(vSeries.filter((v) => Number.isFinite(v)).slice(-5)),
      );
      history.vwap_bounces.push(countVwapBounces(window, vSeries, 10));
    }
  }

  return {
    ticker,
    timeframe,
    current_price: last.close,
    total_traded_value: last.close * last.volume,
    net_liquidity_3d_avg: netLiq3d,
    volume_today: last.volume,
    volume_20d_avg: vol20Avg,
    atr_20d: atr20,
    price_range_today: last.high - last.low,
    anchored_vwap: {
      value: vwapLast,
      slope_5d: vwapSlope5,
      bounces_10d: vwapBounces,
    },
    ad_line_slope_5d: adSlope5,
    cmf_10d: cmf10,
    history_90d: history,
    data_quality: "estimated",
    higher_timeframe_bias: opts.higherTimeframeBias ?? "neutral",
  };
}

/**
 * One-shot convenience: derive weekly bias from candles, then run daily engine.
 */
export function analyzeCandles(ticker: string, candles: WhaleTrackerCandle[]): EngineOutput | null {
  if (candles.length < 25) return null;

  // Weekly bias
  const weekly = resampleWeekly(candles);
  let weeklyBias: Bias | "accumulation" | "neutral" | "distribution" = "neutral";
  if (weekly.length >= 8) {
    const weeklyInput = buildEngineInput({
      ticker,
      candles: weekly,
      timeframe: "weekly",
      higherTimeframeBias: "neutral",
      vwapAnchorOffset: Math.min(8, weekly.length - 2),
    });
    if (weeklyInput) {
      const weeklyOut = runWhaleEngine(weeklyInput);
      weeklyBias =
        weeklyOut.bias === "Accumulation"
          ? "accumulation"
          : weeklyOut.bias === "Distribution"
            ? "distribution"
            : "neutral";
    }
  }

  const dailyInput = buildEngineInput({ ticker, candles, higherTimeframeBias: weeklyBias });
  if (!dailyInput) return null;
  return runWhaleEngine(dailyInput);
}
