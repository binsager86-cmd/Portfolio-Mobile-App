/* eslint-disable custom-styles/no-hardcoded-styles */

import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type { DnaSetupBar, DnaSetupExample } from "@/hooks/useEagleEye";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

const PRICE_HEIGHT = 160;
const VOLUME_HEIGHT = 46;
const INDICATOR_HEIGHT = 78;
const SECTION_GAP = 10;
const CHART_PADDING = 10;

function scaleX(index: number, count: number, width: number): number {
  if (count <= 1) return CHART_PADDING;
  return CHART_PADDING + (index / (count - 1)) * (width - CHART_PADDING * 2);
}

function scaleY(value: number, min: number, max: number, height: number): number {
  const safeRange = max - min || 1;
  return CHART_PADDING + ((max - value) / safeRange) * (height - CHART_PADDING * 2);
}

function buildLinePath(values: Array<number | null>, width: number, height: number, min: number, max: number): string {
  const segments: string[] = [];

  values.forEach((value, index) => {
    if (value == null || Number.isNaN(value)) return;
    const x = scaleX(index, values.length, width);
    const y = scaleY(value, min, max, height);
    segments.push(`${segments.length === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  });

  return segments.join(" ");
}

function getVisibleBars(example: DnaSetupExample, selectedWindowDays: number): DnaSetupBar[] {
  const visibleEnd = Math.min(
    example.bars.length - 1,
    example.setup_window_end_index + Math.max(selectedWindowDays, 1),
  );
  return example.bars.slice(0, visibleEnd + 1);
}

function getNumericRange(values: Array<number | null>, fallback: [number, number]): [number, number] {
  const numeric = values.filter((value): value is number => value != null && !Number.isNaN(value));
  if (!numeric.length) return fallback;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

function formatGain(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export const BehavioralDnaSetupChart = React.memo(function BehavioralDnaSetupChart({
  example,
  selectedWindowDays,
  colors,
}: {
  example: DnaSetupExample;
  selectedWindowDays: number;
  colors: ThemePalette;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(420, viewportWidth - UITokens.spacing.md * 4));

  const visibleBars = useMemo(
    () => getVisibleBars(example, selectedWindowDays),
    [example, selectedWindowDays],
  );

  const chartHeight = PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP + INDICATOR_HEIGHT;
  const selectedOutcome = example.forward_outcomes[String(selectedWindowDays)] ?? null;

  // Memoize bar value extraction — avoids allocating new arrays on every render
  const closeValues = useMemo(() => visibleBars.map((bar) => bar.close ?? null), [visibleBars]);
  const volumeValues = useMemo(() => visibleBars.map((bar) => bar.volume ?? null), [visibleBars]);
  const rsiValues = useMemo(() => visibleBars.map((bar) => bar.rsi ?? null), [visibleBars]);
  const adxValues = useMemo(() => visibleBars.map((bar) => bar.adx ?? null), [visibleBars]);
  const macdValues = useMemo(() => visibleBars.map((bar) => bar.macd_histogram ?? null), [visibleBars]);

  const [priceMin, priceMax] = useMemo(() => getNumericRange(closeValues, [0, 1]), [closeValues]);
  const [volumeMin, volumeMax] = useMemo(() => getNumericRange(volumeValues, [0, 1]), [volumeValues]);
  const [macdMin, macdMax] = useMemo(() => getNumericRange(macdValues, [-1, 1]), [macdValues]);

  const pricePath = useMemo(
    () => buildLinePath(closeValues, chartWidth, PRICE_HEIGHT, priceMin, priceMax),
    [chartWidth, closeValues, priceMax, priceMin],
  );
  const rsiPath = useMemo(
    () => buildLinePath(rsiValues, chartWidth, INDICATOR_HEIGHT, 0, 100),
    [chartWidth, rsiValues],
  );
  const adxPath = useMemo(
    () => buildLinePath(adxValues, chartWidth, INDICATOR_HEIGHT, 0, 60),
    [adxValues, chartWidth],
  );

  // Memoize per-bar SVG children — avoids re-creating dozens of React elements on every render
  const volumeBarElements = useMemo(
    () =>
      visibleBars.map((bar, index) => {
        const volume = bar.volume ?? null;
        if (volume == null || Number.isNaN(volume)) return null;
        const x = scaleX(index, visibleBars.length, chartWidth);
        const normalizedHeight = ((volume - volumeMin) / ((volumeMax - volumeMin) || 1)) * (VOLUME_HEIGHT - 8);
        return (
          <Rect
            key={`${bar.date}-volume`}
            x={x - 1.5}
            y={PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT - normalizedHeight}
            width={3}
            height={Math.max(2, normalizedHeight)}
            fill={colors.accentSecondary}
            opacity={0.7}
          />
        );
      }),
    [visibleBars, chartWidth, volumeMin, volumeMax, colors.accentSecondary],
  );

  const macdBarElements = useMemo(
    () =>
      visibleBars.map((bar, index) => {
        const macdHistogram = bar.macd_histogram ?? null;
        if (macdHistogram == null || Number.isNaN(macdHistogram)) return null;
        const x = scaleX(index, visibleBars.length, chartWidth);
        const baselineY = PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP + INDICATOR_HEIGHT / 2;
        const y =
          PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP + scaleY(macdHistogram, macdMin, macdMax, INDICATOR_HEIGHT);
        return (
          <Line
            key={`${bar.date}-macd`}
            x1={x}
            y1={baselineY}
            x2={x}
            y2={y}
            stroke={macdHistogram >= 0 ? colors.success : colors.danger}
            strokeWidth={2}
            opacity={0.55}
          />
        );
      }),
    [visibleBars, chartWidth, macdMin, macdMax, colors.success, colors.danger],
  );

  const observationCircles = useMemo(
    () =>
      example.observations
        .map((observation) => ({
          observation,
          index: visibleBars.findIndex((bar) => bar.date === observation.date),
        }))
        .filter((item) => item.index >= 0)
        .map(({ observation, index }) => {
          const close = visibleBars[index]?.close;
          if (close == null || Number.isNaN(close)) return null;
          const x = scaleX(index, visibleBars.length, chartWidth);
          const y = scaleY(close, priceMin, priceMax, PRICE_HEIGHT);
          return (
            <Circle
              key={`${observation.date}-${observation.signal}`}
              cx={x}
              cy={y}
              r={4}
              fill={colors.bgCard}
              stroke={colors.accentPrimary}
              strokeWidth={2}
            />
          );
        }),
    [example.observations, visibleBars, chartWidth, priceMin, priceMax, colors.bgCard, colors.accentPrimary],
  );

  if (visibleBars.length < 2) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}>
        <Text style={[styles.placeholderText, { color: colors.textMuted }]}>Chart unavailable</Text>
      </View>
    );
  }

  const setupStartX = scaleX(example.setup_window_start_index, visibleBars.length, chartWidth);
  const setupEndX = scaleX(
    Math.min(example.setup_window_end_index, visibleBars.length - 1),
    visibleBars.length,
    chartWidth,
  );
  const horizonEndIndex = Math.min(
    visibleBars.length - 1,
    example.setup_window_end_index + Math.max(selectedWindowDays, 1),
  );
  const horizonEndX = scaleX(horizonEndIndex, visibleBars.length, chartWidth);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor }]}> 
      <Svg width={chartWidth} height={chartHeight}>
        <Rect
          x={Math.min(setupStartX, setupEndX)}
          y={0}
          width={Math.max(8, Math.abs(setupEndX - setupStartX) + 4)}
          height={chartHeight}
          fill={colors.accentPrimary}
          opacity={0.08}
        />

        <Line
          x1={horizonEndX}
          y1={0}
          x2={horizonEndX}
          y2={chartHeight}
          stroke={colors.warning}
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.8}
        />

        <Path
          d={pricePath}
          fill="none"
          stroke={selectedOutcome?.max_gain_pct != null && selectedOutcome.max_gain_pct >= 0 ? colors.success : colors.accentPrimary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {volumeBarElements}

        <Line
          x1={CHART_PADDING}
          y1={PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP + INDICATOR_HEIGHT / 2}
          x2={chartWidth - CHART_PADDING}
          y2={PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP + INDICATOR_HEIGHT / 2}
          stroke={colors.borderColor}
          strokeWidth={1}
          opacity={0.75}
        />

        {macdBarElements}

        <Path
          d={rsiPath}
          transform={`translate(0 ${PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP})`}
          fill="none"
          stroke={colors.warning}
          strokeWidth={1.8}
        />
        <Path
          d={adxPath}
          transform={`translate(0 ${PRICE_HEIGHT + SECTION_GAP + VOLUME_HEIGHT + SECTION_GAP})`}
          fill="none"
          stroke={colors.accentTertiary}
          strokeWidth={1.8}
        />

        {observationCircles}
      </Svg>

      <View style={styles.legendRow}>
        <LegendSwatch color={colors.success} label={`Max gain ${formatGain(selectedOutcome?.max_gain_pct)}`} colors={colors} />
        <LegendSwatch color={colors.warning} label="RSI" colors={colors} />
        <LegendSwatch color={colors.accentTertiary} label="ADX" colors={colors} />
      </View>
    </View>
  );
});

function LegendSwatch({
  color,
  label,
  colors,
}: {
  color: string;
  label: string;
  colors: ThemePalette;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.sm,
    gap: UITokens.spacing.sm,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },
  placeholder: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 12,
  },
});