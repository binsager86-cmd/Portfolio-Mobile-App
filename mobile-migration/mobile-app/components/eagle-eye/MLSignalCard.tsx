/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * MLSignalCard — stock detail card showing the ML band signal.
 *
 * Per Phase 3 requirements:
 *  - Shows band label (HIGH / MED / LOW) — NEVER raw probability numbers
 *  - Shows calibration verdict (BORDERLINE) when applicable
 *  - Prominent "⚠️ EXPERIMENTAL" disclaimer
 *  - Link to methodology page
 *
 * Used in the Eagle Eye stock detail screen alongside the rule-based TradePlanCard.
 */
import { EE } from "@/constants/eagleEyeStrings";
import { useMLBandForTicker } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MLBandBadge } from "./MLBandBadge";
import type { MLBandLabel } from "./MLBandBadge";

interface MLSignalCardProps {
  ticker: string;
}

export function MLSignalCard({ ticker }: MLSignalCardProps) {
  const { colors } = useThemeStore();
  const router = useRouter();

  const { data, isLoading, isError } = useMLBandForTicker(ticker);

  if (isLoading) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {EE.mlSignalCardTitle}
        </Text>
        <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginTop: 8 }} />
      </View>
    );
  }

  // 404 = not a SHADOW stock; error = gracefully hidden
  if (isError || !data) return null;

  // Kill switch active
  if (!data.enabled) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {EE.mlSignalCardTitle}
        </Text>
        <Text style={[styles.disabledNote, { color: colors.textMuted }]}>
          {EE.mlDisabled}
        </Text>
      </View>
    );
  }

  const band = data.band as MLBandLabel;
  const bandDisplay = getBandDisplay(band);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
          {EE.mlSignalCardTitle}
        </Text>
        <View
          style={[
            styles.experimentalTag,
            { borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.10)" },
          ]}
        >
          <Text style={styles.experimentalTagText}>EXPERIMENTAL</Text>
        </View>
      </View>

      {/* Band display — large */}
      <View style={styles.bandRow}>
        <MLBandBadge band={band} size="md" />
        {data.verdict === "BORDERLINE" && (
          <View
            style={[
              styles.borderlinePill,
              { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "#F59E0B" },
            ]}
          >
            <Text style={[styles.borderlineText, { color: "#F59E0B" }]}>
              BORDERLINE
            </Text>
          </View>
        )}
      </View>

      {/* Band description */}
      {band && band !== "INSUFFICIENT_DATA" && band !== "NO_VARIANCE" && (
        <Text style={[styles.bandDesc, { color: colors.textMuted }]}>
          {bandDisplay.desc}
        </Text>
      )}

      {/* Calibration note */}
      {band && band !== "INSUFFICIENT_DATA" && band !== "NO_VARIANCE" && (
        <Text style={[styles.calibNote, { color: colors.textMuted }]}>
          {`${EE.mlCalibrationVerdict}: BORDERLINE (Phase 3 evaluation)`}
        </Text>
      )}

      {/* As-of date */}
      {data.as_of && (
        <Text style={[styles.asOf, { color: colors.textMuted }]}>
          {`Signal date: ${data.as_of}`}
        </Text>
      )}

      {/* Mandatory disclaimer */}
      <View style={styles.disclaimerBox}>
        <FontAwesome name="exclamation-triangle" size={11} color="#F59E0B" />
        <Text style={styles.disclaimerText}>{EE.mlExperimentalNote}</Text>
      </View>

      {/* Methodology link */}
      <Pressable
        onPress={() => router.push("/(tabs)/eagle-eye/methodology" as any)}
        style={styles.methodologyLink}
        accessibilityRole="link"
      >
        <FontAwesome name="info-circle" size={11} color={colors.accentPrimary} />
        <Text style={[styles.methodologyText, { color: colors.accentPrimary }]}>
          {EE.mlMethodologyLink}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBandDisplay(band: MLBandLabel): { desc: string } {
  switch (band) {
    case "HIGH":
      return { desc: "Above 67th percentile of recent 90 days" };
    case "MEDIUM":
      return { desc: "Within the 33rd–67th percentile range of recent 90 days" };
    case "LOW":
      return { desc: "Below 33rd percentile of recent 90 days" };
    case "INSUFFICIENT_DATA":
      return { desc: "Collecting baseline data — fewer than 30 days of history" };
    case "NO_VARIANCE":
      return { desc: "Model producing narrow-range signals — band not differentiated" };
    default:
      return { desc: "" };
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  experimentalTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  experimentalTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F59E0B",
    letterSpacing: 0.4,
  },
  bandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  borderlinePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  borderlineText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  bandDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  calibNote: {
    fontSize: 11,
    fontStyle: "italic",
  },
  asOf: {
    fontSize: 11,
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 6,
    padding: 8,
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 11,
    color: "#F59E0B",
    flex: 1,
    lineHeight: 16,
    fontWeight: "600",
  },
  methodologyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  methodologyText: {
    fontSize: 12,
    textDecorationLine: "underline",
  },
  disabledNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
});
