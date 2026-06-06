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

// ── Stage name map (rules-first taxonomy) ─────────────────────────
export const STAGE_LABELS: Record<string, string> = {
  ACCUMULATION: "Accumulation",
  EARLY_MARKUP: "Early Markup",
  MARKUP: "Markup",
  DISTRIBUTION: "Distribution",
  MARKDOWN: "Markdown",
  NEUTRAL_AMBIGUOUS: "Neutral / Ambiguous",
  INSUFFICIENT_HISTORY: "Insufficient History",
  INACTIVE_OR_DELISTED: "Inactive / Delisted",
  INDICATOR_UNAVAILABLE: "Indicator Unavailable",

  // Legacy aliases (display-only fallback for stale cache rows)
  DORMANT: "Neutral / Ambiguous",
  STEALTH_ACCUMULATION: "Accumulation",
  EARLY_BREAKOUT: "Early Markup",
  MARKUP_TRENDING: "Markup",
  ACCELERATION_CLIMAX: "Distribution",
  DISTRIBUTION_TOPPING: "Distribution",
  MARKDOWN_DECLINE: "Markdown",
  CAPITULATION_EXHAUSTION: "Markdown",
};

// ── Stage short labels — scanner list (space-constrained) ─────────
export const STAGE_LABELS_SHORT: Record<string, string> = {
  ACCUMULATION: "Accumulating",
  EARLY_MARKUP: "Turning Up",
  MARKUP: "Rising",
  DISTRIBUTION: "Topping",
  MARKDOWN: "Falling",
  NEUTRAL_AMBIGUOUS: "Mixed",
  INSUFFICIENT_HISTORY: "Low History",
  INACTIVE_OR_DELISTED: "Inactive",
  INDICATOR_UNAVAILABLE: "No Indicators",

  DORMANT: "Mixed",
  STEALTH_ACCUMULATION: "Accumulating",
  EARLY_BREAKOUT: "Turning Up",
  MARKUP_TRENDING: "Rising",
  ACCELERATION_CLIMAX: "Topping",
  DISTRIBUTION_TOPPING: "Topping",
  MARKDOWN_DECLINE: "Falling",
  CAPITULATION_EXHAUSTION: "Falling",
};

// ── Stage full labels — detail / DNA screens ──────────────────────
export const STAGE_LABELS_FULL: Record<string, string> = {
  ACCUMULATION: "Accumulation (Bottoming)",
  EARLY_MARKUP: "Early Markup (Breakout Setup)",
  MARKUP: "Markup (Uptrend)",
  DISTRIBUTION: "Distribution (Risk-Off)",
  MARKDOWN: "Markdown (Downtrend)",
  NEUTRAL_AMBIGUOUS: "Neutral / Ambiguous",
  INSUFFICIENT_HISTORY: "Insufficient History",
  INACTIVE_OR_DELISTED: "Inactive / Delisted",
  INDICATOR_UNAVAILABLE: "Indicator Unavailable",

  DORMANT: "Neutral / Ambiguous",
  STEALTH_ACCUMULATION: "Accumulation (Bottoming)",
  EARLY_BREAKOUT: "Early Markup (Breakout Setup)",
  MARKUP_TRENDING: "Markup (Uptrend)",
  ACCELERATION_CLIMAX: "Distribution (Risk-Off)",
  DISTRIBUTION_TOPPING: "Distribution (Risk-Off)",
  MARKDOWN_DECLINE: "Markdown (Downtrend)",
  CAPITULATION_EXHAUSTION: "Markdown (Downtrend)",
};

// ── Stage tooltip descriptions ────────────────────────────────────
export const STAGE_DESCRIPTIONS: Record<string, string> = {
  ACCUMULATION: "Accumulating (Accumulation): Quietly being picked up at the bottom.",
  EARLY_MARKUP: "Turning Up (Early Markup): The move is starting with buyers stepping in.",
  MARKUP: "Rising (Markup): In a steady uptrend.",
  DISTRIBUTION: "Topping (Distribution): Topping out and being quietly sold.",
  MARKDOWN: "Falling (Markdown): In a downtrend with money leaving.",
  NEUTRAL_AMBIGUOUS: "Mixed / Neutral: No clear signal right now.",
  INSUFFICIENT_HISTORY: "Not enough price history to compute a reliable stage.",
  INACTIVE_OR_DELISTED: "Recent market activity is too weak or inactive for trading analysis.",
  INDICATOR_UNAVAILABLE: "Required indicators are unavailable right now.",

  DORMANT: "Mixed / Neutral: No clear signal right now.",
  STEALTH_ACCUMULATION: "Accumulating (Accumulation): Quietly being picked up at the bottom.",
  EARLY_BREAKOUT: "Turning Up (Early Markup): The move is starting with buyers stepping in.",
  MARKUP_TRENDING: "Rising (Markup): In a steady uptrend.",
  ACCELERATION_CLIMAX: "Topping (Distribution): Topping out and being quietly sold.",
  DISTRIBUTION_TOPPING: "Topping (Distribution): Topping out and being quietly sold.",
  MARKDOWN_DECLINE: "Falling (Markdown): In a downtrend with money leaving.",
  CAPITULATION_EXHAUSTION: "Falling (Markdown): In a downtrend with money leaving.",
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

// ── Rating helper descriptions ───────────────────────────────────
export const RATING_DESCRIPTIONS: Record<string, string> = {
  CONTINUE_RISING: "Continuation lane: breakout is already underway, buyers remain in control, and trend exhaustion is still limited.",
  STRONG_BUY: "Strong Buy: Strong setup with multiple confirmations.",
  BUY: "Buy: A genuine setup with real buying support.",
  WATCHLIST: "Watchlist: Forming but not confirmed yet. Watch closely.",
  HOLD: "Hold: Healthy trend if you already own it, but not a fresh entry.",
  NEUTRAL: "Neutral: No clear action right now.",
  REDUCE: "Reduce: Showing weakness or topping. Consider trimming.",
  SELL: "Sell: Confirmed decline. Consider exiting.",
  STRONG_SELL: "Strong Sell: Strong downtrend with confirmation.",
  AVOID: "Avoid: Poor quality, illiquid, or actively dangerous.",
  INSUFFICIENT_DATA: "Insufficient Data: Not enough reliable evidence yet.",
};

/** Tooltip/info description for a rating. Falls back to empty string. */
export function getRatingDescription(rating: string): string {
  return RATING_DESCRIPTIONS[rating] ?? "";
}

/** Confidence band label in plain language. */
export function getConfidenceBand(confidence: number): string {
  if (confidence >= 75) return "Strong";
  if (confidence >= 60) return "Solid";
  if (confidence >= 45) return "Moderate";
  return "Weak";
}

/** Confidence helper text for tooltips. */
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 75) {
    return "Strong (75-100): Most evidence agrees. High-conviction signal.";
  }
  if (confidence >= 60) {
    return "Solid (60-75): Good evidence, with a few mixed signals.";
  }
  if (confidence >= 45) {
    return "Moderate (45-60): Real but incomplete evidence.";
  }
  return "Weak (below 45): Early or thin evidence. Treat with caution.";
}

/** Combined helper for the common rating + confidence confusion. */
export function getRatingConfidenceDescription(
  rating: string,
  confidence: number,
): string {
  const confLine = getConfidenceDescription(confidence);
  const normalized = (rating ?? "").toUpperCase();

  if ((normalized === "BUY" || normalized === "WATCHLIST" || normalized === "STRONG_BUY") && confidence < 60) {
    return `${confLine} Direction is bullish, but confirmation is still thin. Early flag, not a green light.`;
  }
  if ((normalized === "SELL" || normalized === "REDUCE" || normalized === "STRONG_SELL" || normalized === "AVOID") && confidence < 60) {
    return `${confLine} Weakness is showing, but confirmation is still developing.`;
  }
  return `${confLine} Rating shows direction. Confidence shows how much the evidence agrees.`;
}

// ── Rating name map ───────────────────────────────────────────────
export const RATING_LABELS: Record<string, string> = {
  CONTINUE_RISING: "Riding",
  BUY: "Buy",
  WATCHLIST: "Watchlist",
  HOLD: "Hold",
  NEUTRAL: "Neutral",
  REDUCE: "Reduce",
  SELL: "Sell",
  AVOID: "Avoid",

  // Legacy aliases
  STRONG_BUY: "Buy",
  STRONG_SELL: "Sell",
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
  ACCUMULATION: "Bottoming behavior is forming with early internal improvement.",
  EARLY_MARKUP: "Trend turn is underway and breakout conditions are starting to align.",
  MARKUP: "Trend is established and constructive for managing long exposure.",
  DISTRIBUTION: "Risk-off behavior is building as upside momentum fades.",
  MARKDOWN: "Downtrend is active; preservation mode is preferred.",
  NEUTRAL_AMBIGUOUS: "Signals conflict; edge is weak until conditions resolve.",
  INSUFFICIENT_HISTORY: "Not enough bars for full stage classification.",
  INACTIVE_OR_DELISTED: "Activity is too low to support reliable analysis.",
  INDICATOR_UNAVAILABLE: "Required indicator set is currently unavailable.",

  DORMANT: "Signals conflict; edge is weak until conditions resolve.",
  STEALTH_ACCUMULATION: "Bottoming behavior is forming with early internal improvement.",
  EARLY_BREAKOUT: "Trend turn is underway and breakout conditions are starting to align.",
  MARKUP_TRENDING: "Trend is established and constructive for managing long exposure.",
  ACCELERATION_CLIMAX: "Risk-off behavior is building as upside momentum fades.",
  DISTRIBUTION_TOPPING: "Risk-off behavior is building as upside momentum fades.",
  MARKDOWN_DECLINE: "Downtrend is active; preservation mode is preferred.",
  CAPITULATION_EXHAUSTION: "Downtrend is active; preservation mode is preferred.",
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
  pullbackEntry: "Pullback Entry",
  stopLoss: "Stop Loss",
  targetTP1: "Target 1",
  targetTP2: "Target 2",
  targetTP3: "Target 3",
  suggestedSize: "Suggested Size",
  riskReward: "Risk : Reward",
  activePlan: "Active Plan",
  conditionalPlan: "Conditional Setup",
  declinedPlan: "Stand Aside",
  conditionalHeadline: (price: number) => `Setup forms if price pulls back to ${price.toFixed(3)}`,
  conditionalFooter: (rr: number) => `If triggered: 1 : ${rr.toFixed(1)}`,
  declinedBody: "No favorable entry at current price — reward doesn't justify risk. Waiting for a better setup.",
  primary: "primary",
  aggressive: "aggressive",
  conservative: "conservative",
  probability: (pct: number) => `${Math.round(pct * 100)}%`,
  belowEntry: (pct: number) => `${pct.toFixed(1)}% below`,
  gainTarget: (pct: number) => `+${pct.toFixed(1)}%`,
  noDataAvailable: "No data available",

  // DNA
  dnaPersonality: "Personality",
  dnaStats: "Historical Base Rates",
  avgConsolidation: "Avg Consolidation",
  avgDuration: "Avg Move Duration",
  avgMagnitude: "Avg Magnitude",
  totalEvents: "Matching Setups",
  fakeouts: "Fakeouts Detected",
  earlyWarningSignals: "Common Ingredients in This Setup",
  leadsBy: (days: number) => `fires avg ${days} days before move`,
  thresholdProfiles: "What Happened Next",
  successRate: "Success Rate",
  occurrences: "Occurrences",
  avgGain: "Avg Gain",
  avgGainAllShort: "All",
  avgGainHitsShort: "Hits",
  ofEvents: "of events",
  setupSignals: "Current setup fingerprint",
  setupHeadline: (count: number, days?: number | null) =>
    `When this setup appeared in the past ${count} time${count === 1 ? "" : "s"}, here is what happened next${days ? ` within ${days} trading days` : ""}:`,
  setupDisclaimer:
    "Based on this stock's own history. Past setups do not predict future results. Sample size affects reliability.",
  limitedData: (count: number) => `Limited data: only ${count} matching setups found. Read these base rates cautiously.`,
  insufficientHistoryTitle: "Insufficient Setup History",
  insufficientHistoryBody: (count: number) =>
    `Only ${count} matching setups were found. At least 20 are required before showing historical percentages for this setup.`,
  setupHorizon: "Forward Horizon",
  expectedGain: "Avg Gain Across All Setups",
  hitGain: "Avg Gain When Target Hit",
  reachedTarget: (target: number) => `Reached +${target.toFixed(0)}%`,
  ofSetups: "of setups",
  fakeoutSignatures: "What this engine has learned NOT to trust",
  dnaIntro: (ticker: string, days?: number | null) => {
    const windowText = days
      ? `over the next ${days} trading days`
      : "after the pattern appears";
    return `Behavioral DNA looks at every time ${ticker} showed this same pattern in the past, then checks what the price did ${windowText}. It is a history lesson about this one stock, not a prediction. More past examples make it more reliable.`;
  },
  setupSummaryTitle: "Setup Summary",
  setupCountLine: (ticker: string, count: number) =>
    `${ticker} has shown this pattern ${count} time${count === 1 ? "" : "s"} in the history we checked.`,
  scoreExplainTitle: "Why this score and recommendation?",
  scoreExplainBody:
    "This combines live signal conditions with this stock's own Behavioral DNA history, so you can see exactly what influenced the current score and call.",
  scoreExplainRecommendationLabel: "Recommendation",
  scoreExplainConfidenceLabel: "Score",
  scoreExplainStageLabel: "Stage",
  scoreExplainThesisLabel: "Engine thesis",
  scoreExplainDriversLabel: "Score is based on",
  scoreExplainRecommendationWhyLabel: "Why this recommendation",
  scoreExplainNoRecommendation:
    "Live recommendation details are unavailable right now. DNA history above still shows how this pattern behaved in the past.",
  scoreDriverHitRate: (target: number, hits: number, total: number, rate: number) =>
    `Historical hit rate: +${Math.round(target)}% was reached in ${hits} of ${total} setups (${rate}%).`,
  scoreDriverAvgMove: (gain: string) => `Typical move after this setup: ${gain}.`,
  scoreDriverDataConfidence: (count: number, label: string) =>
    `Data confidence: ${label} (${count} completed setups).`,
  scoreDriverPatternSignals: (signals: string) =>
    `Current setup fingerprint matched: ${signals}.`,
  scoreDriverLiveSignals: (signals: string) =>
    `Live engine signals currently firing: ${signals}.`,
  recommendationBuy: (confidence: number) =>
    `Buy is assigned because confidence is ${confidence}% with constructive stage conditions and positive signal alignment.`,
  recommendationWatchlist: (confidence: number) =>
    `Watchlist is assigned at ${confidence}% because setup quality is improving but still needs confirmation before full conviction.`,
  recommendationHold: (confidence: number) =>
    `Hold is assigned because confidence is ${confidence}% and the trend remains constructive, but reward-to-risk is less compelling for fresh entries.`,
  recommendationNeutral: (confidence: number) =>
    `Neutral is assigned at ${confidence}% because current evidence is mixed and does not support a strong directional edge.`,
  recommendationReduce: (confidence: number) =>
    `Reduce is assigned because confidence is ${confidence}% and distribution-style risk is rising. Trimming exposure is prudent.`,
  recommendationSell: (confidence: number) =>
    `Sell is assigned because confidence in upside is low (${confidence}%) and markdown conditions are dominant.`,
  recommendationAvoid: (confidence: number) =>
    `Avoid is assigned because confidence is ${confidence}% and the setup does not justify taking risk right now.`,

  // Legacy aliases for older rating values
  recommendationStrongBuy: (confidence: number) =>
    `Buy is assigned because confidence is ${confidence}% with constructive stage conditions and positive signal alignment.`,
  recommendationStrongSell: (confidence: number) =>
    `Avoid is assigned because confidence is ${confidence}% and the setup does not justify taking risk right now.`,
  recommendationInsufficientData:
    "Insufficient Data is assigned because there is not enough reliable setup history and current signal evidence to form a robust call.",
  recommendationFallback: (rating: string, confidence: number) =>
    `${rating} is assigned at ${confidence}% confidence based on current stage, signal confluence, and historical setup outcomes.`,
  forwardWindowLine: (days?: number | null) => {
    if (!days) return "We measured what happened after the pattern appeared.";
    const weeks = Math.max(1, Math.round(days / 5));
    return `We measured what happened over the next ${days} trading days (about ${weeks} week${weeks === 1 ? "" : "s"}).`;
  },
  patternMatchedNow: "Pattern matched now",
  typicalResultTitle: "Typical result",
  typicalResultBody: (value: string) => `All past setups, wins and losses included: ${value}`,
  typicalResultCaption: "wins and losses included",
  targetOutcomeLine: (target: number, hits: number, total: number, rate: number) =>
    `Reached +${Math.round(target)}% in ${hits} of ${total} past setups (${rate}%)`,
  avgHitLine: (value: string) => `When it did hit, the average gain was ${value}`,
  noHitLine: "This target did not hit often enough to show a reliable average gain.",
  strengthStrong: "Strong",
  strengthModerate: "Moderate",
  strengthWeak: "Weak / thin data",
  patternLooksLikeTitle: "What This Pattern Looks Like",
  patternLooksLikeBody:
    "These are the ingredients that showed up most often when this setup appeared in the past.",
  signalSeenLine: (pct: number, fired: number, total: number) =>
    `Seen in ${pct}% of these setups (${fired} of ${total})`,
  insufficientHistoryHonestTitle: "Not enough history yet",
  insufficientHistoryHonestBody: (ticker: string, count: number, minCount = 20) =>
    `${ticker} has only shown this pattern ${count} time${count === 1 ? "" : "s"} so far, which is too few to draw reliable conclusions. We need at least ${minCount} past examples before showing success rates.`,
  dataAnomalyTitle: "Data anomaly",
  dataAnomalyBody:
    "Bigger targets should usually get harder to reach. This stock's past results do not follow that pattern cleanly, so read the ladder with extra caution.",
  howToReadTitle: "How to Read This",
  howToReadBody:
    "A strong signal means this stock often rose after this pattern, but past results never guarantee the future. Always check your own risk before acting. Thin-volume stocks are less reliable.",
  dnaWindowSelector: "Review window",
  dnaWindowTab: (days: number) => `${days}d`,
  dnaConfidenceTitle: "Confidence",
  dnaConfidenceLine: (count: number, label: string) =>
    `${count} completed setup${count === 1 ? "" : "s"}. ${label}.`,
  dnaSelectedWindowNote: (days: number) => `Viewing the next ${days} trading days after the setup.`,
  dnaInflationNote: (days: number) =>
    `${days}-day windows naturally look stronger because price has more time to travel. Compare them against 20d on a like-for-like basis.`,
  dnaTooThinPercentages: (count: number, floor: number) =>
    `Only ${count} completed setup${count === 1 ? "" : "s"} exist for this window. We need at least ${floor} before showing percentages, but the visual evidence still appears below.`,
  dnaObservationsTitle: "What the machine saw",
  dnaObservationsBody:
    "Every observation marker is causal. It fired on or before the setup bar, not after the outcome was known.",
  dnaVisualEvidenceTitle: "Visual setup evidence",
  dnaVisualEvidenceBody:
    "These are real historical examples of the same setup. The shaded block is the setup window and the dashed line marks the selected review window.",
  dnaCurrentChartTitle: "Current chart (same setup indicators)",
  dnaCurrentChartBody: (days: number, rangeLabel: string) =>
    `This shows the latest ${rangeLabel} of price action using the same setup indicators as historical examples (RSI, ADX, MACD). The shaded block marks the current setup window and the dashed marker tracks a ${days}-day comparison horizon.`,
  dnaCurrentRangeLabel: "Chart range",
  dnaCurrentRange1m: "1 month",
  dnaCurrentRange3m: "3 months",
  dnaCurrentRange6m: "6 months",
  dnaCurrentRange9m: "9 months",
  dnaCurrentRange1y: "1 year",
  dnaCurrentRange2y: "2 years",
  dnaCurrentChartLoading: "Loading latest chart data...",
  dnaCurrentChartNoData:
    "Recent chart data is not available right now, but historical setup examples are still shown below.",
  dnaCurrentChartError:
    "Could not load the recent chart. Pull to refresh and try again.",
  dnaCurrentChartFootnote: (setupDate: string, latestDate: string) =>
    `Current setup anchored on ${setupDate} with latest bar at ${latestDate}. Use this panel to compare today's structure versus the historical examples below.`,
  dnaCurrentChartCoverage: (rangeLabel: string, startDate: string, latestDate: string, bars: number) =>
    `Showing ${rangeLabel}: ${bars} bars from ${startDate} to ${latestDate}.`,
  dnaExampleTitle: (date: string) => `Historical setup from ${date}`,
  dnaExampleOutcome: (days: number, gain: string, completed: boolean) =>
    completed
      ? `Within ${days} trading days, the max gain reached ${gain}.`
      : `This example does not have a complete ${days}-day forward window yet.`,
  dnaTargetsHit: (targets: number[]) =>
    targets.length > 0
      ? `Targets hit: ${targets.map((target) => `+${Math.round(target)}%`).join(", ")}.`
      : "No tracked target was hit in this window.",
  dnaNoExamples: "No historical setup charts are available yet.",
  dnaUpdatedAt: (isoStr: string) => {
    // e.g. "2026-05-23T14:05:00" → "May 23, 2026"
    const d = new Date(isoStr);
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return `Updated nightly · Last computed: ${label}`;
  },
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
  warmingUp: "Eagle Eye is warming up…",
  warmingUpSub: "Analysis runs in the background. Refresh in a moment.",

  // ML Phase 3
  mlColumnHeader: "ML",
  mlDisclaimerTitle: "EXPERIMENTAL: ML signals are in active evaluation.",
  mlDisclaimerBody:
    "Do not use for trading decisions yet. Compare with rule-based confidence column. Auto-disable triggers active.",
  mlDisclaimerDismiss: "Dismiss for session",
  mlAutoDisabled: "⚠️ ML signals auto-disabled. Calibration anomaly detected. Investigating.",
  mlDisabled: "ML signals temporarily disabled.",
  mlMethodologyLink: "What does this mean?",
  mlSignalCardTitle: "ML Signal",
  mlCollectingData: "Collecting baseline data",
  mlInsufficientVariance: "Insufficient model variance",
  mlNotActive: "ML not active for this stock",
  mlExperimentalNote: "⚠️ EXPERIMENTAL — do not trade on this signal yet.",
  mlBandHigh: "HIGH",
  mlBandMed: "MED",
  mlBandLow: "LOW",
  mlCalibrationVerdict: "Calibration verdict",
  mlBandDescription: (band: string, pct: string) =>
    band === "HIGH"
      ? `Above ${pct} percentile of recent 90 days`
      : band === "LOW"
      ? `Below ${pct} percentile of recent 90 days`
      : `Within middle range of recent 90 days`,
} as const;
