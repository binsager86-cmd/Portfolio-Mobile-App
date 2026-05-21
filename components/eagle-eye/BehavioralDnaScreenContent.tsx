/* eslint-disable custom-styles/no-hardcoded-styles */

import { EE, signalLabel } from "@/constants/eagleEyeStrings";
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type { BehavioralDNA, SignalReliabilityStat, ThresholdProfile } from "@/hooks/useEagleEye";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

function formatSignedWholePct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
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

function getProfileSetupCount(profile: ThresholdProfile): number {
  return Math.max(profile.total_setups ?? 0, profile.total_count ?? 0, profile.sample_count ?? 0);
}

function getSignalSetupCount(signalStat: SignalReliabilityStat): number {
  return Math.max(signalStat.total_setups ?? 0, signalStat.total_events ?? 0, signalStat.fired_count ?? 0);
}

function getStrengthState(successRate: number, setupCount: number, colors: ThemePalette) {
  if (successRate >= 60 && setupCount >= 30) {
    return {
      label: EE.strengthStrong,
      textColor: colors.success,
      barColor: colors.success,
      borderColor: colors.success,
      backgroundColor: colors.bgCardHover,
    };
  }

  if ((successRate >= 40 && successRate <= 60) || (setupCount >= 20 && setupCount < 30)) {
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

function hasDataAnomaly(profiles: ThresholdProfile[]): boolean {
  for (let index = 1; index < profiles.length; index += 1) {
    if ((profiles[index]?.success_rate ?? 0) > (profiles[index - 1]?.success_rate ?? 0)) {
      return true;
    }
  }
  return false;
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
  const historyStatus = dna.history_status ?? "ok";
  const totalSetups = dna.total_events_analyzed ?? 0;
  const setupHorizonDays = dna.setup_horizon_days ?? null;
  const hasEnoughHistory = historyStatus !== "INSUFFICIENT_HISTORY" && totalSetups >= 20;
  const displayedProfiles = dna.threshold_profiles ? pickDisplayedProfiles(dna.threshold_profiles) : [];
  const avgGainAll = displayedProfiles[0]?.avg_gain_all_pct ?? dna.threshold_profiles?.[0]?.avg_gain_all_pct ?? null;
  const topSignalStats = [...(dna.signal_stats ?? [])]
    .sort((left, right) => {
      const leftPct = left.presence_pct ?? left.reliability_pct ?? 0;
      const rightPct = right.presence_pct ?? right.reliability_pct ?? 0;
      return rightPct - leftPct;
    })
    .slice(0, 6);
  const setupSignals = dna.setup_signals ?? [];
  const primaryProfile = displayedProfiles.find((profile) => Math.round(profile.threshold_pct) === 25) ?? displayedProfiles[0] ?? null;
  const primaryStrength = primaryProfile
    ? getStrengthState(primaryProfile.success_rate ?? 0, getProfileSetupCount(primaryProfile), colors)
    : null;
  const anomalyDetected = hasEnoughHistory && hasDataAnomaly(displayedProfiles);

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
          <Text style={[styles.introText, { color: colors.textSecondary }]}>{EE.dnaIntro(ticker, setupHorizonDays)}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.setupSummaryTitle}</Text>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.setupCountLine(ticker, totalSetups)}</Text>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.forwardWindowLine(setupHorizonDays)}</Text>

          <View style={styles.summaryGrid}>
            <SummaryFact label="Matching setups" value={String(totalSetups)} colors={colors} />
            <SummaryFact
              label="Forward window"
              value={setupHorizonDays != null ? `${setupHorizonDays}d` : "-"}
              colors={colors}
            />
          </View>

          {hasEnoughHistory && (
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
          )}

          {hasEnoughHistory && setupSignals.length > 0 && (
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

        {!hasEnoughHistory ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.insufficientHistoryHonestTitle}</Text>
            <Text style={[styles.insufficientBody, { color: colors.textSecondary }]}>{EE.insufficientHistoryHonestBody(ticker, totalSetups)}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.thresholdProfiles}</Text>

              {anomalyDetected && (
                <View style={[styles.noteBox, { backgroundColor: colors.bgCardHover, borderColor: colors.warning }]}> 
                  <Text style={[styles.noteTitle, { color: colors.warning }]}>{EE.dataAnomalyTitle}</Text>
                  <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{EE.dataAnomalyBody}</Text>
                </View>
              )}

              {displayedProfiles.map((profile) => (
                <TargetOutcomeRow key={profile.threshold_pct} profile={profile} colors={colors} />
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.patternLooksLikeTitle}</Text>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.patternLooksLikeBody}</Text>
              {topSignalStats.map((signalStat) => (
                <SignalFrequencyRow key={signalStat.signal} signalStat={signalStat} colors={colors} />
              ))}
            </View>
          </>
        )}

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{EE.howToReadTitle}</Text>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>{EE.howToReadBody}</Text>
        </View>

        {dna.computed_at && (
          <Text style={[styles.freshness, { color: colors.textMuted }]}>
            Computed: {dna.computed_at.slice(0, 19).replace("T", " ")}
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
  colors,
}: {
  profile: ThresholdProfile;
  colors: ThemePalette;
}) {
  const successRate = Math.round(profile.success_rate ?? 0);
  const hits = profile.hits ?? profile.sample_count ?? 0;
  const totalSetups = getProfileSetupCount(profile);
  const avgGainOnHits = profile.avg_gain_on_hits_pct ?? profile.avg_win_pct ?? null;
  const strength = getStrengthState(successRate, totalSetups, colors);

  return (
    <View style={[styles.metricRow, { borderTopColor: colors.borderColor }]}> 
      <View style={styles.metricHeader}>
        <View style={styles.metricTitleWrap}>
          <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{EE.reachedTarget(profile.threshold_pct)}</Text>
          <Text style={[styles.metricCountLine, { color: colors.textSecondary }]}>{EE.targetOutcomeLine(profile.threshold_pct, hits, totalSetups, successRate)}</Text>
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
        {avgGainOnHits != null ? EE.avgHitLine(formatSignedWholePct(avgGainOnHits)) : EE.noHitLine}
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
  introText: {
    fontSize: 14,
    lineHeight: 21,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: UITokens.spacing.sm,
  },
  summaryFact: {
    flex: 1,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    paddingVertical: UITokens.spacing.md,
    paddingHorizontal: UITokens.spacing.sm,
    alignItems: "center",
    gap: 4,
  },
  summaryFactValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  summaryFactLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  heroPanel: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.md,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  heroValue: {
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38,
  },
  heroCaption: {
    fontSize: 13,
    lineHeight: 19,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  heroFooterLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "700",
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  signalChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  insufficientBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  noteBox: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  noteBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  metricRow: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  metricTitleWrap: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  metricCountLine: {
    fontSize: 12,
    lineHeight: 18,
  },
  metricSupportLine: {
    fontSize: 12,
    lineHeight: 18,
  },
  barTrack: {
    height: 10,
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
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  strengthBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  freshness: {
    fontSize: 11,
    textAlign: "center",
  },
});