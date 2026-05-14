/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Behavioral DNA screen
 *
 * Shows per-ticker learned behavior: personality, reliable signals,
 * threshold profiles, fakeout signatures.
 *
 * Route: /(tabs)/eagle-eye/[ticker]-dna
 */

import { getDiscriminativePowerColor } from "@/constants/eagleEyeColors";
import { EE, PERSONALITY_LABELS, signalLabel } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useEagleEyeDna } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemePalette } from "@/constants/theme";

export default function EagleEyeDnaScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  // Route file is [ticker]-dna.tsx → Expo Router param key is "ticker".
  // In some Expo Router versions the full segment (e.g. "KFIC-dna") is returned
  // rather than just the dynamic portion. Strip the literal "-dna" suffix if present.
  const rawParam = params.ticker ?? "";
  const ticker = rawParam.replace(/-dna$/i, "").toUpperCase().trim();

  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch } = useEagleEyeDna(ticker);
  const isPending = data?.status === "pending";
  const dna = data?.data;

  const personality = dna?.dominant_pattern;
  const personalityLabel = personality ? (PERSONALITY_LABELS[personality] ?? personality) : null;

  const screenTitle = `Behavioral DNA — ${ticker}`;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <BackHeader title={screenTitle} colors={colors} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <BackHeader title={screenTitle} colors={colors} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
          <Text style={[styles.errorText, { color: colors.textMuted, marginTop: 12 }]}>
            Computing Behavioral DNA…
          </Text>
          <Text style={[{ color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 6 }]}>
            {data?.message ?? "This runs nightly. Check back in a few minutes."}
          </Text>
        </View>
      </View>
    );
  }

  if (isError || !dna) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <BackHeader title={screenTitle} colors={colors} />
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
      <BackHeader title={screenTitle} colors={colors} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + UITokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Personality ─────────────────────────────────────────────────── */}
        {personalityLabel && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {EE.dnaPersonality}
            </Text>
            <Text style={[styles.personalityLabel, { color: colors.accentPrimary }]}>
              {personalityLabel}
            </Text>
          </View>
        )}

        {/* ── Move Statistics ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            {EE.dnaStats}
          </Text>
          <View style={styles.statsGrid}>
            <StatCell
              label={EE.totalEvents}
              value={String(dna.total_events_analyzed)}
              colors={colors}
            />
          </View>
        </View>

        {/* ── Most Reliable Signals ─────────────────────────────────────────── */}
        {dna.most_reliable_signals && dna.most_reliable_signals.length > 0 && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {EE.earlyWarningSignals}
            </Text>
            {dna.most_reliable_signals.map((sig, i) => (
              <View
                key={sig}
                style={[
                  styles.sigRow,
                  {
                    borderTopColor: colors.borderColor,
                    backgroundColor:
                      i % 2 === 0 ? colors.bgCard : colors.bgCardHover,
                  },
                ]}
              >
                <FontAwesome
                  name="check-circle"
                  size={14}
                  color={colors.success}
                />
                <Text style={[styles.sigLabel, { color: colors.textSecondary }]}>
                  {signalLabel(sig)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Threshold Profiles ────────────────────────────────────────────── */}
        {dna.threshold_profiles && dna.threshold_profiles.length > 0 && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {EE.thresholdProfiles}
            </Text>
            {/* Header row */}
            <View style={[styles.tableHeader, { borderBottomColor: colors.borderColor }]}>
              <Text style={[styles.thCol, { color: colors.textMuted }]}>Target</Text>
              <Text style={[styles.thCol, { color: colors.textMuted, textAlign: "center" }]}>
                {EE.successRate}
              </Text>
              <Text style={[styles.thCol, { color: colors.textMuted, textAlign: "right" }]}>
                {EE.occurrences}
              </Text>
              <Text style={[styles.thCol, { color: colors.textMuted, textAlign: "right" }]}>
                {EE.avgGain}
              </Text>
            </View>
            {dna.threshold_profiles.map((tp, i) => {
              const srColor =
                tp.success_rate >= 0.7
                  ? colors.success
                  : tp.success_rate >= 0.5
                  ? colors.warning
                  : colors.danger;
              return (
                <View
                  key={i}
                  style={[
                    styles.tableRow,
                    {
                      borderBottomColor: colors.borderColor,
                      backgroundColor:
                        i % 2 === 0 ? colors.bgCard : colors.bgCardHover,
                    },
                  ]}
                >
                  <Text
                    style={[styles.thCol, { color: colors.textPrimary, fontWeight: "700" }]}
                  >
                    {tp.threshold_pct > 0 ? "+" : ""}
                    {tp.threshold_pct.toFixed(0)}%
                  </Text>
                  <Text
                    style={[
                      styles.thCol,
                      { color: srColor, textAlign: "center", fontWeight: "700" },
                    ]}
                  >
                    {Math.round(tp.success_rate * 100)}%
                  </Text>
                  <Text
                    style={[styles.thCol, { color: colors.textSecondary, textAlign: "right" }]}
                  >
                    {tp.sample_count}
                  </Text>
                  <Text
                    style={[styles.thCol, { color: colors.success, textAlign: "right" }]}
                  >
                    {tp.avg_win_pct != null
                      ? `+${tp.avg_win_pct.toFixed(1)}%`
                      : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Freshness ────────────────────────────────────────────────────── */}
        {dna.computed_at && (
          <Text style={[styles.freshness, { color: colors.textMuted }]}>
            Computed: {dna.computed_at.slice(0, 19).replace("T", " ")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BackHeader({
  title,
  colors,
}: {
  title: string;
  colors: ThemePalette;
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

function StatCell({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemePalette;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
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
  },
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
    marginBottom: 4,
  },
  personalityLabel: {
    fontSize: 20,
    fontWeight: "800",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  statCell: {
    flex: 1,
    minWidth: 100,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  sigRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sigLabel: {
    fontSize: 13,
    flex: 1,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thCol: {
    flex: 1,
    fontSize: 12,
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
