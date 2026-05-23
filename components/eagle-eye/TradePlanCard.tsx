/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * TradePlanCard — displays entry / stop / targets from FullStockAnalysis.
 */
import { EE } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { FullStockAnalysis } from "@/hooks/useEagleEye";

interface TradePlanCardProps {
  data: FullStockAnalysis;
}

interface PlanRow {
  label: string;
  value: string | null;
  accent?: string;
  secondary?: string | null;
}

export const TradePlanCard = React.memo(function TradePlanCard({ data }: TradePlanCardProps) {
  const { colors } = useThemeStore();

  const planState = data.plan_state ?? "ACTIVE";
  const reviewLabel = "Review";
  const maxDisplayedGainPct = 60;
  const maxDisplayedRr = 10;

  const fmt = (v: number | null | undefined, decimals = 3) =>
    v != null ? v.toFixed(decimals) : "—";

  const pct = (gainPct: number | null | undefined) => {
    if (gainPct == null) return null;
    if (!Number.isFinite(gainPct) || Math.abs(gainPct) > maxDisplayedGainPct) {
      return reviewLabel;
    }
    return gainPct.toFixed(1);
  };

  const deriveGainPct = (entry: number | null | undefined, target: number | null | undefined) => {
    if (!entry || !target) return null;
    return ((target - entry) / entry) * 100;
  };

  const gainText = (gainPctValue: number | null | undefined) => {
    const gainPct = pct(gainPctValue);
    if (!gainPct) return null;
    return gainPct === reviewLabel ? reviewLabel : EE.gainTarget(parseFloat(gainPct));
  };

  const stopPct = () => {
    if (!data.entry_primary || !data.stop_loss) return null;
    return (
      ((data.entry_primary - data.stop_loss) / data.entry_primary) *
      100
    ).toFixed(1);
  };

  const rrRatio = () => {
    const ratio = data.risk_reward_ratio ?? (() => {
      if (!data.entry_primary || !data.stop_loss || !data.tp1) return null;
      const risk = data.entry_primary - data.stop_loss;
      const reward = data.tp1 - data.entry_primary;
      if (risk <= 0) return null;
      return reward / risk;
    })();
    if (ratio == null) return null;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > maxDisplayedRr) return reviewLabel;
    return ratio.toFixed(1);
  };

  const tp1GainText = gainText(data.gain_pct_to_tp1 ?? deriveGainPct(data.entry_primary, data.tp1));
  const conditionalEntry = data.conditional_entry ?? data.entry_primary;

  const stateTitle =
    planState === "CONDITIONAL"
      ? EE.conditionalPlan
      : planState === "DECLINED"
        ? EE.declinedPlan
        : EE.activePlan;
  const stateAccent =
    planState === "CONDITIONAL"
      ? colors.accentPrimary
      : planState === "DECLINED"
        ? colors.danger
        : colors.success;
  const stateBody =
    planState === "CONDITIONAL" && conditionalEntry != null
      ? EE.conditionalHeadline(conditionalEntry)
      : planState === "DECLINED"
        ? (data.plan_reason ?? EE.declinedBody)
        : null;
  const stateNote =
    planState === "CONDITIONAL"
      ? data.plan_reason
      : null;

  const rows: PlanRow[] = [
    {
      label: planState === "CONDITIONAL" ? EE.pullbackEntry : EE.entryZone,
      value: fmt(data.entry_primary),
      secondary: planState === "ACTIVE" && data.entry_aggressive != null && data.entry_conservative != null
        ? `${EE.aggressive}: ${fmt(data.entry_aggressive)}  |  ${EE.conservative}: ${fmt(data.entry_conservative)}`
        : null,
    },
    {
      label: EE.stopLoss,
      value: fmt(data.stop_loss),
      accent: colors.danger,
      secondary: stopPct() ? EE.belowEntry(parseFloat(stopPct()!)) : null,
    },
    {
      label: EE.targetTP1,
      value: fmt(data.tp1),
      accent: colors.success,
      secondary: data.tp1_probability != null
        ? `${EE.probability(data.tp1_probability)}${tp1GainText ? `  (${tp1GainText})` : ""}`
        : null,
    },
    {
      label: EE.targetTP2,
      value: fmt(data.tp2),
      accent: colors.success,
      secondary: data.tp2_probability != null
        ? `${EE.probability(data.tp2_probability)}${gainText(deriveGainPct(data.entry_primary, data.tp2)) ? `  (${gainText(deriveGainPct(data.entry_primary, data.tp2))})` : ""}`
        : null,
    },
    {
      label: EE.targetTP3,
      value: fmt(data.tp3),
      accent: colors.success,
      secondary: data.tp3_probability != null
        ? `${EE.probability(data.tp3_probability)}${gainText(deriveGainPct(data.entry_primary, data.tp3)) ? `  (${gainText(deriveGainPct(data.entry_primary, data.tp3))})` : ""}`
        : null,
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={[styles.stateBanner, { borderBottomColor: colors.borderColor }]}>
        <Text style={[styles.stateTitle, { color: stateAccent }]}>{stateTitle}</Text>
        {stateBody ? (
          <Text style={[styles.stateBody, { color: colors.textPrimary }]}>{stateBody}</Text>
        ) : null}
        {stateNote ? (
          <Text style={[styles.stateNote, { color: colors.textMuted }]}>{stateNote}</Text>
        ) : null}
      </View>

      {planState !== "DECLINED" ? (
        <>
          {rows.map((row) => (
            <View key={row.label} style={[styles.row, { borderBottomColor: colors.borderColor }]}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{row.label}</Text>
              <View style={styles.rowRight}>
                <Text
                  style={[styles.rowValue, { color: row.accent ?? colors.textPrimary }]}
                >
                  {row.value}
                </Text>
                {row.secondary ? (
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>{row.secondary}</Text>
                ) : null}
              </View>
            </View>
          ))}

          <View style={styles.footer}>
            {planState === "ACTIVE" && data.position_size_pct != null && (
              <View style={styles.footerItem}>
                <Text style={[styles.footerLabel, { color: colors.textMuted }]}>
                  {EE.suggestedSize}
                </Text>
                <Text style={[styles.footerValue, { color: colors.accentPrimary }]}>
                  {data.position_size_pct.toFixed(1)}%
                  {data.liquidity_capped ? " (capped)" : ""}
                </Text>
              </View>
            )}
            {rrRatio() && (
              <View style={styles.footerItem}>
                <Text style={[styles.footerLabel, { color: colors.textMuted }]}>
                  {planState === "CONDITIONAL" ? EE.conditionalPlan : EE.riskReward}
                </Text>
                <Text style={[styles.footerValue, { color: colors.textSecondary }]}>
                  {rrRatio() === reviewLabel
                    ? reviewLabel
                    : planState === "CONDITIONAL"
                      ? EE.conditionalFooter(parseFloat(rrRatio()!))
                      : `1 : ${rrRatio()}`}
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  stateBanner: {
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  stateTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  stateBody: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  stateNote: {
    fontSize: 11,
    lineHeight: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  rowRight: {
    alignItems: "flex-end",
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  rowSub: {
    fontSize: 11,
    marginTop: 2,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm,
    gap: UITokens.spacing.md,
  },
  footerItem: {
    flex: 1,
    gap: 2,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  footerValue: {
    fontSize: 14,
    fontWeight: "700",
  },
});
