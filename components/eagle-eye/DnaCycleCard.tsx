/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * DnaCycleCard — shows per-stock recurring setup cycle detection.
 * Renders period, days-since-last, and estimated days-to-next.
 */
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type { CycleProfile } from "@/hooks/useEagleEye";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function DnaCycleCard({ cycle, colors }: { cycle: CycleProfile; colors: ThemePalette }) {
  const confColor =
    cycle.period_confidence === "STRONG" ? colors.success :
    cycle.period_confidence === "MODERATE" ? colors.warning :
    colors.textMuted;

  const inWindow = cycle.days_to_next <= 0;
  const statusLabel = inWindow
    ? "Likely inside setup window now"
    : `~${Math.round(cycle.days_to_next)} trading days to next window`;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>📈 Cycle Analysis</Text>
      <Text style={[styles.helper, { color: colors.textSecondary }]}>
        Based on {cycle.sample_count} historical setup gaps, this stock recurs every ~{Math.round(cycle.period_days)} trading days (±{Math.round(cycle.std_days)}d).
      </Text>
      <View style={[styles.row, { backgroundColor: colors.bgCardHover, borderColor: confColor + "44" }]}>
        <Stat val={`${Math.round(cycle.period_days)}d`} lbl="Avg Period" valColor={confColor} colors={colors} />
        <Stat val={`${cycle.days_since_last}d`} lbl="Since Last" valColor={colors.textPrimary} colors={colors} />
        <Stat
          val={inWindow ? "NOW" : `~${Math.round(cycle.days_to_next)}d`}
          lbl="To Next"
          valColor={inWindow ? colors.success : colors.accentPrimary}
          colors={colors}
        />
        <View style={[styles.badge, { backgroundColor: confColor + "22", borderColor: confColor }]}>
          <Text style={[styles.badgeText, { color: confColor }]}>{cycle.period_confidence}</Text>
        </View>
      </View>
      <Text style={[styles.status, { color: inWindow ? colors.success : colors.textSecondary }]}>
        {statusLabel}
      </Text>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        IRREGULAR = cycle varies widely; treat as directional bias only, not a precise timer.
      </Text>
    </View>
  );
}

function Stat({ val, lbl, valColor, colors }: { val: string; lbl: string; valColor: string; colors: ThemePalette }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: valColor }]}>{val}</Text>
      <Text style={[styles.statLbl, { color: colors.textMuted }]}>{lbl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  helper: { fontSize: 12.5, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: UITokens.radius.sm,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 16,
  },
  stat: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 9.5, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  status: { fontSize: 12.5, fontWeight: "500" },
  note: { fontSize: 10.5, lineHeight: 15 },
});
