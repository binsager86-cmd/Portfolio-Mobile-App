/**
 * Japanese candlestick chart (price + volume panes) with TradingView-style
 * crosshair, floating tooltip, and persistent OHLCV header.
 *
 * Interaction model:
 *   - Single transparent overlay over the plot area (not per-slot hit boxes).
 *   - Web: `onMouseMove` / `onMouseLeave` on the wrapper update cursor + idx.
 *   - Native: `PanResponder` provides tap-and-drag scrubbing on touch devices.
 *   - X crosshair snaps to the nearest candle slot. Y crosshair tracks freely
 *     and renders a price label on the Y axis at the exact cursor height.
 *   - Top OHLCV bar is always visible (defaults to last candle) and updates
 *     instantly while the user scrubs — same pattern as TradingView.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type ViewProps,
} from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import type { ThemePalette } from "@/constants/theme";
import type { WhaleTrackerCandle } from "@/services/api/analytics/whaleTracker";
import { resampleWeekly } from "@/src/features/trade-signals/whaleRadar";

type Granularity = "1D" | "1W";

interface Props {
  candles: WhaleTrackerCandle[];
  colors: ThemePalette;
  maxBars?: number;
  height?: number;
}

const BULL_COLOR = "#16a34a";
const BEAR_COLOR = "#dc2626";

function formatVolume(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export function CandlestickChart({ candles, colors, maxBars = 80, height = 380 }: Props) {
  const { width: winWidth } = useWindowDimensions();
  const [granularity, setGranularity] = useState<Granularity>("1D");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const series = useMemo(
    () => (granularity === "1W" ? resampleWeekly(candles) : candles),
    [candles, granularity],
  );
  const visible = useMemo(() => series.slice(-maxBars), [series, maxBars]);

  React.useEffect(() => {
    setHoverIdx(null);
    setCursor(null);
  }, [granularity, visible.length]);

  // ── Layout ─────────────────────────────────────────────────────
  const padLeft = 56;
  const padRight = 16;
  const padTop = 8;
  const padBottom = 32;
  const paneGap = 8;
  const barWidth = 10;
  const barGap = 4;
  const chartW = Math.max(winWidth - 32, visible.length * (barWidth + barGap) + padLeft + padRight);
  const innerW = chartW - padLeft - padRight;
  const totalInnerH = height - padTop - padBottom - paneGap;
  const priceH = Math.round(totalInnerH * 0.72);
  const volumeH = totalInnerH - priceH;
  const volumeTop = padTop + priceH + paneGap;
  const slotWidth = visible.length > 0 ? innerW / visible.length : 0;

  // ── Scales ─────────────────────────────────────────────────────
  const { yScale, vScale, gridValues, volTicks, yMaxPad, yMinPad } = useMemo(() => {
    if (visible.length === 0) {
      return {
        yScale: () => 0,
        vScale: () => 0,
        gridValues: [] as number[],
        volTicks: [] as number[],
        yMaxPad: 0,
        yMinPad: 0,
      };
    }
    const highs = visible.map((c) => c.high);
    const lows = visible.map((c) => c.low);
    const yMax = Math.max(...highs);
    const yMin = Math.min(...lows);
    const yRange = yMax - yMin || 1;
    const padPct = 0.05;
    const yMaxP = yMax + yRange * padPct;
    const yMinP = yMin - yRange * padPct;
    const yRangeP = yMaxP - yMinP;
    const ys = (v: number) => padTop + ((yMaxP - v) / yRangeP) * priceH;
    const vMax = Math.max(...visible.map((c) => c.volume), 1);
    const vs = (v: number) => volumeTop + (1 - v / vMax) * volumeH;
    const gridLevels = 5;
    const gv = Array.from({ length: gridLevels }, (_, i) => yMaxP - (yRangeP * i) / (gridLevels - 1));
    return {
      yScale: ys,
      vScale: vs,
      gridValues: gv,
      volTicks: [vMax, vMax / 2, 0],
      yMaxPad: yMaxP,
      yMinPad: yMinP,
    };
  }, [visible, priceH, volumeH, padTop, volumeTop]);

  const labelIndices = useMemo(() => {
    if (visible.length === 0) return [];
    const labelCount = Math.min(6, visible.length);
    return Array.from({ length: labelCount }, (_, i) =>
      Math.floor((i * (visible.length - 1)) / Math.max(labelCount - 1, 1)),
    );
  }, [visible.length]);

  // ── Pointer handling (continuous, snapped X) ──────────────────
  const handleMove = (x: number, y: number) => {
    if (slotWidth <= 0) return;
    if (x < padLeft || x > chartW - padRight) {
      setHoverIdx(null);
      setCursor(null);
      return;
    }
    const i = Math.floor((x - padLeft) / slotWidth);
    const idx = Math.max(0, Math.min(visible.length - 1, i));
    const snappedX = padLeft + slotWidth * idx + slotWidth / 2;
    setHoverIdx(idx);
    setCursor({ x: snappedX, y });
  };

  const handleLeave = () => {
    setHoverIdx(null);
    setCursor(null);
  };

  // RN-web maps these directly onto the underlying DOM <div>.
  // On native they're silently ignored, so the cast is safe.
  const webHandlers = {
    onMouseMove: (e: { nativeEvent: { offsetX?: number; offsetY?: number } }) => {
      const ne = e.nativeEvent;
      if (typeof ne.offsetX === "number" && typeof ne.offsetY === "number") {
        handleMove(ne.offsetX, ne.offsetY);
      }
    },
    onMouseLeave: handleLeave,
  } as unknown as ViewProps;

  // Native: tap-and-drag scrub via PanResponder.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        handleMove(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        handleMove(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      },
      onPanResponderRelease: handleLeave,
      onPanResponderTerminate: handleLeave,
    }),
  ).current;

  // ── Display values for the persistent top bar ─────────────────
  const displayed = hoverIdx !== null ? visible[hoverIdx] : visible[visible.length - 1];
  const prevForChange =
    hoverIdx !== null && hoverIdx > 0
      ? visible[hoverIdx - 1].close
      : visible.length > 1
        ? visible[visible.length - 2].close
        : displayed?.open ?? 0;
  const change = displayed ? displayed.close - prevForChange : 0;
  const changePct = displayed && prevForChange ? (change / prevForChange) * 100 : 0;
  const dispColor = displayed && displayed.close >= displayed.open ? BULL_COLOR : BEAR_COLOR;

  // Free-cursor price (for the Y-axis label pill)
  const cursorPrice = useMemo(() => {
    if (!cursor) return null;
    if (cursor.y < padTop || cursor.y > padTop + priceH) return null;
    return yMaxPad - ((cursor.y - padTop) / priceH) * (yMaxPad - yMinPad);
  }, [cursor, padTop, priceH, yMaxPad, yMinPad]);

  if (visible.length === 0 || !displayed) return null;

  return (
    <View style={[styles.wrap, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
      {/* ── Header row ───────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Price Action — Candlesticks</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {visible.length} {granularity === "1W" ? "weeks" : "sessions"} ·{" "}
            {visible[0].date.slice(0, 10)} → {visible[visible.length - 1].date.slice(0, 10)}
          </Text>
        </View>
        <View style={[styles.toggle, { borderColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
          {((["1D", "1W"] as Granularity[])).map((g) => {
            const active = granularity === g;
            return (
              <Pressable
                key={g}
                onPress={() => setGranularity(g)}
                style={[styles.toggleBtn, active && { backgroundColor: colors.accentPrimary }]}
              >
                <Text style={[styles.toggleText, { color: active ? "#fff" : colors.textSecondary }]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Persistent OHLCV bar (TradingView-style) ─────────── */}
      <View
        style={[
          styles.topBar,
          { borderColor: colors.borderColor, backgroundColor: colors.bgSecondary },
          hoverIdx !== null && { borderColor: colors.accentPrimary },
        ]}
      >
        <Text style={[styles.topBarDate, { color: colors.textPrimary }]}>{displayed.date.slice(0, 10)}</Text>
        <View style={styles.topBarCells}>
          <TopBarCell colors={colors} label="O" value={displayed.open.toFixed(2)} />
          <TopBarCell colors={colors} label="H" value={displayed.high.toFixed(2)} valueColor={BULL_COLOR} />
          <TopBarCell colors={colors} label="L" value={displayed.low.toFixed(2)} valueColor={BEAR_COLOR} />
          <TopBarCell colors={colors} label="C" value={displayed.close.toFixed(2)} valueColor={dispColor} />
          <TopBarCell colors={colors} label="VOL" value={formatVolume(displayed.volume)} />
        </View>
        <Text style={[styles.topBarChange, { color: dispColor }]}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)} ({changePct >= 0 ? "+" : ""}
          {changePct.toFixed(2)}%)
        </Text>
      </View>

      {/* ── Chart surface ────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View
          style={{ width: chartW, height }}
          {...panResponder.panHandlers}
          {...webHandlers}
        >
          <Svg width={chartW} height={height} pointerEvents="none">
            {/* Price grid */}
            {gridValues.map((v, i) => {
              const y = yScale(v);
              return (
                <G key={`grid-${i}`}>
                  <Line
                    x1={padLeft}
                    x2={chartW - padRight}
                    y1={y}
                    y2={y}
                    stroke={colors.borderColor}
                    strokeWidth={1}
                    strokeDasharray="2,4"
                    opacity={0.5}
                  />
                  <SvgText x={padLeft - 6} y={y + 4} fontSize={11} fill={colors.textMuted} textAnchor="end">
                    {v.toFixed(2)}
                  </SvgText>
                </G>
              );
            })}

            {/* Candles */}
            {visible.map((c, i) => {
              const cx = padLeft + slotWidth * i + slotWidth / 2;
              const isBull = c.close >= c.open;
              const color = isBull ? BULL_COLOR : BEAR_COLOR;
              const yHigh = yScale(c.high);
              const yLow = yScale(c.low);
              const yOpen = yScale(c.open);
              const yClose = yScale(c.close);
              const bodyTop = Math.min(yOpen, yClose);
              const bodyH = Math.max(Math.abs(yClose - yOpen), 1);
              return (
                <G key={`candle-${c.date}-${i}`}>
                  <Line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1.2} />
                  <Rect
                    x={cx - barWidth / 2}
                    y={bodyTop}
                    width={barWidth}
                    height={bodyH}
                    fill={color}
                    stroke={color}
                    strokeWidth={1}
                  />
                </G>
              );
            })}

            {/* Volume pane separator */}
            <Line
              x1={padLeft}
              x2={chartW - padRight}
              y1={volumeTop}
              y2={volumeTop}
              stroke={colors.borderColor}
              strokeWidth={1}
              opacity={0.6}
            />

            {/* Volume axis ticks */}
            {volTicks.map((v, i) => (
              <SvgText
                key={`vtick-${i}`}
                x={padLeft - 6}
                y={vScale(v) + 4}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {formatVolume(v)}
              </SvgText>
            ))}

            {/* Volume bars */}
            {visible.map((c, i) => {
              const cx = padLeft + slotWidth * i + slotWidth / 2;
              const isBull = c.close >= c.open;
              const color = isBull ? BULL_COLOR : BEAR_COLOR;
              const y = vScale(c.volume);
              const h = Math.max(volumeTop + volumeH - y, 1);
              return (
                <Rect
                  key={`vol-${c.date}-${i}`}
                  x={cx - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={h}
                  fill={color}
                  opacity={0.65}
                />
              );
            })}

            {/* X-axis date labels */}
            {labelIndices.map((idx) => {
              const cx = padLeft + slotWidth * idx + slotWidth / 2;
              const dateStr = visible[idx]?.date.slice(0, 10) ?? "";
              return (
                <SvgText
                  key={`xlabel-${idx}`}
                  x={cx}
                  y={height - 10}
                  fontSize={10}
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {dateStr.slice(5)}
                </SvgText>
              );
            })}

            {/* Crosshair */}
            {cursor && hoverIdx !== null && (
              <G key="crosshair">
                {/* Vertical (snapped) */}
                <Line
                  x1={cursor.x}
                  x2={cursor.x}
                  y1={padTop}
                  y2={volumeTop + volumeH}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.85}
                />
                {/* Horizontal (free, only inside price pane) */}
                {cursor.y >= padTop && cursor.y <= padTop + priceH && (
                  <>
                    <Line
                      x1={padLeft}
                      x2={chartW - padRight}
                      y1={cursor.y}
                      y2={cursor.y}
                      stroke={colors.textSecondary}
                      strokeWidth={1}
                      strokeDasharray="3,3"
                      opacity={0.85}
                    />
                    {cursorPrice !== null && (
                      <G>
                        <Rect
                          x={2}
                          y={cursor.y - 10}
                          width={padLeft - 6}
                          height={20}
                          rx={3}
                          fill={colors.accentPrimary}
                        />
                        <SvgText
                          x={padLeft - 6}
                          y={cursor.y + 4}
                          fontSize={11}
                          fontWeight="700"
                          fill="#fff"
                          textAnchor="end"
                        >
                          {cursorPrice.toFixed(2)}
                        </SvgText>
                      </G>
                    )}
                  </>
                )}
                {/* X-axis date label pill */}
                <G>
                  <Rect
                    x={cursor.x - 38}
                    y={height - padBottom + 4}
                    width={76}
                    height={20}
                    rx={3}
                    fill={colors.accentPrimary}
                  />
                  <SvgText
                    x={cursor.x}
                    y={height - padBottom + 18}
                    fontSize={11}
                    fontWeight="700"
                    fill="#fff"
                    textAnchor="middle"
                  >
                    {visible[hoverIdx].date.slice(0, 10)}
                  </SvgText>
                </G>
              </G>
            )}
          </Svg>

          {/* Floating tooltip near cursor */}
          {cursor && hoverIdx !== null && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                {
                  borderColor: colors.borderColor,
                  backgroundColor: colors.bgCard,
                  left:
                    cursor.x + 200 > chartW - padRight
                      ? Math.max(padLeft, cursor.x - 210)
                      : cursor.x + 12,
                  top: Math.max(padTop, Math.min(cursor.y - 10, height - 150)),
                },
              ]}
            >
              <Text style={[styles.tooltipDate, { color: colors.textPrimary }]}>
                {visible[hoverIdx].date.slice(0, 10)}
              </Text>
              <TooltipRow colors={colors} label="Open" value={visible[hoverIdx].open.toFixed(2)} />
              <TooltipRow colors={colors} label="High" value={visible[hoverIdx].high.toFixed(2)} valueColor={BULL_COLOR} />
              <TooltipRow colors={colors} label="Low" value={visible[hoverIdx].low.toFixed(2)} valueColor={BEAR_COLOR} />
              <TooltipRow
                colors={colors}
                label="Close"
                value={visible[hoverIdx].close.toFixed(2)}
                valueColor={visible[hoverIdx].close >= visible[hoverIdx].open ? BULL_COLOR : BEAR_COLOR}
              />
              <TooltipRow colors={colors} label="Volume" value={formatVolume(visible[hoverIdx].volume)} />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: BULL_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Bullish</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: BEAR_COLOR }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Bearish</Text>
        </View>
        <Text style={[styles.legendText, { color: colors.textMuted, marginLeft: "auto" }]}>
          Hover (web) or tap-and-drag (mobile) to inspect
        </Text>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function TopBarCell({
  colors,
  label,
  value,
  valueColor,
}: {
  colors: ThemePalette;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.topBarCell}>
      <Text style={[styles.topBarLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.topBarValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function TooltipRow({
  colors,
  label,
  value,
  valueColor,
}: {
  colors: ThemePalette;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={[styles.tooltipLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.tooltipValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, padding: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  subtitle: { fontSize: 13 },
  toggle: { flexDirection: "row", borderWidth: 1, borderRadius: 8, padding: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  toggleText: { fontSize: 13, fontWeight: "700" },

  topBar: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  topBarDate: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  topBarCells: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "baseline", flex: 1 },
  topBarCell: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  topBarLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  topBarValue: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  topBarChange: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },

  tooltip: {
    position: "absolute",
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    gap: 4,
  },
  tooltipDate: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  tooltipRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  tooltipLabel: { fontSize: 12 },
  tooltipValue: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },

  legend: { flexDirection: "row", gap: 16, marginTop: 8, flexWrap: "wrap", alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  legendText: { fontSize: 12 },
});
