/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye methodology page.
 *
 * User-facing guide for Stage, Rating, and Confidence,
 * with emphasis on how to read Rating + Confidence together.
 */

import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { StageTag } from "@/components/eagle-eye/StageTag";
import { getRatingColors } from "@/constants/eagleEyeColors";
import {
  getConfidenceDescription,
  getStageDescription,
} from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type StageCode =
  | "ACCUMULATION"
  | "EARLY_MARKUP"
  | "MARKUP"
  | "DISTRIBUTION"
  | "MARKDOWN"
  | "NEUTRAL_AMBIGUOUS";

const STAGE_ITEMS: Array<{ stage: StageCode; body: string }> = [
  {
    stage: "ACCUMULATION",
    body:
      "The stock has stopped falling and is building a base near its lows. Smart money may be quietly buying. This is the earliest opportunity, with higher failure risk if the base breaks.",
  },
  {
    stage: "EARLY_MARKUP",
    body:
      "The base is starting to break. Price is rising with real buying support and improving control from buyers. This is usually the sweet spot: confirmation without being too extended.",
  },
  {
    stage: "MARKUP",
    body:
      "A confirmed uptrend. The move is healthy and established, but no longer the earliest entry. Useful for trend-following while watching for overextension.",
  },
  {
    stage: "DISTRIBUTION",
    body:
      "After a run, topping behavior can appear. Price may still look strong, but internal buying fades and risk of weakness rises under the surface.",
  },
  {
    stage: "MARKDOWN",
    body:
      "A confirmed downtrend. Price is weak and money is leaving. This is generally avoid territory for fresh long entries.",
  },
  {
    stage: "NEUTRAL_AMBIGUOUS",
    body:
      "Signals are mixed and conviction is low. There is no clear setup or danger signal yet, so patience is usually better than forcing a decision.",
  },
];

const RATING_ITEMS = [
  {
    rating: "STRONG_BUY",
    label: "Strong Buy",
    body: "Strong setup with multiple confirmations. The best opportunities the system sees.",
  },
  {
    rating: "BUY",
    label: "Buy",
    body: "A genuine setup with real buying support. Worth serious consideration.",
  },
  {
    rating: "WATCHLIST",
    label: "Watchlist",
    body: "Forming but not confirmed. Watch closely; it may strengthen into Buy or fade.",
  },
  {
    rating: "HOLD",
    label: "Hold",
    body: "Healthy trend if already owned, but not an ideal fresh entry point.",
  },
  {
    rating: "NEUTRAL",
    label: "Neutral",
    body: "No clear action. Nothing compelling either way.",
  },
  {
    rating: "REDUCE",
    label: "Reduce",
    body: "Weakening or topping behavior. Consider trimming if you hold it.",
  },
  {
    rating: "SELL",
    label: "Sell",
    body: "Confirmed decline behavior. Consider exiting.",
  },
  {
    rating: "STRONG_SELL",
    label: "Strong Sell",
    body: "Strong downtrend with confirmation. Clear exit signal.",
  },
  {
    rating: "AVOID",
    label: "Avoid",
    body: "Poor quality, illiquid, or actively dangerous. Stay away.",
  },
] as const;

const CONFIDENCE_WEIGHTS = [
  "Liquidity and money flow (30%): is real money moving in?",
  "Trend (20%): is the price structure healthy?",
  "Momentum (20%): is strength building?",
  "Compression and geometry (15%): is it coiled and positioned for a move?",
  "Risk and reward (15%): is upside room attractive versus downside risk?",
];

const CONFIDENCE_BANDS = [
  { label: "75-100", title: "Strong", body: "Most evidence agrees. High-conviction signal." },
  { label: "60-75", title: "Solid", body: "Good evidence with a few mixed signals." },
  { label: "45-60", title: "Moderate", body: "Real but incomplete. Some pieces are still missing." },
  { label: "Below 45", title: "Weak", body: "Early or thin evidence. Treat with caution." },
] as const;

const COMBINATION_ITEMS = [
  {
    title: "BUY + High Confidence",
    example: "Example: Buy, 78",
    body: "The strong case. Broad evidence agreement with money flow, trend, and momentum aligned.",
    takeaway: "A strong setup the system is confident about.",
  },
  {
    title: "BUY or WATCHLIST + Low Confidence",
    example: "Example: Watchlist, 47",
    body:
      "The stage can look promising, but confirmation is still thin. It is an early flag, not a green light.",
    takeaway:
      "Something is forming, but it has not proven itself yet. Watch it and wait for more proof.",
  },
  {
    title: "HOLD + High Confidence",
    example: "Example: Hold, 75",
    body: "Strong and established trend quality, but usually past the ideal early entry.",
    takeaway: "Strong trend to keep, but not a setup to chase.",
  },
  {
    title: "SELL or REDUCE + High Confidence",
    example: "Example: Sell, 80",
    body: "Strong agreement that weakness is real and downside risk is active.",
    takeaway: "The system is confident this name is in trouble.",
  },
  {
    title: "SELL or REDUCE + Low Confidence",
    example: "Example: Reduce, 40",
    body: "Early weakness signs are appearing but not fully confirmed yet.",
    takeaway: "Caution flag, not full alarm.",
  },
] as const;

const EXAMPLE_ITEMS = [
  {
    title: "ALG - Accumulation - Watchlist - 51",
    body:
      "Possible bottoming behavior. Worth watching, but not confirmed yet. If buying support broadens and confidence rises, it can graduate into Buy.",
  },
  {
    title: "BOURSA - Early Markup - Buy - 77",
    body:
      "Base has broken with real buying support. Trend and momentum agree, so this is a stronger and more confirmed setup.",
  },
] as const;

export default function EagleEyeMethodologyScreen() {
  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}
    >
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Methodology</Text>
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
        <View
          style={[
            styles.keyCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <Text style={[styles.keyTitle, { color: colors.textPrimary }]}>Most Important Rule</Text>
          <Text style={[styles.keyBody, { color: colors.textSecondary }]}>Rating tells direction. Confidence tells how sure the evidence is.</Text>
          <Text style={[styles.keyBody, { color: colors.textSecondary }]}>A low-confidence Buy or Watchlist is an early flag, not a green light.</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle title="1. What Is A Stage?" color={colors.textPrimary} />
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>Stage describes where a stock is in its cycle right now.</Text>
          {STAGE_ITEMS.map((item) => (
            <View
              key={item.stage}
              style={[
                styles.itemCard,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
            >
              <StageTag stage={item.stage} size="sm" />
              <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
              <Text style={[styles.thinkLine, { color: colors.textMuted }]}>Think: {getStageDescription(item.stage)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <SectionTitle title="2. What Is A Rating?" color={colors.textPrimary} />
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>Rating turns analysis into a suggested action.</Text>
          {RATING_ITEMS.map((item) => {
            const ratingColors = getRatingColors(item.rating, colors);
            return (
              <View
                key={item.rating}
                style={[
                  styles.itemCard,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
                ]}
              >
                <View
                  style={[
                    styles.ratingPill,
                    { backgroundColor: ratingColors.bg, borderColor: ratingColors.border },
                  ]}
                >
                  <Text style={[styles.ratingPillText, { color: ratingColors.text }]}>{item.label}</Text>
                </View>
                <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <SectionTitle title="3. What Is Confidence?" color={colors.textPrimary} />
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>Confidence is a 0-100 score for how strongly the evidence agrees.</Text>
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>It does not mean how much price will move. It means how much confirmation exists.</Text>

          <View
            style={[
              styles.itemCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.subTitle, { color: colors.textPrimary }]}>Evidence families</Text>
            {CONFIDENCE_WEIGHTS.map((line) => (
              <Text key={line} style={[styles.listLine, { color: colors.textSecondary }]}>
                - {line}
              </Text>
            ))}
          </View>

          <View
            style={[
              styles.itemCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.subTitle, { color: colors.textPrimary }]}>How to read the number</Text>
            {CONFIDENCE_BANDS.map((band) => (
              <Text key={band.label} style={[styles.listLine, { color: colors.textSecondary }]}>
                - {band.label} ({band.title}): {band.body}
              </Text>
            ))}
            <Text style={[styles.thinkLine, { color: colors.textMuted }]}>Confidence helper sample: {getConfidenceDescription(51)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="4. Read Rating + Confidence Together" color={colors.textPrimary} />
          <Text style={[styles.sectionLead, { color: colors.textSecondary }]}>Rating is direction. Confidence is certainty. Use both together every time.</Text>

          {COMBINATION_ITEMS.map((item) => (
            <View
              key={item.title}
              style={[
                styles.itemCard,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
            >
              <Text style={[styles.comboTitle, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.comboExample, { color: colors.textMuted }]}>{item.example}</Text>
              <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
              <Text style={[styles.thinkLine, { color: colors.textMuted }]}>{item.takeaway}</Text>
            </View>
          ))}

          <View
            style={[
              styles.principleCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.principleLine, { color: colors.textPrimary }]}>RATING = direction of the signal.</Text>
            <Text style={[styles.principleLine, { color: colors.textPrimary }]}>CONFIDENCE = strength of agreement behind it.</Text>
            <Text style={[styles.principleLine, { color: colors.textSecondary }]}>Low confidence means early or unconfirmed. High confidence means evidence strongly agrees.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="5. Putting It Together" color={colors.textPrimary} />
          {EXAMPLE_ITEMS.map((item) => (
            <View
              key={item.title}
              style={[
                styles.itemCard,
                { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
              ]}
            >
              <Text style={[styles.comboTitle, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, color }: { title: string; color: string }) {
  return <Text style={[styles.sectionTitle, { color }]}>{title}</Text>;
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
    gap: UITokens.spacing.md,
  },
  keyCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  keyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  keyBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    gap: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionLead: {
    fontSize: 13,
    lineHeight: 19,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 7,
  },
  itemBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  thinkLine: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  ratingPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  listLine: {
    fontSize: 12,
    lineHeight: 18,
  },
  comboTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  comboExample: {
    fontSize: 12,
    fontStyle: "italic",
  },
  principleCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  principleLine: {
    fontSize: 12,
    lineHeight: 18,
  },
});
