/**
 * MetricCard — a single KPI card with accent bar, icon, label, value, and optional trend indicator.
 *
 * Used in the overview dashboard metrics grid.
 * Theme-aware via `useThemeStore`.
 * Responsive: touch targets ≥ 44px, fonts ≥ 14px on mobile.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { DimensionValue } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { InfoTip } from "@/components/ui/InfoTip";
import type { ThemePalette } from "@/constants/theme";

export type TrendDirection = "up" | "down" | "neutral";

export interface MetricCardProps {
  /** Display label (e.g. "Total Value") */
  label: string;
  /** Formatted display value (e.g. "12,345.678 KWD") */
  value: string;
  /** FontAwesome icon name */
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  /** Emoji fallback icon (used when `icon` is not provided) */
  emoji?: string;
  /** Trend direction — controls accent color and arrow indicator */
  trend?: TrendDirection;
  /** Optional subline text below the value */
  subline?: string;
  /** Override accent bar color */
  accentColor?: string;
  /** Card width (as percentage or number) */
  width?: string | number;
  /** Optional plain-language explanation shown via a "?" icon next to the label. */
  helpText?: string;
}

function trendColor(trend: TrendDirection | undefined, c: ThemePalette): string {
  if (trend === "up") return c.success;
  if (trend === "down") return c.danger;
  return c.accentPrimary;
}

function trendArrow(trend: TrendDirection | undefined): string {
  if (trend === "up") return " ▲";
  if (trend === "down") return " ▼";
  return "";
}

export const MetricCard = React.memo(function MetricCard({
  label,
  value,
  icon,
  emoji,
  trend,
  subline,
  accentColor,
  width = "48%",
  helpText,
}: MetricCardProps) {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();
  const accent = accentColor ?? trendColor(trend, colors);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          width: width as DimensionValue,
          padding: spacing.cardPadding,
        },
      ]}
    >
      {/* Accent top bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Help icon — anchored top-right for consistent placement across all cards */}
      {helpText ? (
        <View style={styles.helpAnchor} pointerEvents="box-none">
          <InfoTip term={label} definition={helpText} size={isPhone ? 16 : 14} />
        </View>
      ) : null}

      {/* Icon */}
      {icon ? (
        <FontAwesome
          name={icon}
          size={isPhone ? UITokens.metric.iconSize.phone : UITokens.metric.iconSize.desktop}
          color={accent}
          style={styles.icon}
        />
      ) : emoji ? (
        <Text style={[styles.emoji, { fontSize: isPhone ? 20 : 22 }]}>{emoji}</Text>
      ) : null}

      {/* Label */}
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.label,
            {
              color: colors.textSecondary,
              fontSize: isPhone ? UITokens.metric.labelSize.phone : UITokens.metric.labelSize.desktop,
              flexShrink: 1,
              paddingRight: helpText ? 28 : 0,
            },
          ]}
        >
          {label}
        </Text>
      </View>

      {/* Value + optional trend arrow */}
      <Text
        style={[
          styles.value,
          {
            color: trend ? trendColor(trend, colors) : colors.textPrimary,
            fontSize: isPhone ? UITokens.metric.valueSize.phone : UITokens.metric.valueSize.desktop,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
        {trendArrow(trend)}
      </Text>

      {/* Subline */}
      {subline ? (
        <Text
          style={[
            styles.subline,
            {
              color: colors.textMuted,
              fontSize: isPhone ? 11 : 12,
            },
          ]}
        >
          {subline}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: UITokens.card.borderRadius,
    padding: UITokens.card.padding,
    borderWidth: UITokens.card.borderWidth,
    minHeight: UITokens.metric.minHeight,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: UITokens.metric.accentBarHeight,
    borderTopLeftRadius: UITokens.card.borderRadius,
    borderTopRightRadius: UITokens.card.borderRadius,
  },
  icon: {
    marginBottom: 6,
  },
  emoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  helpAnchor: {
    position: "absolute",
    top: 4,
    right: 4,
    zIndex: 2,
  },
  value: {
    fontSize: 17,
    fontWeight: "700",
  },
  subline: {
    fontSize: 12,
    marginTop: 4,
  },
});
