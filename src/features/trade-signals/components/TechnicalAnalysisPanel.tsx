/**
 * TechnicalAnalysisPanel — Kuwait multi-factor signal engine UI.
 *
 * Beginner-friendly design with a visual price ladder showing support,
 * resistance, entry zone, stop loss, and profit targets clearly.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { FourScores, FourScoreTier } from "@/services/api/analytics/tradeSignals";
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

// ── Human-readable regime names ───────────────────────────────────────
function humanRegime(regime: string): string {
  if (regime.includes("Bull")) return "Bull Market (Prices Rising)";
  if (regime.includes("Bear")) return "Bear Market (Prices Falling)";
  return "Sideways Market (No Clear Direction)";
}

// ── Human-readable setup type ─────────────────────────────────────────
function humanSetup(setup: string): string {
  return setup.replace(/_/g, " ");
}

// ── Section card ──────────────────────────────────────────────────────
function SectionCard({
  title,
  subtitle,
  children,
  colors,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      )}
      {children}
    </View>
  );
}

// ── Row item ──────────────────────────────────────────────────────────
function Row({
  label,
  hint,
  value,
  valueColor,
  colors,
}: {
  label: string;
  hint?: string;
  value: string;
  valueColor?: string;
  colors: ThemePalette;
}) {
  return (
    <View style={styles.rowWrap}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
        {hint && <Text style={[styles.rowHint, { color: colors.textMuted }]}>{hint}</Text>}
      </View>
      <Text style={[styles.rowValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ── Score bar (beginner labelled) ────────────────────────────────────
function ScoreBar({
  icon,
  label,
  hint,
  value,
  max = 100,
  colors,
}: {
  icon: string;
  label: string;
  hint: string;
  value: number;
  max?: number;
  colors: ThemePalette;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const barColor =
    pct >= 0.7 ? "#22c55e" : pct >= 0.5 ? "#f59e0b" : "#ef4444";
  const grade =
    pct >= 0.7 ? "Strong" : pct >= 0.5 ? "Moderate" : "Weak";
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.scoreBarRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.scoreBarLabel, { color: colors.textPrimary }]}>
            {icon}  {label}
          </Text>
          <Text style={[styles.scoreBarHint, { color: colors.textMuted }]}>{hint}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.scoreBarVal, { color: barColor }]}>{value}</Text>
          <Text style={[{ fontSize: 9, color: barColor }]}>{grade}</Text>
        </View>
      </View>
      <View style={[styles.scoreBarTrack, { backgroundColor: colors.borderColor }]}>
        <View style={[styles.scoreBarFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Signal badge ──────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: "STRONG_BUY" | "BUY" | "SELL" | "NEUTRAL" }) {
  const config = {
    STRONG_BUY: { bg: "#16a34a30", color: "#16a34a", text: "⭐ STRONG BUY" },
    BUY:        { bg: "#22c55e18", color: "#22c55e", text: "BUY SIGNAL" },
    SELL:       { bg: "#ef444418", color: "#ef4444", text: "SELL SIGNAL" },
    NEUTRAL:    { bg: "#94a3b818", color: "#94a3b8", text: "NO SIGNAL" },
  }[signal];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

// ── Regime badge ──────────────────────────────────────────────────────
function RegimeBadge({ regime }: { regime: string }) {
  const isBull = regime.includes("Bull");
  const isBear = regime.includes("Bear");
  const bg    = isBull ? "#22c55e18" : isBear ? "#ef444418" : "#f59e0b18";
  const color = isBull ? "#22c55e"   : isBear ? "#ef4444"   : "#f59e0b";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{humanRegime(regime)}</Text>
    </View>
  );
}

// ── ★ VISUAL PRICE LADDER ─────────────────────────────────────────────
type LadderLevel = {
  price: number;
  label: string;
  sublabel: string;
  type: "resistance" | "tp3" | "tp2" | "tp1" | "entry" | "stop" | "support" | "vwap";
};

const LADDER_COLORS: Record<LadderLevel["type"], { bg: string; border: string; text: string }> = {
  resistance: { bg: "#ef444415", border: "#ef4444",  text: "#ef4444"  },
  tp3:        { bg: "#d946ef15", border: "#d946ef",  text: "#a21caf"  },
  tp2:        { bg: "#22c55e15", border: "#22c55e",  text: "#22c55e"  },
  tp1:        { bg: "#86efac20", border: "#86efac",  text: "#16a34a"  },
  entry:      { bg: "#3b82f615", border: "#3b82f6",  text: "#3b82f6"  },
  stop:       { bg: "#ef444410", border: "#ef4444",  text: "#ef4444"  },
  support:    { bg: "#f59e0b12", border: "#f59e0b",  text: "#d97706"  },
  vwap:       { bg: "#a78bfa15", border: "#a78bfa",  text: "#7c3aed"  },
};

const LADDER_ICONS: Record<LadderLevel["type"], string> = {
  resistance: "⛔",
  tp3:        "🚀",
  tp2:        "🎯",
  tp1:        "✅",
  entry:      "📍",
  stop:       "🛑",
  support:    "🟡",
  vwap:       "〰️",
};

function PriceLadder({
  signal,
  colors,
}: {
  signal: KuwaitSignal;
  colors: ThemePalette;
}) {
  const e = signal.execution;
  const c = signal.confluence_details;
  const direction = signal.signal;

  // Build levels list
  const levels: LadderLevel[] = [];

  // Resistance levels
  (c.resistance_levels ?? []).slice(0, 2).forEach((p, i) => {
    levels.push({
      price: p,
      label: i === 0 ? "Nearest Resistance" : "Resistance Zone",
      sublabel: "Price may fall back from here — be cautious",
      type: "resistance",
    });
  });

  // TP3
  if (e.tp3_fils != null) {
    levels.push({
      price: e.tp3_fils,
      label: "Aggressive Target (TP3)",
      sublabel: "Maximum upside target — bonus if momentum continues strong",
      type: "tp3",
    });
  }

  // TP2
  if (e.tp2_fils != null) {
    levels.push({
      price: e.tp2_fils,
      label: "Full Target (TP2)",
      sublabel: "Your maximum profit goal — take all remaining profits here",
      type: "tp2",
    });
  }

  // TP1
  if (e.tp1_fils != null) {
    levels.push({
      price: e.tp1_fils,
      label: "First Target (TP1)",
      sublabel: "Take partial profits here — reduce your risk",
      type: "tp1",
    });
  }

  // VWAP
  if (c.vwap != null) {
    levels.push({
      price: c.vwap,
      label: "Average Price (VWAP)",
      sublabel: "Average price traded over recent sessions — acts as a magnet",
      type: "vwap",
    });
  }

  // Entry zone (use midpoint label, show range in sublabel)
  const entryMid =
    e.entry_zone_fils[0] != null && e.entry_zone_fils[1] != null
      ? (e.entry_zone_fils[0] + e.entry_zone_fils[1]) / 2
      : null;
  if (entryMid != null) {
    levels.push({
      price: entryMid,
      label: (direction === "BUY" || direction === "STRONG_BUY") ? "Buy Zone (Entry)" : direction === "SELL" ? "Sell Zone (Entry)" : "Entry Zone",
      sublabel:
        e.entry_zone_fils[0] != null && e.entry_zone_fils[1] != null
          ? `Place your order between ${e.entry_zone_fils[0]?.toFixed(1)} – ${e.entry_zone_fils[1]?.toFixed(1)} fils`
          : "Your suggested entry price",
      type: "entry",
    });
  }

  // Stop loss
  if (e.stop_loss_fils != null) {
    levels.push({
      price: e.stop_loss_fils,
      label: "Stop Loss (Exit if reached)",
      sublabel: "EXIT immediately if price touches this — cuts your loss before it grows",
      type: "stop",
    });
  }

  // Support levels
  (c.support_levels ?? []).slice(0, 2).forEach((p, i) => {
    levels.push({
      price: p,
      label: i === 0 ? "Nearest Support" : "Support Zone",
      sublabel: "Price tends to bounce back up from here",
      type: "support",
    });
  });

  // Sort descending (highest price at top = natural price ladder)
  levels.sort((a, b) => b.price - a.price);

  if (levels.length === 0) return null;

  const maxPrice = levels[0].price;
  const minPrice = levels[levels.length - 1].price;
  const priceRange = maxPrice - minPrice || 1;

  return (
    <SectionCard
      title="📊 Price Map — Support & Resistance"
      subtitle="A visual snapshot of key price levels for this stock"
      colors={colors}
    >
      {levels.map((lvl, idx) => {
        const lc = LADDER_COLORS[lvl.type];
        const isEntry = lvl.type === "entry";
        const isStop  = lvl.type === "stop";
        // Gap bar between levels
        const nextLvl = levels[idx + 1];
        const gapPct =
          nextLvl != null
            ? Math.max(2, ((lvl.price - nextLvl.price) / priceRange) * 100)
            : 0;

        return (
          <View key={`${lvl.type}-${lvl.price}`}>
            {/* Level row */}
            <View
              style={[
                styles.ladderRow,
                {
                  backgroundColor: lc.bg,
                  borderLeftColor: lc.border,
                  borderLeftWidth: isEntry ? 4 : isStop ? 3 : 2,
                  borderColor: isEntry ? lc.border : "transparent",
                  borderWidth: isEntry ? 1 : 0,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.ladderLabel, { color: lc.text }]}>
                  {LADDER_ICONS[lvl.type]}  {lvl.label}
                </Text>
                <Text style={[styles.ladderSub, { color: colors.textMuted }]}>
                  {lvl.sublabel}
                </Text>
              </View>
              <Text style={[styles.ladderPrice, { color: lc.text }]}>
                {lvl.price.toFixed(1)}
                {"\n"}
                <Text style={{ fontSize: 9, color: colors.textMuted }}>fils</Text>
              </Text>
            </View>

            {/* Gap spacer between levels */}
            {nextLvl != null && (
              <View
                style={{
                  height: Math.min(Math.max(gapPct * 0.5, 4), 24),
                  marginLeft: 14,
                  borderLeftWidth: 1,
                  borderLeftColor: colors.borderColor,
                  borderStyle: "dashed",
                }}
              />
            )}
          </View>
        );
      })}

      {/* Distance summary */}
      {entryMid != null && e.stop_loss_fils != null && e.tp1_fils != null && (
        <View style={[styles.ladderSummary, { borderTopColor: colors.borderColor }]}>
          <View style={styles.ladderSumItem}>
            <Text style={[styles.ladderSumNum, { color: "#ef4444" }]}>
              −{Math.abs(entryMid - e.stop_loss_fils).toFixed(1)}
            </Text>
            <Text style={[styles.ladderSumLabel, { color: colors.textMuted }]}>fils at risk</Text>
          </View>
          <FontAwesome name="arrow-right" size={10} color={colors.textMuted} />
          <View style={styles.ladderSumItem}>
            <Text style={[styles.ladderSumNum, { color: "#22c55e" }]}>
              +{Math.abs(entryMid - e.tp1_fils).toFixed(1)}
            </Text>
            <Text style={[styles.ladderSumLabel, { color: colors.textMuted }]}>fils to Target 1</Text>
          </View>
          {e.tp2_fils != null && (
            <>
              <FontAwesome name="arrow-right" size={10} color={colors.textMuted} />
              <View style={styles.ladderSumItem}>
                <Text style={[styles.ladderSumNum, { color: "#22c55e" }]}>
                  +{Math.abs(entryMid - e.tp2_fils).toFixed(1)}
                </Text>
                <Text style={[styles.ladderSumLabel, { color: colors.textMuted }]}>fils to Target 2</Text>
              </View>
            </>
          )}
        </View>
      )}
    </SectionCard>
  );
}

// ── Main component ────────────────────────────────────────────────────
export function TechnicalAnalysisPanel({ colors }: { colors: ThemePalette }) {
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const { data: signal, isLoading, isError, error } = useQuery<KuwaitSignal>({
    queryKey: ["kuwait-signal", ticker],
    queryFn: () =>
      getKuwaitSignal({ symbol: ticker!, exchange: "KSE", segment: "PREMIER" }),
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
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
          Signal Engine
        </Text>
        <Text style={[styles.searchSub, { color: colors.textMuted }]}>
          Enter a KSE Premier Market stock to see buy/sell guidance with clear price targets
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
            {(error as any)?.response?.data?.detail ?? "Failed to load signal. Please try again."}
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
            Pick a stock to get started
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            The engine analyses trend, momentum, buying pressure, key price levels, and risk — then gives you a clear BUY, SELL, or NO SIGNAL recommendation.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Full signal output ────────────────────────────────────────────────
export function SignalOutput({ signal, colors }: { signal: KuwaitSignal; colors: ThemePalette }) {
  const c = signal.confluence_details;
  const e = signal.execution;
  const r = signal.risk_metrics;
  const p = signal.probabilities;
  const raw = c.raw_sub_scores as KuwaitSignalSubScores;

  const entryMid =
    e.entry_zone_fils[0] != null && e.entry_zone_fils[1] != null
      ? (e.entry_zone_fils[0] + e.entry_zone_fils[1]) / 2
      : null;

  return (
    <>
      {/* ── Header card ─────────────────────────────────────── */}
      <View style={[styles.signalHeader, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.signalHeaderLeft}>
          <Text style={[styles.stockCode, { color: colors.textPrimary }]}>{signal.stock_code}</Text>
          <Text style={[styles.setupType, { color: colors.textMuted }]}>
            {humanSetup(signal.setup_type)}
          </Text>
          <Text style={[{ fontSize: 10, color: colors.textMuted, marginTop: 2 }]}>
            Data as of {signal.metadata.data_as_of}
          </Text>

          {/* ── Hurst exponent badge ───────────────────────── */}
          {c.hurst_filter && (
            <View style={[
              styles.metaBadge,
              { backgroundColor: c.hurst_filter.action === "proceed" ? "#22c55e18" : "#f59e0b18" },
            ]}>
              <Text style={[
                styles.metaBadgeText,
                { color: c.hurst_filter.action === "proceed" ? "#16a34a" : "#b45309" },
              ]}>
                H: {c.hurst_filter.h_value.toFixed(3)}
                {"  ·  "}
                {c.hurst_filter.action === "proceed" ? "Trending ✓" : "Choppy ⚠️"}
              </Text>
            </View>
          )}

          {/* ── Banking Lead-Lag badge ─────────────────────── */}
          {c.banking_lead_lag?.active && (
            <View style={[styles.metaBadge, { backgroundColor: "#3b82f618" }]}>
              <Text style={[styles.metaBadgeText, { color: "#1d4ed8" }]}>
                🏦 Banking Lead  ×{c.banking_lead_lag.multiplier.toFixed(1)}
                {"  ·  "}trend {c.banking_lead_lag.banking_trend_raw.toFixed(0)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.signalHeaderRight}>
          <SignalBadge signal={signal.signal} />
          <View style={{ alignItems: "flex-end", marginTop: 6 }}>
            <Text style={[{ fontSize: 11, color: colors.textMuted }]}>Raw Technical</Text>
            <Text style={[styles.scoreCircleText, {
              color: (signal.raw_technical_score ?? c.total_score) >= 75 ? "#22c55e"
                : (signal.raw_technical_score ?? c.total_score) >= 50 ? "#f59e0b"
                : "#ef4444",
            }]}>
              {signal.raw_technical_score ?? c.total_score}
              <Text style={{ fontSize: 12, color: colors.textMuted }}>/100</Text>
            </Text>
            {signal.risk_adjusted_score != null
              && signal.risk_adjusted_score !== signal.raw_technical_score && (
              <Text style={[{ fontSize: 11, color: colors.textMuted, marginTop: 2 }]}>
                Adj: <Text style={{ color: "#f59e0b" }}>{signal.risk_adjusted_score}</Text>
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* ── NEUTRAL reason banner ────────────────────────────── */}
      {signal.signal === "NEUTRAL" && signal.reason && (
        <View style={[styles.card, {
          backgroundColor: "#fef3c7",
          borderColor: "#f59e0b",
          borderWidth: 1,
        }]}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400e", marginBottom: 4 }}>
            🚧 Signal Blocked: {signal.reason_description ?? signal.reason}
          </Text>
          {signal.failed_gates.length > 0 && (
            <Text style={{ fontSize: 12, color: "#b45309", marginBottom: 4 }}>
              Failed gates: {signal.failed_gates.join(" · ")}
            </Text>
          )}
          {signal.technical_scores_debug && (
            <Text style={{ fontSize: 11, color: "#92400e" }}>
              Debug — Trend: {signal.technical_scores_debug.trend_raw ?? "—"}  Mom: {signal.technical_scores_debug.momentum_raw ?? "—"}  Vol: {signal.technical_scores_debug.volume_raw ?? "—"}  SR: {signal.technical_scores_debug.sr_raw ?? "—"}
            </Text>
          )}
        </View>
      )}

      {/* ── PRICE MAP (S/R ladder) ───────────────────────────── */}
      {(signal.signal === "BUY" || signal.signal === "STRONG_BUY" || signal.signal === "SELL") && <PriceLadder signal={signal} colors={colors} />}

      {/* ── Execution levels ─────────────────────────────────── */}
      {(signal.signal === "BUY" || signal.signal === "STRONG_BUY" || signal.signal === "SELL") && (
        <SectionCard
          title="📋 Your Trade Plan"
          subtitle="Exactly where to buy, where to exit if wrong, and where to take profits"
          colors={colors}
        >
          <Row
            label="Buy Between"
            hint="Place a limit order in this price range"
            value={
              e.entry_zone_fils[0] != null
                ? `${e.entry_zone_fils[0]?.toFixed(1)} – ${e.entry_zone_fils[1]?.toFixed(1)} fils`
                : "—"
            }
            valueColor="#3b82f6"
            colors={colors}
          />
          <Row
            label="🛑 Stop Loss — Exit If Falls Below"
            hint="Set this as a sell order immediately after buying. Limits your loss."
            value={fmtFils(e.stop_loss_fils)}
            valueColor="#ef4444"
            colors={colors}
          />
          <TPTargetCard
            icon="✅"
            label="First Target (TP1)"
            hint="Sell HALF your shares here — lock in profits early"
            description="Based on 1.5× your risk. Statistically, this target is hit more often than TP2."
            price={e.tp1_fils}
            probability={p.p_tp1_before_sl}
            gainFils={entryMid != null && e.tp1_fils != null ? Math.abs(e.tp1_fils - entryMid) : null}
            rMultiple={1.5}
            signalDir={(signal.signal === "STRONG_BUY" ? "BUY" : signal.signal) as "BUY" | "SELL"}
            colors={colors}
          />
          <TPTargetCard
            icon="🎯"
            label="Full Target (TP2)"
            hint="Sell REMAINING shares here — your maximum profit"
            description="Based on 3.0× your risk. Lower chance but bigger reward if reached."
            price={e.tp2_fils}
            probability={p.p_tp2_before_sl}
            gainFils={entryMid != null && e.tp2_fils != null ? Math.abs(e.tp2_fils - entryMid) : null}
            rMultiple={3.0}
            signalDir={(signal.signal === "STRONG_BUY" ? "BUY" : signal.signal) as "BUY" | "SELL"}
            colors={colors}
          />
          {e.tp3_fils != null && (
            <TPTargetCard
              icon="🚀"
              label="Aggressive Target (TP3)"
              hint="Bonus target — only pursue if momentum is very strong"
              description="Based on 4.0× your risk using Fibonacci extensions and 52-week extremes."
              price={e.tp3_fils}
              probability={null}
              gainFils={entryMid != null ? Math.abs(e.tp3_fils - entryMid) : null}
              rMultiple={4.0}
              signalDir={(signal.signal === "STRONG_BUY" ? "BUY" : signal.signal) as "BUY" | "SELL"}
              colors={colors}
            />
          )}
          <View style={[styles.divider, { borderTopColor: colors.borderColor }]} />
          <Row
            label="Max Loss per Share"
            hint="If stop loss is hit, this is how many fils you lose per share"
            value={fmtFils(r.risk_per_share_fils)}
            valueColor="#ef444499"
            colors={colors}
          />
          <Row
            label="Profit vs Risk Ratio"
            hint="For every 1 fil you risk, you could potentially make this much"
            value={
              r.risk_reward_ratio != null
                ? `1 : ${r.risk_reward_ratio.toFixed(2)}  ${r.risk_reward_ratio >= 2 ? "✓ Good" : r.risk_reward_ratio >= 1.5 ? "Acceptable" : "Low"}`
                : "—"
            }
            valueColor={
              (r.risk_reward_ratio ?? 0) >= 2 ? "#22c55e"
                : (r.risk_reward_ratio ?? 0) >= 1.5 ? "#f59e0b"
                : "#ef4444"
            }
            colors={colors}
          />
          <Row
            label="Order Type"
            hint="Use a limit order so you get the exact price you want"
            value={e.preferred_order_type === "LIMIT" ? "Limit Order (Recommended)" : e.preferred_order_type}
            colors={colors}
          />
        </SectionCard>
      )}

      {/* ── Win chances ──────────────────────────────────────── */}
      {(signal.signal === "BUY" || signal.signal === "STRONG_BUY" || signal.signal === "SELL") && (
        <SectionCard
          title="🎲 Probability — What Are the Chances?"
          subtitle="How likely is this trade to work? Estimated from thousands of simulated outcomes."
          colors={colors}
        >
          <WinChancesBlock p={p} riskPerShare={r.risk_per_share_fils} entryMid={entryMid} colors={colors} />
        </SectionCard>
      )}

      {/* ── Rich S/R Map ─────────────────────────────────────── */}
      {(signal.signal === "BUY" || signal.signal === "STRONG_BUY" || signal.signal === "SELL") && signal.confluence_details.rich_sr && (
        (() => {
          const richSR = signal.confluence_details.rich_sr!;
          const allLevels = [
            ...richSR.resistance.map(lv => ({ ...lv, side: "resistance" as const })),
            ...richSR.support.map(lv => ({ ...lv, side: "support" as const })),
          ].sort((a, b) => b.price - a.price);
          if (allLevels.length === 0) return null;
          return (
            <SectionCard
              title="📍 Support & Resistance Map"
              subtitle="Key levels identified from swing pivots, Fibonacci, pivots, volume clusters, and round numbers"
              colors={colors}
            >
              {allLevels.map((lv, idx) => {
                const isSup = lv.side === "support";
                const borderColor = isSup ? "#f59e0b" : "#ef4444";
                const textColor = isSup ? "#d97706" : "#ef4444";
                const bgColor = isSup ? "#f59e0b12" : "#ef444412";
                const strengthDots = lv.strength_score >= 80 ? "●●●" : lv.strength_score >= 60 ? "●●○" : "●○○";
                return (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      marginBottom: 4,
                      borderRadius: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: borderColor,
                      backgroundColor: bgColor,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: textColor, fontWeight: "600" }}>
                        {isSup ? "▲ Support" : "▼ Resistance"}{lv.volume_cluster ? "  📦" : ""}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                        {lv.type}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 13, color: textColor, fontWeight: "700" }}>
                        {lv.price.toFixed(1)}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>
                        {strengthDots}  {lv.strength}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </SectionCard>
          );
        })()
      )}

      {/* ── Signal strength breakdown ─────────────────────────── */}
      <SectionCard
        title="📈 Signal Strength Breakdown"
        subtitle="Five factors are scored. All must align for a strong signal."
        colors={colors}
      >
        <ScoreBar
          icon="📈"
          label="Trend Direction"
          hint="Is the stock consistently moving in the right direction?"
          value={raw.trend}
          colors={colors}
        />
        <ScoreBar
          icon="⚡"
          label="Speed & Momentum"
          hint="How fast and strong is the current price move?"
          value={raw.momentum}
          colors={colors}
        />
        <ScoreBar
          icon="💧"
          label="Buying Pressure"
          hint="Are large investors actively accumulating this stock?"
          value={raw.volume_flow}
          colors={colors}
        />
        <ScoreBar
          icon="🏦"
          label="Key Price Levels"
          hint="Is the price near a strong support level with room to run?"
          value={raw.support_resistance}
          colors={colors}
        />
        <ScoreBar
          icon="⚖️"
          label="Risk vs Reward"
          hint="Is the potential gain worth the risk being taken?"
          value={raw.risk_reward}
          colors={colors}
        />
        <View style={[styles.totalRow, { borderTopColor: colors.borderColor }]}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Combined Score</Text>
            <Text style={[styles.totalHint, { color: colors.textMuted }]}>Need ≥ 75 for a BUY signal</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.totalValue, {
              color: c.total_score >= 75 ? "#22c55e" : c.total_score >= 50 ? "#f59e0b" : "#ef4444",
            }]}>
              {signal.raw_technical_score ?? c.total_score} / 100
            </Text>
            {signal.score_breakdown && signal.score_breakdown.circuit_penalty_pct > 0 && (
              <Text style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>
                Circuit penalty: −{signal.score_breakdown.circuit_penalty_pct}%  →  Adj: {signal.risk_adjusted_score}
              </Text>
            )}
          </View>
        </View>
      </SectionCard>

      {/* ── Four-score decision matrix ────────────────────────── */}
      {c.four_scores && (
        <FourScoreCards fourScores={c.four_scores} colors={colors} />
      )}

      {/* ── Market conditions ────────────────────────────────── */}
      <SectionCard
        title="🌍 Current Market Conditions"
        subtitle="The engine adjusts its scoring based on the overall market mood"
        colors={colors}
      >
        <View style={styles.regimeRow}>
          <RegimeBadge regime={c.regime ?? "Neutral_Chop"} />
          <Text style={[styles.regimeConf, { color: colors.textMuted }]}>
            {fmtPct(c.regime_confidence)} sure
          </Text>
        </View>
        <Row
          label="End-of-Day Buying Activity"
          hint="High values (>1.8) suggest large investors are active — a positive sign"
          value={
            c.auction_intensity != null
              ? `${c.auction_intensity.toFixed(2)}  ${c.auction_intensity > 1.8 ? "🔥 High" : c.auction_intensity < 1.0 ? "😴 Low" : "Normal"}`
              : "—"
          }
          colors={colors}
        />
        <View style={styles.liqRow}>
          <LiqChip
            label="Daily Volume"
            desc="≥ KD 100K"
            pass={c.liquidity_details?.pass_adtv ?? false}
            value={
              c.liquidity_details?.adtv_20d_kd != null
                ? `KD ${(c.liquidity_details.adtv_20d_kd / 1000).toFixed(0)}K`
                : "—"
            }
            colors={colors}
          />
          <LiqChip
            label="Buy/Sell Gap"
            desc="≤ 1.5%"
            pass={c.liquidity_details?.pass_spread ?? false}
            value={
              c.liquidity_details?.spread_proxy_pct != null
                ? `${c.liquidity_details.spread_proxy_pct.toFixed(2)}%`
                : "—"
            }
            colors={colors}
          />
          <LiqChip
            label="Active Days"
            desc="≥ 80%"
            pass={c.liquidity_details?.pass_active_days ?? false}
            value={
              c.liquidity_details?.active_days_30d_pct != null
                ? `${c.liquidity_details.active_days_30d_pct.toFixed(0)}%`
                : "—"
            }
            colors={colors}
          />
          <LiqChip
            label="Volume Check"
            desc="No single spike"
            pass={c.liquidity_details?.pass_concentration ?? false}
            value={
              c.liquidity_details?.volume_concentration != null
                ? `${c.liquidity_details.volume_concentration.toFixed(0)}%`
                : "—"
            }
            colors={colors}
          />
        </View>
      </SectionCard>

      {/* ── Position sizing ───────────────────────────────────── */}
      {(signal.signal === "BUY" || signal.signal === "STRONG_BUY" || signal.signal === "SELL") && (
        <SectionCard
          title="💰 How Much to Invest"
          subtitle="Based on a 2% account risk rule — never risk more than you can afford to lose"
          colors={colors}
        >
          <Row
            label="Suggested Position Size"
            hint="Percentage of your total account to allocate to this trade"
            value={r.position_size_percent != null ? `${r.position_size_percent.toFixed(2)}% of your account` : "—"}
            colors={colors}
          />
          <Row
            label="Worst-Case Daily Loss"
            hint="Statistical worst single day loss — happens in about 5% of cases"
            value={fmtFils(r.cvar_95_fils)}
            valueColor="#ef444499"
            colors={colors}
          />
          <Row
            label="Ease of Trading (Liquidity)"
            hint="1.0 = fully liquid. Lower means harder to buy/sell quickly."
            value={
              r.liquidity_adjustment_factor != null
                ? `${(r.liquidity_adjustment_factor * 100).toFixed(0)}%  ${r.liquidity_adjustment_factor >= 0.95 ? "✓ Easy to trade" : r.liquidity_adjustment_factor >= 0.7 ? "Manageable" : "⚠️ Low liquidity"}`
                : "—"
            }
            valueColor={
              (r.liquidity_adjustment_factor ?? 0) >= 0.95 ? "#22c55e"
                : (r.liquidity_adjustment_factor ?? 0) >= 0.7 ? "#f59e0b"
                : "#ef4444"
            }
            colors={colors}
          />
        </SectionCard>
      )}

      {/* ── Order book imbalance quick row ─────────────────── */}
      {c.orderbook_metrics?.available && c.orderbook_metrics.imbalance_ratio != null && (
        <SectionCard
          title="📖 Order Book Snapshot"
          subtitle="Real-time bid vs ask pressure at point of signal generation"
          colors={colors}
        >
          <Row
            label="Bid/Ask Imbalance"
            hint="Positive = more buying pressure, negative = more selling pressure"
            value={
              c.orderbook_metrics.imbalance_ratio > 0
                ? `▶ Bid +${(c.orderbook_metrics.imbalance_ratio * 100).toFixed(0)}%`
                : `◀ Ask ${(c.orderbook_metrics.imbalance_ratio * 100).toFixed(0)}%`
            }
            valueColor={c.orderbook_metrics.imbalance_ratio > 0.1 ? "#22c55e" : c.orderbook_metrics.imbalance_ratio < -0.1 ? "#ef4444" : colors.textPrimary}
            colors={colors}
          />
          {c.orderbook_metrics.liquidity_wall && (
            <View style={[styles.alertRow, { backgroundColor: "#fef3c720", borderRadius: 6, padding: 8, marginTop: 4 }]}>
              <Text style={{ fontSize: 13, marginRight: 6 }}>🧱</Text>
              <Text style={[styles.alertText, { color: "#92400e" }]}>
                {c.orderbook_metrics.liquidity_wall.strength.toUpperCase()}{" "}
                {c.orderbook_metrics.liquidity_wall.side.toUpperCase()} wall @{" "}
                {c.orderbook_metrics.liquidity_wall.price.toFixed(1)} fils
                {" — "}vol {c.orderbook_metrics.liquidity_wall.volume.toLocaleString()}
              </Text>
            </View>
          )}
        </SectionCard>
      )}

      {/* ── Alerts ───────────────────────────────────────────── */}
      {signal.alerts.length > 0 && (
        <SectionCard
          title="⚠️ Important Notices"
          subtitle="Read these carefully before placing a trade"
          colors={colors}
        >
          {signal.alerts.map((a) => (
            <View key={a} style={styles.alertRow}>
              <FontAwesome
                name={
                  a.startsWith("WARNING") || a.startsWith("LIQUIDITY")
                    ? "exclamation-triangle"
                    : "info-circle"
                }
                size={13}
                color={
                  a.startsWith("WARNING") || a.startsWith("LIQUIDITY")
                    ? "#f59e0b"
                    : colors.accentPrimary
                }
                style={{ marginTop: 1, marginRight: 8, flexShrink: 0 }}
              />
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>
                {humaniseAlert(a)}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <View style={[styles.meta, { borderTopColor: colors.borderColor }]}>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          Model v{signal.metadata.model_version}  ·  Data as of {signal.metadata.data_as_of}
        </Text>
        <Text style={[styles.metaText, { color: colors.textMuted, marginTop: 3 }]}>
          ⚠️ This is for educational purposes only — not financial advice.
        </Text>
      </View>
    </>
  );
}

// ── TP Target Card — price + probability combined ────────────────────
function TPTargetCard({
  icon,
  label,
  hint,
  description,
  price,
  probability,
  gainFils,
  rMultiple,
  signalDir,
  colors,
}: {
  icon: string;
  label: string;
  hint: string;
  description: string;
  price: number | null;
  probability: number | null;
  gainFils: number | null;
  rMultiple: number;
  signalDir: "BUY" | "SELL";
  colors: ThemePalette;
}) {
  const tpColor = signalDir === "BUY" ? "#22c55e" : "#f97316";
  const pct = probability != null ? Math.round(probability * 100) : null;
  const pctColor =
    pct == null ? colors.textMuted
      : pct >= 68 ? "#22c55e"
      : pct >= 55 ? "#f59e0b"
      : "#ef4444";
  const confidence =
    pct == null ? "" : pct >= 68 ? "High" : pct >= 55 ? "Moderate" : "Low";

  return (
    <View style={[styles.tpCard, { borderColor: tpColor + "30", backgroundColor: tpColor + "0a" }]}>
      {/* Header */}
      <View style={styles.tpCardHeader}>
        <Text style={[styles.tpCardLabel, { color: tpColor }]}>
          {icon}  {label}
        </Text>
        <Text style={[styles.tpCardHint, { color: colors.textMuted }]}>{hint}</Text>
      </View>

      {/* Three stats in a row */}
      <View style={styles.tpCardStats}>
        {/* Stat 1: Target Price */}
        <View style={styles.tpStatCol}>
          <Text style={[styles.tpStatNum, { color: tpColor }]}>
            {price != null ? price.toFixed(1) : "—"}
          </Text>
          <Text style={[styles.tpStatLabel, { color: colors.textMuted }]}>Target Price{"\n"}(fils)</Text>
        </View>

        <View style={[styles.tpDividerV, { backgroundColor: colors.borderColor }]} />

        {/* Stat 2: Hit probability (circle) */}
        <View style={styles.tpStatCol}>
          <View style={[styles.tpProbCircle, { borderColor: pctColor }]}>
            <Text style={[styles.tpProbNum, { color: pctColor }]}>
              {pct != null ? `${pct}%` : "—"}
            </Text>
          </View>
          <Text style={[styles.tpStatLabel, { color: colors.textMuted, marginTop: 4 }]}>
            Hit Chance
          </Text>
          {confidence !== "" && (
            <Text style={{ fontSize: 9, color: pctColor, fontWeight: "700", marginTop: 1 }}>
              {confidence}
            </Text>
          )}
        </View>

        <View style={[styles.tpDividerV, { backgroundColor: colors.borderColor }]} />

        {/* Stat 3: Gain in fils */}
        <View style={styles.tpStatCol}>
          <Text style={[styles.tpStatNum, { color: tpColor }]}>
            {gainFils != null ? `+${gainFils.toFixed(1)}` : "—"}
          </Text>
          <Text style={[styles.tpStatLabel, { color: colors.textMuted }]}>
            Gain per{"\n"}Share (fils)
          </Text>
          <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 1 }}>
            ({rMultiple}× risk)
          </Text>
        </View>
      </View>

      <Text style={[styles.tpCardDesc, { color: colors.textMuted }]}>{description}</Text>
    </View>
  );
}

// ── Win-chances block (CI + expected return) ──────────────────────────
function WinChancesBlock({
  p,
  riskPerShare,
  entryMid,
  colors,
}: {
  p: KuwaitSignal["probabilities"];
  riskPerShare: number | null;
  entryMid: number | null;
  colors: ThemePalette;
}) {
  const ci = p.confidence_interval_95;

  // Convert R-multiple to actual fils and % of entry price
  // expected_r = p_tp1 * 1.5R - (1 - p_tp1) * 1R  →  multiply by risk to get fils
  const expectedFils =
    p.expected_return_r_multiple != null && riskPerShare != null
      ? p.expected_return_r_multiple * riskPerShare
      : null;
  const expectedPct =
    expectedFils != null && entryMid != null && entryMid > 0
      ? (expectedFils / entryMid) * 100
      : null;
  const isPos = (expectedFils ?? 0) >= 0;
  const retColor = expectedFils == null ? colors.textMuted : isPos ? "#22c55e" : "#ef4444";

  return (
    <View style={styles.winChancesRow}>
      <View style={styles.winChancesCol}>
        <Text style={[styles.winChancesNum, { color: colors.textPrimary }]}>
          {ci ? `${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%` : "—"}
        </Text>
        <Text style={[styles.winChancesLabel, { color: colors.textMuted }]}>
          Likely Win Rate Range
        </Text>
        <Text style={[styles.winChancesHint, { color: colors.textMuted }]}>
          The engine ran 10,000 simulations. In most cases, the actual chance of hitting Target 1 falls somewhere in this range.
        </Text>
      </View>
      <View style={[styles.tpDividerV, { backgroundColor: colors.borderColor, height: 60 }]} />
      <View style={styles.winChancesCol}>
        {/* Primary: expected fils per share */}
        <Text style={[styles.winChancesNum, { color: retColor }]}>
          {expectedFils != null
            ? `${isPos ? "+" : ""}${expectedFils.toFixed(1)} fils`
            : "—"}
        </Text>
        {/* Secondary: as % of buy price */}
        {expectedPct != null && (
          <Text style={[{ fontSize: 11, fontWeight: "700", color: retColor, marginTop: 1 }]}>
            ({isPos ? "+" : ""}{expectedPct.toFixed(2)}% of buy price)
          </Text>
        )}
        <Text style={[styles.winChancesLabel, { color: colors.textMuted, marginTop: 4 }]}>
          Avg Expected Gain per Share
        </Text>
        <Text style={[styles.winChancesHint, { color: colors.textMuted }]}>
          On average, across all simulated outcomes, this is how much you gain or lose per share you buy.
        </Text>
      </View>
    </View>
  );
}

// ── Liquidity chip ────────────────────────────────────────────────────
function LiqChip({
  label,
  desc,
  pass,
  value,
  colors,
}: {
  label: string;
  desc: string;
  pass: boolean;
  value: string;
  colors: ThemePalette;
}) {
  return (
    <View
      style={[
        styles.liqChip,
        {
          backgroundColor: pass ? "#22c55e12" : "#ef444412",
          borderColor: pass ? "#22c55e40" : "#ef444440",
        },
      ]}
    >
      <FontAwesome name={pass ? "check" : "times"} size={9} color={pass ? "#22c55e" : "#ef4444"} />
      <View style={{ marginLeft: 4 }}>
        <Text style={{ color: pass ? "#22c55e" : "#ef4444", fontSize: 10, fontWeight: "700" }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 9 }}>
          {desc}  {value}
        </Text>
      </View>
    </View>
  );
}

// ── Alert humaniser ───────────────────────────────────────────────────
function humaniseAlert(raw: string): string {
  if (raw.startsWith("LIQUIDITY FAIL"))
    return "This stock does not meet the minimum liquidity requirements. Trading it may be difficult or costly.";
  if (raw.includes("circuit-breaker"))
    return raw.replace("WARNING: Price within", "⚠️ Warning: Price is only")
              .replace("of upper circuit-breaker limit (+10%)", "away from the daily upper price limit — be cautious about buying near the ceiling.")
              .replace("of lower circuit-breaker limit (-5%)", "away from the daily lower price limit — selling pressure may accelerate.");
  if (raw.includes("72 hours"))
    return "⏰ This signal is too old (over 72 hours). Wait for a fresh signal before trading.";
  if (raw.includes("Major resistance"))
    return "⛔ A strong resistance level is very close above the entry — not enough room for profit. Signal blocked.";
  if (raw.includes("Extended neutral"))
    return "📉 The market has been moving sideways for a long time. Momentum signals may give false readings.";
  if (raw.includes("Bear-regime"))
    return "🐻 The market is currently in a downtrend. Only consider selling opportunities or stay in cash.";
  if (raw.includes("Bull-regime confirmed"))
    return "🐂 The market is in a confirmed uptrend — trend-following strategies are working well.";
  if (raw.includes("Regime shift"))
    return `🔄 ${raw.replace("Regime shift detected: ", "Market mood just changed: ").replace(/_/g, " ")}`;
  if (raw.includes("Regime confidence low"))
    return "🤔 The market direction is unclear right now — signals are less reliable.";
  if (raw.includes("Key support at"))
    return raw.replace("Key support at", "✅ There is a solid price floor at").replace("confirms entry zone", "which supports the entry zone.");
  if (raw.includes("Psychological resistance near TP2"))
    return raw.replace("Psychological resistance near TP2", "⚠️ A key resistance level sits near Target 2").replace("— monitor TP2 execution", "— consider taking profits slightly before Target 2.");
  return raw;
}

// ── ★ FOUR SCORE CARDS ────────────────────────────────────────────────

const TIER_CONFIG: Record<FourScoreTier, { bg: string; border: string; text: string; label: string }> = {
  "Strong Buy":  { bg: "#16a34a20", border: "#16a34a", text: "#16a34a", label: "Strong Buy" },
  "Buy":         { bg: "#22c55e14", border: "#22c55e", text: "#22c55e", label: "Buy" },
  "Hold":        { bg: "#f59e0b14", border: "#f59e0b", text: "#b45309", label: "Hold" },
  "Sell":        { bg: "#f9731614", border: "#f97316", text: "#c2410c", label: "Sell" },
  "Strong Sell": { bg: "#ef444414", border: "#ef4444", text: "#ef4444", label: "Strong Sell" },
};

const _DESC_LABELS: Record<string, string> = {
  maximum_conviction_aligned: "All factors aligned",
  good_setup_acceptable_edge: "Good setup, solid edge",
  neutral_mixed_signals_wait: "Mixed signals — wait",
  weak_setup_avoid_or_reduce: "Weak setup — reduce",
  dangerous_no_edge_block:    "Dangerous — no edge",
  blocked_by_risk_gate:       "Blocked by risk gate",
};
function humanizeDesc(d: string): string {
  return _DESC_LABELS[d] ?? d.replace(/_/g, " ");
}

function ScoreCard({
  icon,
  title,
  hint,
  score,
  tier,
  description,
  isBlocked,
  isGated,
  colors,
}: {
  icon: string;
  title: string;
  hint: string;
  score: number;
  tier: FourScoreTier;
  description: string;
  isBlocked?: boolean;
  isGated?: boolean;
  colors: ThemePalette;
}) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG["Hold"];
  return (
    <View
      style={{
        width: "48%",
        margin: "1%",
        borderRadius: 10,
        borderWidth: isBlocked || isGated ? 2 : 1,
        borderColor: isBlocked || isGated ? "#ef4444" : cfg.border + "60",
        backgroundColor: isBlocked || isGated ? "#ef444410" : cfg.bg,
        padding: 10,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 18, marginBottom: 2 }}>{icon}</Text>
      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textPrimary, textAlign: "center" }}>
        {title}
      </Text>
      <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: "center", marginBottom: 6 }}>
        {hint}
      </Text>

      {/* Score ring */}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 4,
          borderColor: isBlocked || isGated ? "#ef4444" : cfg.border,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 6,
          backgroundColor: colors.bgCard,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800", color: isBlocked || isGated ? "#ef4444" : cfg.text }}>
          {score}
        </Text>
      </View>

      {/* Tier badge */}
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: (isBlocked || isGated ? "#ef4444" : cfg.border) + "20" }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: isBlocked || isGated ? "#ef4444" : cfg.text }}>
          {isBlocked ? "⛔ BLOCKING" : isGated ? "⛔ GATED" : cfg.label}
        </Text>
      </View>

      {/* Human-readable description */}
      <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: "center", marginTop: 4 }}>
        {humanizeDesc(description)}
      </Text>

      {/* Mini score bar */}
      <View
        style={{
          marginTop: 6,
          width: "100%",
          height: 4,
          backgroundColor: colors.borderColor,
          borderRadius: 2,
        }}
      >
        <View
          style={{
            height: 4,
            width: `${score}%`,
            backgroundColor: isBlocked || isGated ? "#ef4444" : cfg.border,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

function FourScoreCards({ fourScores, colors }: { fourScores: FourScores; colors: ThemePalette }) {
  const action = fourScores.position_action;
  const actionColor =
    action.max_position_pct >= 2.0 ? "#16a34a"
      : action.max_position_pct >= 1.0 ? "#22c55e"
      : action.max_position_pct > 0   ? "#f59e0b"
      : "#ef4444";

  return (
    <SectionCard
      title="🎯 Four-Score Decision Matrix"
      subtitle="Four independent lenses — all must align for a high-conviction trade"
      colors={colors}
    >
      {/* 2×2 grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        <ScoreCard
          icon="🚀"
          title="Potential"
          hint="Trend 40% · Momentum 25% · Volume 35%"
          score={fourScores.potential.score}
          tier={fourScores.potential.tier as FourScoreTier}
          description={fourScores.potential.description}
          colors={colors}
        />
        <ScoreCard
          icon="⏱️"
          title="Timing"
          hint="S/R 35% · POC 30% · Auction 15% · Resist 20%"
          score={fourScores.timing.score}
          tier={fourScores.timing.tier as FourScoreTier}
          description={fourScores.timing.description}
          colors={colors}
        />
        <ScoreCard
          icon="🛡️"
          title="Risk"
          hint="RR 40% · Volatility 25% · Liquidity 20% · Circuit 15%"
          score={fourScores.risk.score}
          tier={fourScores.risk.tier as FourScoreTier}
          description={fourScores.risk.description}
          isBlocked={fourScores.risk.is_blocked}
          colors={colors}
        />
        <ScoreCard
          icon="⭐"
          title="Overall"
          hint="Risk-gated composite (Potential 50% · Timing 50%)"
          score={fourScores.overall.score}
          tier={fourScores.overall.tier as FourScoreTier}
          description={fourScores.overall.description}
          isGated={fourScores.overall.description === "blocked_by_risk_gate"}
          colors={colors}
        />
      </View>

      {/* Position action banner */}
      <View
        style={{
          backgroundColor: actionColor + "15",
          borderWidth: 1,
          borderColor: actionColor + "50",
          borderRadius: 8,
          padding: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 18 }}>
          {action.max_position_pct >= 2.0 ? "💪"
            : action.max_position_pct >= 1.0 ? "✅"
            : action.max_position_pct > 0   ? "⚠️"
            : "🚫"}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: actionColor }}>
            {action.label}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            {action.max_position_pct > 0
              ? `Max position size: ${action.max_position_pct}% of account equity`
              : "Do not enter this trade"}
          </Text>
        </View>
      </View>

      {/* Tier legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 4 }}>
        {(Object.entries(TIER_CONFIG) as [FourScoreTier, typeof TIER_CONFIG[FourScoreTier]][]).map(
          ([t, cfg]) => (
            <View
              key={t}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: cfg.bg,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: cfg.border,
                  marginRight: 4,
                }}
              />
              <Text style={{ fontSize: 9, color: cfg.text }}>{cfg.label}</Text>
            </View>
          )
        )}
        <Text style={{ fontSize: 9, color: colors.textMuted, alignSelf: "center", marginLeft: 4 }}>
          ≥85 / ≥70 / ≥40 / ≥15 / &lt;15
        </Text>
      </View>
    </SectionCard>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 14 },

  searchCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14,
  },
  searchTitle: { fontSize: 17, fontWeight: "800", marginBottom: 2 },
  searchSub: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
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
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10,
  },
  signalHeaderLeft: { gap: 4, flex: 1 },
  signalHeaderRight: { alignItems: "flex-end", gap: 4 },
  stockCode: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  setupType: { fontSize: 12 },
  scoreCircleText: { fontSize: 22, fontWeight: "800" },

  metaBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
  },
  metaBadgeText: { fontSize: 11, fontWeight: "600" },

  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  // Card
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "800", marginBottom: 3, letterSpacing: 0.1 },
  cardSubtitle: { fontSize: 11, marginBottom: 12, lineHeight: 15 },

  // Row
  rowWrap: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, alignItems: "flex-start" },
  rowLabel: { fontSize: 12, fontWeight: "600", flex: 1 },
  rowHint: { fontSize: 10, marginTop: 1, lineHeight: 13 },
  rowValue: { fontSize: 12, fontWeight: "700", textAlign: "right", flexShrink: 0, marginLeft: 8 },

  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 6 },

  // Score bar
  scoreBarRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, alignItems: "flex-start" },
  scoreBarLabel: { fontSize: 12, fontWeight: "700" },
  scoreBarHint: { fontSize: 10, marginTop: 1, lineHeight: 13 },
  scoreBarVal: { fontSize: 14, fontWeight: "800" },
  scoreBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  scoreBarFill: { height: 6, borderRadius: 3 },

  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, marginTop: 8, borderTopWidth: 1, alignItems: "center" },
  totalLabel: { fontSize: 13, fontWeight: "700" },
  totalHint: { fontSize: 10 },
  totalValue: { fontSize: 20, fontWeight: "800" },

  // Price Ladder
  ladderRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderLeftWidth: 3,
  },
  ladderLabel: { fontSize: 12, fontWeight: "700" },
  ladderSub: { fontSize: 10, marginTop: 2, lineHeight: 13 },
  ladderPrice: { fontSize: 16, fontWeight: "800", textAlign: "right" },
  ladderSummary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderTopWidth: 1, marginTop: 10, paddingTop: 10,
  },
  ladderSumItem: { alignItems: "center" },
  ladderSumNum: { fontSize: 15, fontWeight: "800" },
  ladderSumLabel: { fontSize: 9, marginTop: 1 },

  // Regime
  regimeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  regimeConf: { fontSize: 12 },

  // Liquidity chips
  liqRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  liqChip: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5,
  },

  // Alerts
  alertRow: { flexDirection: "row", paddingVertical: 5 },
  alertText: { fontSize: 12, flex: 1, lineHeight: 18 },

  // Metadata
  meta: { borderTopWidth: 1, paddingTop: 12, marginTop: 6, alignItems: "center" },
  metaText: { fontSize: 10, textAlign: "center" },

  // TP Target Card
  tpCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  tpCardHeader: { marginBottom: 12 },
  tpCardLabel: { fontSize: 13, fontWeight: "800" },
  tpCardHint: { fontSize: 10, marginTop: 2, lineHeight: 14 },
  tpCardStats: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-around", marginBottom: 10,
  },
  tpStatCol: { alignItems: "center", flex: 1 },
  tpStatNum: { fontSize: 22, fontWeight: "800" },
  tpStatLabel: { fontSize: 9, textAlign: "center", marginTop: 2, lineHeight: 12 },
  tpDividerV: { width: 1, height: 56, opacity: 0.4 },
  tpProbCircle: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 3,
    alignItems: "center", justifyContent: "center",
  },
  tpProbNum: { fontSize: 15, fontWeight: "800" },
  tpCardDesc: { fontSize: 10, lineHeight: 14 },

  // Win chances (CI + expected return row)
  winChancesRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-around", paddingVertical: 4,
  },
  winChancesCol: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  winChancesNum: { fontSize: 22, fontWeight: "800", marginBottom: 2 },
  winChancesLabel: { fontSize: 10, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  winChancesHint: { fontSize: 9, textAlign: "center", lineHeight: 12 },
});
