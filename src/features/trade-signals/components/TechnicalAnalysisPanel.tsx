/**
 * TechnicalAnalysisPanel — Kuwait multi-factor signal engine UI.
 *
 * Lets the user pick any KSE Premier Market ticker, then displays the
 * full signal output from GET /api/v1/trade-signals/kuwait-signal.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
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
import {
  getKuwaitSignal,
  type KuwaitSignal,
  type KuwaitSignalSubScores,
} from "@/services/api/analytics/tradeSignals";

// ── Quick-pick tickers ────────────────────────────────────────────────
const QUICK_TICKERS = ["NBK", "KFH", "ZAIN", "MABANEE", "BURG", "CBK", "AGILITY"];

// ── Helper formatters ─────────────────────────────────────────────────
function fmtFils(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)} fils`;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v == null) return "—";
  return v.toFixed(dp);
}

// ── Score bar ─────────────────────────────────────────────────────────
function ScoreBar({
  label,
  value,
  max = 100,
  colors,
}: {
  label: string;
  value: number;
  max?: number;
  colors: ThemePalette;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const barColor =
    pct >= 0.7 ? "#22c55e" : pct >= 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.scoreBarRow}>
        <Text style={[styles.scoreBarLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.scoreBarVal, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      <View style={[styles.scoreBarTrack, { backgroundColor: colors.borderColor }]}>
        <View style={[styles.scoreBarFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Section card ──────────────────────────────────────────────────────
function SectionCard({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

// ── Row item ──────────────────────────────────────────────────────────
function Row({
  label,
  value,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ThemePalette;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ── Signal badge ──────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "NEUTRAL" }) {
  const bg =
    signal === "BUY"
      ? "#22c55e18"
      : signal === "SELL"
      ? "#ef444418"
      : "#94a3b818";
  const color =
    signal === "BUY" ? "#22c55e" : signal === "SELL" ? "#ef4444" : "#94a3b8";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{signal}</Text>
    </View>
  );
}

// ── Regime badge ──────────────────────────────────────────────────────
function RegimeBadge({ regime }: { regime: string }) {
  const isBull = regime.includes("Bull");
  const isBear = regime.includes("Bear");
  const bg = isBull ? "#22c55e18" : isBear ? "#ef444418" : "#f59e0b18";
  const color = isBull ? "#22c55e" : isBear ? "#ef4444" : "#f59e0b";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>
        {regime.replace("_", " ")}
      </Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────
export function TechnicalAnalysisPanel({ colors }: { colors: ThemePalette }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const { data: signal, isLoading, isError, error } = useQuery<KuwaitSignal>({
    queryKey: ["kuwait-signal", ticker],
    queryFn: () =>
      getKuwaitSignal({ symbol: ticker!, exchange: "KSE", segment: "PREMIER" }),
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  });

  function submit() {
    const sym = input.trim().toUpperCase().replace(/\.KW$/i, "");
    if (sym) setTicker(sym);
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: 80 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Search bar ──────────────────────────────────────── */}
      <View style={[styles.searchCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.searchTitle, { color: colors.textPrimary }]}>
          Kuwait Signal Engine
        </Text>
        <Text style={[styles.searchSub, { color: colors.textMuted }]}>
          Multi-factor technical analysis · KSE Premier Market
        </Text>

        <View style={[styles.inputRow, { borderColor: colors.borderColor }]}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder="Enter ticker (e.g. NBK, KFH)"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submit}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          <Pressable
            onPress={submit}
            style={[styles.searchBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <FontAwesome name="search" size={14} color="#fff" />
          </Pressable>
        </View>

        {/* Quick-pick chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {QUICK_TICKERS.map((sym) => (
            <Pressable
              key={sym}
              onPress={() => { setInput(sym); setTicker(sym); }}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    ticker === sym ? colors.accentPrimary + "20" : colors.bgPrimary,
                  borderColor:
                    ticker === sym ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text
                style={{
                  color: ticker === sym ? colors.accentPrimary : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {sym}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Loading ────────────────────────────────────────── */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Analysing {ticker}…
          </Text>
        </View>
      )}

      {/* ── Error ─────────────────────────────────────────── */}
      {isError && (
        <View style={[styles.errorBox, { borderColor: "#ef4444", backgroundColor: "#ef444412" }]}>
          <FontAwesome name="exclamation-triangle" size={16} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>
            {(error as any)?.response?.data?.detail ?? "Failed to load signal. Try again."}
          </Text>
        </View>
      )}

      {/* ── Signal output ─────────────────────────────────── */}
      {signal && !isLoading && <SignalOutput signal={signal} colors={colors} />}

      {/* ── Empty state ───────────────────────────────────── */}
      {!ticker && !isLoading && (
        <View style={styles.emptyState}>
          <FontAwesome name="line-chart" size={40} color={colors.accentPrimary + "60"} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            Enter a ticker to generate a signal
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            Supports KSE Premier Market stocks. Uses trend, momentum, volume flow, support/resistance, and risk/reward confluence scoring.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Signal output blocks ──────────────────────────────────────────────
function SignalOutput({ signal, colors }: { signal: KuwaitSignal; colors: ThemePalette }) {
  const c = signal.confluence_details;
  const e = signal.execution;
  const r = signal.risk_metrics;
  const p = signal.probabilities;
  const sub = c.sub_scores as KuwaitSignalSubScores;
  const raw = c.raw_sub_scores as KuwaitSignalSubScores;

  return (
    <>
      {/* ── Header ───────────────────────────────────────── */}
      <View style={[styles.signalHeader, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.signalHeaderLeft}>
          <Text style={[styles.stockCode, { color: colors.textPrimary }]}>{signal.stock_code}</Text>
          <Text style={[styles.setupType, { color: colors.textMuted }]}>
            {signal.setup_type.replace(/_/g, " ")}
          </Text>
        </View>
        <View style={styles.signalHeaderRight}>
          <SignalBadge signal={signal.signal} />
          <Text style={[styles.scoreCircleText, { color: colors.textPrimary }]}>
            {c.total_score}<Text style={{ fontSize: 11, color: colors.textMuted }}>/100</Text>
          </Text>
        </View>
      </View>

      {/* ── Regime + liquidity ───────────────────────────── */}
      <SectionCard title="Market Regime & Liquidity" colors={colors}>
        <View style={styles.regimeRow}>
          <RegimeBadge regime={c.regime ?? "Neutral_Chop"} />
          <Text style={[styles.regimeConf, { color: colors.textMuted }]}>
            {fmtPct(c.regime_confidence)} confidence
          </Text>
        </View>
        <Row
          label="Auction Intensity"
          value={c.auction_intensity != null ? c.auction_intensity.toFixed(2) : "—"}
          colors={colors}
        />
        <View style={styles.liqRow}>
          <LiqChip label="ADTV" pass={c.liquidity_details?.pass_adtv ?? false} colors={colors}
            value={c.liquidity_details?.adtv_20d_kd != null
              ? `KD ${(c.liquidity_details.adtv_20d_kd / 1000).toFixed(0)}K` : "—"} />
          <LiqChip label="Spread" pass={c.liquidity_details?.pass_spread ?? false} colors={colors}
            value={c.liquidity_details?.spread_proxy_pct != null
              ? `${c.liquidity_details.spread_proxy_pct.toFixed(2)}%` : "—"} />
          <LiqChip label="Active" pass={c.liquidity_details?.pass_active_days ?? false} colors={colors}
            value={c.liquidity_details?.active_days_30d_pct != null
              ? `${c.liquidity_details.active_days_30d_pct.toFixed(0)}%` : "—"} />
          <LiqChip label="Volume" pass={c.liquidity_details?.pass_concentration ?? false} colors={colors}
            value={c.liquidity_details?.volume_concentration != null
              ? `${c.liquidity_details.volume_concentration.toFixed(0)}%` : "—"} />
        </View>
      </SectionCard>

      {/* ── Confluence scores ────────────────────────────── */}
      <SectionCard title="Confluence Scores" colors={colors}>
        <ScoreBar label={`Trend  (weighted ${sub.trend})`} value={raw.trend} colors={colors} />
        <ScoreBar label={`Momentum  (weighted ${sub.momentum})`} value={raw.momentum} colors={colors} />
        <ScoreBar label={`Volume / Flow  (weighted ${sub.volume_flow})`} value={raw.volume_flow} colors={colors} />
        <ScoreBar label={`Support / Resistance  (weighted ${sub.support_resistance})`} value={raw.support_resistance} colors={colors} />
        <ScoreBar label={`Risk / Reward  (weighted ${sub.risk_reward})`} value={raw.risk_reward} colors={colors} />
        <View style={[styles.totalRow, { borderTopColor: colors.borderColor }]}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Score</Text>
          <Text style={[styles.totalValue, {
            color: c.total_score >= 75 ? "#22c55e" : c.total_score >= 50 ? "#f59e0b" : "#ef4444",
          }]}>
            {c.total_score} / 100
          </Text>
        </View>
      </SectionCard>

      {/* ── Execution levels ─────────────────────────────── */}
      {signal.signal !== "NEUTRAL" && (
        <SectionCard title="Execution Levels (fils)" colors={colors}>
          <Row label="Entry Zone" value={
            e.entry_zone_fils[0] != null
              ? `${e.entry_zone_fils[0]?.toFixed(1)} – ${e.entry_zone_fils[1]?.toFixed(1)} fils`
              : "—"
          } colors={colors} />
          <Row label="Stop Loss" value={fmtFils(e.stop_loss_fils)}
            valueColor="#ef4444" colors={colors} />
          <Row label="TP1 (1.5R)" value={fmtFils(e.tp1_fils)}
            valueColor="#22c55e" colors={colors} />
          <Row label="TP2 (3.0R)" value={fmtFils(e.tp2_fils)}
            valueColor="#22c55e" colors={colors} />
          <Row label="Risk per Share" value={fmtFils(r.risk_per_share_fils)} colors={colors} />
          <Row label="Risk / Reward" value={r.risk_reward_ratio != null ? `1 : ${r.risk_reward_ratio.toFixed(2)}` : "—"}
            valueColor={
              (r.risk_reward_ratio ?? 0) >= 2 ? "#22c55e"
              : (r.risk_reward_ratio ?? 0) >= 1.5 ? "#f59e0b"
              : "#ef4444"
            }
            colors={colors}
          />
          <Row label="Tick Alignment" value={e.tick_alignment} colors={colors} />
          <Row label="Order Type" value={e.preferred_order_type} colors={colors} />
        </SectionCard>
      )}

      {/* ── Probabilities ────────────────────────────────── */}
      <SectionCard title="Probability Estimates" colors={colors}>
        <ProbabilityBlock p={p} colors={colors} />
      </SectionCard>

      {/* ── Risk metrics ─────────────────────────────────── */}
      <SectionCard title="Risk & Position Sizing" colors={colors}>
        <Row label="Position Size" value={r.position_size_percent != null ? `${r.position_size_percent.toFixed(2)}% of equity` : "—"} colors={colors} />
        <Row label="CVaR 95 %" value={fmtFils(r.cvar_95_fils)} colors={colors} />
        <Row label="Liquidity Factor" value={r.liquidity_adjustment_factor != null ? r.liquidity_adjustment_factor.toFixed(3) : "—"} colors={colors} />
      </SectionCard>

      {/* ── Alerts ───────────────────────────────────────── */}
      {signal.alerts.length > 0 && (
        <SectionCard title="Alerts" colors={colors}>
          {signal.alerts.map((a, i) => (
            <View key={i} style={styles.alertRow}>
              <FontAwesome
                name={a.startsWith("WARNING") || a.startsWith("LIQUIDITY") ? "exclamation-triangle" : "info-circle"}
                size={12}
                color={a.startsWith("WARNING") || a.startsWith("LIQUIDITY") ? "#f59e0b" : colors.accentPrimary}
                style={{ marginTop: 1, marginRight: 6, flexShrink: 0 }}
              />
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>{a}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── Metadata ─────────────────────────────────────── */}
      <View style={[styles.meta, { borderTopColor: colors.borderColor }]}>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          Model v{signal.metadata.model_version} · Data as of {signal.metadata.data_as_of} · {signal.metadata.walk_forward_window}
        </Text>
      </View>
    </>
  );
}

// ── Probability block ─────────────────────────────────────────────────
function ProbabilityBlock({
  p,
  colors,
}: {
  p: KuwaitSignal["probabilities"];
  colors: ThemePalette;
}) {
  const tp1 = p.p_tp1_before_sl;
  const tp2 = p.p_tp2_before_sl;
  const ci = p.confidence_interval_95;

  return (
    <>
      <View style={styles.probRow}>
        <ProbCircle label="P(TP1)" value={tp1} colors={colors} />
        <ProbCircle label="P(TP2)" value={tp2} colors={colors} />
        <View style={styles.probInfo}>
          <Text style={[styles.probLabel, { color: colors.textMuted }]}>95% CI</Text>
          <Text style={[styles.probValue, { color: colors.textPrimary }]}>
            {ci ? `${(ci[0] * 100).toFixed(0)}% – ${(ci[1] * 100).toFixed(0)}%` : "—"}
          </Text>
          <Text style={[styles.probLabel, { color: colors.textMuted, marginTop: 4 }]}>Exp. Return</Text>
          <Text style={[styles.probValue, { color: (p.expected_return_r_multiple ?? 0) > 0 ? "#22c55e" : "#ef4444" }]}>
            {p.expected_return_r_multiple != null ? `${p.expected_return_r_multiple.toFixed(2)}R` : "—"}
          </Text>
        </View>
      </View>
      <Text style={[styles.calibMethod, { color: colors.textMuted }]}>
        Method: {p.calibration_method}
      </Text>
    </>
  );
}

function ProbCircle({
  label,
  value,
  colors,
}: {
  label: string;
  value: number | null;
  colors: ThemePalette;
}) {
  const pct = value != null ? Math.round(value * 100) : null;
  const color =
    pct == null ? colors.textMuted
    : pct >= 68 ? "#22c55e"
    : pct >= 55 ? "#f59e0b"
    : "#ef4444";

  return (
    <View style={styles.probCircleWrap}>
      <View style={[styles.probCircle, { borderColor: color }]}>
        <Text style={[styles.probCircleNum, { color }]}>
          {pct != null ? `${pct}%` : "—"}
        </Text>
      </View>
      <Text style={[styles.probCircleLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ── Liquidity chip ────────────────────────────────────────────────────
function LiqChip({
  label,
  pass,
  value,
  colors,
}: {
  label: string;
  pass: boolean;
  value: string;
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.liqChip, {
      backgroundColor: pass ? "#22c55e12" : "#ef444412",
      borderColor: pass ? "#22c55e40" : "#ef444440",
    }]}>
      <FontAwesome name={pass ? "check" : "times"} size={9} color={pass ? "#22c55e" : "#ef4444"} />
      <Text style={{ color: pass ? "#22c55e" : "#ef4444", fontSize: 10, fontWeight: "700", marginLeft: 3 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 9, marginLeft: 3 }}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 14 },

  searchCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14,
  },
  searchTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  searchSub: { fontSize: 12, marginBottom: 12 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 10, overflow: "hidden",
  },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  searchBtn: {
    paddingHorizontal: 16, paddingVertical: 11,
    alignItems: "center", justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, marginRight: 8,
  },

  center: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  errorText: { fontSize: 13, flex: 1 },

  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 12, textAlign: "center", lineHeight: 18 },

  // Signal header
  signalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10,
  },
  signalHeaderLeft: { gap: 4 },
  signalHeaderRight: { alignItems: "flex-end", gap: 6 },
  stockCode: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  setupType: { fontSize: 12 },
  scoreCircleText: { fontSize: 20, fontWeight: "800" },

  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },

  // Card
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10, letterSpacing: 0.2 },

  // Row
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  rowLabel: { fontSize: 12 },
  rowValue: { fontSize: 12, fontWeight: "600" },

  // Score bar
  scoreBarRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  scoreBarLabel: { fontSize: 11 },
  scoreBarVal: { fontSize: 11, fontWeight: "700" },
  scoreBarTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  scoreBarFill: { height: 5, borderRadius: 3 },

  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, marginTop: 4, borderTopWidth: 1 },
  totalLabel: { fontSize: 13, fontWeight: "600" },
  totalValue: { fontSize: 18, fontWeight: "800" },

  // Regime
  regimeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  regimeConf: { fontSize: 12 },

  // Liquidity
  liqRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  liqChip: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },

  // Probability
  probRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  probCircleWrap: { alignItems: "center", gap: 4 },
  probCircle: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: "center", justifyContent: "center",
  },
  probCircleNum: { fontSize: 18, fontWeight: "800" },
  probCircleLabel: { fontSize: 11 },
  probInfo: { flex: 1 },
  probLabel: { fontSize: 11 },
  probValue: { fontSize: 14, fontWeight: "700" },
  calibMethod: { fontSize: 10, marginTop: 2 },

  // Alerts
  alertRow: { flexDirection: "row", paddingVertical: 4 },
  alertText: { fontSize: 12, flex: 1, lineHeight: 17 },

  // Metadata
  meta: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, alignItems: "center" },
  metaText: { fontSize: 10, textAlign: "center" },
});
