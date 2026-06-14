/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * DnaSimilarSetupsCard — shows the top-K historically similar setups
 * from the ML pattern store (cosine-similarity nearest-neighbour).
 */
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type { SimilarSetup } from "@/hooks/useEagleEye";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function DnaSimilarSetupsCard({ setups, colors }: { setups: SimilarSetup[]; colors: ThemePalette }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>🔍 Most Similar Past Setups</Text>
      <Text style={[styles.helper, { color: colors.textSecondary }]}>
        Historical dates with the most similar indicator fingerprint to today — and what happened after.
      </Text>
      {setups.map((setup, i) => {
        const simPct = Math.round((setup.similarity ?? 0) * 100);
        const gain = setup.max_excursion_pct;
        const outcome = setup.primary_label === 1 ? "Breakout ✓" : setup.primary_label === 0 ? "No breakout" : "Unknown";
        const gainColor = gain == null ? colors.textMuted : gain >= 0 ? colors.success : colors.danger;
        return (
          <View key={`sim${i}`} style={[styles.row, { borderColor: colors.borderColor }]}>
            <View style={styles.left}>
              <Text style={[styles.date, { color: colors.textPrimary }]}>{setup.date ?? "—"}</Text>
              <Text style={[styles.outcome, { color: setup.primary_label === 1 ? colors.success : colors.textMuted }]}>
                {outcome}
              </Text>
            </View>
            <View style={styles.right}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${simPct}%`, backgroundColor: colors.accentPrimary }]} />
              </View>
              <Text style={[styles.sim, { color: colors.accentPrimary }]}>{simPct}% match</Text>
              {gain != null && (
                <Text style={[styles.gain, { color: gainColor }]}>
                  {gain >= 0 ? "+" : ""}{gain.toFixed(1)}%
                </Text>
              )}
            </View>
          </View>
        );
      })}
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Similarity is cosine distance across 29 technical indicators. Higher % = more similar setup conditions.
      </Text>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  left: { flex: 1, gap: 2 },
  date: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  outcome: { fontSize: 10.5 },
  right: { flex: 1, alignItems: "flex-end", gap: 3 },
  barTrack: { width: "100%", height: 4, backgroundColor: "#ffffff11", borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2, opacity: 0.65 },
  sim: { fontSize: 11, fontWeight: "500" },
  gain: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  note: { fontSize: 10.5, lineHeight: 15, paddingTop: 4 },
});
