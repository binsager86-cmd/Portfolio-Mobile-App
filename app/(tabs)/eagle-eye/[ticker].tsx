/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Stock Detail screen
 *
 * Displays full analysis for a single ticker: rating, stage, thesis,
 * chart with S/R levels, trade plan, confluence signals, accumulation data.
 *
 * Route: /(tabs)/eagle-eye/[ticker]
 */

import { ActionInterpretationCard } from "@/components/eagle-eye/ActionInterpretationCard";
import { ConfluenceBar } from "@/components/eagle-eye/ConfluenceBar";
import { EagleEyeChart } from "@/components/eagle-eye/EagleEyeChart";
import { RatingBadge } from "@/components/eagle-eye/RatingBadge";
import { isSimulatorFeatureEnabled } from "@/constants/Config";
import { SafetyConfirmModal } from "@/components/eagle-eye/SafetyConfirmModal";
import { SignalBreakdown } from "@/components/eagle-eye/SignalBreakdown";
import { StageTag } from "@/components/eagle-eye/StageTag";
import { TradePlanCard } from "@/components/eagle-eye/TradePlanCard";
import { MLSignalCard } from "@/components/eagle-eye/MLSignalCard";
import { EE, STAGE_INTERPRETATIONS, getStageDescription, getStageLabelFull } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useEagleEyeStock } from "@/hooks/useEagleEye";
import { findSimulatorState, useReadOnlySimulatorSymbolStates, type SimulatorSymbolState } from "@/hooks/useSimulatorReadOnly";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import EagleEyeDnaScreen from "./[ticker]-dna";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EagleEyeDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Expo Router v6 sometimes routes [ticker]-dna URLs here instead of to
  // [ticker]-dna.tsx because fully-dynamic [ticker].tsx wins the match.
  // Delegate rendering to the DNA screen when the URL ends with -dna.
  const isDnaRoute = (ticker ?? "").toLowerCase().endsWith("-dna");

  const t = isDnaRoute ? "" : (ticker ?? "").toUpperCase().trim();

  const simulatorFeatureEnabled = isSimulatorFeatureEnabled();
  const { data, isLoading, isError, refetch } = useEagleEyeStock(t, 0, !isDnaRoute);
  const { data: simulatorStates } = useReadOnlySimulatorSymbolStates(!isDnaRoute && simulatorFeatureEnabled);
  const analysis = data?.data;
  const simulatorState = simulatorFeatureEnabled ? findSimulatorState(simulatorStates, analysis?.ticker ?? t) : undefined;
  const gateCards = getGateCards(simulatorState).slice(0, 9);
  const evidencePanels = getEvidencePanels(simulatorState);
  const systemIndices = getSystemIndices(simulatorState);
  const v2Confidence = simulatorState?.confidence;
  const spikeConfidence = analysis?.confidence;

  // Safety modal — auto-show when requires_confirmation
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [safetyDismissed, setSafetyDismissed] = useState(false);
  // Stage tooltip (web hover)
  const [stageTooltipVisible, setStageTooltipVisible] = useState(false);

  useEffect(() => {
    if (analysis?.requires_confirmation && !safetyDismissed) {
      setSafetyVisible(true);
    }
  }, [analysis?.requires_confirmation, safetyDismissed]);

  const handleProceed = useCallback(() => {
    setSafetyVisible(false);
    setSafetyDismissed(true);
  }, []);

  const handleReduce = useCallback(() => {
    setSafetyVisible(false);
    setSafetyDismissed(true);
    // Could navigate to settings here — for now just dismiss
  }, []);

  // Expo Router v6 routes [ticker]-dna URLs here; delegate to the DNA screen.
  if (isDnaRoute) {
    return <EagleEyeDnaScreen />;
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <BackHeader title={t} colors={colors} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      </View>
    );
  }

  if (isError || !analysis) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <BackHeader title={t} colors={colors} />
        <View style={styles.centred}>
          <FontAwesome name="exclamation-triangle" size={28} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {EE.errorLoading}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{EE.retry}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const stageInterpretation = STAGE_INTERPRETATIONS[analysis.stage];

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}
    >
      <BackHeader title={analysis.ticker} colors={colors} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + UITokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card ─────────────────────────────────────────────────────── */}
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroTicker, { color: colors.textPrimary }]}>
                {analysis.ticker}
              </Text>
              <Text style={[styles.heroName, { color: colors.textMuted }]} numberOfLines={1}>
                {analysis.name_en}
              </Text>
              <Text style={[styles.heroSector, { color: colors.textMuted }]}>
                {analysis.sector}
              </Text>
            </View>
            <View style={styles.heroRight}>
              <RatingBadge rating={analysis.rating} />
              <View style={styles.stageRow}>
                <StageTag stage={analysis.stage} size="sm" variant="full" />
                {Platform.OS !== "web" ? (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        getStageLabelFull(analysis.stage),
                        getStageDescription(analysis.stage),
                      )
                    }
                    hitSlop={8}
                    style={({ pressed }: any) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <FontAwesome name="info-circle" size={14} color={colors.textMuted} />
                  </Pressable>
                ) : (
                  <View
                    {...({
                      onMouseEnter: () => setStageTooltipVisible(true),
                      onMouseLeave: () => setStageTooltipVisible(false),
                    } as any)}
                    style={{ position: "relative" }}
                  >
                    <FontAwesome name="info-circle" size={14} color={colors.textMuted} />
                    {stageTooltipVisible && (
                      <View
                        style={[
                          styles.stageTooltip,
                          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
                        ]}
                      >
                        <Text style={[styles.stageTooltipText, { color: colors.textSecondary }]}>
                          {getStageDescription(analysis.stage)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              <Text style={[styles.heroConfidence, { color: colors.accentPrimary }]}>
                {v2Confidence != null
                  ? `V2 confidence ${v2Confidence.toFixed(0)}%`
                  : `Spike confidence ${analysis.confidence.toFixed(0)}%`}
              </Text>
              {v2Confidence != null && spikeConfidence != null ? (
                <Text style={[styles.heroSubConfidence, { color: colors.textMuted }]}>
                  {`Spike confidence ${spikeConfidence.toFixed(0)}%`}
                </Text>
              ) : null}
              <View style={styles.sourceRow}>
                <Text style={[styles.sourceBadge, { color: colors.textSecondary, borderColor: colors.borderColor }]}>
                  {`Decision: ${v2Confidence != null ? "V2 canonical" : "Spike"}`}
                </Text>
                <Text style={[styles.sourceBadge, { color: colors.textSecondary, borderColor: colors.borderColor }]}>
                  {`State: ${simulatorState?.source ?? "none"}`}
                </Text>
              </View>
              <SimulatorStateBadge state={simulatorState} />
            </View>
          </View>

          {/* Thesis */}
          <Text style={[styles.thesis, { color: colors.textSecondary }]}>
            {analysis.thesis}
          </Text>

          {/* Stage interpretation */}
          {stageInterpretation ? (
            <View
              style={[styles.interpretBox, { backgroundColor: colors.bgCardHover }]}
            >
              <Text style={[styles.interpretText, { color: colors.textMuted }]}>
                {stageInterpretation}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <ActionInterpretationCard analysis={analysis} />
        </View>

        {/* ── Chart ─────────────────────────────────────────────────────────── */}
        {analysis.last_price != null && (
          <View style={styles.section}>
            <EagleEyeChart
              prices={[analysis.last_price]} // real charts need OHLCV endpoint (future)
              supports={analysis.supports ?? []}
              resistances={analysis.resistances ?? []}
              lastPrice={analysis.last_price}
              width={360}
              height={120}
            />
          </View>
        )}

        {/* ── Trade Plan ────────────────────────────────────────────────────── */}
        {(analysis.entry_primary != null || analysis.stop_loss != null) && (
          <View style={styles.section}>
            <SectionTitle title={EE.tradePlan} colors={colors} />
            <TradePlanCard data={analysis} />
          </View>
        )}

        {/* ── Simulator gates surfaced inline on stock detail ─────────────── */}
        {simulatorState ? (
          <View style={styles.section}>
            <SectionTitle title="Decision Gates" colors={colors} />
            <View
              style={[
                styles.card,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
            >
              <View style={styles.simMetricsRow}>
                <MetricChip label="Lifecycle" value={simulatorState.lifecycle ?? "NEUTRAL"} />
                <MetricChip label="Tier" value={simulatorState.tier ?? "NONE"} />
                <MetricChip
                  label="Gates Passing"
                  value={simulatorState.gates_passing != null ? `${simulatorState.gates_passing}/${systemIndices.gateTotal}` : "—"}
                />
                <MetricChip
                  label="Confidence"
                  value={simulatorState.confidence != null ? `${simulatorState.confidence.toFixed(0)}%` : "—"}
                />
              </View>

              <View style={[styles.systemCalcCard, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}> 
                <Text style={[styles.systemCalcTitle, { color: colors.textPrimary }]}>System calculation indices</Text>
                <Text style={[styles.systemCalcText, { color: colors.textSecondary }]}>
                  {`Gate pass ratio: ${systemIndices.gatePassing}/${systemIndices.gateTotal} (${systemIndices.passRate.toFixed(0)}%).`}
                </Text>
                <Text style={[styles.systemCalcText, { color: colors.textSecondary }]}>
                  {`Confidence index: ${systemIndices.confidenceIndex.toFixed(0)} / 100.`}
                </Text>
                <Text style={[styles.systemCalcText, { color: colors.textSecondary }]}>
                  {`Tier penalty: ${systemIndices.tierPenalty.toFixed(0)} points (${simulatorState.tier ?? "NONE"}).`}
                </Text>
                <Text style={[styles.systemCalcTextStrong, { color: colors.accentPrimary }]}>
                  {`Composite readiness index: ${systemIndices.compositeIndex.toFixed(0)} / 100 → ${systemIndices.decisionLabel}`}
                </Text>
              </View>

              {gateCards.length > 0 ? (
                <View style={styles.gateGrid}>
                  {gateCards.map((gate, index) => (
                    <View
                      key={`${index}-${gate.name}`}
                      style={[
                        styles.gateCard,
                        {
                          backgroundColor: colors.bgSecondary,
                          borderColor: gate.passed ? colors.success : colors.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.gateName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {gate.name}
                      </Text>
                      <Text style={[styles.gateMeta, { color: colors.textMuted }]} numberOfLines={2}>
                        {gate.value} vs {gate.threshold}
                      </Text>
                      <Text style={[styles.gateExplain, { color: colors.textSecondary }]} numberOfLines={3}>
                        {gate.explanation}
                      </Text>
                      <Text
                        style={[
                          styles.gateState,
                          { color: gate.passed ? colors.success : colors.danger },
                        ]}
                      >
                        {gate.passed ? "PASS" : "BLOCK"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.inlineEmpty, { color: colors.textMuted }]}>
                  No gate payload is projected for this stock yet.
                </Text>
              )}

              {evidencePanels.some((panel) => panel.items.length > 0) ? (
                <View style={styles.evidenceStack}>
                  {evidencePanels.map((panel) => (
                    <View
                      key={panel.title}
                      style={[
                        styles.evidenceCard,
                        { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor },
                      ]}
                    >
                      <Text style={[styles.evidenceTitle, { color: colors.textPrimary }]}>
                        {panel.title}
                      </Text>
                      {panel.items.length === 0 ? (
                        <Text style={[styles.inlineEmpty, { color: colors.textMuted }]}>No projected evidence.</Text>
                      ) : (
                        panel.items.slice(0, 5).map(([key, raw]) => (
                          <View key={`${panel.title}-${key}`} style={styles.evidenceRow}>
                            <Text style={[styles.evidenceKey, { color: colors.textMuted }]}>{key}</Text>
                            <Text style={[styles.evidenceValue, { color: colors.textPrimary }]} numberOfLines={2}>
                              {formatEvidenceValue(raw)}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── ML Signal Card (SHADOW roster stocks only) ────────────────────── */}
        <View style={styles.section}>
          <SectionTitle title={EE.mlSignalCardTitle} colors={colors} />
          <MLSignalCard ticker={t} />
        </View>

        {/* ── Confluence ────────────────────────────────────────────────────── */}
        {analysis.signals && analysis.signals.length > 0 && (
          <View style={styles.section}>
            <SectionTitle title={EE.confluenceAnalysis} colors={colors} />
            <View
              style={[
                styles.card,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
            >
              <ConfluenceBar signals={analysis.signals} />
            </View>
          </View>
        )}

        {/* ── Signal Breakdown ─────────────────────────────────────────────── */}
        {analysis.signals && analysis.signals.length > 0 && (
          <View style={styles.section}>
            <SignalBreakdown signals={analysis.signals} />
          </View>
        )}

        {/* ── DNA button ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(tabs)/eagle-eye/[ticker]-dna', params: { ticker: t } })
            }
            style={({ pressed }) => [
              styles.dnaBtn,
              {
                backgroundColor: pressed
                  ? colors.accentSecondary
                  : colors.accentPrimary,
              },
            ]}
          >
            <FontAwesome name="flask" size={14} color="#fff" />
            <Text style={styles.dnaBtnText}>{EE.viewDna}</Text>
          </Pressable>
        </View>

        {/* Data freshness */}
        {analysis.computed_at && (
          <Text style={[styles.freshness, { color: colors.textMuted }]}>
            Computed: {analysis.computed_at.slice(0, 19).replace("T", " ")}
            {analysis.days_of_history != null
              ? `  ·  ${analysis.days_of_history}d history`
              : ""}
          </Text>
        )}
      </ScrollView>

      {/* Safety modal */}
      <SafetyConfirmModal
        visible={safetyVisible}
        ticker={analysis.ticker}
        positionSizePct={analysis.position_size_pct}
        worstCasePct={null}
        onProceed={handleProceed}
        onReduce={handleReduce}
        onDismiss={() => setSafetyVisible(false)}
      />
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BackHeader({
  title,
  colors,
}: {
  title: string;
  colors: import("@/constants/theme").ThemePalette;
}) {
  const router = useRouter();
  return (
    <View
      style={[
        styles.backHeader,
        { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

function SectionTitle({
  title,
  colors,
}: {
  title: string;
  colors: import("@/constants/theme").ThemePalette;
}) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
  );
}

function SimulatorStateBadge({ state }: { state?: SimulatorSymbolState }) {
  const { colors } = useThemeStore();
  const lifecycle = state?.lifecycle ?? "NEUTRAL";
  const tier = state?.tier ?? "NONE";
  const palette = getSimulatorStatePalette(lifecycle, tier, colors);
  return (
    <View style={[styles.simStateBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}> 
      <Text style={[styles.simStateText, { color: palette.text }]} numberOfLines={1}>
        {lifecycle} · {tier}
      </Text>
    </View>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.metricChip, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function getGateCards(state?: SimulatorSymbolState) {
  const gates = Array.isArray(state?.gates) ? state.gates : [];
  return gates.map((gate, index) => ({
    name: readGateText(gate.name ?? gate.key ?? gate.signal ?? gate.label) ?? `Gate ${index + 1}`,
    value: readGateText(gate.value ?? gate.current ?? gate.observed) ?? "—",
    threshold: readGateText(gate.threshold ?? gate.target ?? gate.limit) ?? "—",
    passed: Boolean(gate.pass ?? gate.passed ?? gate.ok ?? gate.fired),
    explanation: gateExplanation(readGateText(gate.name ?? gate.key ?? gate.signal ?? gate.label), index),
  }));
}

function gateExplanation(gateName: string | null, index: number): string {
  const key = String(gateName ?? "").toUpperCase();
  if (key.includes("LIFECYCLE")) return "Checks whether structure is in a decision-eligible lifecycle state.";
  if (key.includes("CONFIRM")) return "Requires confirmation before entry-grade decisions are allowed.";
  if (key.includes("VETO") || key.includes("AVOID")) return "Veto and avoid checks can block entries even when other gates pass.";
  if (key.includes("INTENT")) return "Validates that candidate intent conditions are armed for action.";
  if (key.includes("POSITION")) return "Protects against duplicate entries while a position is already open.";
  return `Gate ${index + 1} validates one rule in the V2 decision engine.`;
}

function getSystemIndices(state?: SimulatorSymbolState) {
  const gateTotal = Array.isArray(state?.gates) && state?.gates?.length ? state.gates.length : 9;
  const gatePassing = Number.isFinite(state?.gates_passing as number) ? Number(state?.gates_passing) : 0;
  const passRate = gateTotal > 0 ? (gatePassing / gateTotal) * 100 : 0;
  const confidenceIndex = Number.isFinite(state?.confidence as number) ? Number(state?.confidence) : passRate;
  const tier = String(state?.tier ?? "").toUpperCase();
  const tierPenalty = tier.includes("AVOID_HARD") ? 35 : tier.includes("AVOID_SOFT") || tier.includes("VETOED") ? 18 : 0;
  const compositeIndex = Math.max(0, Math.min(100, passRate * 0.6 + confidenceIndex * 0.4 - tierPenalty));
  const decisionLabel = compositeIndex >= 70 ? "BUY BIAS" : compositeIndex >= 45 ? "WATCHLIST" : "DEFENSIVE / AVOID";
  return {
    gateTotal,
    gatePassing,
    passRate,
    confidenceIndex,
    tierPenalty,
    compositeIndex,
    decisionLabel,
  };
}

function getEvidencePanels(state?: SimulatorSymbolState) {
  return [
    { title: "Soft conditions", items: evidenceEntries(state?.soft_conditions) },
    { title: "Hard refs", items: evidenceEntries(state?.hard_refs) },
    { title: "Base", items: evidenceEntries(state?.base) },
    { title: "Entry paths", items: evidenceEntries(state?.entry_paths) },
    { title: "Exit watch", items: evidenceEntries(state?.exit_watch) },
  ];
}

function evidenceEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

function readGateText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getSimulatorStatePalette(
  lifecycle: string,
  tier: string,
  colors: import("@/constants/theme").ThemePalette,
) {
  if (tier === "AVOID_HARD") return { bg: colors.dangerBg, text: colors.dangerText, border: colors.danger };
  if (tier === "AVOID_SOFT") return { bg: colors.warningBg, text: colors.warning, border: colors.warning };
  if (lifecycle === "MARKUP_ACTIVE") return { bg: "#DBEAFE", text: "#1D4ED8", border: "#2563EB" };
  if (lifecycle === "BASE_VALID") return { bg: colors.successBg, text: colors.successText, border: colors.success };
  return { bg: colors.bgCardHover, text: colors.textSecondary, border: colors.borderColor };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  scroll: {
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.md,
  },
  heroCard: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.sm,
    ...UITokens.shadows.card,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stageTooltip: {
    position: "absolute",
    right: 0,
    top: 20,
    width: 220,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    zIndex: 100,
    ...UITokens.shadows.card,
  },
  stageTooltipText: {
    fontSize: 12,
    lineHeight: 17,
  },
  heroTicker: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroName: {
    fontSize: 13,
  },
  heroSector: {
    fontSize: 11,
  },
  heroConfidence: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroSubConfidence: {
    fontSize: 10,
    fontWeight: "600",
  },
  sourceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
  },
  sourceBadge: {
    fontSize: 10,
    borderWidth: 1,
    borderRadius: UITokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  simStateBadge: {
    maxWidth: 210,
    borderWidth: 1,
    borderRadius: UITokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  simStateText: {
    fontSize: 10,
    fontWeight: "800",
  },
  simMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  metricChip: {
    minWidth: 120,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: UITokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  gateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
    marginTop: UITokens.spacing.sm,
  },
  gateCard: {
    width: "31%",
    minWidth: 110,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  gateName: {
    fontSize: 12,
    fontWeight: "800",
  },
  gateMeta: {
    fontSize: 10,
    lineHeight: 14,
  },
  gateExplain: {
    fontSize: 10,
    lineHeight: 14,
  },
  gateState: {
    fontSize: 11,
    fontWeight: "800",
  },
  systemCalcCard: {
    marginTop: UITokens.spacing.sm,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  systemCalcTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  systemCalcText: {
    fontSize: 12,
    lineHeight: 18,
  },
  systemCalcTextStrong: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  evidenceStack: {
    gap: UITokens.spacing.sm,
    marginTop: UITokens.spacing.sm,
  },
  evidenceCard: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: 6,
  },
  evidenceTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  evidenceRow: {
    gap: 2,
  },
  evidenceKey: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  evidenceValue: {
    fontSize: 12,
    lineHeight: 16,
  },
  inlineEmpty: {
    fontSize: 12,
    lineHeight: 18,
  },
  thesis: {
    fontSize: 14,
    lineHeight: 20,
  },
  interpretBox: {
    borderRadius: UITokens.radius.sm,
    padding: UITokens.spacing.sm,
  },
  interpretText: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  section: {
    gap: UITokens.spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    padding: UITokens.spacing.md,
  },
  dnaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: UITokens.spacing.sm,
    paddingVertical: 13,
    borderRadius: UITokens.radius.md,
  },
  dnaBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  freshness: {
    fontSize: 11,
    textAlign: "center",
  },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: UITokens.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: UITokens.radius.md,
  },
});
