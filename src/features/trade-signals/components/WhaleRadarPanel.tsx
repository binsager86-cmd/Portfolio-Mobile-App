/**
 * Whale Radar Panel — institutional flow detection UI.
 *
 * Renders the output of the Whale Flow Decision Engine for any ticker
 * fetched from EODHD. All scoring is done client-side from OHLCV data.
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
import { getWhaleTrackerCandles } from "@/services/api/analytics/whaleTracker";
import {
  analyzeCandles,
  type Action,
  type AlertLevel,
  type EngineOutput,
} from "@/src/features/trade-signals/whaleRadar";

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

function actionColor(action: Action, colors: ThemePalette): string {
  if (action === "BUY") return colors.success;
  if (action === "SELL") return colors.danger;
  return colors.textMuted;
}

function alertColor(level: AlertLevel, colors: ThemePalette): string {
  if (level === "STRONG") return colors.success;
  if (level === "MODERATE") return colors.accentPrimary;
  return colors.textMuted;
}

// ── Component ───────────────────────────────────────────────────────

export function WhaleRadarPanel({ colors }: { colors: ThemePalette }) {
  const { t } = useTranslation();
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [submittedSymbol, setSubmittedSymbol] = useState("AAPL");
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
    if (timeframe === "CUSTOM" && validRange) {
      setSubmittedRange({ from: fromDate, to: toDate });
    }
  };

  const candlesQuery = useQuery({
    queryKey: ["whale-radar", normalized, submittedRange.from, submittedRange.to],
    queryFn: () =>
      getWhaleTrackerCandles({
        symbol: normalized,
        from: submittedRange.from,
        to: submittedRange.to,
      }),
    enabled: normalized.length > 0,
    staleTime: 5 * 60_000,
  });

  const result: EngineOutput | null = useMemo(() => {
    if (!candlesQuery.data || candlesQuery.data.length < 25) return null;
    return analyzeCandles(normalized, candlesQuery.data);
  }, [candlesQuery.data, normalized]);

  const candleCount = candlesQuery.data?.length ?? 0;
  const insufficient = candlesQuery.data && candleCount < 25;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.headerRow}>
          <FontAwesome name="bullseye" size={18} color={colors.accentPrimary} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {t("whaleRadar.title", "Whale Radar")}
          </Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.textMuted }]}>
          {t(
            "whaleRadar.subtitle",
            "Institutional accumulation / distribution scoring engine. Scores 0–100, sigmoid-calibrated flow estimate, multi-timeframe alignment.",
          )}
        </Text>
      </View>

      {/* ── Symbol picker ──────────────────────────────────────── */}
      <View style={[styles.pickerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>
          {t("whaleRadar.symbolLabel", "Ticker (e.g. AAPL, KFH.KW)")}
        </Text>
        <View style={styles.pickerRow}>
          <TextInput
            value={symbolInput}
            onChangeText={setSymbolInput}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AAPL"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.borderColor },
            ]}
            onSubmitEditing={() => setSubmittedSymbol(symbolInput)}
            returnKeyType="search"
          />
          <Pressable
            onPress={() => setSubmittedSymbol(symbolInput)}
            style={({ pressed }) => [
              styles.runBtn,
              { backgroundColor: colors.accentPrimary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <FontAwesome name="play" size={12} color="#fff" />
            <Text style={styles.runBtnText}>{t("whaleRadar.scan", "Scan")}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Loading / errors / insufficient ────────────────────── */}
      {candlesQuery.isLoading && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
            {t("whaleRadar.fetching", "Fetching EODHD candles…")}
          </Text>
        </View>
      )}

      {candlesQuery.isError && (
        <View style={[styles.statusCard, { backgroundColor: colors.danger + "12", borderColor: colors.danger + "40" }]}>
          <FontAwesome name="exclamation-triangle" size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, marginTop: 6, fontSize: 13, textAlign: "center" }}>
            {t("whaleRadar.fetchError", "Could not fetch candles. Check symbol/exchange suffix and EODHD token.")}
          </Text>
        </View>
      )}

      {insufficient && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <FontAwesome name="info-circle" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 13, textAlign: "center" }}>
            {t("whaleRadar.insufficient", "Insufficient history (got {{n}} candles, need ≥25).", { n: candleCount })}
          </Text>
        </View>
      )}

      {/* ── Result ─────────────────────────────────────────────── */}
      {result && <RadarResult colors={colors} result={result} />}
    </ScrollView>
  );
}

// ── Result card ─────────────────────────────────────────────────────

function RadarResult({ colors, result }: { colors: ThemePalette; result: EngineOutput }) {
  const { t } = useTranslation();
  const { alert, factors } = result;
  const acColor = actionColor(alert.action, colors);
  const lvColor = alertColor(alert.alert_level, colors);

  return (
    <>
      {/* Action banner */}
      <View style={[styles.actionBanner, { backgroundColor: acColor + "15", borderColor: acColor + "60" }]}>
        <View style={[styles.actionPill, { backgroundColor: acColor }]}>
          <Text style={styles.actionPillText}>{alert.action}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
            {result.ticker} · {alert.bias}
          </Text>
          <Text style={[styles.actionSub, { color: colors.textSecondary }]}>{alert.suggested_action}</Text>
        </View>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <ScoreCard
          colors={colors}
          label={t("whaleRadar.accum", "Accumulation")}
          score={result.accumulation_score}
          color={colors.success}
        />
        <ScoreCard
          colors={colors}
          label={t("whaleRadar.dist", "Distribution")}
          score={result.distribution_score}
          color={colors.danger}
        />
      </View>

      {/* Meta row */}
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <MetaRow
          colors={colors}
          label={t("whaleRadar.alertLevel", "Alert Level")}
          value={alert.alert_level}
          valueColor={lvColor}
        />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.alignment", "Multi-TF Alignment")}
          value={alert.timeframe_alignment.toUpperCase()}
        />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.confidence", "Confidence")}
          value={`${Math.round(result.confidence * 100)}%`}
        />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.estFlow", "Est. Institutional Flow")}
          value={`${formatCompact(result.estimated_flow_range[0])}–${formatCompact(result.estimated_flow_range[1])}`}
        />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.primaryDriver", "Primary Driver")}
          value={alert.primary_driver}
        />
      </View>

      {/* Factor contributions */}
      <View style={[styles.factorCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>
          {t("whaleRadar.factors", "Factor Contributions")}
        </Text>
        {factors.contributions.map((f) => {
          const pct = (f.points / f.weight) * 100;
          return (
            <View key={f.name} style={styles.factorRow}>
              <View style={styles.factorLabelRow}>
                <Text style={[styles.factorName, { color: colors.textSecondary }]}>{f.name}</Text>
                <Text style={[styles.factorPoints, { color: colors.textPrimary }]}>
                  +{f.points.toFixed(1)} <Text style={{ color: colors.textMuted }}>/ {f.weight}</Text>
                </Text>
              </View>
              <View style={[styles.factorTrack, { backgroundColor: colors.bgSecondary }]}>
                <View
                  style={[
                    styles.factorFill,
                    { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: colors.accentPrimary },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* Levels */}
      <View style={[styles.levelsCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>
          {t("whaleRadar.levels", "Key Levels")}
        </Text>
        <LevelRow colors={colors} icon="arrow-up" iconColor={colors.success} text={alert.key_level} />
        <LevelRow colors={colors} icon="ban" iconColor={colors.danger} text={alert.invalidation} />
        {alert.confirmation_signals.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.confirmHeading, { color: colors.textMuted }]}>
              {t("whaleRadar.confirmations", "Supporting Signals")}
            </Text>
            {alert.confirmation_signals.map((s) => (
              <Text key={s} style={[styles.confirmItem, { color: colors.textSecondary }]}>
                ◦ {s}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        {t(
          "whaleRadar.disclaimer",
          "Flow estimate uses A/D multiplier × volume × price as a proxy (data_quality: estimated). Direct aggressor data not available from EODHD EOD endpoint. Decisions are not investment advice.",
        )}
      </Text>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ScoreCard({
  colors,
  label,
  score,
  color,
}: {
  colors: ThemePalette;
  label: string;
  score: number;
  color: string;
}) {
  return (
    <View style={[styles.scoreCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.scoreValue, { color }]}>{score}</Text>
      <View style={[styles.scoreTrack, { backgroundColor: colors.bgSecondary }]}>
        <View
          style={[
            styles.scoreFill,
            { width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

function MetaRow({
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
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function LevelRow({
  colors,
  icon,
  iconColor,
  text,
}: {
  colors: ThemePalette;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor: string;
  text: string;
}) {
  return (
    <View style={styles.levelRow}>
      <FontAwesome name={icon} size={12} color={iconColor} style={{ marginTop: 3 }} />
      <Text style={[styles.levelText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 80, gap: 12 },
  headerCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: "800" },
  headerSub: { fontSize: 12, lineHeight: 17 },

  pickerCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  pickerLabel: { fontSize: 12, fontWeight: "600" },
  pickerRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  runBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  tfRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tfChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  dateRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dateLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  dateInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "monospace",
  },
  rangeNote: { fontSize: 11, fontStyle: "italic", marginTop: 4 },

  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  actionBanner: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  actionPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionPillText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  actionTitle: { fontSize: 16, fontWeight: "700" },
  actionSub: { fontSize: 12, marginTop: 3, lineHeight: 17 },

  scoreRow: { flexDirection: "row", gap: 10 },
  scoreCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  scoreLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  scoreValue: { fontSize: 28, fontWeight: "800", letterSpacing: -1 },
  scoreTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  scoreFill: { height: 6, borderRadius: 3 },

  metaCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaLabel: { fontSize: 12, fontWeight: "500" },
  metaValue: { fontSize: 13, fontWeight: "700" },

  factorCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  cardHeading: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  factorRow: { marginBottom: 10 },
  factorLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  factorName: { fontSize: 12, fontWeight: "600" },
  factorPoints: { fontSize: 12, fontWeight: "700" },
  factorTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  factorFill: { height: 4, borderRadius: 2 },

  levelsCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  levelRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  levelText: { flex: 1, fontSize: 12, lineHeight: 17 },
  confirmHeading: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", marginBottom: 4 },
  confirmItem: { fontSize: 12, lineHeight: 18 },

  disclaimer: { fontSize: 11, fontStyle: "italic", lineHeight: 16, paddingHorizontal: 4 },
});
