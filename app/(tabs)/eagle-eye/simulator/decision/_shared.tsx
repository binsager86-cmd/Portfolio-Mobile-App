/* eslint-disable custom-styles/no-hardcoded-styles */
import { useThemeStore } from "@/services/themeStore";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import type { SimulatorCycle, SimulatorSymbolState } from "@/hooks/useSimulatorReadOnly";

export function formatKwd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-KW", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function jsonEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

export function jsonValues(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
  }
  if (typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function valueBounds(values: Array<number | null | undefined>): [number, number] {
  const numbers = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (numbers.length === 0) return [0, 1];
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

export function DecisionTraceChart({
  state,
  cycle,
}: {
  state?: SimulatorSymbolState | null;
  cycle?: SimulatorCycle | null;
}) {
  const { colors } = useThemeStore();
  const base = state?.base ?? null;
  const hardRefs = state?.hard_refs ?? null;
  const entryPaths = state?.entry_paths ?? null;
  const exitWatch = state?.exit_watch ?? null;

  const numericValues = useMemo(() => {
    const baseLow = readNumber((base as Record<string, unknown> | null)?.low ?? (base as Record<string, unknown> | null)?.bottom);
    const baseHigh = readNumber((base as Record<string, unknown> | null)?.top ?? (base as Record<string, unknown> | null)?.high);
    const entryPrice = readNumber(cycle?.entry_price);
    const exitPrice = readNumber(cycle?.exit_price);
    const peakMfe = readNumber(cycle?.peak_mfe);
    const h1 = readNumber((hardRefs as Record<string, unknown> | null)?.h1_price ?? (hardRefs as Record<string, unknown> | null)?.h1 ?? (hardRefs as Record<string, unknown> | null)?.line);
    const ema10 = readNumber((base as Record<string, unknown> | null)?.ema_10 ?? (base as Record<string, unknown> | null)?.ema10);
    const ema30 = readNumber((base as Record<string, unknown> | null)?.ema_30 ?? (base as Record<string, unknown> | null)?.ema30);
    return [baseLow, baseHigh, entryPrice, exitPrice, peakMfe, h1, ema10, ema30].filter((item): item is number => item != null);
  }, [base, hardRefs, cycle?.entry_price, cycle?.exit_price, cycle?.peak_mfe]);

  const [min, max] = valueBounds(numericValues);
  const width = 360;
  const height = 220;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 32;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const baseLow = readNumber((base as Record<string, unknown> | null)?.low ?? (base as Record<string, unknown> | null)?.bottom) ?? min;
  const baseHigh = readNumber((base as Record<string, unknown> | null)?.top ?? (base as Record<string, unknown> | null)?.high) ?? max;
  const baseWidthPct = readNumber((base as Record<string, unknown> | null)?.width_pct ?? (base as Record<string, unknown> | null)?.width_percent) ?? 60;
  const baseMidX = padLeft + plotWidth / 2;
  const baseHalfWidth = Math.max(30, (plotWidth * Math.min(90, Math.max(15, baseWidthPct))) / 200);

  const yFor = (value: number): number => padTop + ((max - value) / (max - min || 1)) * plotHeight;
  const xFor = (ratio: number): number => padLeft + ratio * plotWidth;

  const h1 = readNumber((hardRefs as Record<string, unknown> | null)?.h1_price ?? (hardRefs as Record<string, unknown> | null)?.h1 ?? (hardRefs as Record<string, unknown> | null)?.line);
  const ema10 = readNumber((base as Record<string, unknown> | null)?.ema_10 ?? (base as Record<string, unknown> | null)?.ema10);
  const ema30 = readNumber((base as Record<string, unknown> | null)?.ema_30 ?? (base as Record<string, unknown> | null)?.ema30);
  const entryPrice = readNumber(cycle?.entry_price);
  const exitPrice = readNumber(cycle?.exit_price);
  const peakPrice = entryPrice != null ? entryPrice * (1 + (cycle?.peak_mfe ?? 0) / 100) : null;

  const gateRows = jsonValues(state?.gates).slice(0, 9);
  const entrySummary = jsonEntries(entryPaths).slice(0, 3);
  const exitSummary = jsonEntries(exitWatch).slice(0, 3);

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Transparency chart</Text>
      <Svg width={width} height={height}>
        <Rect x={padLeft} y={padTop} width={plotWidth} height={plotHeight} fill={colors.bgSecondary} opacity={0.55} rx={12} />
        <Rect
          x={baseMidX - baseHalfWidth}
          y={yFor(baseHigh)}
          width={baseHalfWidth * 2}
          height={Math.max(1, yFor(baseLow) - yFor(baseHigh))}
          fill={colors.accentPrimary}
          opacity={0.16}
          rx={10}
        />
        {ema10 != null && (
          <Line x1={padLeft} y1={yFor(ema10)} x2={padLeft + plotWidth} y2={yFor(ema10)} stroke={colors.success} strokeDasharray="8 6" strokeWidth={1.6} />
        )}
        {ema30 != null && (
          <Line x1={padLeft} y1={yFor(ema30)} x2={padLeft + plotWidth} y2={yFor(ema30)} stroke={colors.warning} strokeDasharray="8 6" strokeWidth={1.6} />
        )}
        {h1 != null && (
          <Line x1={padLeft} y1={yFor(h1)} x2={padLeft + plotWidth} y2={yFor(h1)} stroke={colors.danger} strokeDasharray="4 4" strokeWidth={1.6} />
        )}
        {entryPrice != null && (
          <>
            <Line x1={xFor(0.18)} y1={yFor(entryPrice)} x2={xFor(0.82)} y2={yFor(entryPrice)} stroke={colors.success} strokeWidth={2.2} />
            <SvgText x={padLeft + 4} y={yFor(entryPrice) - 6} fill={colors.success} fontSize={10}>
              Entry {formatKwd(entryPrice)}
            </SvgText>
          </>
        )}
        {exitPrice != null && (
          <>
            <Line x1={xFor(0.18)} y1={yFor(exitPrice)} x2={xFor(0.82)} y2={yFor(exitPrice)} stroke={colors.danger} strokeWidth={2.2} />
            <SvgText x={padLeft + 4} y={yFor(exitPrice) - 6} fill={colors.danger} fontSize={10}>
              Exit {formatKwd(exitPrice)}
            </SvgText>
          </>
        )}
        {peakPrice != null && (
          <>
            <Line x1={xFor(0.22)} y1={yFor(peakPrice)} x2={xFor(0.78)} y2={yFor(peakPrice)} stroke={colors.accentSecondary} strokeDasharray="3 5" strokeWidth={1.4} />
            <SvgText x={padLeft + 4} y={yFor(peakPrice) - 6} fill={colors.accentSecondary} fontSize={10}>
              Peak {formatKwd(peakPrice)}
            </SvgText>
          </>
        )}
        <SvgText x={8} y={yFor(baseHigh)} fill={colors.textMuted} fontSize={10}>
          {formatKwd(baseHigh)}
        </SvgText>
        <SvgText x={8} y={yFor(baseLow)} fill={colors.textMuted} fontSize={10}>
          {formatKwd(baseLow)}
        </SvgText>
        <SvgText x={padLeft} y={height - 10} fill={colors.textMuted} fontSize={10}>
          {state?.book ?? "—"} · {state?.lifecycle ?? "NEUTRAL"}
        </SvgText>
      </Svg>

      <View style={styles.legendRow}>
        <LegendDot color={colors.accentPrimary} label={`Base ${state?.base ? "box" : "unset"}`} />
        <LegendDot color={colors.success} label={ema10 != null ? "EMA10" : "EMA10 n/a"} />
        <LegendDot color={colors.warning} label={ema30 != null ? "EMA30" : "EMA30 n/a"} />
        <LegendDot color={colors.danger} label={h1 != null ? "H1" : "H1 n/a"} />
      </View>

      <View style={styles.smallGrid}>
        <KeyValue label="Gates" value={state?.gates_passing != null ? `${state.gates_passing}/9` : "—"} />
        <KeyValue label="Tier" value={state?.tier ?? "NONE"} />
        <KeyValue label="Book" value={state?.book ?? "—"} />
        <KeyValue label="CONF" value={state?.confidence != null ? `${state.confidence.toFixed(0)}%` : "—"} />
      </View>

      <View style={styles.detailGrid}>
        <DetailList title="Gate evidence" items={gateRows} />
        <DetailList title="Entry paths" items={entrySummary} />
        <DetailList title="Exit watch" items={exitSummary} />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.keyValue, { backgroundColor: colors.bgSecondary }]}> 
      <Text style={[styles.keyLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.keyValueText, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DetailList({ title, items }: { title: string; items: Array<[string, unknown]> }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.detailCard, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}> 
      <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.detailEmpty, { color: colors.textMuted }]}>No projected evidence available.</Text>
      ) : (
        items.map(([key, raw]) => (
          <View key={key} style={styles.detailRow}>
            <Text style={[styles.detailKey, { color: colors.textMuted }]}>{key}</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]} numberOfLines={2}>
              {typeof raw === "string" ? raw : JSON.stringify(raw)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  chartCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },
  smallGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keyValue: {
    minWidth: 80,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  keyLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  keyValueText: {
    fontSize: 13,
    fontWeight: "700",
  },
  detailGrid: {
    gap: 10,
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  detailEmpty: {
    fontSize: 12,
    lineHeight: 18,
  },
  detailRow: {
    gap: 3,
  },
  detailKey: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 12,
    lineHeight: 17,
  },
});