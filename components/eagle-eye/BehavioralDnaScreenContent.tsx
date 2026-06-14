/* eslint-disable custom-styles/no-hardcoded-styles */

import { BehavioralDnaSetupChart } from "@/components/eagle-eye/BehavioralDnaSetupChart";
import { DnaCycleCard } from "@/components/eagle-eye/DnaCycleCard";
import { DnaSimilarSetupsCard } from "@/components/eagle-eye/DnaSimilarSetupsCard";
import { EE, RATING_LABELS, getStageLabelFull, signalLabel } from "@/constants/eagleEyeStrings";
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type {
  BehavioralDNA,
  DnaSetupExample,
  DnaSetupBar,
  DnaWindowProfile,
  ExitSignalProfile,
  FullStockAnalysis,
  PostDropBehavior,
  PreDropSignal,
  SignalItem,
  SignalReliabilityStat,
  ThresholdProfile,
} from "@/hooks/useEagleEye";
import { useSimilarSetups } from "@/hooks/useEagleEye";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const MAX_INITIAL_EXAMPLES = 3;

const CURRENT_RANGE_OPTIONS = [
  { key: "1M", bars: 22 },
  { key: "3M", bars: 66 },
  { key: "6M", bars: 132 },
  { key: "9M", bars: 198 },
  { key: "1Y", bars: 252 },
  { key: "2Y", bars: 504 },
] as const;

type CurrentRangeKey = (typeof CURRENT_RANGE_OPTIONS)[number]["key"];
const DEFAULT_CURRENT_RANGE: CurrentRangeKey = "1Y";

function getCurrentRangeLabel(range: CurrentRangeKey): string {
  switch (range) {
    case "1M":
      return EE.dnaCurrentRange1m;
    case "3M":
      return EE.dnaCurrentRange3m;
    case "6M":
      return EE.dnaCurrentRange6m;
    case "9M":
      return EE.dnaCurrentRange9m;
    case "1Y":
      return EE.dnaCurrentRange1y;
    case "2Y":
      return EE.dnaCurrentRange2y;
    default:
      return EE.dnaCurrentRange1y;
  }
}

function formatSignedWholePct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value)}%`;
}

function formatSignedPrecisePct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function parseNumericWindow(windowKey: string): number | null {
  const parsed = Number.parseInt(windowKey, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatRatingLabel(rating?: string | null): string {
  if (!rating) return "-";
  const fromMap = RATING_LABELS[rating];
  if (fromMap) return fromMap;
  return rating
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function buildRecommendationExplanation(stock: FullStockAnalysis): string {
  const confidence = Math.round(stock.confidence ?? 0);
  switch (stock.rating) {
    case "BUY":
      return EE.recommendationBuy(confidence);
    case "WATCHLIST":
      return EE.recommendationWatchlist(confidence);
    case "HOLD":
      return EE.recommendationHold(confidence);
    case "NEUTRAL":
      return EE.recommendationNeutral(confidence);
    case "REDUCE":
      return EE.recommendationReduce(confidence);
    case "SELL":
      return EE.recommendationSell(confidence);
    case "AVOID":
      return EE.recommendationAvoid(confidence);
    case "STRONG_BUY":
      return EE.recommendationStrongBuy(confidence);
    case "STRONG_SELL":
      return EE.recommendationStrongSell(confidence);
    case "INSUFFICIENT_DATA":
      return EE.recommendationInsufficientData;
    default:
      return EE.recommendationFallback(formatRatingLabel(stock.rating), confidence);
  }
}

type ObservationBucketKey = "bottom" | "confirmation" | "market";

const OBSERVATION_KEYWORDS: Record<ObservationBucketKey, string[]> = {
  bottom: [
    "accumulation",
    "wyckoff",
    "near_60d_low",
    "oversold",
    "capitulation",
    "obv",
    "cmf",
    "mfi",
    "sma200_slope_turning_up",
  ],
  confirmation: [
    "breakout",
    "price_above_vwap",
    "ema",
    "macd",
    "adx",
    "plus_di",
    "supertrend",
    "ichimoku",
    "volume_breakout",
    "markup",
  ],
  market: [
    "market_",
    "relative_strength_3m",
    "regime",
    "breadth",
    "index",
    "risk_on",
  ],
};

function matchesObservationBucket(signalKey: string, bucket: ObservationBucketKey): boolean {
  const key = signalKey.toLowerCase();
  return OBSERVATION_KEYWORDS[bucket].some((token) => key.includes(token));
}

function formatSignalObservationLine(signal: SignalItem): string {
  const label = signalLabel(signal.signal);
  const detail = (signal.description ?? "").trim();
  if (detail.length > 0) {
    return `${label}: ${detail}`;
  }
  return EE.scoreExplainObserveFallback(label);
}

function buildObservationBuckets(signals: SignalItem[] | null | undefined): Record<ObservationBucketKey, string[]> {
  const buckets: Record<ObservationBucketKey, string[]> = {
    bottom: [],
    confirmation: [],
    market: [],
  };

  const seenSignals = new Set<string>();
  const firedSignals = (signals ?? []).filter((signal) => signal.fired);

  for (const signal of firedSignals) {
    if (seenSignals.has(signal.signal)) continue;
    seenSignals.add(signal.signal);

    const line = formatSignalObservationLine(signal);

    if (matchesObservationBucket(signal.signal, "market")) {
      buckets.market.push(line);
      continue;
    }

    if (matchesObservationBucket(signal.signal, "bottom")) {
      buckets.bottom.push(line);
      continue;
    }

    buckets.confirmation.push(line);
  }

  return {
    bottom: buckets.bottom.slice(0, 4),
    confirmation: buckets.confirmation.slice(0, 4),
    market: buckets.market.slice(0, 4),
  };
}

function pickDisplayedProfiles(profiles: ThresholdProfile[]): ThresholdProfile[] {
  if (profiles.length <= 3) {
    return [...profiles].sort((left, right) => left.threshold_pct - right.threshold_pct);
  }

  const preferredTargets = [15, 25, 50];
  const picked = preferredTargets
    .map((target) => profiles.find((profile) => Math.round(profile.threshold_pct) === target))
    .filter((profile): profile is ThresholdProfile => !!profile);

  const base = picked.length > 0 ? picked : profiles.slice(0, 3);
  return [...base].sort((left, right) => left.threshold_pct - right.threshold_pct);
}

function getSignalSetupCount(signalStat: SignalReliabilityStat): number {
  return Math.max(signalStat.total_setups ?? 0, signalStat.total_events ?? 0, signalStat.fired_count ?? 0);
}

function getStrengthState(successRate: number, setupCount: number, colors: ThemePalette) {
  if (successRate >= 60 && setupCount >= 20) {
    return {
      label: EE.strengthStrong,
      textColor: colors.success,
      barColor: colors.success,
      borderColor: colors.success,
      backgroundColor: colors.bgCardHover,
    };
  }

  if (successRate >= 40 || setupCount >= 10) {
    return {
      label: EE.strengthModerate,
      textColor: colors.warning,
      barColor: colors.warning,
      borderColor: colors.warning,
      backgroundColor: colors.bgCardHover,
    };
  }

  return {
    label: EE.strengthWeak,
    textColor: colors.textMuted,
    barColor: colors.textMuted,
    borderColor: colors.borderColor,
    backgroundColor: colors.bgCardHover,
  };
}

function getConfidenceState(confidenceTier: string | undefined, colors: ThemePalette) {
  switch (confidenceTier) {
    case "ESTABLISHED":
      return {
        textColor: colors.success,
        backgroundColor: colors.successBg,
        borderColor: colors.success,
      };
    case "BUILDING":
      return {
        textColor: colors.warningText,
        backgroundColor: colors.warningBg,
        borderColor: colors.warning,
      };
    case "EARLY":
      return {
        textColor: colors.accentPrimary,
        backgroundColor: colors.bgCardHover,
        borderColor: colors.accentPrimary,
      };
    default:
      return {
        textColor: colors.textMuted,
        backgroundColor: colors.bgCardHover,
        borderColor: colors.borderColor,
      };
  }
}

function hasDataAnomaly(profiles: ThresholdProfile[]): boolean {
  for (let index = 1; index < profiles.length; index += 1) {
    if ((profiles[index]?.success_rate ?? 0) > (profiles[index - 1]?.success_rate ?? 0)) {
      return true;
    }
  }
  return false;
}

function buildWindowList(dna: BehavioralDNA): number[] {
  const fromProfiles = (dna.window_profiles ?? []).map((profile) => profile.horizon_days);
  const fromData = dna.available_window_days ?? [];
  const fallback = dna.setup_horizon_days != null ? [dna.setup_horizon_days] : [];
  return [...new Set([...fromData, ...fromProfiles, ...fallback].filter((window) => window != null))].sort((left, right) => left - right);
}

function findSelectedProfile(dna: BehavioralDNA, selectedWindow: number): DnaWindowProfile | null {
  return dna.window_profiles?.find((profile) => profile.horizon_days === selectedWindow) ?? null;
}

function buildCurrentComparisonExample(bars: DnaSetupBar[], selectedWindow: number): DnaSetupExample | null {
  const cleanBars = bars.filter((bar) => bar.close != null && !Number.isNaN(bar.close));
  if (cleanBars.length < 8) {
    return null;
  }

  const horizonDays = Math.max(5, selectedWindow);
  const forwardReserve = Math.max(3, Math.min(horizonDays, Math.floor(cleanBars.length / 3)));
  const setupBarIndex = Math.max(0, cleanBars.length - forwardReserve - 1);
  const setupWindowLen = Math.min(25, setupBarIndex + 1);
  const setupWindowStartIndex = Math.max(0, setupBarIndex - setupWindowLen + 1);
  const setupWindowEndIndex = setupBarIndex;
  const availableForwardBars = cleanBars.length - setupWindowEndIndex - 1;
  const inspectedForwardBars = Math.min(availableForwardBars, horizonDays);
  const forwardEndIndex = setupWindowEndIndex + inspectedForwardBars;

  const setupClose = cleanBars[setupWindowEndIndex]?.close ?? null;
  let maxGainPct: number | null = null;
  let maxGainDate: string | null = null;

  if (setupClose != null && setupClose > 0) {
    for (let index = setupWindowEndIndex + 1; index <= forwardEndIndex; index += 1) {
      const candidateHigh = cleanBars[index]?.high ?? cleanBars[index]?.close ?? null;
      if (candidateHigh == null) continue;
      const gainPct = ((candidateHigh - setupClose) / setupClose) * 100;
      if (maxGainPct == null || gainPct > maxGainPct) {
        maxGainPct = gainPct;
        maxGainDate = cleanBars[index]?.date ?? null;
      }
    }
  }

  const thresholdHits = maxGainPct == null
    ? []
    : [15, 25, 50].filter((threshold) => maxGainPct >= threshold);

  return {
    setup_date: cleanBars[setupWindowEndIndex]?.date ?? "",
    setup_window_start_date: cleanBars[setupWindowStartIndex]?.date ?? "",
    setup_window_end_date: cleanBars[setupWindowEndIndex]?.date ?? "",
    setup_bar_index: setupBarIndex,
    setup_window_start_index: setupWindowStartIndex,
    setup_window_end_index: setupWindowEndIndex,
    available_forward_bars: availableForwardBars,
    bars: cleanBars,
    observations: [],
    forward_outcomes: {
      [String(selectedWindow)]: {
        horizon_days: selectedWindow,
        completed: availableForwardBars >= selectedWindow,
        max_gain_pct: maxGainPct,
        max_gain_date: maxGainDate,
        threshold_hits: thresholdHits,
      },
    },
  };
}

export function BehavioralDnaScreenContent({
  ticker,
  dna,
  stock,
  recentBars,
  recentBarsLoading,
  recentBarsError,
  colors,
  bottomInset,
}: {
  ticker: string;
  dna: BehavioralDNA;
  stock?: FullStockAnalysis | null;
  recentBars: DnaSetupBar[];
  recentBarsLoading: boolean;
  recentBarsError: boolean;
  colors: ThemePalette;
  bottomInset: number;
}) {
  const availableWindows = useMemo(() => buildWindowList(dna), [dna]);
  const defaultWindow = dna.default_window_days ?? dna.setup_horizon_days ?? availableWindows[0] ?? 20;
  const [selectedWindow, setSelectedWindow] = useState(defaultWindow);
  const [currentRange, setCurrentRange] = useState<CurrentRangeKey>(DEFAULT_CURRENT_RANGE);
  const [showAllExamples, setShowAllExamples] = useState(false);

  // Similar historical setups (pattern-store nearest-neighbour)
  const { data: similarData } = useSimilarSetups(ticker);

  useEffect(() => {
    setSelectedWindow(defaultWindow);
  }, [defaultWindow]);

  const selectedProfile = useMemo(
    () => findSelectedProfile(dna, selectedWindow),
    [dna, selectedWindow],
  );
  const displayedProfiles = useMemo(
    () => pickDisplayedProfiles(selectedProfile?.threshold_profiles ?? dna.threshold_profiles ?? []),
    [selectedProfile, dna.threshold_profiles],
  );
  const topSignalStats = useMemo(
    () =>
      [...(dna.signal_stats ?? [])]
        .sort((left, right) => (right.presence_pct ?? right.reliability_pct ?? 0) - (left.presence_pct ?? left.reliability_pct ?? 0))
        .slice(0, 6),
    [dna.signal_stats],
  );
  const totalSetups = useMemo(
    () => selectedProfile?.setup_count ?? dna.total_events_analyzed ?? 0,
    [selectedProfile, dna.total_events_analyzed],
  );
  const topTargetZones = useMemo(
    () =>
      [...(dna.historical_target_clusters ?? [])]
        .sort((left, right) => (right.cluster_strength ?? 0) - (left.cluster_strength ?? 0))
        .slice(0, 3)
        .map((cluster) => cluster.gain_pct_from_entry),
    [dna.historical_target_clusters],
  );
  const confidenceFloor = selectedProfile?.confidence_floor ?? dna.confidence_floor ?? 5;
  const hasPercentages = selectedProfile?.percentages_visible ?? displayedProfiles.length > 0;
  const avgGainAll = displayedProfiles[0]?.avg_gain_all_pct ?? dna.threshold_profiles?.[0]?.avg_gain_all_pct ?? null;
  const primaryProfile = useMemo(
    () => displayedProfiles.find((profile) => Math.round(profile.threshold_pct) === 25) ?? displayedProfiles[0] ?? null,
    [displayedProfiles],
  );
  const primaryStrength = useMemo(
    () => (primaryProfile ? getStrengthState(primaryProfile.success_rate ?? 0, totalSetups, colors) : null),
    [primaryProfile, totalSetups, colors],
  );
  const confidenceColors = useMemo(
    () => getConfidenceState(selectedProfile?.confidence_tier, colors),
    [selectedProfile, colors],
  );
  const setupSignals = dna.setup_signals ?? [];
  const matchedSetupSignals = useMemo(
    () => setupSignals.map((signal) => signalLabel(signal)).slice(0, 4),
    [setupSignals],
  );
  const liveFiredSignals = useMemo(
    () =>
      (stock?.signals ?? [])
        .filter((signal) => signal.fired)
        .map((signal) => signalLabel(signal.signal))
        .slice(0, 4),
    [stock?.signals],
  );
  const scoreDrivers = useMemo(() => {
    const drivers: string[] = [];

    if (primaryProfile && totalSetups > 0) {
      const hits = primaryProfile.hits ?? primaryProfile.sample_count ?? 0;
      const successRate = Math.round(primaryProfile.success_rate ?? 0);
      drivers.push(
        EE.scoreDriverHitRate(primaryProfile.threshold_pct, hits, totalSetups, successRate),
      );
    }

    if (avgGainAll != null && !Number.isNaN(avgGainAll)) {
      drivers.push(EE.scoreDriverAvgMove(formatSignedPrecisePct(avgGainAll)));
    }

    drivers.push(
      EE.scoreDriverDataConfidence(totalSetups, selectedProfile?.confidence_label ?? "Too thin"),
    );

    if (matchedSetupSignals.length > 0) {
      drivers.push(EE.scoreDriverPatternSignals(matchedSetupSignals.join(", ")));
    }

    if (liveFiredSignals.length > 0) {
      drivers.push(EE.scoreDriverLiveSignals(liveFiredSignals.join(", ")));
    }

    return drivers;
  }, [
    avgGainAll,
    liveFiredSignals,
    matchedSetupSignals,
    primaryProfile,
    selectedProfile?.confidence_label,
    totalSetups,
  ]);
  const recommendationExplanation = useMemo(
    () => (stock ? buildRecommendationExplanation(stock) : null),
    [stock],
  );
  const liveObservationBuckets = useMemo(
    () => buildObservationBuckets(stock?.signals),
    [stock?.signals],
  );
  const currentRangeConfig = useMemo(
    () => CURRENT_RANGE_OPTIONS.find((option) => option.key === currentRange) ?? CURRENT_RANGE_OPTIONS[4],
    [currentRange],
  );
  const scopedRecentBars = useMemo(() => {
    if (recentBars.length <= currentRangeConfig.bars) return recentBars;
    return recentBars.slice(-currentRangeConfig.bars);
  }, [recentBars, currentRangeConfig.bars]);
  const currentComparisonExample = useMemo(
    () => buildCurrentComparisonExample(scopedRecentBars, selectedWindow),
    [scopedRecentBars, selectedWindow],
  );
  const currentChartStartDate = currentComparisonExample?.bars[0]?.date;
  const currentChartLatestDate = currentComparisonExample?.bars[currentComparisonExample.bars.length - 1]?.date;
  const currentChartBarCount = currentComparisonExample?.bars.length ?? 0;
  const setupExamples = useMemo(() => dna.setup_examples ?? [], [dna.setup_examples]);
  const visibleExamples = useMemo(
    () => (showAllExamples ? setupExamples : setupExamples.slice(0, MAX_INITIAL_EXAMPLES)),
    [setupExamples, showAllExamples],
  );
  const hiddenExampleCount = setupExamples.length - MAX_INITIAL_EXAMPLES;
  const anomalyDetected = hasPercentages && hasDataAnomaly(displayedProfiles);
  const handleShowAllExamples = useCallback(() => setShowAllExamples(true), []);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: bottomInset + UITokens.spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.dnaTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaIntro(ticker, selectedWindow)}</Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.dnaWindowSelector}</Text>
        <View style={styles.windowTabs}>
          {availableWindows.map((window) => {
            const isActive = window === selectedWindow;
            return (
              <Pressable
                key={window}
                onPress={() => setSelectedWindow(window)}
                style={[
                  styles.windowTab,
                  {
                    backgroundColor: isActive ? colors.accentPrimary : colors.bgCardHover,
                    borderColor: isActive ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
              >
                <Text style={[styles.windowTabText, { color: isActive ? "#fff" : colors.textPrimary }]}>
                  {EE.dnaWindowTab(window)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.setupSummaryTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.setupCountLine(ticker, totalSetups)}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaSelectedWindowNote(selectedWindow)}</Text>

        <View style={styles.summaryGrid}>
          <SummaryFact label="Completed setups" value={String(totalSetups)} colors={colors} />
          <SummaryFact label="Window" value={`${selectedWindow}d`} colors={colors} />
          <SummaryFact
            label={EE.dnaConfidenceTitle}
            value={selectedProfile?.confidence_label ?? "-"}
            colors={colors}
          />
        </View>

        <View style={[styles.noteBox, { backgroundColor: confidenceColors.backgroundColor, borderColor: confidenceColors.borderColor }]}> 
          <Text style={[styles.noteBody, { color: confidenceColors.textColor }]}>
            {EE.dnaConfidenceLine(totalSetups, selectedProfile?.confidence_label ?? "Too thin")}
          </Text>
        </View>

        {selectedWindow > 20 && (
          <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.warning }]}> 
            <Text style={[styles.noteTitle, { color: colors.warning }]}>{EE.dnaWindowTab(selectedWindow)}</Text>
            <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dnaInflationNote(selectedWindow)}</Text>
          </View>
        )}

        <View style={[styles.heroPanel, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
          <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>{EE.typicalResultTitle}</Text>
          <Text
            style={[
              styles.heroValue,
              {
                color:
                  (avgGainAll ?? 0) > 0
                    ? colors.success
                    : (avgGainAll ?? 0) < 0
                      ? colors.danger
                      : colors.textPrimary,
              },
            ]}
          >
            {formatSignedWholePct(avgGainAll)}
          </Text>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>{EE.typicalResultBody(formatSignedWholePct(avgGainAll))}</Text>

          {primaryProfile && primaryStrength && (
            <View style={styles.heroFooter}>
              <Text style={[styles.heroFooterLabel, { color: colors.textSecondary }]}>+{Math.round(primaryProfile.threshold_pct)}% outlook</Text>
              <StrengthBadge
                label={primaryStrength.label}
                textColor={primaryStrength.textColor}
                backgroundColor={primaryStrength.backgroundColor}
                borderColor={primaryStrength.borderColor}
              />
            </View>
          )}
        </View>

        {setupSignals.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.patternMatchedNow}</Text>
            <View style={styles.chipWrap}>
              {setupSignals.map((signal) => (
                <View
                  key={signal}
                  style={[
                    styles.signalChip,
                    { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor },
                  ]}
                >
                  <Text style={[styles.signalChipText, { color: colors.textSecondary }]}>{signalLabel(signal)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Cycle detection card ──────────────────────────────────────────── */}
      {dna.cycle_profile && (
        <DnaCycleCard cycle={dna.cycle_profile} colors={colors} />
      )}

      {/* ── Similar historical setups card ────────────────────────────────── */}
      {similarData?.status === "ok" && similarData.setups.length > 0 && (
        <DnaSimilarSetupsCard setups={similarData.setups} colors={colors} />
      )}

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.dnaCurrentChartTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaCurrentChartBody(selectedWindow, getCurrentRangeLabel(currentRange))}</Text>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.dnaCurrentRangeLabel}</Text>
        <View style={styles.windowTabs}>
          {CURRENT_RANGE_OPTIONS.map((option) => {
            const isActive = option.key === currentRange;
            return (
              <Pressable
                key={option.key}
                onPress={() => setCurrentRange(option.key)}
                style={[
                  styles.windowTab,
                  {
                    backgroundColor: isActive ? colors.accentPrimary : colors.bgCardHover,
                    borderColor: isActive ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
              >
                <Text style={[styles.windowTabText, { color: isActive ? "#fff" : colors.textPrimary }]}>
                  {getCurrentRangeLabel(option.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {recentBarsLoading ? (
          <View style={styles.currentChartState}>
            <ActivityIndicator color={colors.accentPrimary} size="small" />
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaCurrentChartLoading}</Text>
          </View>
        ) : recentBarsError ? (
          <View style={styles.currentChartState}>
            <Text style={[styles.helperText, { color: colors.textSecondary, textAlign: "center" }]}>{EE.dnaCurrentChartError}</Text>
          </View>
        ) : currentComparisonExample ? (
          <>
            <BehavioralDnaSetupChart
              example={currentComparisonExample}
              selectedWindowDays={selectedWindow}
              colors={colors}
            />
            {currentChartLatestDate && (
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                {EE.dnaCurrentChartFootnote(currentComparisonExample.setup_window_end_date, currentChartLatestDate)}
              </Text>
            )}
            {currentChartStartDate && currentChartLatestDate && (
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                {EE.dnaCurrentChartCoverage(
                  getCurrentRangeLabel(currentRange),
                  currentChartStartDate,
                  currentChartLatestDate,
                  currentChartBarCount,
                )}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.currentChartState}>
            <Text style={[styles.helperText, { color: colors.textSecondary, textAlign: "center" }]}>{EE.dnaCurrentChartNoData}</Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.scoreExplainTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.scoreExplainBody}</Text>

        {stock ? (
          <>
            <View style={styles.summaryGrid}>
              <SummaryFact
                label={EE.scoreExplainRecommendationLabel}
                value={formatRatingLabel(stock.rating)}
                colors={colors}
              />
              <SummaryFact
                label={EE.scoreExplainConfidenceLabel}
                value={`${Math.round(stock.confidence)}%`}
                colors={colors}
              />
              <SummaryFact
                label={EE.scoreExplainStageLabel}
                value={getStageLabelFull(stock.stage ?? "")}
                colors={colors}
              />
            </View>

            <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
              <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.scoreExplainThesisLabel}</Text>
              <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{stock.thesis}</Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.scoreExplainObservationsTitle}</Text>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.scoreExplainObservationsBody}</Text>

            <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
              <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.scoreExplainObserveBottomTitle}</Text>
              {liveObservationBuckets.bottom.length > 0 ? (
                <View style={styles.reasonList}>
                  {liveObservationBuckets.bottom.map((line, index) => (
                    <View key={`obs-bottom-${index}`} style={styles.reasonRow}>
                      <View style={[styles.reasonDot, { backgroundColor: colors.accentPrimary }]} />
                      <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.scoreExplainObserveBottomEmpty}</Text>
              )}
            </View>

            <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
              <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.scoreExplainObserveConfirmationTitle}</Text>
              {liveObservationBuckets.confirmation.length > 0 ? (
                <View style={styles.reasonList}>
                  {liveObservationBuckets.confirmation.map((line, index) => (
                    <View key={`obs-confirmation-${index}`} style={styles.reasonRow}>
                      <View style={[styles.reasonDot, { backgroundColor: colors.accentPrimary }]} />
                      <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.scoreExplainObserveConfirmationEmpty}</Text>
              )}
            </View>

            <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
              <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.scoreExplainObserveMarketTitle}</Text>
              {liveObservationBuckets.market.length > 0 ? (
                <View style={styles.reasonList}>
                  {liveObservationBuckets.market.map((line, index) => (
                    <View key={`obs-market-${index}`} style={styles.reasonRow}>
                      <View style={[styles.reasonDot, { backgroundColor: colors.accentPrimary }]} />
                      <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.scoreExplainObserveMarketEmpty}</Text>
              )}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.scoreExplainDriversLabel}</Text>
            <View style={styles.reasonList}>
              {scoreDrivers.map((driver, index) => (
                <View key={`${index}-${driver}`} style={styles.reasonRow}>
                  <View style={[styles.reasonDot, { backgroundColor: colors.accentPrimary }]} />
                  <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{driver}</Text>
                </View>
              ))}
            </View>

            {recommendationExplanation && (
              <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
                <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.scoreExplainRecommendationWhyLabel}</Text>
                <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{recommendationExplanation}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
            <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.scoreExplainNoRecommendation}</Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.thresholdProfiles}</Text>

        {!hasPercentages && (
          <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
            <Text style={[styles.noteBody, { color: colors.textSecondary }]}>
              {EE.dnaTooThinPercentages(totalSetups, confidenceFloor)}
            </Text>
          </View>
        )}

        {anomalyDetected && (
          <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.warning }]}> 
            <Text style={[styles.noteTitle, { color: colors.warning }]}>{EE.dataAnomalyTitle}</Text>
            <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dataAnomalyBody}</Text>
          </View>
        )}

        {hasPercentages ? (
          displayedProfiles.map((profile) => (
            <TargetOutcomeRow
              key={`${selectedWindow}-${profile.threshold_pct}`}
              profile={profile}
              setupCount={totalSetups}
              colors={colors}
            />
          ))
        ) : (
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.insufficientHistoryHonestBody(ticker, totalSetups, confidenceFloor)}</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.dnaObservationsTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaObservationsBody}</Text>
        {topSignalStats.map((signalStat) => (
          <SignalFrequencyRow key={signalStat.signal} signalStat={signalStat} colors={colors} />
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.dnaVisualEvidenceTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaVisualEvidenceBody}</Text>
        <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
          <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>{EE.dnaLearnedProfitTitle}</Text>
          <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dnaLearnedOptimalHold(dna.optimal_hold_window_days)}</Text>
          <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dnaLearnedTargets(topTargetZones)}</Text>
          <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dnaLearnedEntryQuality(dna.avg_entry_quality_score)}</Text>
          <Text style={[styles.noteBody, { color: colors.textSecondary }]}>
            {EE.dnaLearnedPullback(
              dna.pullback_entry_profile?.median_pullback_pct,
              dna.pullback_entry_profile?.pullback_within_days,
              dna.pullback_entry_profile?.pullback_success_rate,
            )}
          </Text>
        </View>
        {setupExamples.length === 0 ? (
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaNoExamples}</Text>
        ) : (
          <>
            {visibleExamples.map((example) => (
              <SetupExampleCard
                key={`${example.setup_date}-${selectedWindow}`}
                example={example}
                selectedWindow={selectedWindow}
                colors={colors}
                dna={dna}
              />
            ))}
            {!showAllExamples && hiddenExampleCount > 0 && (
              <Pressable
                onPress={handleShowAllExamples}
                style={[styles.showMoreButton, { borderColor: colors.borderColor, backgroundColor: colors.bgCardHover }]}
              >
                <Text style={[styles.showMoreText, { color: colors.accentPrimary }]}>
                  Show {hiddenExampleCount} more {hiddenExampleCount === 1 ? "example" : "examples"}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {dna.exit_signal_profile != null && (
        <ExitSignalCard exit={dna.exit_signal_profile} colors={colors} />
      )}

      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.howToReadTitle}</Text>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.howToReadBody}</Text>
      </View>

      {dna.computed_at && (
        <Text style={[styles.freshness, { color: colors.textMuted }]}>
          {EE.dnaUpdatedAt(dna.computed_at)}
        </Text>
      )}
    </ScrollView>
  );
}

function SummaryFact({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.summaryFact, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
      <Text style={[styles.summaryFactValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.summaryFactLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function StrengthBadge({
  label,
  textColor,
  backgroundColor,
  borderColor,
}: {
  label: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.strengthBadge, { backgroundColor, borderColor }]}> 
      <Text style={[styles.strengthBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function TargetOutcomeRow({
  profile,
  setupCount,
  colors,
}: {
  profile: ThresholdProfile;
  setupCount: number;
  colors: ThemePalette;
}) {
  const successRate = Math.round(profile.success_rate ?? 0);
  const hits = profile.hits ?? profile.sample_count ?? 0;
  const avgGainOnHits = profile.avg_gain_on_hits_pct ?? profile.avg_win_pct ?? null;
  const strength = getStrengthState(successRate, setupCount, colors);

  return (
    <View style={[styles.metricRow, { borderTopColor: colors.borderColor }]}> 
      <View style={styles.metricHeader}>
        <View style={styles.metricTitleWrap}>
          <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{EE.reachedTarget(profile.threshold_pct)}</Text>
          <Text style={[styles.metricCountLine, { color: colors.textSecondary }]}>{EE.targetOutcomeLine(profile.threshold_pct, hits, setupCount, successRate)}</Text>
        </View>
        <StrengthBadge
          label={strength.label}
          textColor={strength.textColor}
          backgroundColor={strength.backgroundColor}
          borderColor={strength.borderColor}
        />
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.bgCardHover }]}> 
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: strength.barColor,
              width: `${Math.max(4, Math.min(100, successRate))}%`,
            },
          ]}
        />
      </View>

      <Text style={[styles.metricSupportLine, { color: colors.textMuted }]}>
        {avgGainOnHits != null ? EE.avgHitLine(formatSignedPrecisePct(avgGainOnHits)) : EE.noHitLine}
      </Text>
    </View>
  );
}

function SignalFrequencyRow({
  signalStat,
  colors,
}: {
  signalStat: SignalReliabilityStat;
  colors: ThemePalette;
}) {
  const presencePct = Math.round(signalStat.presence_pct ?? signalStat.reliability_pct ?? 0);
  const totalSetups = getSignalSetupCount(signalStat);

  return (
    <View style={[styles.metricRow, { borderTopColor: colors.borderColor }]}> 
      <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{signalLabel(signalStat.signal)}</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.bgCardHover }]}> 
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: colors.accentPrimary,
              width: `${Math.max(4, Math.min(100, presencePct))}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.metricSupportLine, { color: colors.textSecondary }]}>{EE.signalSeenLine(presencePct, signalStat.fired_count, totalSetups)}</Text>
    </View>
  );
}

const SetupExampleCard = React.memo(function SetupExampleCard({
  example,
  selectedWindow,
  colors,
  dna,
}: {
  example: DnaSetupExample;
  selectedWindow: number;
  colors: ThemePalette;
  dna?: BehavioralDNA | null;
}) {
  const selectedOutcome = example.forward_outcomes[String(selectedWindow)] ?? null;
  const bestCompletedOutcome = useMemo(() => {
    const completed = Object.entries(example.forward_outcomes)
      .map(([windowKey, outcome]) => ({
        window: parseNumericWindow(windowKey),
        outcome,
      }))
      .filter(
        (item): item is { window: number; outcome: NonNullable<typeof selectedOutcome> } =>
          item.window != null && item.outcome != null && item.outcome.completed,
      )
      .sort((left, right) => {
        const leftGain = left.outcome.max_gain_pct ?? Number.NEGATIVE_INFINITY;
        const rightGain = right.outcome.max_gain_pct ?? Number.NEGATIVE_INFINITY;
        if (rightGain === leftGain) return left.window - right.window;
        return rightGain - leftGain;
      });

    return completed[0] ?? null;
  }, [example.forward_outcomes]);

  const shownTargets =
    (selectedOutcome?.threshold_hits?.length ?? 0) > 0
      ? selectedOutcome?.threshold_hits ?? []
      : bestCompletedOutcome?.outcome.threshold_hits ?? [];

  return (
    <View style={[styles.exampleCard, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
      <Text style={[styles.exampleTitle, { color: colors.textPrimary }]}>{EE.dnaExampleTitle(example.setup_date)}</Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
        {EE.dnaExampleOutcome(
          selectedWindow,
          formatSignedPrecisePct(selectedOutcome?.max_gain_pct),
          selectedOutcome?.completed ?? false,
        )}
      </Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}> 
        {bestCompletedOutcome
          ? EE.dnaExampleBestOutcome(
              bestCompletedOutcome.window,
              formatSignedPrecisePct(bestCompletedOutcome.outcome.max_gain_pct),
              bestCompletedOutcome.outcome.max_gain_date,
            )
          : EE.dnaExampleBestOutcomePending}
      </Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaTargetsHit(shownTargets)}</Text>

      <BehavioralDnaSetupChart example={example} selectedWindowDays={selectedWindow} colors={colors} dna={dna} />

      <View style={styles.observationList}>
        {example.observations.map((observation) => (
          <View key={`${example.setup_date}-${observation.date}-${observation.signal}`} style={styles.observationRow}>
            <View style={[styles.observationDot, { backgroundColor: colors.accentPrimary }]} />
            <View style={styles.observationContent}>
              <Text style={[styles.observationLabel, { color: colors.textPrimary }]}>
                {observation.label} · {observation.date}
              </Text>
              <Text style={[styles.observationDetail, { color: colors.textSecondary }]}>{observation.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Exit Signal Intelligence card
// ---------------------------------------------------------------------------
function postDropClassificationLabel(classification: string): string {
  switch (classification) {
    case "STRONG_BOUNCER": return EE.exitPostDropBouncer;
    case "CONTINUATION_SELLER": return EE.exitPostDropContinuation;
    default: return EE.exitPostDropMixed;
  }
}

function postDropBadgeColors(
  classification: string,
  colors: ThemePalette,
): { textColor: string; backgroundColor: string; borderColor: string } {
  switch (classification) {
    case "STRONG_BOUNCER":
      return { textColor: colors.success, backgroundColor: colors.successBg ?? colors.bgCardHover, borderColor: colors.success };
    case "CONTINUATION_SELLER":
      return { textColor: colors.danger, backgroundColor: colors.dangerBg ?? colors.bgCardHover, borderColor: colors.danger };
    default:
      return { textColor: colors.warning, backgroundColor: colors.warningBg ?? colors.bgCardHover, borderColor: colors.warning };
  }
}

function ExitSignalCard({
  exit,
  colors,
}: {
  exit: ExitSignalProfile;
  colors: ThemePalette;
}) {
  const hasSignals = exit.pre_drop_signals.length > 0;
  const pdb: PostDropBehavior | null = exit.post_drop_behavior;
  const badgeColors = pdb ? postDropBadgeColors(pdb.classification, colors) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.exitIntelTitle}</Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
        {EE.exitIntelBody(exit.drop_threshold_pct, exit.historical_drop_events)}
      </Text>
      <Text style={[styles.metricSupportLine, { color: colors.textMuted }]}>
        {EE.exitAvgDrop(exit.avg_drop_magnitude_pct, exit.avg_days_peak_to_trough)}
      </Text>

      {/* Pre-drop warning signals */}
      {hasSignals && (
        <View style={{ gap: UITokens.spacing.xs }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.exitPreDropTitle}</Text>
          {exit.pre_drop_signals.map((sig: PreDropSignal) => (
            <View
              key={sig.signal}
              style={[styles.metricRow, { borderTopColor: colors.borderColor }]}
            >
              <View style={styles.metricHeader}>
                <View style={styles.metricTitleWrap}>
                  <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{sig.label}</Text>
                  <Text style={[styles.metricCountLine, { color: colors.textSecondary }]}>
                    {EE.exitPreDropSignalLine(sig.label, sig.fired_before_drop_pct, sig.avg_bars_before_drop)}
                  </Text>
                </View>
                <View style={[styles.strengthBadge, { backgroundColor: colors.bgCardHover, borderColor: colors.warning }]}>
                  <Text style={[styles.strengthBadgeText, { color: colors.warning }]}>
                    {`${sig.fired_before_drop_pct.toFixed(0)}%`}
                  </Text>
                </View>
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.bgCardHover }]}> 
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: colors.warning,
                      width: `${Math.max(4, Math.min(100, sig.fired_before_drop_pct))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{sig.description}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Post-drop behavior */}
      {pdb != null && badgeColors != null && (
        <View style={{ gap: UITokens.spacing.xs }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{EE.exitPostDropTitle}</Text>
          <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: badgeColors.borderColor }]}> 
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.noteTitle, { color: badgeColors.textColor, flex: 1 }]}>
                {postDropClassificationLabel(pdb.classification)}
              </Text>
              <View style={[styles.strengthBadge, { backgroundColor: badgeColors.backgroundColor, borderColor: badgeColors.borderColor }]}>
                <Text style={[styles.strengthBadgeText, { color: badgeColors.textColor }]}>
                  {pdb.classification === "STRONG_BOUNCER" ? "Bouncer" : pdb.classification === "CONTINUATION_SELLER" ? "Seller" : "Mixed"}
                </Text>
              </View>
            </View>
            <Text style={[styles.noteBody, { color: colors.textSecondary }]}>
              {EE.exitPostDropStats(pdb.bounce_rate_pct, pdb.avg_recovery_days, pdb.avg_continuation_pct)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.md,
  },
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.sm,
    ...UITokens.shadows.card,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  windowTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  windowTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: 8,
  },
  windowTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  summaryFact: {
    minWidth: 96,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  summaryFactValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  summaryFactLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroPanel: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.xs,
  },
  heroEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroValue: {
    fontSize: 30,
    fontWeight: "800",
  },
  heroCaption: {
    fontSize: 13,
    lineHeight: 19,
  },
  heroFooter: {
    marginTop: UITokens.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: UITokens.spacing.sm,
  },
  heroFooterLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  signalChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: 6,
  },
  signalChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  noteBox: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  noteBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  metricRow: {
    paddingTop: UITokens.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: UITokens.spacing.xs,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: UITokens.spacing.sm,
  },
  metricTitleWrap: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  metricCountLine: {
    fontSize: 12,
    lineHeight: 17,
  },
  metricSupportLine: {
    fontSize: 12,
    lineHeight: 17,
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  strengthBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  strengthBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  exampleCard: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: UITokens.spacing.sm,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  observationList: {
    gap: UITokens.spacing.sm,
  },
  observationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: UITokens.spacing.sm,
  },
  observationDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 5,
  },
  observationContent: {
    flex: 1,
    gap: 2,
  },
  observationLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  observationDetail: {
    fontSize: 12,
    lineHeight: 17,
  },
  freshness: {
    textAlign: "center",
    fontSize: 12,
  },
  showMoreButton: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    paddingVertical: UITokens.spacing.sm,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  reasonList: {
    gap: UITokens.spacing.xs,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: UITokens.spacing.sm,
  },
  reasonDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: 5,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  currentChartState: {
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: UITokens.spacing.sm,
    paddingVertical: UITokens.spacing.sm,
  },
});
