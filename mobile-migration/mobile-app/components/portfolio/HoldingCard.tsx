/**
 * Professional Holdings Card Component
 * 
 * Modern financial portfolio card with:
 * - Clear visual hierarchy (symbol prominent, allocation badge)
 * - Gain/loss visual indicators (color-coded, trending arrows)
 * - Improved typography and spacing for mobile
 * - Gradient backgrounds for visual appeal
 * - Touch-friendly sizing and hit targets
 * - Accessibility support (WCAG compliant)
 * 
 * Design System:
 * - Typography: Symbol (800 weight), Company (500 weight), Values (700 weight)
 * - Colors: Gain (green), Loss (red), Neutral (muted)
 * - Spacing: 14px padding, 8px gap between sections
 * - Border: 1px with gain/loss color overlay
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { formatCurrency, formatPercent } from "@/lib/currency";
import { pnlColor } from "@/lib/formatting";
import { useThemeStore } from "@/services/themeStore";

export interface HoldingCardData {
  symbol: string;
  company: string;
  quantity: number;
  costPerPrice: number;
  lastPrice: number;
  changePct: number | null;
  totalValueChange: number | null;
  totalValue?: number;
  allocation?: number;
}

export const HoldingCard = React.memo(function HoldingCard({ holding }: { holding: HoldingCardData }) {
  const { colors, mode } = useThemeStore();

  // Compute derived values with memoization
  const isGain = useMemo(
    () => (holding.changePct ?? 0) >= 0,
    [holding.changePct]
  );

  const priceChangeColor = useMemo(
    () => pnlColor(holding.changePct ?? 0, colors),
    [holding.changePct, colors]
  );

  const valueChangeColor = useMemo(
    () => pnlColor(holding.totalValueChange ?? 0, colors),
    [holding.totalValueChange, colors]
  );

  // Gradient overlay based on gain/loss
  const gradientColors = useMemo(() => {
    if (isGain) {
      return mode === "dark"
        ? ([colors.success + "15", colors.bgCard] as const) // Green tint for dark mode
        : ([colors.success + "08", colors.bgCard] as const); // Subtle green for light mode
    } else {
      return mode === "dark"
        ? ([colors.danger + "15", colors.bgCard] as const)
        : ([colors.danger + "08", colors.bgCard] as const);
    }
  }, [isGain, mode, colors]);

  // Border color based on gain/loss
  const borderColor = isGain
    ? colors.success + "40"
    : colors.danger + "40";

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor: colors.bgCard,
        },
      ]}
    >
      {/* Header: Symbol + Company + Allocation Badge */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.symbol, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {holding.symbol}
          </Text>
          <Text
            style={[styles.company, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {holding.company}
          </Text>
        </View>

        {/* Allocation Badge (if available) */}
        {holding.allocation != null && (
          <View
            style={[
              styles.allocationBadge,
              {
                backgroundColor: colors.accentPrimary + "18",
                borderColor: colors.accentPrimary + "40",
              },
            ]}
          >
            <Text
              style={[
                styles.allocationText,
                { color: colors.accentPrimary },
              ]}
            >
              {formatPercent(holding.allocation)}
            </Text>
          </View>
        )}
      </View>

      {/* Primary Metrics Row: Quantity | Last Price */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBlock}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
            QUANTITY
          </Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
            {holding.quantity.toLocaleString()}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

        <View style={styles.metricBlock}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
            LAST PRICE
          </Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
            {formatCurrency(holding.lastPrice)}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

        <View style={[styles.metricBlock, { alignItems: "flex-end" }]}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
            CHANGE
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <FontAwesome
              name={isGain ? "arrow-up" : "arrow-down"}
              size={10}
              color={priceChangeColor}
              style={{ marginRight: 2 }}
            />
            <Text style={[styles.changeValue, { color: priceChangeColor }]}>
              {holding.changePct == null
                ? "—"
                : `${holding.changePct >= 0 ? "+" : ""}${holding.changePct.toFixed(2)}%`}
            </Text>
          </View>
        </View>
      </View>

      {/* Cost Basis + Total Value Row */}
      <View style={[styles.infoRow, { borderTopColor: colors.borderColor }]}>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
            Cost Basis
          </Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
            {formatCurrency(holding.costPerPrice)}
          </Text>
        </View>

        {holding.totalValue != null && (
          <View style={[styles.infoBlock, { alignItems: "flex-end" }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
              Total Value
            </Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {formatCurrency(holding.totalValue)}
            </Text>
          </View>
        )}

        {holding.totalValueChange != null && (
          <View style={[styles.infoBlock, { alignItems: "flex-end" }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
              Day Value Chg
            </Text>
            <Text
              style={[
                styles.infoValue,
                { color: valueChangeColor, fontWeight: "700" },
              ]}
            >
              {holding.totalValueChange >= 0 ? "+" : ""}
              {formatCurrency(holding.totalValueChange)}
            </Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  symbol: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
    lineHeight: 20,
  },
  company: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    lineHeight: 16,
  },
  allocationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  allocationText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  metricBlock: {
    flex: 1,
    alignItems: "flex-start",
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 2,
    opacity: 0.8,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  changeValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  divider: {
    width: 1,
    height: 28,
    marginHorizontal: 8,
    opacity: 0.4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: 1,
  },
  infoBlock: {
    flex: 1,
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 2,
    opacity: 0.75,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
