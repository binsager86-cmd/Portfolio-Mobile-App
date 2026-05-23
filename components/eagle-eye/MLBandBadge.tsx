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
  size?: "sm" | "md";
  accessibilityHint?: string;
}

// Intentionally sub-minimum sizes: badge glyphs live inside compact scanner
// rows and are deliberately smaller than the accessibility floor (14 px).
const BADGE_FONT = {
  sm: { dot: 8, label: 9, placeholder: 24 },
  md: { dot: 12, label: 12, placeholder: 32 },
} as const;

export function MLBandBadge({
  band,
  size = "sm",
  accessibilityHint,
}: MLBandBadgeProps) {
  const { colors } = useThemeStore();
  const metrics = BADGE_FONT[size];

  const bandConfig: Record<string, { color: string; dot: string; short: string }> = {
    HIGH:              { color: colors.success,   dot: "●", short: "Hi" },
    MEDIUM:            { color: colors.warning,   dot: "●", short: "Md" },
    LOW:               { color: colors.danger,    dot: "●", short: "Lo" },
    INSUFFICIENT_DATA: { color: colors.textMuted, dot: "—", short: "—" },
    NO_VARIANCE:       { color: colors.textMuted, dot: "—", short: "—" },
  };

  if (!band) {
    return <View style={[styles.placeholder, { width: metrics.placeholder }]} />;
  }

  const cfg = bandConfig[band] ?? bandConfig.INSUFFICIENT_DATA;

  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityHint={accessibilityHint}
    >
      <Text style={[styles.dot, { color: cfg.color, fontSize: metrics.dot, lineHeight: metrics.dot }]}>{cfg.dot}</Text>
      <Text style={[styles.label, { color: cfg.color, fontSize: metrics.label, lineHeight: metrics.label + 1 }]}>{cfg.short}</Text>
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
    width: BADGE_FONT.sm.placeholder,
  },
  dot: {
    fontSize: BADGE_FONT.sm.dot,
    lineHeight: BADGE_FONT.sm.dot,
  },
  label: {
    fontSize: BADGE_FONT.sm.label,
    lineHeight: BADGE_FONT.sm.label + 1,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
