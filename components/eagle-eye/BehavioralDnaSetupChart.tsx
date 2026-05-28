/**
 * BehavioralDnaSetupChart
 *
 * Interactive multi-pane setup evidence chart for Eagle Eye Behavioral DNA.
 * Uses candlestick rendering with setup zone, horizon marker, volume,
 * indicators, tooltip, and crosshair behavior.
 */

/* eslint-disable custom-styles/no-hardcoded-styles */

import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import type { DnaSetupBar, DnaSetupExample } from "@/hooks/useEagleEye";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

// ── Constants ────────────────────────────────────────────────────────

const BULL_COLOR = "#16a34a";
const BEAR_COLOR = "#dc2626";
const RSI_COLOR  = "#f59e0b"; // amber
const ADX_COLOR  = "#14b8a6"; // teal

// Layout proportions
const PAD_LEFT   = 52;
const PAD_RIGHT  = 12;
const PAD_TOP    = 8;
const PAD_BOTTOM = 28; // room for X-axis labels
const PANE_GAP   = 6;

// Pane height ratios (must sum to 1)
const PRICE_RATIO  = 0.60;
const VOLUME_RATIO = 0.14;
const IND_RATIO    = 0.26;

// ── Helpers ──────────────────────────────────────────────────────────

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 10)   return v.toFixed(2);
  return v.toFixed(3);
}

function fmtVol(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function fmtGain(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function numericRange(
  values: Array<number | null>,
  fallback: [number, number],
): [number, number] {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return fallback;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? [min - 1, max + 1] : [min, max];
}

function buildLinePath(
  values: Array<number | null>,
  count: number,
  slotW: number,
  padLeft: number,
  yMin: number,
  yMax: number,
  yTop: number,
  yHeight: number,
): string {
  const segs: string[] = [];
  values.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) return;
    const x = padLeft + slotW * i + slotW / 2;
    const range = yMax - yMin || 1;
    const y = yTop + ((yMax - v) / range) * yHeight;
    segs.push(`${segs.length === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  return segs.join(" ");
}

function getVisibleBars(
  example: DnaSetupExample,
  selectedWindowDays: number,
): DnaSetupBar[] {
  const visibleEnd = Math.min(
    example.bars.length - 1,
    example.setup_window_end_index + Math.max(selectedWindowDays, 1),
  );
  return example.bars.slice(0, visibleEnd + 1);
}

function asFinitePositive(value?: number | null): number | null {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

function normalizeVisibleBars(rawBars: DnaSetupBar[]): DnaSetupBar[] {
  if (rawBars.length === 0) return [];

  const firstKnownClose =
    rawBars.reduce<number | null>((acc, bar) => {
      if (acc != null) return acc;
      return asFinitePositive(bar.close) ?? asFinitePositive(bar.open);
    }, null) ?? 1;

  const normalized: DnaSetupBar[] = [];
  let prevClose: number | null = null;

  rawBars.forEach((bar) => {
    const close =
      asFinitePositive(bar.close)
      ?? asFinitePositive(bar.open)
      ?? prevClose
      ?? firstKnownClose;
    const open = asFinitePositive(bar.open) ?? prevClose ?? close;

    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);

    let high = asFinitePositive(bar.high) ?? bodyHigh;
    let low = asFinitePositive(bar.low) ?? bodyLow;

    if (high < bodyHigh) high = bodyHigh;
    if (low > bodyLow) low = bodyLow;
    if (high < low) {
      const tmp = high;
      high = low;
      low = tmp;
    }

    normalized.push({
      ...bar,
      open,
      high,
      low,
      close,
    });
    prevClose = close;
  });

  return normalized;
}

// ── Main component ───────────────────────────────────────────────────

export const BehavioralDnaSetupChart = React.memo(
  function BehavioralDnaSetupChart({
    example,
    selectedWindowDays,
    colors,
  }: {
    example: DnaSetupExample;
    selectedWindowDays: number;
    colors: ThemePalette;
  }) {
    const { width: winWidth } = useWindowDimensions();
    const [measuredW, setMeasuredW] = useState(0);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

    const chartW = measuredW || Math.max(300, winWidth - UITokens.spacing.md * 6);
    const chartH = 400;

    const innerW  = chartW - PAD_LEFT - PAD_RIGHT;
    const innerH  = chartH - PAD_TOP - PAD_BOTTOM - PANE_GAP * 2;
    const priceH  = Math.round(innerH * PRICE_RATIO);
    const volumeH = Math.round(innerH * VOLUME_RATIO);
    const indH    = Math.round(innerH * IND_RATIO);

    const volumeTop = PAD_TOP + priceH + PANE_GAP;
    const indTop    = volumeTop + volumeH + PANE_GAP;

    // ── Derived bar data ─────────────────────────────────────────
    const bars = useMemo(
      () => normalizeVisibleBars(getVisibleBars(example, selectedWindowDays)),
      [example, selectedWindowDays],
    );

    const count    = bars.length;
    const slotW    = count > 0 ? innerW / count : 0;
    const barWidth = Math.max(3, Math.min(32, slotW * 0.85));

    // Y scales
    const [priceMin, priceMax] = useMemo(() => {
      if (bars.length === 0) return [0, 1] as [number, number];
      const highs = bars.map((b) => b.high ?? b.close ?? 0);
      const lows  = bars.map((b) => b.low  ?? b.close ?? 0);
      const yMax  = Math.max(...highs);
      const yMin  = Math.min(...lows);
      const pad   = (yMax - yMin) * 0.03;
      return [yMin - pad, yMax + pad] as [number, number];
    }, [bars]);

    const [volMin, volMax] = useMemo(
      () => numericRange(bars.map((b) => b.volume ?? null), [0, 1]),
      [bars],
    );

    const [rsiMin, rsiMax] = [0, 100];
    const [adxMin, adxMax] = [0, 60];
    const macdValues = useMemo(() => bars.map((b) => b.macd_histogram ?? null), [bars]);
    const [macdMin, macdMax] = useMemo(
      () => numericRange(macdValues, [-1, 1]),
      [macdValues],
    );

    // Scale functions
    const yPrice = useCallback(
      (v: number) => PAD_TOP + ((priceMax - v) / (priceMax - priceMin || 1)) * priceH,
      [priceMax, priceMin, priceH],
    );
    const yVol = useCallback(
      (v: number) => volumeTop + (1 - (v - volMin) / ((volMax - volMin) || 1)) * volumeH,
      [volMin, volMax, volumeTop, volumeH],
    );
    const yInd = useCallback(
      (v: number, min: number, max: number) =>
        indTop + ((max - v) / (max - min || 1)) * indH,
      [indTop, indH],
    );

    // Grid lines (5 horizontal price levels)
    const gridValues = useMemo(() => {
      const steps = 4;
      return Array.from({ length: steps + 1 }, (_, i) =>
        priceMax - ((priceMax - priceMin) * i) / steps,
      );
    }, [priceMin, priceMax]);

    // X-axis label positions (up to 6 evenly spaced)
    const xLabelIndices = useMemo(() => {
      if (count === 0) return [];
      const n = Math.min(5, count);
      return Array.from({ length: n }, (_, i) =>
        Math.floor((i * (count - 1)) / Math.max(n - 1, 1)),
      );
    }, [count]);

    // Setup zone + horizon
    const setupStartX = PAD_LEFT + slotW * example.setup_window_start_index + slotW / 2;
    const setupEndX   = PAD_LEFT + slotW * Math.min(example.setup_window_end_index, count - 1) + slotW / 2;
    const horizonIdx  = Math.min(count - 1, example.setup_window_end_index + Math.max(selectedWindowDays, 1));
    const horizonX    = PAD_LEFT + slotW * horizonIdx + slotW / 2;

    const selectedOutcome = example.forward_outcomes[String(selectedWindowDays)] ?? null;

    // Last bar info
    const lastBar   = bars[count - 1];
    const lastClose = lastBar?.close ?? 0;
    const lastY     = yPrice(lastClose);
    const prevLastClose = count >= 2 ? (bars[count - 2]?.close ?? lastClose) : lastClose;
    const lastOpenVal = lastBar?.open ?? prevLastClose;
    const lastColor = lastBar && (lastBar.close ?? 0) >= lastOpenVal ? BULL_COLOR : BEAR_COLOR;

    // Hovered or last bar for info display
    const displayed = hoverIdx !== null ? bars[hoverIdx] : lastBar;
    const dispIdx   = hoverIdx !== null ? hoverIdx : count - 1;
    const prevDispClose = dispIdx > 0 ? (bars[dispIdx - 1]?.close ?? displayed?.close ?? 0) : (displayed?.close ?? 0);
    const dispOpenVal   = displayed?.open ?? prevDispClose;
    const isBullDisp = displayed ? (displayed.close ?? 0) >= dispOpenVal : true;
    const dispColor  = isBullDisp ? BULL_COLOR : BEAR_COLOR;

    // Memoized SVG element arrays ──────────────────────────────────

    // Candlestick bodies + wicks
    const candleElements = useMemo(
      () =>
        bars.map((bar, i) => {
          const cx         = PAD_LEFT + slotW * i + slotW / 2;
          // When open is missing fall back to the previous bar's close so
          // bull/bear direction is still meaningful.
          const prevClose  = i > 0 ? (bars[i - 1].close ?? bar.close) : bar.close;
          const openVal    = bar.open ?? prevClose ?? 0;
          const isBull     = (bar.close ?? 0) >= openVal;
          const color      = isBull ? BULL_COLOR : BEAR_COLOR;
          const yH         = yPrice(bar.high  ?? bar.close ?? 0);
          const yL         = yPrice(bar.low   ?? bar.close ?? 0);
          const yO         = yPrice(openVal);
          const yC         = yPrice(bar.close ?? 0);
          const bodyTop    = Math.min(yO, yC);
          const bodyH      = Math.max(Math.abs(yC - yO), 2);
          return (
            <G key={`candle-${bar.date}-${i}`}>
              <Line x1={cx} y1={yH} x2={cx} y2={yL} stroke={color} strokeWidth={2} />
              <Rect
                x={cx - barWidth / 2}
                y={bodyTop}
                width={barWidth}
                height={bodyH}
                fill={color}
                stroke={color}
                strokeWidth={1.5}
              />
            </G>
          );
        }),
      [bars, slotW, barWidth, yPrice],
    );

    // Volume bars
    const volumeElements = useMemo(
      () =>
        bars.map((bar, i) => {
          const vol = bar.volume ?? null;
          if (vol == null) return null;
          const cx        = PAD_LEFT + slotW * i + slotW / 2;
          const prevCl    = i > 0 ? (bars[i - 1].close ?? bar.close) : bar.close;
          const openV     = bar.open ?? prevCl ?? 0;
          const isBull    = (bar.close ?? 0) >= openV;
          const y         = yVol(vol);
          const h      = Math.max(1, volumeTop + volumeH - y);
          return (
            <Rect
              key={`vol-${bar.date}-${i}`}
              x={cx - barWidth / 2}
              y={y}
              width={barWidth}
              height={h}
              fill={isBull ? BULL_COLOR : BEAR_COLOR}
              opacity={0.65}
            />
          );
        }),
      [bars, slotW, barWidth, yVol, volumeTop, volumeH],
    );

    // MACD histogram bars
    const macdElements = useMemo(
      () =>
        bars.map((bar, i) => {
          const v = bar.macd_histogram ?? null;
          if (v == null) return null;
          const cx       = PAD_LEFT + slotW * i + slotW / 2;
          const baseline = yInd(0, macdMin, macdMax);
          const top      = yInd(v, macdMin, macdMax);
          const barTop   = Math.min(baseline, top);
          const barH     = Math.max(1, Math.abs(baseline - top));
          return (
            <Rect
              key={`macd-${bar.date}-${i}`}
              x={cx - barWidth / 2}
              y={barTop}
              width={barWidth}
              height={barH}
              fill={v >= 0 ? BULL_COLOR : BEAR_COLOR}
              opacity={0.6}
            />
          );
        }),
      [bars, slotW, barWidth, yInd, macdMin, macdMax],
    );

    // RSI line path
    const rsiPath = useMemo(
      () =>
        buildLinePath(
          bars.map((b) => b.rsi ?? null),
          count, slotW, PAD_LEFT,
          rsiMin, rsiMax, indTop, indH,
        ),
      [bars, count, slotW, indTop, indH],
    );

    // ADX line path
    const adxPath = useMemo(
      () =>
        buildLinePath(
          bars.map((b) => b.adx ?? null),
          count, slotW, PAD_LEFT,
          adxMin, adxMax, indTop, indH,
        ),
      [bars, count, slotW, indTop, indH],
    );

    // Observation dots (pinned to candle close price)
    const observationDots = useMemo(
      () =>
        example.observations
          .map((obs) => ({ obs, idx: bars.findIndex((b) => b.date === obs.date) }))
          .filter(({ idx }) => idx >= 0)
          .map(({ obs, idx }) => {
            const close = bars[idx]?.close;
            if (close == null) return null;
            const cx = PAD_LEFT + slotW * idx + slotW / 2;
            const cy = yPrice(close);
            return (
              <Circle
                key={`obs-${obs.date}-${obs.signal}`}
                cx={cx}
                cy={cy - 8}
                r={4.5}
                fill={colors.bgCard}
                stroke={colors.accentPrimary}
                strokeWidth={2}
              />
            );
          }),
      [example.observations, bars, slotW, yPrice, colors.bgCard, colors.accentPrimary],
    );

    // ── Pointer handling (web hover) ─────────────────────────────
    const handleMove = useCallback(
      (x: number, y: number) => {
        if (slotW <= 0) return;
        if (x < PAD_LEFT || x > chartW - PAD_RIGHT) {
          setHoverIdx(null);
          setCursor(null);
          return;
        }
        const i   = Math.floor((x - PAD_LEFT) / slotW);
        const idx = Math.max(0, Math.min(count - 1, i));
        const snappedX = PAD_LEFT + slotW * idx + slotW / 2;
        setHoverIdx(idx);
        setCursor({ x: snappedX, y });
      },
      [slotW, chartW, count],
    );

    const handleLeave = useCallback(() => {
      setHoverIdx(null);
      setCursor(null);
    }, []);

    // Web event handlers (onMouseMove, onMouseLeave, ignored on native)
    const webHandlers = {
      onMouseMove: (e: { nativeEvent: { offsetX?: number; offsetY?: number } }) => {
        const ne = e.nativeEvent;
        if (typeof ne.offsetX === "number" && typeof ne.offsetY === "number") {
          handleMove(ne.offsetX, ne.offsetY);
        }
      },
      onMouseLeave: handleLeave,
    } as unknown as ViewProps;

    // Mobile: tap nearest bar
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          handleMove(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          // Keep the selected bar visible; user taps elsewhere to clear
        },
      }),
    ).current;

    const onSurfaceLayout = (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (Math.abs(w - measuredW) > 1) setMeasuredW(w);
    };

    if (bars.length < 2) {
      return (
        <View
          style={[
            styles.placeholder,
            { backgroundColor: colors.bgCardHover, borderColor: colors.borderColor },
          ]}
        >
          <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
            Chart unavailable
          </Text>
        </View>
      );
    }

    // Cursor price (for Y-axis pill label)
    const cursorPrice =
      cursor && cursor.y >= PAD_TOP && cursor.y <= PAD_TOP + priceH
        ? priceMax - ((cursor.y - PAD_TOP) / priceH) * (priceMax - priceMin)
        : null;

    return (
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        {/* ── OHLCV info bar ─────────────────────────────────── */}
        <View
          style={[
            styles.infoBar,
            {
              backgroundColor: colors.bgSecondary ?? colors.bgCardHover,
              borderColor: hoverIdx !== null ? colors.accentPrimary : colors.borderColor,
            },
          ]}
        >
          <Text style={[styles.infoDate, { color: colors.textPrimary }]}>
            {displayed?.date?.slice(0, 10) ?? ""}
          </Text>
          <View style={styles.infoOHLCV}>
            <InfoCell label="O" value={fmtPrice(displayed?.open  ?? 0)} color={colors.textMuted} valueColor={colors.textPrimary} />
            <InfoCell label="H" value={fmtPrice(displayed?.high  ?? 0)} color={colors.textMuted} valueColor={BULL_COLOR} />
            <InfoCell label="L" value={fmtPrice(displayed?.low   ?? 0)} color={colors.textMuted} valueColor={BEAR_COLOR} />
            <InfoCell label="C" value={fmtPrice(displayed?.close ?? 0)} color={colors.textMuted} valueColor={dispColor} />
            {displayed?.volume != null && (
              <InfoCell label="V" value={fmtVol(displayed.volume)} color={colors.textMuted} valueColor={colors.textSecondary} />
            )}
          </View>
          <Text style={[styles.infoGain, { color: (selectedOutcome?.max_gain_pct ?? 0) >= 0 ? BULL_COLOR : BEAR_COLOR }]}>
            {fmtGain(selectedOutcome?.max_gain_pct)}
          </Text>
        </View>

        {/* ── Chart surface ───────────────────────────────────── */}
        <View
          onLayout={onSurfaceLayout}
          style={{ width: "100%", height: chartH }}
          {...panResponder.panHandlers}
          {...webHandlers}
        >
          <Svg width={chartW} height={chartH} pointerEvents="none">

            {/* ── Price grid horizontal lines ───────────────── */}
            {gridValues.map((v, gi) => {
              const y = yPrice(v);
              return (
                <G key={`grid-${gi}`}>
                  <Line
                    x1={PAD_LEFT} y1={y}
                    x2={chartW - PAD_RIGHT} y2={y}
                    stroke={colors.borderColor}
                    strokeWidth={1}
                    strokeDasharray="2,4"
                    opacity={0.45}
                  />
                  <SvgText
                    x={PAD_LEFT - 5} y={y + 4}
                    fontSize={9.5}
                    fill={colors.textMuted}
                    textAnchor="end"
                  >
                    {fmtPrice(v)}
                  </SvgText>
                </G>
              );
            })}

            {/* ── Setup window highlight ────────────────────── */}
            <Rect
              x={Math.min(setupStartX, setupEndX)}
              y={PAD_TOP}
              width={Math.max(6, Math.abs(setupEndX - setupStartX))}
              height={priceH + PANE_GAP + volumeH}
              fill={colors.accentPrimary}
              opacity={0.07}
            />

            {/* ── Forward horizon marker ────────────────────── */}
            {horizonX <= chartW - PAD_RIGHT && (
              <Line
                x1={horizonX} y1={PAD_TOP}
                x2={horizonX} y2={indTop + indH}
                stroke={colors.warning ?? "#f59e0b"}
                strokeWidth={1.5}
                strokeDasharray="4,4"
                opacity={0.8}
              />
            )}

            {/* Candlesticks */}
            {candleElements}

            {/* ── Observation dots ──────────────────────────── */}
            {observationDots}

            {/* ── Last price marker ─────────────────────────── */}
            {lastY >= PAD_TOP && lastY <= PAD_TOP + priceH && (
              <G key="lastprice">
                <Line
                  x1={PAD_LEFT} y1={lastY}
                  x2={chartW - PAD_RIGHT} y2={lastY}
                  stroke={lastColor}
                  strokeWidth={1}
                  strokeDasharray="3,5"
                  opacity={0.7}
                />
                <Rect
                  x={chartW - PAD_RIGHT - 52}
                  y={lastY - 9}
                  width={50}
                  height={18}
                  rx={3}
                  fill={lastColor}
                />
                <SvgText
                  x={chartW - PAD_RIGHT - 3}
                  y={lastY + 4}
                  fontSize={10}
                  fontWeight="700"
                  fill="#fff"
                  textAnchor="end"
                >
                  {fmtPrice(lastClose)}
                </SvgText>
              </G>
            )}

            {/* ── Volume pane separator ─────────────────────── */}
            <Line
              x1={PAD_LEFT} y1={volumeTop}
              x2={chartW - PAD_RIGHT} y2={volumeTop}
              stroke={colors.borderColor}
              strokeWidth={1}
              opacity={0.5}
            />

            {/* ── Volume label ──────────────────────────────── */}
            <SvgText
              x={PAD_LEFT - 5} y={volumeTop + 10}
              fontSize={8.5}
              fill={colors.textMuted}
              textAnchor="end"
            >
              VOL
            </SvgText>

            {/* ── Volume bars ───────────────────────────────── */}
            {volumeElements}

            {/* ── Indicator pane separator ──────────────────── */}
            <Line
              x1={PAD_LEFT} y1={indTop}
              x2={chartW - PAD_RIGHT} y2={indTop}
              stroke={colors.borderColor}
              strokeWidth={1}
              opacity={0.5}
            />

            {/* ── Indicator pane: RSI overbought/oversold ───── */}
            {[70, 50, 30].map((level) => {
              const y = yInd(level, rsiMin, rsiMax);
              return (
                <G key={`rsi-level-${level}`}>
                  <Line
                    x1={PAD_LEFT} y1={y}
                    x2={chartW - PAD_RIGHT} y2={y}
                    stroke={level === 50 ? colors.borderColor : level === 70 ? BEAR_COLOR : BULL_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2,4"
                    opacity={0.25}
                  />
                  <SvgText
                    x={PAD_LEFT - 4} y={y + 3}
                    fontSize={8}
                    fill={colors.textMuted}
                    textAnchor="end"
                  >
                    {level}
                  </SvgText>
                </G>
              );
            })}

            {/* ── MACD histogram ────────────────────────────── */}
            {macdElements}

            {/* ── RSI line ──────────────────────────────────── */}
            {rsiPath && (
              <Path
                d={rsiPath}
                fill="none"
                stroke={RSI_COLOR}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* ── ADX line ──────────────────────────────────── */}
            {adxPath && (
              <Path
                d={adxPath}
                fill="none"
                stroke={ADX_COLOR}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* ── X-axis date labels ────────────────────────── */}
            {xLabelIndices.map((idx) => {
              const cx = PAD_LEFT + slotW * idx + slotW / 2;
              const label = bars[idx]?.date?.slice(5, 10) ?? "";
              return (
                <SvgText
                  key={`xlabel-${idx}`}
                  x={cx}
                  y={chartH - 6}
                  fontSize={9.5}
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              );
            })}

            {/* ── Crosshair ─────────────────────────────────── */}
            {cursor && hoverIdx !== null && (
              <G key="crosshair">
                {/* Vertical snapped line */}
                <Line
                  x1={cursor.x} y1={PAD_TOP}
                  x2={cursor.x} y2={indTop + indH}
                  stroke={colors.textSecondary ?? colors.textMuted}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.7}
                />
                {/* Horizontal line (only in price pane) */}
                {cursor.y >= PAD_TOP && cursor.y <= PAD_TOP + priceH && (
                  <>
                    <Line
                      x1={PAD_LEFT} y1={cursor.y}
                      x2={chartW - PAD_RIGHT} y2={cursor.y}
                      stroke={colors.textSecondary ?? colors.textMuted}
                      strokeWidth={1}
                      strokeDasharray="3,3"
                      opacity={0.7}
                    />
                    {cursorPrice !== null && (
                      <G>
                        <Rect
                          x={2} y={cursor.y - 9}
                          width={PAD_LEFT - 5} height={18}
                          rx={3}
                          fill={colors.accentPrimary}
                        />
                        <SvgText
                          x={PAD_LEFT - 7} y={cursor.y + 4}
                          fontSize={9.5}
                          fontWeight="700"
                          fill="#fff"
                          textAnchor="end"
                        >
                          {fmtPrice(cursorPrice)}
                        </SvgText>
                      </G>
                    )}
                  </>
                )}
                {/* X-axis date pill */}
                <G>
                  <Rect
                    x={Math.max(PAD_LEFT, Math.min(cursor.x - 32, chartW - PAD_RIGHT - 66))}
                    y={chartH - PAD_BOTTOM + 4}
                    width={64}
                    height={18}
                    rx={3}
                    fill={colors.accentPrimary}
                  />
                  <SvgText
                    x={Math.max(PAD_LEFT + 32, Math.min(cursor.x, chartW - PAD_RIGHT - 34))}
                    y={chartH - PAD_BOTTOM + 16}
                    fontSize={9.5}
                    fontWeight="700"
                    fill="#fff"
                    textAnchor="middle"
                  >
                    {bars[hoverIdx]?.date?.slice(0, 10) ?? ""}
                  </SvgText>
                </G>
              </G>
            )}

          </Svg>

          {/* ── Floating tooltip (web hover) ──────────────── */}
          {cursor && hoverIdx !== null && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                  left:
                    cursor.x + 180 > chartW - PAD_RIGHT
                      ? Math.max(PAD_LEFT, cursor.x - 190)
                      : cursor.x + 10,
                  top: Math.max(PAD_TOP, Math.min(cursor.y - 10, chartH - 175)),
                },
              ]}
            >
              <Text style={[styles.ttDate, { color: colors.textPrimary }]}>
                {bars[hoverIdx]?.date?.slice(0, 10)}
              </Text>
              {(() => {
                const hBar = bars[hoverIdx];
                const hPrev = hoverIdx > 0 ? bars[hoverIdx - 1] : null;
                const hOpenVal = hBar?.open ?? hPrev?.close ?? hBar?.close ?? 0;
                const hCloseColor = (hBar?.close ?? 0) >= hOpenVal ? BULL_COLOR : BEAR_COLOR;
                return (
                  <>
                    <TooltipRow label="Open"   value={fmtPrice(hOpenVal)} colors={colors} />
                    <TooltipRow label="High"   value={fmtPrice(hBar?.high  ?? 0)} colors={colors} valueColor={BULL_COLOR} />
                    <TooltipRow label="Low"    value={fmtPrice(hBar?.low   ?? 0)} colors={colors} valueColor={BEAR_COLOR} />
                    <TooltipRow label="Close"  value={fmtPrice(hBar?.close ?? 0)} colors={colors} valueColor={hCloseColor} />
                    {hBar?.volume != null && (
                      <TooltipRow label="Volume" value={fmtVol(hBar.volume)} colors={colors} valueColor={colors.textSecondary} />
                    )}
                    {hBar?.rsi != null && (
                      <TooltipRow label="RSI" value={(hBar.rsi!).toFixed(1)} colors={colors} valueColor={RSI_COLOR} />
                    )}
                    {hBar?.adx != null && (
                      <TooltipRow label="ADX" value={(hBar.adx!).toFixed(1)} colors={colors} valueColor={ADX_COLOR} />
                    )}
                  </>
                );
              })()}
            </View>
          )}
        </View>

        {/* ── Legend ──────────────────────────────────────────── */}
        <View style={styles.legend}>
          <LegendSwatch color={BULL_COLOR}                    label="Bull"              colors={colors} />
          <LegendSwatch color={BEAR_COLOR}                    label="Bear"              colors={colors} />
          <LegendSwatch color={RSI_COLOR}                     label="RSI"               colors={colors} line />
          <LegendSwatch color={ADX_COLOR}                     label="ADX"               colors={colors} line />
          <LegendSwatch color={colors.accentPrimary}          label="Setup zone"        colors={colors} line />
          <LegendSwatch color={colors.warning ?? "#f59e0b"}   label={`+${selectedWindowDays}d horizon`} colors={colors} line />
        </View>

        {/* ── Observations list ───────────────────────────────── */}
        {example.observations.length > 0 && (
          <View style={styles.obsWrap}>
            {example.observations.map((obs) => (
              <View key={`${obs.date}-${obs.signal}`} style={styles.obsRow}>
                <View style={[styles.obsDot, { backgroundColor: colors.accentPrimary }]} />
                <View style={styles.obsContent}>
                  <Text style={[styles.obsLabel, { color: colors.textPrimary }]}>
                    {obs.label} · {obs.date}
                  </Text>
                  <Text style={[styles.obsDetail, { color: colors.textSecondary }]}>
                    {obs.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  },
);

// ── Sub-components ───────────────────────────────────────────────────

function InfoCell({
  label,
  value,
  color,
  valueColor,
}: {
  label: string;
  value: string;
  color: string;
  valueColor: string;
}) {
  return (
    <View style={styles.infoCell}>
      <Text style={[styles.infoCellLabel, { color }]}>{label}</Text>
      <Text style={[styles.infoCellValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function TooltipRow({
  label,
  value,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  colors: ThemePalette;
  valueColor?: string;
}) {
  return (
    <View style={styles.ttRow}>
      <Text style={[styles.ttLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.ttValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function LegendSwatch({
  color,
  label,
  colors,
  line,
}: {
  color: string;
  label: string;
  colors: ThemePalette;
  line?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      {line ? (
        <View style={[styles.legendLine, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      )}
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  placeholder: {
    height: 180,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 13,
  },

  // Info bar (OHLCV header)
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
    flexWrap: "wrap",
  },
  infoDate: {
    fontSize: 12,
    fontWeight: "700",
  },
  infoOHLCV: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
    flexWrap: "wrap",
  },
  infoCell: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  infoCellLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  infoCellValue: {
    fontSize: 11,
    fontWeight: "600",
  },
  infoGain: {
    fontSize: 13,
    fontWeight: "800",
  },

  // Tooltip
  tooltip: {
    position: "absolute",
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 3,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  ttDate: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  ttRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  ttLabel: {
    fontSize: 11,
  },
  ttValue: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Legend
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Observations
  obsWrap: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  obsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  obsDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginTop: 4,
  },
  obsContent: {
    flex: 1,
    gap: 1,
  },
  obsLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  obsDetail: {
    fontSize: 11,
    lineHeight: 16,
  },
});
