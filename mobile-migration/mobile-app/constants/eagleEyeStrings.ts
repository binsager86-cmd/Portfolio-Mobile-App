/**
 * Eagle Eye display strings — all human-facing text in one place.
 * Structured for easy Arabic translation addition later (just add an `ar` block).
 */

// ── Signal name map (snake_case backend key → readable label) ───────
export const SIGNAL_LABELS: Record<string, string> = {
  obv_60d_slope_strongly_positive: "OBV 60-day uptrend",
  accumulation_above_65: "Accumulation score > 65",
  accumulation_above_75: "Accumulation score > 75",
  bb_squeeze_active: "Bollinger squeeze",
  macd_histogram_turned_positive: "MACD turned positive",
  adx_crossed_20: "Trend strength emerging (ADX > 20)",
  adx_strong_trend: "Strong trend confirmed (ADX > 25)",
  plus_di_dominates: "Buyers in control (+DI > -DI)",
  rsi_in_bullish_zone: "RSI in bullish zone (50–70)",
  rsi_bullish_divergence: "RSI bullish divergence",
  cmf_above_010: "Strong buying pressure (CMF > 0.1)",
  mfi_in_bullish_zone: "Money flow bullish",
  ema_ribbon_bullish: "All EMAs aligned bullish",
  price_above_vwap: "Price above VWAP",
  volume_breakout_15x: "Volume surge (1.5× average)",
  volume_breakout_2x: "Volume surge (2× average)",
  wyckoff_in_accumulation: "Wyckoff accumulation phase",
  wyckoff_in_markup: "Wyckoff markup phase",
  above_ichimoku_cloud: "Above Ichimoku cloud",
  supertrend_bullish: "Supertrend bullish",
  // Additional raw indicator keys that appear in SignalBreakdown
  rsi: "RSI",
  macd_histogram: "MACD Histogram",
  adx: "ADX",
  cmf: "Chaikin Money Flow",
  accumulation_score: "Accumulation Score",
  obv_slope_20: "OBV Slope",
  ema_ribbon_aligned: "EMA Ribbon",
  bb_squeeze: "Bollinger Squeeze",
  mfi: "Money Flow Index",
  supertrend_signal: "Supertrend",
};

/** Return human-readable label, falling back to title-cased snake_case. */
export function signalLabel(key: string): string {
  if (SIGNAL_LABELS[key]) return SIGNAL_LABELS[key];
  // Fallback: title-case the snake_case key
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Stage name map (legacy — kept for backward compat) ───────────
export const STAGE_LABELS: Record<string, string> = {
  DORMANT: "Dormant",
  STEALTH_ACCUMULATION: "Stealth Accumulation",
  EARLY_BREAKOUT: "Early Breakout",
  MARKUP_TRENDING: "Markup / Trending",
  ACCELERATION_CLIMAX: "Acceleration / Climax",
  DISTRIBUTION_TOPPING: "Distribution / Topping",
  MARKDOWN_DECLINE: "Markdown / Decline",
  CAPITULATION_EXHAUSTION: "Capitulation / Exhaustion",
};

// ── Stage short labels — scanner list (space-constrained) ─────────
export const STAGE_LABELS_SHORT: Record<string, string> = {
  DORMANT:                 "Sleeping",
  STEALTH_ACCUMULATION:    "Accumulating",
  EARLY_BREAKOUT:          "Breaking Out",
  MARKUP_TRENDING:         "Rising",
  ACCELERATION_CLIMAX:     "Overheating",
  DISTRIBUTION_TOPPING:    "Topping",
  MARKDOWN_DECLINE:        "Falling",
  CAPITULATION_EXHAUSTION: "Bottoming",
};

// ── Stage full labels — detail / DNA screens ──────────────────────
export const STAGE_LABELS_FULL: Record<string, string> = {
  DORMANT:                 "Sleeping",
  STEALTH_ACCUMULATION:    "Quiet Buying",
  EARLY_BREAKOUT:          "Breaking Out",
  MARKUP_TRENDING:         "Rising Strong",
  ACCELERATION_CLIMAX:     "Overheating",
  DISTRIBUTION_TOPPING:    "Topping Out",
  MARKDOWN_DECLINE:        "Falling",
  CAPITULATION_EXHAUSTION: "Crashed — Possible Bottom",
};

// ── Stage tooltip descriptions ────────────────────────────────────
export const STAGE_DESCRIPTIONS: Record<string, string> = {
  DORMANT:                 "Price is flat. Wait for direction before trading.",
  STEALTH_ACCUMULATION:    "Volume is building under the radar. Possible institutional buying.",
  EARLY_BREAKOUT:          "Just broke above resistance on strong volume. Best entry point for new positions.",
  MARKUP_TRENDING:         "Clean uptrend in progress. Trade with the trend, buy pullbacks.",
  ACCELERATION_CLIMAX:     "Up too fast, too far. Take profits or wait for cooldown.",
  DISTRIBUTION_TOPPING:    "Smart money exiting while price stays high. Reduce exposure.",
  MARKDOWN_DECLINE:        "Clear downtrend. Avoid new long positions.",
  CAPITULATION_EXHAUSTION: "Major selloff exhausted. Risky but potential for sharp reversal.",
};

/** Short display label for scanner list. Falls back to raw stage name. */
export function getStageLabelShort(stage: string): string {
  return STAGE_LABELS_SHORT[stage] ?? stage;
}

/** Full display label for detail/DNA screens. Falls back to raw stage name. */
export function getStageLabelFull(stage: string): string {
  return STAGE_LABELS_FULL[stage] ?? stage;
}

/** Tooltip/info description for a stage. Falls back to empty string. */
export function getStageDescription(stage: string): string {
  return STAGE_DESCRIPTIONS[stage] ?? "";
}

// ── Rating name map ───────────────────────────────────────────────
export const RATING_LABELS: Record<string, string> = {
  STRONG_BUY: "Strong Buy",
  BUY: "Buy",
  HOLD: "Hold",
  SELL: "Sell",
  STRONG_SELL: "Strong Sell",
  INSUFFICIENT_DATA: "Insufficient Data",
};

const COMPANY_SUFFIXES = [
  " K.P.S.C.",
  " K.S.C.",
  " K.S.C.P.",
  " - K.P.S.C.",
  " Holding Company",
  " Investment Company",
  " Real Estate Company",
  " Group",
] as const;

/** Strip known legal suffixes for tighter scanner rows. */
export function cleanCompanyName(name: string): string {
  let cleaned = (name ?? "").trim();
  for (const suffix of COMPANY_SUFFIXES) {
    if (cleaned.toLowerCase().endsWith(suffix.toLowerCase())) {
      cleaned = cleaned.slice(0, cleaned.length - suffix.length).trim();
      cleaned = cleaned.replace(/\s*-\s*$/, "").trim();
    }
  }
  return cleaned || (name ?? "");
}

// ── Personality name map ──────────────────────────────────────────
export const PERSONALITY_LABELS: Record<string, string> = {
  slow_builder: "Slow Builder",
  volatile_burst: "Volatile Burst",
  high_amplitude_trender: "High Amplitude Trender",
  range_grinder: "Range Grinder",
  balanced_mover: "Balanced Mover",
};

// ── Indicator category display names ─────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  trend: "Trend",
  momentum: "Momentum",
  volume_flow: "Volume / Flow",
  volatility: "Volatility",
  structure: "Structure",
  institutional: "Institutional",
  statistical: "Statistical",
  regime: "Regime",
};

// ── Regime labels ─────────────────────────────────────────────────
export const REGIME_LABELS: Record<string, string> = {
  RISK_ON: "Risk On",
  NEUTRAL: "Neutral",
  RISK_OFF: "Risk Off",
};

// ── Stage one-line interpretations ───────────────────────────────
export const STAGE_INTERPRETATIONS: Record<string, string> = {
  DORMANT: "Stock is quiet — low volatility, low volume. Waiting for a catalyst.",
  STEALTH_ACCUMULATION: "Institutional accumulation likely underway. OBV rising while price stays flat.",
  EARLY_BREAKOUT: "Price breaking out with volume confirmation. Early entry opportunity.",
  MARKUP_TRENDING: "Established uptrend with all EMAs aligned. Trend-following conditions favourable.",
  ACCELERATION_CLIMAX: "Parabolic move underway — late-stage, high risk of reversal. Caution advised.",
  DISTRIBUTION_TOPPING: "Smart money distributing. OBV diverging despite high price. Risk elevated.",
  MARKDOWN_DECLINE: "Confirmed downtrend. Short bias or stay out until trend reversal confirmed.",
  CAPITULATION_EXHAUSTION: "Extreme oversold — potential reversal zone. Counter-trend opportunity only for experienced traders.",
};

// ── Screen/section titles ─────────────────────────────────────────
export const EE = {
  screenTitle: "Eagle Eye",
  screenSubtitle: "Kuwait stock lifecycle analysis",
  scannerTitle: "Scanner",
  detailTitle: "Analysis",
  dnaTitle: "Behavioral DNA",
  settingsTitle: "Settings",

  // Scanner
  filterSector: "Sector",
  filterTier: "Market Tier",
  filterConfidence: "Min Confidence",
  allSectors: "All Sectors",
  allTiers: "All Tiers",
  tierPremier: "Premier",
  tierMain: "Main",
  pullToRefresh: "Pull to refresh",
  noStocks: "No stocks match your filters",
  retry: "Retry",
  updatedAgo: (mins: number) => `Updated ${mins}m ago`,

  // Detail
  tradePlan: "Trade Plan",
  confluenceAnalysis: "Confluence Analysis",
  accumulation: "Accumulation & Wyckoff",
  viewDna: "View Behavioral DNA",
  setPriceAlert: "Set Price Alert",
  alertPlaceholder: "Price alerts coming soon",
  entryZone: "Entry Zone",
  stopLoss: "Stop Loss",
  targetTP1: "Target 1",
  targetTP2: "Target 2",
  targetTP3: "Target 3",
  suggestedSize: "Suggested Size",
  riskReward: "Risk : Reward",
  primary: "primary",
  aggressive: "aggressive",
  conservative: "conservative",
  probability: (pct: number) => `${Math.round(pct * 100)}%`,
  belowEntry: (pct: number) => `${pct.toFixed(1)}% below`,
  gainTarget: (pct: number) => `+${pct.toFixed(1)}%`,
  noDataAvailable: "No data available",

  // DNA
  dnaPersonality: "Personality",
  dnaStats: "Move Statistics",
  avgConsolidation: "Avg Consolidation",
  avgDuration: "Avg Move Duration",
  avgMagnitude: "Avg Magnitude",
  totalEvents: "Total Events",
  fakeouts: "Fakeouts Detected",
  earlyWarningSignals: "What fires before this stock moves",
  leadsBy: (days: number) => `fires avg ${days} days before move`,
  thresholdProfiles: "Historical Performance by Target",
  successRate: "Success Rate",
  occurrences: "Occurrences",
  avgGain: "Avg Gain",
  fakeoutSignatures: "What this engine has learned NOT to trust",
  noFakeouts: "No fakeout patterns identified yet",
  days: "days",
  bars: "bars",

  // Settings
  safetyFeatures: "Safety Features",
  liquidityCap: "Liquidity Cap",
  liquidityCapAlwaysOn: "Always on — protects exit liquidity",
  circuitBreaker: "Circuit Breaker (25% drawdown)",
  confirmLargePositions: "Confirm positions > 30%",
  positionLimits: "Position Limits",
  sectorExposureCap: "Sector Exposure Cap",
  regimeMultipliers: "Regime Multipliers (read-only)",
  regimeRiskOn: "Risk-On",
  regimeNeutral: "Neutral",
  regimeRiskOff: "Risk-Off",
  displaySection: "Display",
  minConfidenceDisplay: "Minimum confidence to show",
  defaultSort: "Default Sort",
  sortByConfidence: "Confidence",
  sortByRR: "Risk : Reward",
  saveSettings: "Save Settings",
  settingsSaved: "Settings saved",

  // Safety modal
  safetyTitle: "Large position — review before proceeding",
  safetyWorstCase: (pct: string) => `In similar setups, this stock drew down up to ${pct} before recovering`,
  safetyInsufficientHistory: "Insufficient historical data for worst-case estimate",
  proceedAnyway: "Proceed anyway",
  reduceSize: "Reduce size",

  // Loading / error
  loading: "Loading...",
  errorLoading: "Failed to load. Tap to retry.",
} as const;
