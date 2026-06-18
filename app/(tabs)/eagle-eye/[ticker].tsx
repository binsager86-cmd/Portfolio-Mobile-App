/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Stock Detail screen
 *
 * Displays full analysis for a single ticker: rating, stage, thesis,
 * chart with S/R levels, trade plan, confluence signals, accumulation data.
 *
 * Route: /(tabs)/eagle-eye/[ticker]
 */

import { ConfluenceBar } from "@/components/eagle-eye/ConfluenceBar";
import { EagleEyeChart } from "@/components/eagle-eye/EagleEyeChart";
import { BadgeHelpTooltip } from "@/components/eagle-eye/BadgeHelpTooltip";
import { RatingBadge } from "@/components/eagle-eye/RatingBadge";
import { SafetyConfirmModal } from "@/components/eagle-eye/SafetyConfirmModal";
import { SignalBreakdown } from "@/components/eagle-eye/SignalBreakdown";
import { StageTag } from "@/components/eagle-eye/StageTag";
import { TradePlanCard } from "@/components/eagle-eye/TradePlanCard";
import { MLSignalCard } from "@/components/eagle-eye/MLSignalCard";
import { getActionInterpretation } from "@/components/eagle-eye/actionInterpretation";
import {
  EE,
  getRatingConfidenceDescription,
  STAGE_INTERPRETATIONS,
} from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useEagleEyeScanner, useEagleEyeStock, useEagleEyeDnaRecentBars } from "@/hooks/useEagleEye";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import EagleEyeDnaScreen from "./[ticker]-dna";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Responsive layout constants ─────────────────────────────────────────────
/** Phones narrower than this threshold get the compact vertical hero layout. */
const NARROW_PHONE_BREAKPOINT = 420;
/** Chart height on narrow phones — keeps the page from feeling too chart-heavy. */
const CHART_HEIGHT_NARROW = 280;
/** Chart height on wider phones and tablets. */
const CHART_HEIGHT_NORMAL = 340;

export default function EagleEyeDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();
  // Breakpoint: phones narrower than NARROW_PHONE_BREAKPOINT get compact hero layout
  const isNarrow = screenWidth < NARROW_PHONE_BREAKPOINT;

  // Expo Router v6 sometimes routes [ticker]-dna URLs here instead of to
  // [ticker]-dna.tsx because fully-dynamic [ticker].tsx wins the match.
  // Delegate rendering to the DNA screen when the URL ends with -dna.
  const isDnaRoute = (ticker ?? "").toLowerCase().endsWith("-dna");

  const t = isDnaRoute ? "" : (ticker ?? "").toUpperCase().trim();

  const { data, isLoading, isError, refetch } = useEagleEyeStock(t, 0, !isDnaRoute);
  const analysis = data?.data;
  const { data: scannerData } = useEagleEyeScanner(undefined, !isDnaRoute);
  // Fetch recent OHLCV bars for the candlestick chart only after core
  // analysis loads, so detail page becomes interactive faster.
  const { data: recentBarsData } = useEagleEyeDnaRecentBars(
    t,
    !isDnaRoute && !!t && !isLoading && !!analysis,
  );

  // Safety modal — auto-show when requires_confirmation
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [safetyDismissed, setSafetyDismissed] = useState(false);

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
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
        <BackHeader title={t} colors={colors} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      </View>
    );
  }

  if (isError || !analysis) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
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
  const scannerRow = scannerData?.stocks?.find((stock) => stock.ticker === analysis.ticker);
  const actionInterpretation = getActionInterpretation({
    rating: analysis.rating,
    continue_rising: analysis.continue_rising,
    continue_rising_exhaustion_count:
      analysis.continue_rising_exhaustion_count
      ?? scannerRow?.continue_rising_exhaustion_count
      ?? null,
    risk_warning_score:
      analysis.risk_warning_score
      ?? scannerRow?.risk_warning_score
      ?? null,
    risky_near_resistance:
      analysis.risky_near_resistance ?? scannerRow?.risky_near_resistance ?? null,
    risk_reward_ratio: analysis.risk_reward_ratio ?? null,
    close: analysis.last_price ?? scannerRow?.last_price ?? null,
    stage: analysis.stage,
  });

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}
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
          <View style={[styles.heroTop, isNarrow && styles.heroTopNarrow]}>
            <View style={[styles.heroLeft, isNarrow && styles.heroLeftNarrow]}>
              <Text
                style={[
                  styles.heroTicker,
                  { color: colors.textPrimary, fontSize: isNarrow ? 21 : 26 },
                ]}
              >
                {analysis.ticker}
              </Text>
              <Text style={[styles.heroName, { color: colors.textMuted }]} numberOfLines={1}>
                {analysis.name_en}
              </Text>
              <Text style={[styles.heroSector, { color: colors.textMuted }]}>
                {analysis.sector}
              </Text>
            </View>
            <View style={[styles.heroRight, isNarrow && styles.heroRightNarrow]}>
              <RatingBadge rating={analysis.rating} />
              <View style={styles.stageRow}>
                <StageTag
                  stage={analysis.stage}
                  size="sm"
                  variant={isNarrow ? "short" : "full"}
                />
              </View>
              <BadgeHelpTooltip
                title={`${analysis.confidence.toFixed(0)}% Confidence`}
                body={getRatingConfidenceDescription(analysis.rating, analysis.confidence)}
                align="right"
              >
                <Text style={[styles.heroConfidence, { color: colors.accentPrimary }]}>
                  {analysis.confidence.toFixed(0)}% confidence
                </Text>
              </BadgeHelpTooltip>
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

          <View style={[styles.meaningBox, { backgroundColor: colors.bgCardHover }]}>
            <Text style={[styles.meaningLabel, { color: colors.textSecondary }]}>What this means</Text>
            <Text style={[styles.meaningAction, { color: colors.textPrimary }]}>{actionInterpretation.action}</Text>
            <Text style={[styles.meaningDetail, { color: colors.textMuted }]}>{actionInterpretation.detail}</Text>
          </View>
        </View>

        {/* ── Chart ─────────────────────────────────────────────────────────── */}
        {(recentBarsData?.bars?.length || analysis?.last_price != null) && (
          <View style={styles.section}>
            <EagleEyeChart
              bars={recentBarsData?.bars ?? []}
              supports={analysis?.supports ?? []}
              resistances={analysis?.resistances ?? []}
              lastPrice={analysis?.last_price}
              height={isNarrow ? CHART_HEIGHT_NARROW : CHART_HEIGHT_NORMAL}
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
  // On narrow phones, stack the info blocks vertically so neither side is squeezed.
  heroTopNarrow: {
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
    paddingRight: UITokens.spacing.sm,
  },
  // On narrow phones heroLeft fills the full row before heroRight wraps below.
  heroLeftNarrow: {
    width: "100%",
    flexShrink: 0,
    paddingRight: 0,
  },
  heroRight: {
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  // On narrow phones heroRight aligns to the leading edge to avoid orphaned padding.
  heroRightNarrow: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroTicker: {
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
  meaningBox: {
    borderRadius: UITokens.radius.sm,
    padding: UITokens.spacing.sm,
    gap: 4,
  },
  meaningLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  meaningAction: {
    fontSize: 14,
    fontWeight: "800",
  },
  meaningDetail: {
    fontSize: 12,
    lineHeight: 18,
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
