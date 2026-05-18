/**
 * MLBandBadge — compact ML band label for scanner rows.
 *
 * Renders a colored dot + 2-character label for:
 *   HIGH    → 🟢  "Hi"
 *   MEDIUM  → 🟡  "Md"
 *   LOW     → 🔴  "Lo"
 *   INSUFFICIENT_DATA / NO_VARIANCE → "—"
 *   null (display disabled or not SHADOW stock) → nothing
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeStore } from "@/services/themeStore";

export type MLBandLabel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "INSUFFICIENT_DATA"
  | "NO_VARIANCE"
  | null
  | undefined;

interface MLBandBadgeProps {
  band: MLBandLabel;
}

// Intentionally sub-minimum sizes: badge glyphs live inside compact scanner
// rows and are deliberately smaller than the accessibility floor (14 px).
const BADGE_FONT = { dot: 8, label: 9 } as const;

export function MLBandBadge({ band }: MLBandBadgeProps) {
  const { colors } = useThemeStore();

  const bandConfig: Record<string, { color: string; dot: string; short: string }> = {
    HIGH:              { color: colors.success,   dot: "●", short: "Hi" },
    MEDIUM:            { color: colors.warning,   dot: "●", short: "Md" },
    LOW:               { color: colors.danger,    dot: "●", short: "Lo" },
    INSUFFICIENT_DATA: { color: colors.textMuted, dot: "—", short: "—" },
    NO_VARIANCE:       { color: colors.textMuted, dot: "—", short: "—" },
  };

  if (!band) return <View style={styles.placeholder} />;

  const cfg = bandConfig[band] ?? bandConfig.INSUFFICIENT_DATA;

  return (
    <View style={styles.container}>
      <Text style={[styles.dot, { color: cfg.color }]}>{cfg.dot}</Text>
      <Text style={[styles.label, { color: cfg.color }]}>{cfg.short}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  placeholder: {
    width: 24,
  },
  dot: {
    fontSize: BADGE_FONT.dot,
    lineHeight: BADGE_FONT.dot,
  },
  label: {
    fontSize: BADGE_FONT.label,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
