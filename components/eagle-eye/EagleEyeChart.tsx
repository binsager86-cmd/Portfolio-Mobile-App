/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * EagleEyeChart — full Japanese candlestick chart with RSI / ADX panes.
 *
 * Accepts DnaSetupBar[] (same shape used by the DNA tab) so the same data
 * from useEagleEyeDnaRecentBars feeds both the detail page and DNA charts.
 * Support / resistance levels are drawn as dashed horizontal lines.
 */
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React, { useCallback, useMemo, useRef, useState } from "react";
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
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { SupportResistanceLevel } from "@/hooks/useEagleEye";
import type { DnaSetupBar } from "@/hooks/useEagleEye";

// ── Constants ──────────────────────────────────────────────────────────────

const BULL_COLOR = "#16a34a";
const BEAR_COLOR = "#dc2626";
const RSI_COLOR  = "#f59e0b"; // amber
const ADX_COLOR  = "#14b8a6"; // teal

const PAD_LEFT   = 48;
const PAD_RIGHT  = 14;
const PAD_TOP    = 8;
const PAD_BOTTOM = 24;
const PANE_GAP   = 5;

const PRICE_RATIO  = 0.58;
const VOLUME_RATIO = 0.14;
const IND_RATIO    = 0.28;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtP(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtV(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function numRange(vals: Array<number | null | undefined>, fallback: [number, number]): [number, number] {
  const ns = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!ns.length) return fallback;
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

function linePath(
  vals: Array<number | null | undefined>,
  slotW: number,
  yMin: number, yMax: number,
  yTop: number, yH: number,
): string {
  const segs: string[] = [];
  vals.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    const x = PAD_LEFT + slotW * i + slotW / 2;
    const y = yTop + ((yMax - v) / (yMax - yMin || 1)) * yH;
    segs.push(`${segs.length === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  return segs.join(" ");
}

function normalise(rawBars: DnaSetupBar[]): DnaSetupBar[] {
  if (!rawBars.length) return [];
  let prev: number | null = null;
  return rawBars.map((b) => {
    const close = (b.close != null && b.close > 0 ? b.close : prev) ?? 1;
    const open  = (b.open  != null && b.open  > 0 ? b.open  : prev) ?? close;
    const high  = Math.max(b.high ?? close, open, close);
    const low   = Math.min(b.low  ?? close, open, close);
    prev = close;
    return { ...b, open, high, low, close };
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export interface EagleEyeChartProps {
  bars?: DnaSetupBar[];
  /** @deprecated pass bars instead */
  prices?: number[];
  supports?: SupportResistanceLevel[];
  resistances?: SupportResistanceLevel[];
  width?: number;
  height?: number;
  lastPrice?: number | null;
  /** If true, show last N bars only (default 120) */
  maxBars?: number;
}

export const EagleEyeChart = React.memo(function EagleEyeChart({
  bars: rawBars = [],
  supports = [],
  resistances = [],
  height = 380,
  maxBars = 120,
}: EagleEyeChartProps) {
  const { colors } = useThemeStore();
  const { width: winW } = useWindowDimensions();
  const [measuredW, setMeasuredW] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const chartW = measuredW || Math.max(300, winW - UITokens.spacing.md * 4);
  const chartH = height;

  const innerW  = chartW - PAD_LEFT - PAD_RIGHT;
  const innerH  = chartH - PAD_TOP - PAD_BOTTOM - PANE_GAP * 2;
  const priceH  = Math.round(innerH * PRICE_RATIO);
  const volH    = Math.round(innerH * VOLUME_RATIO);
  const indH    = Math.round(innerH * IND_RATIO);
  const volTop  = PAD_TOP + priceH + PANE_GAP;
  const indTop  = volTop + volH + PANE_GAP;

  // Slice to maxBars most recent
  const bars = useMemo(
    () => normalise(rawBars.length > maxBars ? rawBars.slice(-maxBars) : rawBars),
    [rawBars, maxBars],
  );

  const count  = bars.length;
  const slotW  = count > 0 ? innerW / count : 0;
  const barW   = Math.max(2, Math.min(28, slotW * 0.82));

  // Y scales
  const [priceMin, priceMax] = useMemo(() => {
    if (!bars.length) return [0, 1] as [number, number];
    const hi = Math.max(...bars.map((b) => b.high ?? b.close ?? 0));
    const lo = Math.min(...bars.map((b) => b.low  ?? b.close ?? 0));
    // also include S/R levels
    const srPrices = [...supports.map((s) => s.price), ...resistances.map((r) => r.price)];
    const allHi = srPrices.length ? Math.max(hi, ...srPrices) : hi;
    const allLo = srPrices.length ? Math.min(lo, ...srPrices) : lo;
    const pad = (allHi - allLo) * 0.04;
    return [allLo - pad, allHi + pad] as [number, number];
  }, [bars, supports, resistances]);

  const [volMin, volMax] = useMemo(() => numRange(bars.map((b) => b.volume), [0, 1]), [bars]);
  const [rsiMin, rsiMax] = [0, 100] as [number, number];
  const [adxMin, adxMax] = [0, 60] as [number, number];

  const yP = useCallback(
    (v: number) => PAD_TOP + ((priceMax - v) / (priceMax - priceMin || 1)) * priceH,
    [priceMax, priceMin, priceH],
  );
  const yV = useCallback(
    (v: number) => volTop + (1 - (v - volMin) / ((volMax - volMin) || 1)) * volH,
    [volMin, volMax, volTop, volH],
  );
  const yI = useCallback(
    (v: number, lo: number, hi: number) => indTop + ((hi - v) / (hi - lo || 1)) * indH,
    [indTop, indH],
  );

  // Grid
  const gridVals = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) =>
      priceMax - ((priceMax - priceMin) * i) / steps,
    );
  }, [priceMin, priceMax]);

  // X labels
  const xLabels = useMemo(() => {
    if (!count) return [];
    const n = Math.min(5, count);
    return Array.from({ length: n }, (_, i) =>
      Math.floor((i * (count - 1)) / Math.max(n - 1, 1)),
    );
  }, [count]);

  // Candles
  const candles = useMemo(
    () =>
      bars.map((b, i) => {
        const cx    = PAD_LEFT + slotW * i + slotW / 2;
        const prev  = i > 0 ? bars[i - 1].close : b.close;
        const openV = b.open ?? prev ?? 0;
        const bull  = (b.close ?? 0) >= openV;
        const col   = bull ? BULL_COLOR : BEAR_COLOR;
        const yHi   = yP(b.high  ?? b.close ?? 0);
        const yLo   = yP(b.low   ?? b.close ?? 0);
        const yO    = yP(openV);
        const yC    = yP(b.close ?? 0);
        const bodyT = Math.min(yO, yC);
        const bodyH = Math.max(Math.abs(yC - yO), 1.5);
        return (
          <G key={`c${i}`}>
            <Line x1={cx} y1={yHi} x2={cx} y2={yLo} stroke={col} strokeWidth={1.5} />
            <Rect x={cx - barW / 2} y={bodyT} width={barW} height={bodyH} fill={col} />
          </G>
        );
      }),
    [bars, slotW, barW, yP],
  );

  // Volume bars
  const volBars = useMemo(
    () =>
      bars.map((b, i) => {
        if (b.volume == null) return null;
        const cx    = PAD_LEFT + slotW * i + slotW / 2;
        const prev  = i > 0 ? bars[i - 1].close : b.close;
        const bull  = (b.close ?? 0) >= (b.open ?? prev ?? 0);
        const y     = yV(b.volume);
        const h     = Math.max(1, volTop + volH - y);
        return <Rect key={`v${i}`} x={cx - barW / 2} y={y} width={barW} height={h} fill={bull ? BULL_COLOR : BEAR_COLOR} opacity={0.6} />;
      }),
    [bars, slotW, barW, yV, volTop, volH],
  );

  // RSI path
  const rsiD = useMemo(
    () => linePath(bars.map((b) => b.rsi), slotW, rsiMin, rsiMax, indTop, indH),
    [bars, slotW, indTop, indH],
  );

  // ADX path
  const adxD = useMemo(
    () => linePath(bars.map((b) => b.adx), slotW, adxMin, adxMax, indTop, indH),
    [bars, slotW, indTop, indH],
  );

  // S/R level Y positions
  const srLines = useMemo(() => {
    const out: Array<{ y: number; color: string; price: number }> = [];
    for (const s of supports.slice(0, 3)) {
      const y = yP(s.price);
      if (y >= PAD_TOP && y <= PAD_TOP + priceH) out.push({ y, color: BULL_COLOR, price: s.price });
    }
    for (const r of resistances.slice(0, 3)) {
      const y = yP(r.price);
      if (y >= PAD_TOP && y <= PAD_TOP + priceH) out.push({ y, color: BEAR_COLOR, price: r.price });
    }
    return out;
  }, [supports, resistances, yP, priceH]);

  // Hover / touch
  const handleMove = useCallback((x: number, y: number) => {
    if (!slotW) return;
    if (x < PAD_LEFT || x > chartW - PAD_RIGHT) { setHoverIdx(null); setCursor(null); return; }
    const idx = Math.max(0, Math.min(count - 1, Math.floor((x - PAD_LEFT) / slotW)));
    setHoverIdx(idx);
    setCursor({ x: PAD_LEFT + slotW * idx + slotW / 2, y });
  }, [slotW, chartW, count]);
  const handleLeave = useCallback(() => { setHoverIdx(null); setCursor(null); }, []);

  const webHandlers = {
    onMouseMove: (e: { nativeEvent: { offsetX?: number; offsetY?: number } }) => {
      const ne = e.nativeEvent;
      if (typeof ne.offsetX === "number") handleMove(ne.offsetX, ne.offsetY ?? 0);
    },
    onMouseLeave: handleLeave,
  } as unknown as ViewProps;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => handleMove(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - measuredW) > 1) setMeasuredW(w);
  };

  const displayed = hoverIdx != null ? bars[hoverIdx] : bars[count - 1];
  const lastBar   = bars[count - 1];
  const lastClose = lastBar?.close ?? 0;
  const lastOpen  = lastBar?.open  ?? (count > 1 ? bars[count - 2]?.close : lastClose) ?? lastClose;
  const lastColor = lastClose >= lastOpen ? BULL_COLOR : BEAR_COLOR;
  const lastY     = yP(lastClose);

  if (!bars.length) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.phText, { color: colors.textMuted }]}>Chart loading…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      {/* OHLCV info bar */}
      <View style={[styles.info, { backgroundColor: colors.bgSecondary ?? colors.bgCardHover, borderColor: colors.borderColor }]}>
        <Text style={[styles.infoDate, { color: colors.textPrimary }]}>{displayed?.date?.slice(0, 10) ?? ""}</Text>
        <View style={styles.infoOhlcv}>
          {(["O","H","L","C"] as const).map((k, ki) => {
            const val = ki === 0 ? displayed?.open : ki === 1 ? displayed?.high : ki === 2 ? displayed?.low : displayed?.close;
            const col = ki === 1 ? BULL_COLOR : ki === 2 ? BEAR_COLOR : colors.textPrimary;
            return (
              <View key={k} style={styles.infoCell}>
                <Text style={[styles.infoLbl, { color: colors.textMuted }]}>{k}</Text>
                <Text style={[styles.infoVal, { color: col }]}>{fmtP(val ?? 0)}</Text>
              </View>
            );
          })}
          {displayed?.volume != null && (
            <View style={styles.infoCell}>
              <Text style={[styles.infoLbl, { color: colors.textMuted }]}>V</Text>
              <Text style={[styles.infoVal, { color: colors.textSecondary }]}>{fmtV(displayed.volume)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Chart */}
      <View onLayout={onLayout} style={{ width: "100%", height: chartH }} {...pan.panHandlers} {...webHandlers}>
        <Svg width={chartW} height={chartH} pointerEvents="none">

          {/* Price grid */}
          {gridVals.map((v, gi) => {
            const y = yP(v);
            return (
              <G key={`g${gi}`}>
                <Line x1={PAD_LEFT} y1={y} x2={chartW - PAD_RIGHT} y2={y} stroke={colors.borderColor} strokeWidth={1} strokeDasharray="2,4" opacity={0.4} />
                <SvgText x={PAD_LEFT - 4} y={y + 4} fontSize={9} fill={colors.textMuted} textAnchor="end">{fmtP(v)}</SvgText>
              </G>
            );
          })}

          {/* Support / resistance dashed lines */}
          {srLines.map(({ y, color, price }, si) => (
            <G key={`sr${si}`}>
              <Line x1={PAD_LEFT} y1={y} x2={chartW - PAD_RIGHT} y2={y} stroke={color} strokeWidth={1} strokeDasharray="3,5" opacity={0.6} />
              <SvgText x={chartW - PAD_RIGHT + 2} y={y + 3} fontSize={8.5} fill={color} textAnchor="start">{fmtP(price)}</SvgText>
            </G>
          ))}

          {/* Candlesticks */}
          {candles}

          {/* Last-price marker */}
          {lastY >= PAD_TOP && lastY <= PAD_TOP + priceH && (
            <G>
              <Line x1={PAD_LEFT} y1={lastY} x2={chartW - PAD_RIGHT} y2={lastY} stroke={lastColor} strokeWidth={1} strokeDasharray="3,5" opacity={0.7} />
              <Rect x={chartW - PAD_RIGHT - 48} y={lastY - 8} width={46} height={16} rx={3} fill={lastColor} />
              <SvgText x={chartW - PAD_RIGHT - 2} y={lastY + 4} fontSize={9.5} fontWeight="700" fill="#fff" textAnchor="end">{fmtP(lastClose)}</SvgText>
            </G>
          )}

          {/* Volume pane */}
          <Line x1={PAD_LEFT} y1={volTop} x2={chartW - PAD_RIGHT} y2={volTop} stroke={colors.borderColor} strokeWidth={1} opacity={0.5} />
          <SvgText x={PAD_LEFT - 4} y={volTop + 9} fontSize={8} fill={colors.textMuted} textAnchor="end">VOL</SvgText>
          {volBars}

          {/* Indicator pane */}
          <Line x1={PAD_LEFT} y1={indTop} x2={chartW - PAD_RIGHT} y2={indTop} stroke={colors.borderColor} strokeWidth={1} opacity={0.5} />

          {/* RSI reference lines */}
          {[70, 50, 30].map((lvl) => {
            const y = yI(lvl, rsiMin, rsiMax);
            return (
              <G key={`rl${lvl}`}>
                <Line x1={PAD_LEFT} y1={y} x2={chartW - PAD_RIGHT} y2={y} stroke={lvl === 50 ? colors.borderColor : lvl === 70 ? BEAR_COLOR : BULL_COLOR} strokeWidth={1} strokeDasharray="2,4" opacity={0.22} />
                <SvgText x={PAD_LEFT - 3} y={y + 3} fontSize={8} fill={colors.textMuted} textAnchor="end">{lvl}</SvgText>
              </G>
            );
          })}

          {/* RSI line */}
          {rsiD && <Path d={rsiD} fill="none" stroke={RSI_COLOR} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}

          {/* ADX line */}
          {adxD && <Path d={adxD} fill="none" stroke={ADX_COLOR} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3,2" />}

          {/* Crosshair */}
          {cursor && hoverIdx != null && (
            <G>
              <Line x1={cursor.x} y1={PAD_TOP} x2={cursor.x} y2={indTop + indH} stroke={colors.accentPrimary} strokeWidth={1} opacity={0.55} strokeDasharray="3,3" />
              <Line x1={PAD_LEFT} y1={cursor.y} x2={chartW - PAD_RIGHT} y2={cursor.y} stroke={colors.accentPrimary} strokeWidth={1} opacity={0.35} strokeDasharray="3,3" />
            </G>
          )}

          {/* X-axis labels */}
          {xLabels.map((idx) => {
            const x = PAD_LEFT + slotW * idx + slotW / 2;
            const label = bars[idx]?.date?.slice(5, 10) ?? "";
            return (
              <SvgText key={`xl${idx}`} x={x} y={chartH - 6} fontSize={8.5} fill={colors.textMuted} textAnchor="middle">{label}</SvgText>
            );
          })}
        </Svg>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={BULL_COLOR} label="Bull" />
        <LegendDot color={BEAR_COLOR} label="Bear" />
        <LegendLine color={RSI_COLOR} label="RSI" />
        <LegendLine color={ADX_COLOR} label="ADX" dashed />
        {supports.length > 0 && <LegendLine color={BULL_COLOR} label="Support" dashed />}
        {resistances.length > 0 && <LegendLine color={BEAR_COLOR} label="Resist" dashed />}
      </View>
    </View>
  );
});

// ── Small legend helpers ────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}
function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const { colors } = useThemeStore();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { borderColor: color, borderStyle: dashed ? "dashed" : "solid" }]} />
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  placeholder: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UITokens.radius.md,
  },
  phText: { fontSize: 12 },
  info: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    gap: 8,
  },
  infoDate: { fontSize: 11, fontWeight: "600", minWidth: 64 },
  infoOhlcv: { flexDirection: "row", gap: 8, flex: 1 },
  infoCell: { alignItems: "center", gap: 1 },
  infoLbl: { fontSize: 8.5 },
  infoVal: { fontSize: 10, fontWeight: "600", fontVariant: ["tabular-nums"] },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 16, height: 0, borderBottomWidth: 2 },
  legendLabel: { fontSize: 9.5 },
});
