/**
 * Whale Tracker Panel — institutional accumulation detection UI.
 *
 * Tracks red-candle accumulation vs green-candle distribution, then compresses
 * net flow by 80% to estimate institutional positioning.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { tokens } from "@/constants/uiTokens";
import type { AnalysisStock } from "@/services/api";
import { getWhaleTrackerCandles } from "@/services/api/analytics/whaleTracker";
import {
  calculateWhaleTracker,
  type WhaleWaveSummary,
} from "@/src/features/trade-signals/whaleTracker";
import { CandlestickChart } from "@/src/features/trade-signals/components/CandlestickChart";

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/\.US$/, "");
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(v: string): boolean {
  if (!ISO_RE.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

type TimeframeKey = "1M" | "3M" | "6M" | "1Y" | "CUSTOM";

const TIMEFRAME_DAYS: Record<Exclude<TimeframeKey, "CUSTOM">, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

const QUICK_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "KFH.KW", "NBK.KW"];

function defaultRange(tf: TimeframeKey): { from: string; to: string } {
  const today = new Date();
  const to = toIsoDate(today);
  if (tf === "CUSTOM") {
    return { from: toIsoDate(subtractDays(today, 180)), to };
  }
  return { from: toIsoDate(subtractDays(today, TIMEFRAME_DAYS[tf])), to };
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function percentOfRows(waves: WhaleWaveSummary[], predicate: (wave: WhaleWaveSummary) => boolean): number {
  if (waves.length === 0) return 0;
  const matching = waves.filter(predicate).length;
  return (matching / waves.length) * 100;
}

// ── Component ───────────────────────────────────────────────────────

export function WhaleTrackerPanel({
  colors,
  selectedStock,
}: {
  colors: ThemePalette;
  selectedStock?: AnalysisStock | null;
}) {
  const { t } = useTranslation();
  const [symbolInput, setSymbolInput] = useState("");
  const [submittedSymbol, setSubmittedSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<TimeframeKey>("6M");
  const initialRange = useMemo(() => defaultRange("6M"), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [submittedRange, setSubmittedRange] = useState(initialRange);

  const normalized = normalizeSymbol(submittedSymbol);

  const handleTimeframeChange = (tf: TimeframeKey) => {
    setTimeframe(tf);
    if (tf !== "CUSTOM") {
      const r = defaultRange(tf);
      setFromDate(r.from);
      setToDate(r.to);
      setSubmittedRange(r);
    }
  };

  const validRange = isIsoDate(fromDate) && isIsoDate(toDate) && fromDate <= toDate;

  const handleScan = () => {
    setSubmittedSymbol(symbolInput);
    if (timeframe === "CUSTOM") {
      if (validRange) {
        setSubmittedRange({ from: fromDate, to: toDate });
      }
    } else {
      // Always anchor preset ranges to today
      const r = defaultRange(timeframe);
      setFromDate(r.from);
      setToDate(r.to);
      setSubmittedRange(r);
    }
  };

  const trackerQuery = useQuery({
    queryKey: ["whale-tracker", normalized, submittedRange.from, submittedRange.to],
    queryFn: () =>
      getWhaleTrackerCandles({
        symbol: normalized,
        exchange: selectedStock?.exchange,
        country: selectedStock?.country,
        from: submittedRange.from,
        to: submittedRange.to,
      }),
    enabled: normalized.length > 0,
    staleTime: 5 * 60_000,
  });

  const summary = useMemo(
    () => calculateWhaleTracker(trackerQuery.data ?? []),
    [trackerQuery.data],
  );

  const accumulationShare = percentOfRows(summary.waves, (wave) => wave.isInstitutionalAccumulation);
  const downtrendAccumulationShare = percentOfRows(
    summary.waves,
    (wave) => wave.isInstitutionalAccumulation && wave.direction === "down",
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.headerRow}>
          <FontAwesome name="eye" size={18} color={colors.accentPrimary} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {t("whaleTracker.title", "Whale Tracker")}
          </Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.textMuted }]}>
          {t(
            "whaleTracker.subtitle",
            "Institutional accumulation engine. Tracks red-candle volume (accumulation) vs green-candle volume (distribution), applies 80% compression to estimate net institutional positioning.",
          )}
        </Text>
      </View>

      {/* ── Summary (stats + waves) shown above picker ────────── */}
      {summary.rows.length > 0 && (
        <TrackerSummary colors={colors} summary={summary} accPct={accumulationShare} downPct={downtrendAccumulationShare} />
      )}

      {/* ── Symbol picker ──────────────────────────────────────── */}
      <View style={[styles.pickerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>
          {t("whaleTracker.symbolLabel", "Ticker (e.g. AAPL, KFH.KW)")}
        </Text>
        <View style={styles.pickerRow}>
          <View style={[styles.inputWrap, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
            <FontAwesome name="search" size={14} color={colors.textMuted} />
            <TextInput
              value={symbolInput}
              onChangeText={setSymbolInput}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="AAPL"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.textPrimary }]}
              onSubmitEditing={handleScan}
              returnKeyType="search"
            />
            {symbolInput.length > 0 && (
              <Pressable
                onPress={() => setSymbolInput("")}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={handleScan}
            disabled={symbolInput.trim().length === 0 || trackerQuery.isFetching}
            style={({ pressed }) => [
              styles.runBtn,
              {
                backgroundColor: colors.accentPrimary,
                opacity:
                  symbolInput.trim().length === 0
                    ? 0.4
                    : trackerQuery.isFetching
                      ? 0.7
                      : pressed
                        ? 0.7
                        : 1,
              },
            ]}
          >
            {trackerQuery.isFetching && normalized.length > 0 ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="play" size={14} color="#fff" />
            )}
            <Text style={styles.runBtnText}>
              {trackerQuery.isFetching && normalized.length > 0
                ? t("whaleTracker.scanning", "Scanning…")
                : t("whaleTracker.scan", "Scan")}
            </Text>
          </Pressable>
        </View>

        {/* Quick ticker picks */}
        <View style={styles.tfRow}>
          {QUICK_TICKERS.map((tk) => {
            const active = symbolInput.toUpperCase() === tk;
            return (
              <Pressable
                key={tk}
                onPress={() => {
                  setSymbolInput(tk);
                  setSubmittedSymbol(tk);
                }}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor: active ? colors.accentPrimary + "22" : colors.bgSecondary,
                    borderColor: active ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    { color: active ? colors.accentPrimary : colors.textSecondary },
                  ]}
                >
                  {tk}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Timeframe chips */}
        <Text style={[styles.pickerLabel, { color: colors.textSecondary, marginTop: tokens.spacing.xs }]}>
          {t("whaleTracker.timeframeLabel", "Historical Range")}
        </Text>
        <View style={styles.tfRow}>
          {(Object.keys(TIMEFRAME_DAYS) as Array<keyof typeof TIMEFRAME_DAYS>).map((tf) => {
            const active = timeframe === tf;
            return (
              <Pressable
                key={tf}
                onPress={() => handleTimeframeChange(tf)}
                style={[
                  styles.tfChip,
                  {
                    backgroundColor: active ? colors.accentPrimary : colors.bgSecondary,
                    borderColor: active ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
              >
                <Text style={[styles.tfChipText, { color: active ? "#fff" : colors.textSecondary }]}>
                  {tf}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => handleTimeframeChange("CUSTOM")}
            style={[
              styles.tfChip,
              {
                backgroundColor: timeframe === "CUSTOM" ? colors.accentPrimary : colors.bgSecondary,
                borderColor: timeframe === "CUSTOM" ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <Text style={[styles.tfChipText, { color: timeframe === "CUSTOM" ? "#fff" : colors.textSecondary }]}>
              {t("whaleTracker.custom", "Custom")}
            </Text>
          </Pressable>
        </View>

        {timeframe === "CUSTOM" && (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                {t("whaleTracker.from", "From")}
              </Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.dateInput,
                  {
                    backgroundColor: colors.bgSecondary,
                    color: colors.textPrimary,
                    borderColor: isIsoDate(fromDate) ? colors.borderColor : colors.danger,
                  },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                {t("whaleTracker.to", "To")}
              </Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.dateInput,
                  {
                    backgroundColor: colors.bgSecondary,
                    color: colors.textPrimary,
                    borderColor: isIsoDate(toDate) ? colors.borderColor : colors.danger,
                  },
                ]}
              />
            </View>
          </View>
        )}

        <Text style={[styles.rangeNote, { color: colors.textMuted }]}>
          {t("whaleTracker.rangeNote", "Range: {{from}} → {{to}}", {
            from: submittedRange.from,
            to: submittedRange.to,
          })}
        </Text>
      </View>

      {/* ── Loading / errors / insufficient ────────────────────── */}
      {!normalized && !trackerQuery.isFetching && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={22} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: tokens.spacing.sm, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
            {t("whaleTracker.emptyTitle", "Enter a ticker to scan")}
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
            {t(
              "whaleTracker.emptyHint",
              "Pick a quick suggestion above or type any symbol (use exchange suffix for non-US, e.g. KFH.KW).",
            )}
          </Text>
        </View>
      )}

      {trackerQuery.isLoading && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
            {t("whaleTracker.fetching", "Fetching market data…")}
          </Text>
        </View>
      )}

      {trackerQuery.isError && (
        <View style={[styles.statusCard, { backgroundColor: colors.danger + "12", borderColor: colors.danger + "40" }]}>
          <FontAwesome name="exclamation-triangle" size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, marginTop: 6, fontSize: 13, textAlign: "center" }}>
            {t(
              "whaleTracker.fetchError",
              "Could not fetch data. Check the ticker symbol (include exchange suffix like .KW for Kuwait) and try again.",
            )}
          </Text>
        </View>
      )}

      {/* ── Candlestick chart ──────────────────────────────────── */}
      {trackerQuery.data && trackerQuery.data.length > 0 && (
        <CandlestickChart
          candles={trackerQuery.data}
          colors={colors}
          maxBars={trackerQuery.data.length}
        />
      )}

      {/* ── Volume calculation table ────────────────────────────── */}
      {summary.rows.length > 0 && <VolumeCalculationTable colors={colors} summary={summary} />}

      {/* ── Wave scanner details ────────────────────────────────── */}
      {summary.rows.length > 0 && <WaveScanner colors={colors} summary={summary} />}

      {trackerQuery.data && trackerQuery.data.length === 0 && !trackerQuery.isLoading && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <FontAwesome name="info-circle" size={18} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13, textAlign: "center" }}>
            {t("whaleTracker.noData", "No data for this range. Try a wider window or another ticker.")}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Summary (rendered above picker) ─────────────────────────────────

function TrackerSummary({
  colors,
  summary,
  accPct,
  downPct,
}: {
  colors: ThemePalette;
  summary: ReturnType<typeof calculateWhaleTracker>;
  accPct: number;
  downPct: number;
}) {
  const { t } = useTranslation();
  
  return (
    <View style={styles.summaryRow}>
      <StatCard
        colors={colors}
        label={t("whaleTracker.totalAccum", "Total Accumulation")}
        value={formatCompact(summary.totalAccumulation)}
        color={colors.success}
        hint={t("whaleTracker.redCandleVol", "Red-candle volume")}
      />
      <StatCard
        colors={colors}
        label={t("whaleTracker.totalDist", "Total Distribution")}
        value={formatCompact(summary.totalDistribution)}
        color={colors.danger}
        hint={t("whaleTracker.greenCandleVol", "Green-candle volume")}
      />
      <StatCard
        colors={colors}
        label={t("whaleTracker.finalShares", "Net Institutional")}
        value={formatCompact(summary.finalInstitutionalShares)}
        color={summary.finalInstitutionalShares >= 0 ? colors.success : colors.danger}
        hint={t("whaleTracker.compressed", "(Net × 0.8)")}
      />
      <StatCard
        colors={colors}
        label={t("whaleTracker.accWaves", "Accum. Waves")}
        value={`${accPct.toFixed(0)}%`}
        color={colors.accentPrimary}
        hint={`${downPct.toFixed(0)}% downtrend`}
      />
    </View>
  );
}

// ── Volume Calculation Table ───────────────────────────────────────

function VolumeCalculationTable({
  colors,
  summary,
}: {
  colors: ThemePalette;
  summary: ReturnType<typeof calculateWhaleTracker>;
}) {
  const { t } = useTranslation();
  const recentRows = useMemo(
    () => [...summary.rows].slice(-20).reverse(),
    [summary.rows],
  );

  return (
    <View style={[styles.tableCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.tableTitle, { color: colors.textPrimary }]}>
        {t("whaleTracker.volumeCalculation", "Volume Calculation Stream")}
      </Text>
      <Text style={[styles.tableSub, { color: colors.textMuted }]}>
        {t("whaleTracker.volumeCalculationDesc", "Latest 20 rows showing candle classification and how raw volume is split into accumulation and distribution.")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableWrap}>
          <View style={[styles.tableHeaderRow, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.tableHeaderCell, { color: colors.textSecondary, width: 100 }]}>DATE</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textSecondary, width: 90 }]}>PRICE</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textSecondary, width: 90 }]}>CANDLE</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textSecondary, width: 120 }]}>ACCUM.</Text>
            <Text style={[styles.tableHeaderCell, { color: colors.textSecondary, width: 120 }]}>DIST.</Text>
          </View>
          {recentRows.map((row, index) => (
            <View
              key={row.date}
              style={[
                styles.tableDataRow,
                {
                  backgroundColor: index % 2 === 0 ? "transparent" : colors.bgSecondary + "40",
                  borderTopColor: colors.borderColor,
                },
              ]}
            >
              <Text style={[styles.tableCell, { color: colors.textPrimary, width: 100 }]}>{row.date}</Text>
              <Text style={[styles.tableCell, { color: colors.textPrimary, width: 90 }]}>{row.close.toFixed(2)}</Text>
              <Text
                style={[
                  styles.tableCell,
                  {
                    width: 90,
                    color: row.candleType === "red" ? colors.danger : colors.success,
                    fontWeight: "700",
                  },
                ]}
              >
                {row.candleType.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  {
                    width: 120,
                    color: row.accumulation > 0 ? colors.success : colors.textMuted,
                    fontWeight: row.accumulation > 0 ? "600" : "400",
                  },
                ]}
              >
                {row.accumulation > 0 ? formatCompact(row.accumulation) : "-"}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  {
                    width: 120,
                    color: row.distribution < 0 ? colors.danger : colors.textMuted,
                    fontWeight: row.distribution < 0 ? "600" : "400",
                  },
                ]}
              >
                {row.distribution < 0 ? formatCompact(row.distribution) : "-"}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Wave Scanner ────────────────────────────────────────────────────

function WaveScanner({
  colors,
  summary,
}: {
  colors: ThemePalette;
  summary: ReturnType<typeof calculateWhaleTracker>;
}) {
  const { t } = useTranslation();
  
  return (
    <View style={[styles.waveCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.waveTitle, { color: colors.textPrimary }]}>
        {t("whaleTracker.waveScanner", "Wave Scanner")}
      </Text>
      <Text style={[styles.waveSub, { color: colors.textMuted }]}>
        {t("whaleTracker.waveScannerDesc", "Trend reversals define waves. Positive net waves indicate institutional accumulation sessions.")}
      </Text>
      <View style={styles.waveList}>
        {summary.waves.slice(-5).reverse().map((wave) => (
          <WaveMiniCard key={wave.id} colors={colors} wave={wave} />
        ))}
      </View>
    </View>
  );
}

function WaveMiniCard({ colors, wave }: { colors: ThemePalette; wave: WhaleWaveSummary }) {
  const accentColor = wave.isInstitutionalAccumulation ? colors.success : colors.textMuted;
  const directionColor =
    wave.direction === "down" ? colors.danger : wave.direction === "up" ? colors.accentPrimary : colors.textMuted;
  
  return (
    <View style={[styles.waveMini, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
      <View style={styles.waveHeader}>
        <Text style={[styles.waveId, { color: accentColor }]}>
          WAVE {wave.id.toString().padStart(2, "0")}
        </Text>
        <Text style={[styles.waveMeta, { color: colors.textMuted }]}>
          {wave.bars} bars
        </Text>
      </View>
      <Text style={[styles.waveMeta, { color: colors.textMuted }]}>
        {wave.startDate} → {wave.endDate}
      </Text>
      <Text style={[styles.waveDirection, { color: directionColor }]}>
        {wave.direction.toUpperCase()}
      </Text>
      <Text style={[styles.waveNet, { color: accentColor }]}>
        {formatCompact(wave.netResult)}
      </Text>
      <Text style={[styles.waveStatus, { color: wave.isInstitutionalAccumulation ? colors.success : colors.textMuted }]}>
        {wave.isInstitutionalAccumulation ? "ACCUMULATION" : "DISTRIBUTION"}
      </Text>
    </View>
  );
}

function StatCard({
  colors,
  label,
  value,
  color,
  hint,
}: {
  colors: ThemePalette;
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {hint && <Text style={[styles.statHint, { color: colors.textMuted }]}>{hint}</Text>}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
  },
  headerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 13,
    lineHeight: 19,
  },
  pickerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  pickerRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  runBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  tfRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tfChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tfChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dateRow: {
    flexDirection: "row",
    gap: 10,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
  },
  dateInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  rangeNote: {
    fontSize: 11,
    fontWeight: "500",
  },
  statusCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  statHint: {
    fontSize: 10,
    fontWeight: "500",
  },
  waveCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  waveTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  waveSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  waveList: {
    gap: 10,
  },
  waveMini: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  waveHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waveId: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  waveMeta: {
    fontSize: 10,
    fontWeight: "500",
  },
  waveDirection: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  waveNet: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  waveStatus: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tableCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  tableSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  tableWrap: {
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  tableCell: {
    fontSize: 13,
    fontWeight: "500",
  },
});
