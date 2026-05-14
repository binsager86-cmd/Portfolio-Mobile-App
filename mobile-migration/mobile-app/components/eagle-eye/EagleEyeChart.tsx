/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * EagleEyeChart — static mini price chart using react-native-svg.
 *
 * Draws a filled area chart of close prices with overlaid S/R level lines.
 * No gesture handling (static first pass).
 * Follows the same SVG pattern as PortfolioChart.tsx.
 */
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import type { SupportResistanceLevel } from "@/hooks/useEagleEye";

interface EagleEyeChartProps {
  prices: number[];
  supports?: SupportResistanceLevel[];
  resistances?: SupportResistanceLevel[];
  width?: number;
  height?: number;
  lastPrice?: number | null;
}

function buildPath(
  prices: number[],
  width: number,
  height: number,
  minVal: number,
  maxVal: number
): string {
  if (prices.length < 2) return "";
  const range = maxVal - minVal || 1;
  const pad = 8;

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = pad + ((maxVal - p) / range) * (height - 2 * pad);
    return { x, y };
  });

  const start = points[0];
  const segments = points
    .slice(1)
    .map((pt) => `L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");

  return [
    `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`,
    segments,
    `L ${points[points.length - 1].x.toFixed(1)} ${height}`,
    `L 0 ${height}`,
    "Z",
  ].join(" ");
}

function buildLinePath(
  prices: number[],
  width: number,
  height: number,
  minVal: number,
  maxVal: number
): string {
  if (prices.length < 2) return "";
  const range = maxVal - minVal || 1;
  const pad = 8;

  return prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = pad + ((maxVal - p) / range) * (height - 2 * pad);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function levelY(
  price: number,
  width: number,
  height: number,
  minVal: number,
  maxVal: number
): number {
  const range = maxVal - minVal || 1;
  const pad = 8;
  return pad + ((maxVal - price) / range) * (height - 2 * pad);
}

export const EagleEyeChart = React.memo(function EagleEyeChart({
  prices,
  supports = [],
  resistances = [],
  width = 320,
  height = 120,
  lastPrice,
}: EagleEyeChartProps) {
  const { colors } = useThemeStore();

  const { min, max } = useMemo(() => {
    if (!prices.length) return { min: 0, max: 1 };
    const allLevels = [
      ...prices,
      ...supports.map((s) => s.price),
      ...resistances.map((r) => r.price),
    ];
    return { min: Math.min(...allLevels), max: Math.max(...allLevels) };
  }, [prices, supports, resistances]);

  const areaPath = useMemo(
    () => buildPath(prices, width, height, min, max),
    [prices, width, height, min, max]
  );
  const linePath = useMemo(
    () => buildLinePath(prices, width, height, min, max),
    [prices, width, height, min, max]
  );

  if (!prices.length) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
          Chart unavailable
        </Text>
      </View>
    );
  }

  const isUp =
    prices.length >= 2 ? prices[prices.length - 1] >= prices[0] : true;
  const lineColor = isUp ? colors.success : colors.danger;
  const gradId = "eeGrad";

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bgCard }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={lineColor} stopOpacity={0.0} />
          </LinearGradient>
        </Defs>

        {/* Area fill */}
        <Path d={areaPath} fill={`url(#${gradId})`} />

        {/* Support lines */}
        {supports.slice(0, 3).map((s, i) => {
          const y = levelY(s.price, width, height, min, max);
          if (y < 0 || y > height) return null;
          return (
            <Line
              key={`s${i}`}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke={colors.success}
              strokeWidth={1}
              strokeDasharray="3,4"
              opacity={0.55}
            />
          );
        })}

        {/* Resistance lines */}
        {resistances.slice(0, 3).map((r, i) => {
          const y = levelY(r.price, width, height, min, max);
          if (y < 0 || y > height) return null;
          return (
            <Line
              key={`r${i}`}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke={colors.danger}
              strokeWidth={1}
              strokeDasharray="3,4"
              opacity={0.55}
            />
          );
        })}

        {/* Price line */}
        <Path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>

      {/* Last price overlay */}
      {lastPrice != null && (
        <View style={styles.priceTag}>
          <Text style={[styles.priceText, { color: lineColor }]}>
            {lastPrice.toFixed(3)}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: UITokens.radius.md,
    overflow: "hidden",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UITokens.radius.md,
    height: 80,
  },
  placeholderText: {
    fontSize: 12,
  },
  priceTag: {
    position: "absolute",
    right: 8,
    top: 6,
  },
  priceText: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
