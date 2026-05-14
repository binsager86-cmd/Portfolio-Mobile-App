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

  const fmt = (v: number | null | undefined, decimals = 3) =>
    v != null ? v.toFixed(decimals) : "—";

  const pct = (entry: number | null | undefined, target: number | null | undefined) => {
    if (!entry || !target) return null;
    return (((target - entry) / entry) * 100).toFixed(1);
  };

  const stopPct = () => {
    if (!data.entry_primary || !data.stop_loss) return null;
    return (
      ((data.entry_primary - data.stop_loss) / data.entry_primary) *
      100
    ).toFixed(1);
  };

  const rows: PlanRow[] = [
    {
      label: EE.entryZone,
      value: fmt(data.entry_primary),
      secondary: data.entry_aggressive != null && data.entry_conservative != null
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
        ? `${EE.probability(data.tp1_probability)}${pct(data.entry_primary, data.tp1) ? `  (${EE.gainTarget(parseFloat(pct(data.entry_primary, data.tp1)!))})` : ""}`
        : null,
    },
    {
      label: EE.targetTP2,
      value: fmt(data.tp2),
      accent: colors.success,
      secondary: data.tp2_probability != null
        ? `${EE.probability(data.tp2_probability)}${pct(data.entry_primary, data.tp2) ? `  (${EE.gainTarget(parseFloat(pct(data.entry_primary, data.tp2)!))})` : ""}`
        : null,
    },
    {
      label: EE.targetTP3,
      value: fmt(data.tp3),
      accent: colors.success,
      secondary: data.tp3_probability != null
        ? `${EE.probability(data.tp3_probability)}${pct(data.entry_primary, data.tp3) ? `  (${EE.gainTarget(parseFloat(pct(data.entry_primary, data.tp3)!))})` : ""}`
        : null,
    },
  ];

  // Risk:reward
  const rrRatio = () => {
    if (!data.entry_primary || !data.stop_loss || !data.tp1) return null;
    const risk = data.entry_primary - data.stop_loss;
    const reward = data.tp1 - data.entry_primary;
    if (risk <= 0) return null;
    return (reward / risk).toFixed(1);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
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

      {/* Footer: position size + R:R */}
      <View style={styles.footer}>
        {data.position_size_pct != null && (
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
              {EE.riskReward}
            </Text>
            <Text style={[styles.footerValue, { color: colors.textSecondary }]}>
              1 : {rrRatio()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
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
