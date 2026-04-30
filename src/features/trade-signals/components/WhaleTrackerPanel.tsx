import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { G, Line as SvgLine, Path, Text as SvgText } from "react-native-svg";

import SnapshotLineChart, { type ChartDataPoint } from "@/components/charts/SnapshotLineChart";
import { DateInput } from "@/components/form/DateInput";
import { useResponsive } from "@/hooks/useResponsive";
import { formatFullDate, formatShortDate } from "@/lib/dateUtils";
import type { ThemePalette } from "@/constants/theme";
import type { AnalysisStock } from "@/services/api";
import { getWhaleTrackerCandles } from "@/services/api/analytics/whaleTracker";
import {
  calculateWhaleTracker,
  defaultWhaleTrackerRange,
  isIsoDate,
  type WhaleTrackerRow,
  type WhaleWaveSummary,
} from "@/src/features/trade-signals/whaleTracker";

const TERMINAL_BG = "#0C0C0C";
const TERMINAL_PANEL = "#111415";
const TERMINAL_PANEL_ALT = "#15191B";
const TERMINAL_GRID = "rgba(255,255,255,0.08)";
const TERMINAL_TEXT = "#E6F1EB";
const TERMINAL_MUTED = "#7F8A84";
const NEON_GREEN = "#00FF00";
const NEON_RED = "#FF4444";
const ELECTRIC_CYAN = "#22D3EE";
const MONO_FONT = Platform.select({
  web: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const QUICK_RANGES = [30, 90, 180, 365] as const;

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString();
}

function normalizeTickerInput(value: string): string {
  return value.trim().toUpperCase().replace(/\.US$/, "");
}

function getWhaleTrackerErrorMessage(error: unknown): string {
  const fallback =
    "Unable to load EODHD data for this request. Check token, symbol format, and network settings.";

  if (!error || typeof error !== "object") return fallback;

  const maybeMessage = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const maybeResponse = (error as { response?: { status?: number; data?: unknown } }).response;
  const status = maybeResponse?.status;
  const responseDetail =
    typeof maybeResponse?.data === "object" && maybeResponse?.data !== null && "detail" in maybeResponse.data
      ? String((maybeResponse.data as { detail?: unknown }).detail ?? "")
      : "";

  if (status === 401) {
    return "EODHD rejected the API token (401 Unauthenticated). Verify the active token value.";
  }

  if (status === 404) {
    return "Ticker not found on EODHD. For Kuwait use symbols like KFH.KW.";
  }

  if (maybeMessage.toLowerCase().includes("network error")) {
    return "Browser network/CORS blocked the EODHD request. Use backend proxy routing for web, or run on native where direct request works.";
  }

  if (responseDetail) {
    return `EODHD request failed: ${responseDetail}`;
  }

  if (maybeMessage) {
    return `EODHD request failed: ${maybeMessage}`;
  }

  return fallback;
}

function percentOfRows(waves: WhaleWaveSummary[], predicate: (wave: WhaleWaveSummary) => boolean): number {
  if (waves.length === 0) return 0;
  const matching = waves.filter(predicate).length;
  return (matching / waves.length) * 100;
}

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function buildAreaPath(points: { x: number; y: number }[], baseline: number): string {
  if (points.length === 0) return "";
  const line = buildLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(1)},${baseline.toFixed(1)} L${first.x.toFixed(1)},${baseline.toFixed(1)} Z`;
}

function scaleValue(value: number, min: number, max: number, top: number, height: number): number {
  if (max === min) return top + height / 2;
  const ratio = (value - min) / (max - min);
  return top + height - ratio * height;
}

function paddedExtent(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const padding = (max - min) * 0.1;
  return { min: min - padding, max: max + padding };
}

function DualSeriesChart({ rows }: { rows: WhaleTrackerRow[] }) {
  const { isPhone } = useResponsive();
  const width = isPhone ? 640 : 900;
  const height = 280;
  const leftPad = 54;
  const rightPad = 54;
  const topPad = 20;
  const bottomPad = 34;
  const plotWidth = width - leftPad - rightPad;
  const plotHeight = height - topPad - bottomPad;

  const closeExtent = paddedExtent(rows.map((row) => row.close));
  const powerExtent = paddedExtent(rows.map((row) => row.dailyInstitutionalPower));
  const labelIndexes = Array.from({ length: Math.min(4, rows.length) }, (_, index) =>
    Math.round((index / Math.max(Math.min(4, rows.length) - 1, 1)) * (rows.length - 1)),
  );

  const pricePoints = rows.map((row, index) => ({
    x: leftPad + (index / Math.max(rows.length - 1, 1)) * plotWidth,
    y: scaleValue(row.close, closeExtent.min, closeExtent.max, topPad, plotHeight),
  }));
  const powerPoints = rows.map((row, index) => ({
    x: leftPad + (index / Math.max(rows.length - 1, 1)) * plotWidth,
    y: scaleValue(row.dailyInstitutionalPower, powerExtent.min, powerExtent.max, topPad, plotHeight),
  }));

  const closeTicks = [closeExtent.max, (closeExtent.max + closeExtent.min) / 2, closeExtent.min];
  const powerTicks = [powerExtent.max, 0, powerExtent.min];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.chartShell, { width, height, backgroundColor: TERMINAL_PANEL_ALT, borderColor: TERMINAL_GRID }]}> 
        <View style={styles.chartLegendRow}>
          <LegendSwatch color={ELECTRIC_CYAN} label="PRICE" />
          <LegendSwatch color={NEON_GREEN} label="INSTITUTIONAL POWER" />
        </View>
        <Svg width={width} height={height}>
          {[0, 1, 2].map((index) => {
            const y = topPad + (index / 2) * plotHeight;
            return (
              <G key={`grid-${index}`}>
                <SvgLine x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke={TERMINAL_GRID} strokeDasharray="4 4" />
                <SvgText
                  x={leftPad - 8}
                  y={y + 4}
                  fill={TERMINAL_MUTED}
                  fontSize={10}
                  textAnchor="end"
                  fontFamily={MONO_FONT}
                >
                  {closeTicks[index].toFixed(2)}
                </SvgText>
                <SvgText
                  x={width - rightPad + 8}
                  y={y + 4}
                  fill={TERMINAL_MUTED}
                  fontSize={10}
                  textAnchor="start"
                  fontFamily={MONO_FONT}
                >
                  {compactNumber(powerTicks[index])}
                </SvgText>
              </G>
            );
          })}

          <Path d={buildLinePath(pricePoints)} stroke={ELECTRIC_CYAN} strokeWidth={2.4} fill="none" />
          <Path d={buildLinePath(powerPoints)} stroke={NEON_GREEN} strokeWidth={2.4} fill="none" />

          {labelIndexes.map((index) => (
            <SvgText
              key={`label-${rows[index]?.date ?? index}`}
              x={leftPad + (index / Math.max(rows.length - 1, 1)) * plotWidth}
              y={height - 10}
              fill={TERMINAL_MUTED}
              fontSize={10}
              textAnchor="middle"
              fontFamily={MONO_FONT}
            >
              {formatShortDate(rows[index].date)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </ScrollView>
  );
}

function CumulativeAreaChart({ rows }: { rows: WhaleTrackerRow[] }) {
  const { isPhone } = useResponsive();
  const width = isPhone ? 640 : 900;
  const height = 220;
  const leftPad = 54;
  const rightPad = 18;
  const topPad = 16;
  const bottomPad = 34;
  const plotWidth = width - leftPad - rightPad;
  const plotHeight = height - topPad - bottomPad;
  const values = rows.map((row) => row.cumulativeInstitutionalShares);
  const extent = paddedExtent(values);
  const points = rows.map((row, index) => ({
    x: leftPad + (index / Math.max(rows.length - 1, 1)) * plotWidth,
    y: scaleValue(row.cumulativeInstitutionalShares, extent.min, extent.max, topPad, plotHeight),
  }));
  const area = buildAreaPath(points, topPad + plotHeight);
  const labels = Array.from({ length: Math.min(4, rows.length) }, (_, index) =>
    Math.round((index / Math.max(Math.min(4, rows.length) - 1, 1)) * (rows.length - 1)),
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.chartShell, { width, height, backgroundColor: TERMINAL_PANEL_ALT, borderColor: TERMINAL_GRID }]}> 
        <Svg width={width} height={height}>
          <Path d={area} fill="rgba(0,255,0,0.16)" />
          <Path d={buildLinePath(points)} stroke={NEON_GREEN} strokeWidth={2.5} fill="none" />
          {[extent.max, (extent.max + extent.min) / 2, extent.min].map((tick, index) => {
            const y = topPad + (index / 2) * plotHeight;
            return (
              <G key={`cum-grid-${index}`}>
                <SvgLine x1={leftPad} y1={y} x2={width - rightPad} y2={y} stroke={TERMINAL_GRID} strokeDasharray="4 4" />
                <SvgText
                  x={leftPad - 8}
                  y={y + 4}
                  fill={TERMINAL_MUTED}
                  fontSize={10}
                  textAnchor="end"
                  fontFamily={MONO_FONT}
                >
                  {compactNumber(tick)}
                </SvgText>
              </G>
            );
          })}
          {labels.map((index) => (
            <SvgText
              key={`cum-label-${rows[index]?.date ?? index}`}
              x={leftPad + (index / Math.max(rows.length - 1, 1)) * plotWidth}
              y={height - 10}
              fill={TERMINAL_MUTED}
              fontSize={10}
              textAnchor="middle"
              fontFamily={MONO_FONT}
            >
              {formatShortDate(rows[index].date)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </ScrollView>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: `${accent}55` }]}>
      <Text style={[styles.statLabel, { color: TERMINAL_MUTED }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function WaveCard({ wave }: { wave: WhaleWaveSummary }) {
  const accent = wave.isInstitutionalAccumulation ? NEON_GREEN : wave.netResult < 0 ? NEON_RED : TERMINAL_TEXT;
  return (
    <View style={[styles.waveCard, { borderColor: `${accent}44` }]}>
      <View style={styles.waveHeaderRow}>
        <Text style={[styles.waveTitle, { color: accent }]}>WAVE {wave.id.toString().padStart(2, "0")}</Text>
        <Text style={styles.waveMeta}>{wave.bars} bars</Text>
      </View>
      <Text style={styles.waveMeta}>{formatShortDate(wave.startDate)} to {formatShortDate(wave.endDate)}</Text>
      <Text style={[styles.waveMeta, { color: wave.direction === "down" ? NEON_RED : wave.direction === "up" ? ELECTRIC_CYAN : TERMINAL_MUTED }]}>TREND {wave.direction.toUpperCase()}</Text>
      <Text style={[styles.waveNet, { color: accent }]}>{compactNumber(wave.netResult)}</Text>
      <Text style={[styles.waveStatus, { color: wave.isInstitutionalAccumulation ? NEON_GREEN : TERMINAL_MUTED }]}>
        {wave.isInstitutionalAccumulation ? "INSTITUTIONAL ACCUMULATION" : "DISTRIBUTION / NEUTRAL"}
      </Text>
    </View>
  );
}

function StreamTable({ rows }: { rows: WhaleTrackerRow[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.tableShell, { borderColor: TERMINAL_GRID }]}> 
        <View style={[styles.tableRow, styles.tableHead]}>
          <Text style={[styles.tableCell, styles.tableHeadCell, { width: 96 }]}>DATE</Text>
          <Text style={[styles.tableCell, styles.tableHeadCell, { width: 90 }]}>PRICE</Text>
          <Text style={[styles.tableCell, styles.tableHeadCell, { width: 86 }]}>CANDLE</Text>
          <Text style={[styles.tableCell, styles.tableHeadCell, { width: 116 }]}>ACC</Text>
          <Text style={[styles.tableCell, styles.tableHeadCell, { width: 116 }]}>DIST</Text>
        </View>
        {rows.map((row, index) => (
          <View
            key={row.date}
            style={[
              styles.tableRow,
              {
                backgroundColor: index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)",
                borderTopColor: TERMINAL_GRID,
              },
            ]}
          >
            <Text style={[styles.tableCell, { width: 96 }]}>{row.date}</Text>
            <Text style={[styles.tableCell, { width: 90 }]}>{row.close.toFixed(2)}</Text>
            <Text style={[styles.tableCell, { width: 86, color: row.candleType === "red" ? NEON_RED : NEON_GREEN }]}>
              {row.candleType.toUpperCase()}
            </Text>
            <Text style={[styles.tableCell, { width: 116, color: row.accumulation > 0 ? NEON_GREEN : TERMINAL_MUTED }]}>
              {row.accumulation > 0 ? compactNumber(row.accumulation) : "-"}
            </Text>
            <Text style={[styles.tableCell, { width: 116, color: row.distribution < 0 ? NEON_RED : TERMINAL_MUTED }]}>
              {row.distribution < 0 ? compactNumber(row.distribution) : "-"}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function WhaleTrackerPanel({
  colors,
  selectedStock,
}: {
  colors: ThemePalette;
  selectedStock?: AnalysisStock | null;
}) {
  const { t } = useTranslation();
  const { isDesktop, isTablet } = useResponsive();
  const initialRange = useMemo(() => defaultWhaleTrackerRange(), []);
  const [symbol, setSymbol] = useState(() => normalizeTickerInput(selectedStock?.symbol ?? "AAPL"));
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [submittedParams, setSubmittedParams] = useState(() => ({
    symbol: normalizeTickerInput(selectedStock?.symbol ?? "AAPL"),
    from: initialRange.from,
    to: initialRange.to,
  }));

  const normalizedSymbol = normalizeTickerInput(symbol);
  const validRange = isIsoDate(fromDate) && isIsoDate(toDate) && fromDate <= toDate;
  const canSubmit = normalizedSymbol.length > 0 && validRange;
  const hasPendingChanges =
    normalizedSymbol !== submittedParams.symbol ||
    fromDate !== submittedParams.from ||
    toDate !== submittedParams.to;

  const trackerQuery = useQuery({
    queryKey: ["trade-signals", "whale-tracker", submittedParams.symbol, submittedParams.from, submittedParams.to],
    queryFn: () =>
      getWhaleTrackerCandles({
        symbol: submittedParams.symbol,
        exchange: selectedStock?.exchange,
        country: selectedStock?.country,
        from: submittedParams.from,
        to: submittedParams.to,
      }),
    enabled: submittedParams.symbol.length > 0,
    staleTime: 60_000,
  });

  const trackerErrorMessage = useMemo(
    () => getWhaleTrackerErrorMessage(trackerQuery.error),
    [trackerQuery.error],
  );

  const summary = useMemo(
    () => calculateWhaleTracker(trackerQuery.data ?? []),
    [trackerQuery.data],
  );

  const chartData = useMemo<ChartDataPoint[]>(
    () =>
      summary.rows.map((row) => ({
        label: row.date,
        value: row.cumulativeInstitutionalShares,
      })),
    [summary.rows],
  );

  const recentRows = useMemo(
    () => [...summary.rows].slice(-20).reverse(),
    [summary.rows],
  );
  const accumulationShare = percentOfRows(summary.waves, (wave) => wave.isInstitutionalAccumulation);
  const downtrendAccumulationShare = percentOfRows(
    summary.waves,
    (wave) => wave.isInstitutionalAccumulation && wave.direction === "down",
  );

  const applyQuickRange = (days: number) => {
    const to = new Date(`${todayString()}T00:00:00`);
    const from = subDays(to, days);
    setToDate(format(to, "yyyy-MM-dd"));
    setFromDate(format(from, "yyyy-MM-dd"));
  };

  const submitFetch = () => {
    if (!canSubmit) return;
    if (hasPendingChanges) {
      setSubmittedParams({
        symbol: normalizedSymbol,
        from: fromDate,
        to: toDate,
      });
      return;
    }
    trackerQuery.refetch();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { borderColor: colors.borderColor }]}> 
        <View style={styles.heroLeft}>
          <Text style={styles.kicker}>{t("tradeSignals.whaleTrackerKicker", "INSTITUTIONAL ACCUMULATION ENGINE")}</Text>
          <Text style={styles.title}>{t("tradeSignals.whaleTracker", "Whale Tracker")}</Text>
          <Text style={styles.subtitle}>
            {t(
              "tradeSignals.whaleTrackerDesc",
              "Tracks red-candle accumulation vs green-candle distribution, then compresses net flow by 80% to estimate institutional positioning.",
            )}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: trackerQuery.isError ? NEON_RED : NEON_GREEN }]} />
              <Text style={styles.statusText}>
                {trackerQuery.isError
                  ? t("tradeSignals.whaleTrackerFeedError", "Feed unavailable")
                  : t("tradeSignals.whaleTrackerFeedLive", "OHLCV feed mapped")}
              </Text>
            </View>
            <Text style={styles.statusNote}>
              {t(
                "tradeSignals.whaleTrackerFields",
                "Data model: date, open, high, low, close, volume",
              )}
            </Text>
          </View>
        </View>
        <View style={styles.heroRight}>
          <View style={styles.symbolBox}>
            <Text style={styles.fieldLabel}>{t("tradeSignals.symbol", "SYMBOL")}</Text>
            <TextInput
              value={symbol}
              onChangeText={setSymbol}
              placeholder="AAPL"
              placeholderTextColor={TERMINAL_MUTED}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.symbolInput}
            />
          </View>
          {selectedStock ? (
            <Text style={styles.selectedHint}>
              {t("tradeSignals.whaleTrackerSelectedHint", "Selected fundamental profile")}: {selectedStock.symbol}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>{t("tradeSignals.fromDate", "FROM")}</Text>
          <DateInput value={fromDate} onChangeText={setFromDate} hasError={!isIsoDate(fromDate)} />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>{t("tradeSignals.toDate", "TO")}</Text>
          <DateInput value={toDate} onChangeText={setToDate} hasError={!isIsoDate(toDate)} />
        </View>
        <View style={styles.quickRangeWrap}>
          <Text style={styles.fieldLabel}>{t("tradeSignals.quickRange", "QUICK RANGE")}</Text>
          <View style={styles.quickRangeRow}>
            {QUICK_RANGES.map((days) => (
              <Pressable key={days} onPress={() => applyQuickRange(days)} style={styles.quickChip}>
                <Text style={styles.quickChipText}>{days >= 365 ? "1Y" : `${Math.round(days / 30)}M`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          onPress={submitFetch}
          disabled={!canSubmit || trackerQuery.isFetching}
          style={[
            styles.submitButton,
            (!canSubmit || trackerQuery.isFetching) && styles.submitButtonDisabled,
          ]}
        >
          <FontAwesome
            name={trackerQuery.isFetching ? "spinner" : "download"}
            size={14}
            color={(!canSubmit || trackerQuery.isFetching) ? TERMINAL_MUTED : "#001400"}
          />
          <Text
            style={[
              styles.submitButtonText,
              (!canSubmit || trackerQuery.isFetching) && styles.submitButtonTextDisabled,
            ]}
          >
            {trackerQuery.isFetching
              ? t("tradeSignals.whaleTrackerLoading", "Pulling OHLCV stream...")
              : t("tradeSignals.getPrices", "Get Prices")}
          </Text>
        </Pressable>
      </View>

      {!validRange && (
        <View style={styles.alertBox}>
          <FontAwesome name="exclamation-triangle" size={14} color={NEON_RED} />
          <Text style={styles.alertText}>
            {t("tradeSignals.whaleTrackerDateError", "Use valid YYYY-MM-DD dates and keep From earlier than To.")}
          </Text>
        </View>
      )}

      {trackerQuery.isError && (
        <View style={styles.alertBox}>
          <FontAwesome name="plug" size={14} color={NEON_RED} />
          <Text style={styles.alertText}>{trackerErrorMessage}</Text>
        </View>
      )}

      {trackerQuery.isLoading && (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>{t("tradeSignals.whaleTrackerLoading", "Pulling OHLCV stream...")}</Text>
        </View>
      )}

      {!trackerQuery.isLoading && !trackerQuery.isError && summary.rows.length > 0 && (
        <View style={[styles.dashboardGrid, (isDesktop || isTablet) && styles.dashboardGridWide]}>
          <View style={styles.statsRail}>
            <StatCard
              label={t("tradeSignals.totalAccumulation", "TOTAL ACCUMULATION")}
              value={compactNumber(summary.totalAccumulation)}
              accent={NEON_GREEN}
              hint={t("tradeSignals.redCandleVolume", "Sum of red-candle volume")}
            />
            <StatCard
              label={t("tradeSignals.totalDistribution", "TOTAL DISTRIBUTION")}
              value={compactNumber(summary.totalDistribution)}
              accent={NEON_RED}
              hint={t("tradeSignals.greenCandleVolume", "Green-candle volume carried as negative")}
            />
            <StatCard
              label={t("tradeSignals.finalInstitutionalShares", "FINAL INSTITUTIONAL SHARES")}
              value={compactNumber(summary.finalInstitutionalShares)}
              accent={summary.finalInstitutionalShares >= 0 ? NEON_GREEN : NEON_RED}
              hint={t("tradeSignals.netTimesEighty", "(Accumulation + Distribution) x 0.8")}
            />
            <StatCard
              label={t("tradeSignals.accumulationWaves", "ACCUMULATION WAVES")}
              value={`${accumulationShare.toFixed(0)}%`}
              accent={ELECTRIC_CYAN}
              hint={`${downtrendAccumulationShare.toFixed(0)}% ${t("tradeSignals.downtrendBias", "downtrend bias")}`}
            />

            <View style={styles.waveRailCard}>
              <Text style={styles.railHeading}>{t("tradeSignals.waveScanner", "WAVE SCANNER")}</Text>
              <Text style={styles.railSubheading}>
                {t(
                  "tradeSignals.waveScannerDesc",
                  "Trend reversals define waves. Positive net waves are flagged as institutional accumulation sessions.",
                )}
              </Text>
              <View style={styles.waveRailList}>
                {summary.waves.slice(-5).reverse().map((wave) => (
                  <WaveCard key={wave.id} wave={wave} />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.mainColumn}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>{t("tradeSignals.priceVsInstitutionalPower", "PRICE VS INSTITUTIONAL POWER")}</Text>
              <Text style={styles.panelDesc}>
                {t(
                  "tradeSignals.priceVsInstitutionalPowerDesc",
                  "Close price is plotted against the daily institutional power estimate so you can spot divergence between price action and stealth accumulation.",
                )}
              </Text>
              <DualSeriesChart rows={summary.rows} />
            </View>

            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>{t("tradeSignals.cumulativeInstitutionalShares", "CUMULATIVE INSTITUTIONAL SHARES")}</Text>
              <Text style={styles.panelDesc}>
                {t(
                  "tradeSignals.cumulativeInstitutionalSharesDesc",
                  "Running total of daily institutional power. Rising curves imply net absorption of supply over the selected period.",
                )}
              </Text>
              <CumulativeAreaChart rows={summary.rows} />
            </View>

            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>{t("tradeSignals.calculationStream", "CALCULATION STREAM")}</Text>
              <Text style={styles.panelDesc}>
                {t(
                  "tradeSignals.calculationStreamDesc",
                  "Latest 20 rows showing candle classification and how raw volume is split into accumulation and distribution.",
                )}
              </Text>
              <StreamTable rows={recentRows} />
            </View>
          </View>
        </View>
      )}

      {!trackerQuery.isLoading && !trackerQuery.isError && summary.rows.length === 0 && validRange && (
        <View style={styles.emptyBox}>
          <FontAwesome name="line-chart" size={28} color={TERMINAL_MUTED} />
          <Text style={styles.emptyTitle}>{t("tradeSignals.whaleTrackerEmpty", "No OHLCV rows for this range")}</Text>
          <Text style={styles.emptyText}>
            {t(
              "tradeSignals.whaleTrackerEmptyDesc",
              "Try a wider window or another US ticker. The tracker needs open, close, and volume on each day to compute institutional flow.",
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

function todayString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 14,
  },
  hero: {
    backgroundColor: TERMINAL_BG,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  heroLeft: {
    gap: 8,
  },
  heroRight: {
    gap: 8,
  },
  kicker: {
    color: NEON_GREEN,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    fontFamily: MONO_FONT,
  },
  title: {
    color: TERMINAL_TEXT,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: TERMINAL_MUTED,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 760,
  },
  statusRow: {
    gap: 8,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: TERMINAL_PANEL,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusText: {
    color: TERMINAL_TEXT,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: MONO_FONT,
  },
  statusNote: {
    color: TERMINAL_MUTED,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  symbolBox: {
    backgroundColor: TERMINAL_PANEL,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: TERMINAL_GRID,
  },
  symbolInput: {
    color: TERMINAL_TEXT,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: MONO_FONT,
    paddingVertical: 6,
  },
  selectedHint: {
    color: TERMINAL_MUTED,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  filtersCard: {
    backgroundColor: TERMINAL_BG,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    color: TERMINAL_MUTED,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 8,
    fontFamily: MONO_FONT,
  },
  dateField: {
    gap: 4,
  },
  quickRangeWrap: {
    gap: 8,
  },
  quickRangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${NEON_GREEN}44`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,255,0,0.08)",
  },
  quickChipText: {
    color: NEON_GREEN,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: MONO_FONT,
  },
  submitButton: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: NEON_GREEN,
    borderWidth: 1,
    borderColor: `${NEON_GREEN}88`,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "rgba(127,138,132,0.15)",
    borderColor: "rgba(127,138,132,0.35)",
  },
  submitButtonText: {
    color: "#001400",
    fontSize: 12,
    fontWeight: "800",
    fontFamily: MONO_FONT,
    letterSpacing: 0.4,
  },
  submitButtonTextDisabled: {
    color: TERMINAL_MUTED,
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,68,68,0.08)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.25)",
  },
  alertText: {
    color: TERMINAL_TEXT,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  loadingBox: {
    borderRadius: 18,
    backgroundColor: TERMINAL_BG,
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: NEON_GREEN,
    fontSize: 13,
    fontFamily: MONO_FONT,
  },
  dashboardGrid: {
    gap: 14,
  },
  dashboardGridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  statsRail: {
    gap: 12,
    flex: 1,
  },
  mainColumn: {
    gap: 12,
    flex: 2,
  },
  statCard: {
    backgroundColor: TERMINAL_BG,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    fontFamily: MONO_FONT,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    fontFamily: MONO_FONT,
  },
  statHint: {
    color: TERMINAL_MUTED,
    fontSize: 11,
    lineHeight: 16,
  },
  waveRailCard: {
    backgroundColor: TERMINAL_BG,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  railHeading: {
    color: TERMINAL_TEXT,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    fontFamily: MONO_FONT,
  },
  railSubheading: {
    color: TERMINAL_MUTED,
    fontSize: 11,
    lineHeight: 16,
  },
  waveRailList: {
    gap: 8,
  },
  waveCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: TERMINAL_PANEL,
    gap: 4,
  },
  waveHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waveTitle: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: MONO_FONT,
  },
  waveMeta: {
    color: TERMINAL_MUTED,
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  waveNet: {
    fontSize: 18,
    fontWeight: "900",
    fontFamily: MONO_FONT,
    marginTop: 4,
  },
  waveStatus: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    fontFamily: MONO_FONT,
  },
  panelCard: {
    backgroundColor: TERMINAL_BG,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  panelTitle: {
    color: TERMINAL_TEXT,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    fontFamily: MONO_FONT,
  },
  panelDesc: {
    color: TERMINAL_MUTED,
    fontSize: 11,
    lineHeight: 16,
  },
  chartShell: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  chartLegendRow: {
    position: "absolute",
    zIndex: 2,
    top: 10,
    right: 14,
    flexDirection: "row",
    gap: 10,
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
    color: TERMINAL_MUTED,
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  tableShell: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: TERMINAL_PANEL_ALT,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 8,
  },
  tableHead: {
    backgroundColor: TERMINAL_PANEL,
  },
  tableCell: {
    color: TERMINAL_TEXT,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  tableHeadCell: {
    color: TERMINAL_MUTED,
    fontWeight: "700",
  },
  emptyBox: {
    backgroundColor: TERMINAL_BG,
    borderRadius: 18,
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: TERMINAL_TEXT,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyText: {
    color: TERMINAL_MUTED,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 520,
  },
});