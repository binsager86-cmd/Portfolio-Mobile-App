/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye ML Methodology page.
 *
 * Explains what ML bands are, why bands instead of percentages,
 * what "experimental" means, the 30-day evaluation timeline,
 * and the kill switch.
 *
 * Content is fetched from /api/v1/eagle-eye/ml/methodology if available,
 * with a static fallback for offline use.
 *
 * Route: /(tabs)/eagle-eye/methodology
 */

import { UITokens } from "@/constants/uiTokens";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { useMLMethodology } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
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

// Static fallback content matching the brief's required wording
const STATIC_SECTIONS = [
  {
    heading: "What are ML bands?",
    body:
      "Eagle Eye ML bands classify each SHADOW-roster stock as LOW, MEDIUM, or HIGH based on a LightGBM binary classifier trained on historical breakout events. The classifier outputs a calibrated probability of a ≥10% move within 20 trading days.",
  },
  {
    heading: "Why bands instead of percentages?",
    body:
      "The model's calibration has been measured as BORDERLINE — meaning the probability numbers themselves are not yet trustworthy as percentages. However, the model's ranking ability (which stocks it rates high vs. low) has been validated. Bands are derived from each stock's own historical distribution using rolling 90-day percentiles, making them informative even when the raw numbers are not.",
  },
  {
    heading: "What does 'experimental' mean?",
    body:
      "These signals are produced by per-stock models trained on 3 years of historical data. They have not yet been validated on live forward data. We are running a 30-day evaluation period to measure whether they actually beat our existing rule-based system.",
  },
  {
    heading: "30-day evaluation timeline",
    body:
      "Phase 3 runs for 30 trading days. Every day, ML scores and rule-engine scores are recorded side-by-side. At day 30, a report compares which approach had higher forward accuracy. Models that beat the rule engine on ≥7 of 14 stocks will be considered for promotion to LIVE. Others will continue in shadow mode or be archived.",
  },
  {
    heading: "The kill switch",
    body:
      "A single environment variable (ENABLE_ML_DISPLAY=false) can hide all ML displays instantly without a deploy. Auto-disable triggers also run daily: if calibration error exceeds 30%, any model shows extreme mispredictions for 2+ consecutive days, 3+ models trigger rollback in 7 days, or the scoring job fails for 2+ days — ML display turns off automatically and an alert is sent.",
  },
  {
    heading: "How to interpret a band",
    body:
      "HIGH means this stock's model is producing a reading above its own historical 67th percentile — relatively elevated signal for this stock. LOW means it is below the 33rd percentile. MEDIUM is in between. This is relative to the stock itself, not a fixed threshold, so a 'HIGH' reading for a low-volatility stock differs from a 'HIGH' reading for a high-volatility stock.",
  },
  {
    heading: "Contact",
    body:
      "Questions about methodology? Contact the portfolio team. Do not rely on experimental signals for trading decisions until the 30-day evaluation is complete.",
  },
];

export default function MLMethodologyScreen() {
  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useMLMethodology();

  // Use fetched sections if available, fallback to static
  const sections =
    data?.sections && data.sections.length > 0
      ? data.sections
      : STATIC_SECTIONS;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}
    >
      {/* Back header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          ML Signal Methodology
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <EagleEyeTopTabs />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + UITokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "#F59E0B" },
          ]}
        >
          <FontAwesome name="exclamation-triangle" size={14} color="#F59E0B" />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Phase 3: Shadow Evaluation</Text>
            <Text style={styles.statusBody}>
              ML signals are experimental — not for trading decisions yet.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator
            color={colors.accentPrimary}
            size="large"
            style={{ marginTop: 32 }}
          />
        ) : (
          sections.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                {section.heading}
              </Text>
              <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
                {section.body}
              </Text>
            </View>
          ))
        )}

        {/* Disclaimer footer */}
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.borderColor },
          ]}
        >
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            ⚠️ ML signal in evaluation — do not use for trading decisions yet.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  scroll: {
    padding: UITokens.spacing.md,
    gap: 0,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  statusText: { flex: 1, gap: 2 },
  statusTitle: {
    color: "#F59E0B",
    fontWeight: "700",
    fontSize: 13,
  },
  statusBody: {
    color: "#FDE68A",
    fontSize: 12,
    lineHeight: 17,
  },
  section: {
    marginBottom: 20,
    gap: 6,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
