/* eslint-disable custom-styles/no-hardcoded-styles */

import { BehavioralDnaSetupChart } from "@/components/eagle-eye/BehavioralDnaSetupChart";
import { EE, signalLabel } from "@/constants/eagleEyeStrings";
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type {
  BehavioralDNA,
  DnaSetupExample,
  DnaWindowProfile,
  SignalReliabilityStat,
  ThresholdProfile,
} from "@/hooks/useEagleEye";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const MAX_INITIAL_EXAMPLES = 3;

function formatSignedWholePct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value)}%`;
}

function formatSignedPrecisePct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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

export function BehavioralDnaScreenContent({
  ticker,
  dna,
  colors,
  bottomInset,
}: {
  ticker: string;
  dna: BehavioralDNA;
  colors: ThemePalette;
  bottomInset: number;
}) {
  const availableWindows = useMemo(() => buildWindowList(dna), [dna]);
  const defaultWindow = dna.default_window_days ?? dna.setup_horizon_days ?? availableWindows[0] ?? 20;
  const [selectedWindow, setSelectedWindow] = useState(defaultWindow);
  const [showAllExamples, setShowAllExamples] = useState(false);

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
}: {
  example: DnaSetupExample;
  selectedWindow: number;
  colors: ThemePalette;
}) {
  const outcome = example.forward_outcomes[String(selectedWindow)] ?? null;

  return (
    <View style={[styles.exampleCard, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
      <Text style={[styles.exampleTitle, { color: colors.textPrimary }]}>{EE.dnaExampleTitle(example.setup_date)}</Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
        {EE.dnaExampleOutcome(selectedWindow, formatSignedPrecisePct(outcome?.max_gain_pct), outcome?.completed ?? false)}
      </Text>
      <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.dnaTargetsHit(outcome?.threshold_hits ?? [])}</Text>

      <BehavioralDnaSetupChart example={example} selectedWindowDays={selectedWindow} colors={colors} />

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
});
