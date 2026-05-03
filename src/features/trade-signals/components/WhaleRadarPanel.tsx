/**
 * Whale Radar Panel — institutional flow detection UI.
 *
 * Renders the output of the Whale Flow Decision Engine for any ticker.
 * Data is fetched from TickerChart via backend proxy. Scoring is done client-side.
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
import { CandlestickChart } from "@/src/features/trade-signals/components/CandlestickChart";
import { WhaleRadarAIChat } from "@/src/features/trade-signals/components/WhaleRadarAIChat";

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
      // Always anchor preset ranges to today so the user gets fresh data
      // regardless of how long the screen has been open.
      const r = defaultRange(timeframe);
      setFromDate(r.from);
      setToDate(r.to);
      setSubmittedRange(r);
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

      {/* ── Summary (action + scores) shown above picker ─────── */}
      {result && <RadarSummary colors={colors} result={result} />}

      {/* ── Symbol picker ──────────────────────────────────────── */}
      <View style={[styles.pickerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>
          {t("whaleRadar.symbolLabel", "Ticker (e.g. AAPL, KFH.KW)")}
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
            disabled={symbolInput.trim().length === 0 || candlesQuery.isFetching}
            style={({ pressed }) => [
              styles.runBtn,
              {
                backgroundColor: colors.accentPrimary,
                opacity:
                  symbolInput.trim().length === 0
                    ? 0.4
                    : candlesQuery.isFetching
                      ? 0.7
                      : pressed
                        ? 0.7
                        : 1,
              },
            ]}
          >
            {candlesQuery.isFetching && normalized.length > 0 ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="play" size={14} color="#fff" />
            )}
            <Text style={styles.runBtnText}>
              {candlesQuery.isFetching && normalized.length > 0
                ? t("whaleRadar.scanning", "Scanning…")
                : t("whaleRadar.scan", "Scan")}
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
        <Text style={[styles.pickerLabel, { color: colors.textSecondary, marginTop: 4 }]}>
          {t("whaleRadar.timeframeLabel", "Historical Range")}
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
              {t("whaleRadar.custom", "Custom")}
            </Text>
          </Pressable>
        </View>

        {timeframe === "CUSTOM" && (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                {t("whaleRadar.from", "From")}
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
                {t("whaleRadar.to", "To")}
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
          {t("whaleRadar.rangeNote", "Range: {{from}} → {{to}}", {
            from: submittedRange.from,
            to: submittedRange.to,
          })}
        </Text>
      </View>

      {/* ── Loading / errors / insufficient ────────────────────── */}
      {!normalized && !candlesQuery.isFetching && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={22} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: 10, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
            {t("whaleRadar.emptyTitle", "Enter a ticker to scan")}
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
            {t(
              "whaleRadar.emptyHint",
              "Pick a quick suggestion above or type any symbol (use exchange suffix for non-US, e.g. KFH.KW).",
            )}
          </Text>
        </View>
      )}

      {candlesQuery.isLoading && (
        <View style={[styles.statusCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
            {t("whaleRadar.fetching", "Fetching market data…")}
          </Text>
        </View>
      )}

      {candlesQuery.isError && (
        <View style={[styles.statusCard, { backgroundColor: colors.danger + "12", borderColor: colors.danger + "40" }]}>
          <FontAwesome name="exclamation-triangle" size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, marginTop: 6, fontSize: 13, textAlign: "center" }}>
            {t(
              "whaleRadar.fetchError",
              "Could not fetch data. Check the ticker symbol (include exchange suffix like .KW for Kuwait) and try again.",
            )}
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

      {/* ── Candlestick chart ──────────────────────────────────── */}
      {candlesQuery.data && candlesQuery.data.length > 0 && (
        <CandlestickChart
          candles={candlesQuery.data}
          colors={colors}
          maxBars={candlesQuery.data.length}
        />
      )}

      {/* ── Result details (meta / factors / levels) ─────────── */}
      {result && <RadarDetails colors={colors} result={result} />}

      {/* ── AI Chat ────────────────────────────────────────────── */}
      {result && <WhaleRadarAIChat colors={colors} ticker={normalized} result={result} />}
    </ScrollView>
  );
}

// ── Summary (rendered above picker) ─────────────────────────────────

function scoreHelper(score: number, type: "accum" | "dist"): string {
  if (type === "accum") {
    if (score >= 80) return `${score}/100 — Strong buying pressure. Institutions likely accumulating on price dips.`;
    if (score >= 70) return `${score}/100 — Moderate buying pressure. Some institutional accumulation detected.`;
    if (score >= 50) return `${score}/100 — Mild buying activity. No clear institutional footprint yet.`;
    return `${score}/100 — Low buying pressure. Institutions are not actively accumulating.`;
  } else {
    if (score >= 80) return `${score}/100 — Heavy selling pressure. Institutions likely offloading positions.`;
    if (score >= 70) return `${score}/100 — Moderate selling. Some distribution activity detected.`;
    if (score >= 50) return `${score}/100 — Mild selling activity. Distribution is not dominant.`;
    return `${score}/100 — Low distribution. Minimal institutional selling detected.`;
  }
}

function parseSuggestedAction(
  suggested: string,
  action: Action,
  colors: ThemePalette,
) {
  // Separate entry instruction from stop instruction for clearer display
  const stopMatch = suggested.match(/Stop\s+([\d.]+)/);
  const stop = stopMatch ? stopMatch[1] : null;
  const entryPart = stop ? suggested.replace(/\.?\s*Stop\s+[\d.]+\.?/, "").trim() : suggested;

  const entryLabel = action === "BUY" ? "ENTRY" : action === "SELL" ? "EXIT" : "WATCH";
  const entryLabelColor =
    action === "BUY" ? colors.success : action === "SELL" ? colors.danger : colors.textMuted;

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {/* Entry row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 5,
            backgroundColor: entryLabelColor + "22",
            borderWidth: 1,
            borderColor: entryLabelColor + "66",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: entryLabelColor, letterSpacing: 1 }}>
            {entryLabel}
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textPrimary, flex: 1, lineHeight: 20 }}>
          {entryPart}
        </Text>
      </View>
      {/* Stop row */}
      {stop && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 5,
              backgroundColor: colors.danger + "22",
              borderWidth: 1,
              borderColor: colors.danger + "66",
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.danger, letterSpacing: 1 }}>
              STOP
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.danger, lineHeight: 22 }}>
              {stop}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 1 }}>
              Exit if price closes below this level
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function RadarSummary({ colors, result }: { colors: ThemePalette; result: EngineOutput }) {
  const { t } = useTranslation();
  const { alert } = result;
  const acColor = actionColor(alert.action, colors);

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
          {parseSuggestedAction(alert.suggested_action, alert.action, colors)}
        </View>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <ScoreCard
          colors={colors}
          label={t("whaleRadar.accum", "Accumulation")}
          score={result.accumulation_score}
          color={colors.success}
          helperText={scoreHelper(result.accumulation_score, "accum")}
        />
        <ScoreCard
          colors={colors}
          label={t("whaleRadar.dist", "Distribution")}
          score={result.distribution_score}
          color={colors.danger}
          helperText={scoreHelper(result.distribution_score, "dist")}
        />
      </View>
    </>
  );
}

// ── Result details card ─────────────────────────────────────────────

function RadarDetails({ colors, result }: { colors: ThemePalette; result: EngineOutput }) {
  const { t } = useTranslation();
  const { alert, factors } = result;
  const lvColor = alertColor(alert.alert_level, colors);

  return (
    <>
      {/* Meta row */}
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <FontAwesome name="bar-chart" size={14} color={colors.accentPrimary} />
          <Text style={[styles.cardHeading, { color: colors.textPrimary, marginBottom: 0 }]}>Signal Details</Text>
        </View>
        <MetaRow
          colors={colors}
          label={t("whaleRadar.alertLevel", "Alert Level")}
          value={alert.alert_level}
          valueColor={lvColor}
          hint="STRONG = clear institutional footprint · MODERATE = partial evidence · WEAK = inconclusive"
        />
        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 4 }} />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.alignment", "Timeframe Alignment")}
          value={alert.timeframe_alignment.toUpperCase()}
          hint="ALIGNED = short & long-term agree · CONFLICTING = mixed signals, trade with extra caution"
        />
        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 4 }} />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.confidence", "Model Confidence")}
          value={`${Math.round(result.confidence * 100)}%`}
          hint="Reliability of this reading. Above 70% is considered actionable."
        />
        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 4 }} />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.estFlow", "Est. Institutional Flow")}
          value={`${formatCompact(result.estimated_flow_range[0])}–${formatCompact(result.estimated_flow_range[1])}`}
          hint="Estimated capital range moving in or out. Larger values = bigger players are active."
        />
        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 4 }} />
        <MetaRow
          colors={colors}
          label={t("whaleRadar.primaryDriver", "Primary Driver")}
          value={alert.primary_driver}
          hint="The main factor that triggered this signal."
        />
      </View>

      {/* Factor contributions */}
      <View style={[styles.factorCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>
          {t("whaleRadar.factors", "Signal Breakdown")}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14, lineHeight: 17 }}>
          How much each market factor contributed to the final score (out of its max weight).
        </Text>
        {factors.contributions.map((f, idx) => {
          const pct = Math.max(0, Math.min(100, (f.points / f.weight) * 100));
          const barColor = pct >= 70 ? colors.success : pct >= 40 ? colors.accentPrimary : colors.danger;
          return (
            <View key={f.name} style={[styles.factorRow, idx < factors.contributions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor }]}>
              <View style={styles.factorLabelRow}>
                <Text style={[styles.factorName, { color: colors.textPrimary }]}>{f.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                  <Text style={[styles.factorPoints, { color: barColor }]}>+{f.points.toFixed(1)}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>/ {f.weight} pts</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <View style={[styles.factorTrack, { flex: 1, backgroundColor: colors.bgSecondary }]}>
                  <View style={[styles.factorFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: "700", color: barColor, width: 36, textAlign: "right" }}>
                  {Math.round(pct)}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Levels */}
      <View style={[styles.levelsCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>
          {t("whaleRadar.levels", "Key Price Levels")}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14, lineHeight: 17 }}>
          Two critical prices that define whether the trade idea is valid or has failed.
        </Text>
        <LevelRow
          colors={colors}
          icon="arrow-up"
          iconColor={colors.success}
          label="BREAKOUT TARGET"
          text={alert.key_level}
          description="This is the price the stock needs to break and close above. When it does — with strong volume — it confirms institutional buyers are in control and the move is real."
        />
        <LevelRow
          colors={colors}
          icon="ban"
          iconColor={colors.danger}
          label="INVALIDATION LEVEL"
          text={alert.invalidation}
          description="If the stock closes below this price, the setup is broken. It means the expected institutional support failed and you should exit or avoid the trade entirely."
        />
        {alert.confirmation_signals.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={[styles.confirmHeading, { color: colors.textMuted }]}>
              {t("whaleRadar.confirmations", "What Would Confirm This Signal")}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8, lineHeight: 17 }}>
              These are additional signs that would strengthen the case for this trade.
            </Text>
            {alert.confirmation_signals.map((s) => (
              <View
                key={s}
                style={[
                  styles.confirmChip,
                  { backgroundColor: colors.accentPrimary + "14", borderColor: colors.accentPrimary + "33" },
                ]}
              >
                <FontAwesome name="check-circle" size={11} color={colors.accentPrimary} />
                <Text style={[styles.confirmItem, { color: colors.textSecondary }]}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Disclaimer */}
      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        {t(
          "whaleRadar.disclaimer",
          "Estimates are derived from end-of-day price and volume behavior. For informational purposes only — not investment advice.",
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
  helperText,
}: {
  colors: ThemePalette;
  label: string;
  score: number;
  color: string;
  helperText?: string;
}) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <View style={[styles.scoreCard, { backgroundColor: colors.bgCard, borderColor: color + "44" }]}>
      {/* Colored top accent bar */}
      <View style={{ height: 3, borderRadius: 2, backgroundColor: color, marginBottom: 10 }} />
      <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      {/* Score + arc */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginVertical: 6 }}>
        <Text style={[styles.scoreValue, { color }]}>{score}</Text>
        <Text style={{ fontSize: 16, color: colors.textMuted, fontWeight: "600" }}>/100</Text>
      </View>
      {/* Progress bar */}
      <View style={[styles.scoreTrack, { backgroundColor: colors.bgSecondary }]}>
        <View style={[styles.scoreFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {/* Tick marks */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
        {[0, 25, 50, 75, 100].map((t) => (
          <Text key={t} style={{ fontSize: 9, color: colors.textMuted }}>{t}</Text>
        ))}
      </View>
      {helperText && (
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, lineHeight: 16 }}>
          {helperText}
        </Text>
      )}
    </View>
  );
}

function MetaRow({
  colors,
  label,
  value,
  valueColor,
  hint,
}: {
  colors: ThemePalette;
  label: string;
  value: string;
  valueColor?: string;
  hint?: string;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaLeft}>
        <Text style={[styles.metaLabel, { color: colors.textPrimary }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.metaHint, { color: "#7EB8D4" }]}>{hint}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.metaValueBadge,
          { backgroundColor: (valueColor ?? colors.accentPrimary) + "18", borderColor: (valueColor ?? colors.accentPrimary) + "44" },
        ]}
      >
        <Text style={[styles.metaValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      </View>
    </View>
  );
}

function LevelRow({
  colors,
  icon,
  iconColor,
  text,
  label,
  description,
}: {
  colors: ThemePalette;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  iconColor: string;
  text: string;
  label?: string;
  description?: string;
}) {
  return (
    <View style={[
      styles.levelRow,
      { backgroundColor: iconColor + "10", borderLeftColor: iconColor, borderLeftWidth: 3, borderRadius: 8 },
    ]}>
      <FontAwesome name={icon} size={13} color={iconColor} />
      <View style={{ flex: 1 }}>
        {label ? (
          <Text style={{ fontSize: 10, fontWeight: "800", color: iconColor, letterSpacing: 0.8, marginBottom: 2 }}>
            {label}
          </Text>
        ) : null}
        <Text style={[styles.levelText, { color: colors.textPrimary }]}>{text}</Text>
        {description ? (
          <Text style={{ fontSize: 12, color: "#7EB8D4", marginTop: 5, lineHeight: 17 }}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

// Web-friendly font sizes (standard web body 14-16px, headings 18-24px)
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80, gap: 16 },
  headerCard: { borderRadius: 12, borderWidth: 1, padding: 18, gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  headerSub: { fontSize: 14, lineHeight: 20 },

  pickerCard: { borderRadius: 12, borderWidth: 1, padding: 18, gap: 12 },
  pickerLabel: { fontSize: 14, fontWeight: "600" },
  pickerRow: { flexDirection: "row", gap: 10 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickChipText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  runBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  tfRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tfChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  tfChipText: { fontSize: 14, fontWeight: "600" },
  dateRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  dateLabel: { fontSize: 13, fontWeight: "600", marginBottom: 5 },
  dateInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "monospace",
  },
  rangeNote: { fontSize: 13, fontStyle: "italic", marginTop: 6 },

  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  actionBanner: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  actionPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionPillText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  actionTitle: { fontSize: 20, fontWeight: "700" },
  actionSub: { fontSize: 14, marginTop: 4, lineHeight: 20 },

  scoreRow: { flexDirection: "row", gap: 12 },
  scoreCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  scoreLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2 },
  scoreValue: { fontSize: 40, fontWeight: "900", letterSpacing: -2 },
  scoreTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  scoreFill: { height: 10, borderRadius: 5 },

  metaCard: { borderRadius: 14, borderWidth: 1, padding: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10 },
  metaLeft: { flex: 1, gap: 3, paddingRight: 16 },
  metaLabel: { fontSize: 14, fontWeight: "700" },
  metaHint: { fontSize: 12, lineHeight: 18, letterSpacing: 0.1 },
  metaValueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  metaValue: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },

  factorCard: { borderRadius: 14, borderWidth: 1, padding: 20 },
  cardHeading: { fontSize: 17, fontWeight: "800", marginBottom: 14 },
  factorRow: { paddingVertical: 12 },
  factorLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  factorName: { fontSize: 14, fontWeight: "600" },
  factorPoints: { fontSize: 15, fontWeight: "800" },
  factorTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  factorFill: { height: 8, borderRadius: 4 },

  levelsCard: { borderRadius: 14, borderWidth: 1, padding: 20 },
  levelRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, marginBottom: 10 },
  levelText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "500" },
  confirmHeading: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  confirmChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  confirmItem: { fontSize: 13, lineHeight: 18, flex: 1 },

  disclaimer: { fontSize: 12, fontStyle: "italic", lineHeight: 18, paddingHorizontal: 4, opacity: 0.7 },
});
