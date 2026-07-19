/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye Simulator — Strategy Detail Page
 *
 * Shows equity curve, open positions, closed trades, and performance breakdowns
 * for one of the two simulator paper cards.
 *
 * Route: /eagle-eye/simulator/[strategy]
 */

import { useThemeStore } from "@/services/themeStore";
import {
  useSimulatorPerformance,
  useSimulatorPortfolioDetail,
  type SimPosition,
  type StrategyName,
} from "@/hooks/useSimulator";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Polyline,
  Stop,
} from "react-native-svg";

// ── Constants ────────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  buy: "#16a34a",
  watchlist: "#0ea5e9",
};

const STRATEGY_LABELS: Record<string, string> = {
  buy: "BUY",
  watchlist: "WATCHLIST",
};

function formatList(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "none";
  if (typeof value === "string") return value || "none";
  return "none";
}

function formatRecord(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "none";
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item != null);
  return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(", ") : "none";
}

// ── Equity curve chart ───────────────────────────────────────────────────────

function EquityChart({
  data,
  color,
}: {
  data: Array<{ total_value_kwd: number | null }>;
  color: string;
}) {
  const prices = data.map((d) => d.total_value_kwd ?? 10000);
  if (prices.length < 2) return null;

  const W = 340;
  const H = 120;
  const pad = 8;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices
    .map((v, i) => {
      const x = (i / (prices.length - 1)) * (W - 2 * pad) + pad;
      const y = pad + ((max - v) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Filled area path
  const coords = prices.map((v, i) => ({
    x: (i / (prices.length - 1)) * (W - 2 * pad) + pad,
    y: pad + ((max - v) / range) * (H - 2 * pad),
  }));
  const linePath = [
    `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`,
    ...coords.slice(1).map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`),
  ].join(" ");
  const areaPath = [
    linePath,
    `L ${coords[coords.length - 1].x.toFixed(1)} ${H}`,
    `L ${coords[0].x.toFixed(1)} ${H}`,
    "Z",
  ].join(" ");

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#grad)" />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// ── Position row ─────────────────────────────────────────────────────────────

function PositionRow({
  pos,
  onPress,
}: {
  pos: SimPosition;
  onPress: () => void;
}) {
  const { colors } = useThemeStore();
  const isOpen = pos.status === "OPEN";
  const pnl = pos.pnl_pct ?? 0;
  const pnlColor = pnl >= 0 ? colors.success : colors.danger;

  const _unrealizedPct =
    isOpen && pos.entry_price && pos.planned_stop_loss != null
      ? null // we don't have current price here; display entry context
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.posRow, { borderBottomColor: colors.borderColor }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.posTicker, { color: colors.textPrimary }]}>
          {pos.ticker}
        </Text>
        <Text style={[styles.posMeta, { color: colors.textMuted }]}>
          {pos.entry_stage ?? ""} · {pos.entry_date ?? ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {isOpen ? (
          <>
            <Text style={[styles.posStatus, { color: colors.accentPrimary }]}>
              OPEN
            </Text>
            <Text style={[styles.posMeta, { color: colors.textMuted }]}>
              {pos.size_kwd?.toFixed(0)} KWD
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.posPnl, { color: pnlColor }]}>
              {pnl >= 0 ? "+" : ""}
              {pnl.toFixed(2)}%
            </Text>
            <Text style={[styles.posMeta, { color: colors.textMuted }]}>
              {pos.exit_reason?.replace(/_/g, " ")}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

// ── Breakdown section ────────────────────────────────────────────────────────

type AnyRow = Record<string, string | number | null | undefined>;

function BreakdownTable({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: AnyRow[];
  labelKey: string;
}) {
  const { colors } = useThemeStore();
  if (!rows || rows.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      {rows.map((r, i) => {
        const label = String(r[labelKey] ?? "?");
        const trades = Number(r.trades ?? r.count ?? 0);
        const winRate = Number(r.win_rate ?? 0);
        const avgPnl = Number(r.avg_pnl_pct ?? r.avg_pnl ?? 0);
        const pnlColor =
          avgPnl >= 0 ? colors.success : colors.danger;

        return (
          <View
            key={i}
            style={[styles.breakdownRow, { borderBottomColor: colors.borderColor }]}
          >
            <Text
              style={[styles.breakdownLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {label.replace(/_/g, " ")}
            </Text>
            <Text style={[styles.breakdownStat, { color: colors.textMuted }]}>
              {trades}T
            </Text>
            <Text style={[styles.breakdownStat, { color: colors.textMuted }]}>
              {winRate.toFixed(0)}%W
            </Text>
            <Text style={[styles.breakdownStat, { color: pnlColor }]}>
              {avgPnl >= 0 ? "+" : ""}
              {avgPnl.toFixed(1)}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SimulatorStrategyScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { strategy } = useLocalSearchParams<{ strategy: string }>();
  const stratKey = (strategy ?? "buy").toLowerCase();
  const stratUpper = stratKey.toUpperCase() as StrategyName;
  const accentColor = STRATEGY_COLORS[stratKey] ?? colors.accentPrimary;

  const { data, isLoading, refetch, isRefetching } = useSimulatorPortfolioDetail(stratUpper);
  const { data: perf } = useSimulatorPerformance(stratUpper);

  const [tab, setTab] = useState<"open" | "history" | "perf">("open");
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handlePositionPress = useCallback(
    (posId: number) => {
      router.push(`/eagle-eye/simulator/position/${posId}`);
    },
    []
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ color: colors.textMuted }}>Strategy not found</Text>
      </View>
    );
  }

  const { summary, equity_curve, open_positions, transaction_history } = data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={accentColor}
        />
      }
    >
      {/* Back + Title */}
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: accentColor }]}>← Simulator</Text>
      </Pressable>
      <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
        PAPER — SIMULATION — {STRATEGY_LABELS[stratKey]} Card
      </Text>
      <Text style={[styles.ruleText, { color: colors.textMuted }]}>Entry: next-session open after R11 rating transitions to {STRATEGY_LABELS[stratKey]}. Exit: Sell/Topping full, Reduce half, Avoid transition full.</Text>

      {/* KPIs */}
      <View style={[styles.kpiRow]}>
        {[
          {
            label: "Current Value",
            value: `${summary.total_value_kwd.toLocaleString("en-KW", { maximumFractionDigits: 0 })} KWD`,
          },
          {
            label: "Return",
            value: `${summary.cumulative_return_pct >= 0 ? "+" : ""}${summary.cumulative_return_pct.toFixed(2)}%`,
            color: summary.cumulative_return_pct >= 0 ? colors.success : colors.danger,
          },
          { label: "Win Rate", value: `${summary.win_rate.toFixed(1)}%` },
          { label: "Max DD", value: `${summary.max_drawdown_pct.toFixed(1)}%`, color: colors.danger },
          { label: "Profit Factor", value: summary.profit_factor.toFixed(2) },
          { label: "Exposure", value: `${summary.exposure_pct.toFixed(1)}%` },
          { label: "Open", value: String(summary.open_positions_count) },
        ].map((kpi) => (
          <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.kpiValue, { color: kpi.color ?? colors.textPrimary }]}>
              {kpi.value}
            </Text>
            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* Equity Curve */}
      {equity_curve.length > 1 && (
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Equity Curve</Text>
          <EquityChart data={equity_curve} color={accentColor} />
          <View style={styles.equityLabels}>
            <Text style={[styles.equityLabel, { color: colors.textMuted }]}>
              {equity_curve[0]?.date}
            </Text>
            <Text style={[styles.equityLabel, { color: colors.textMuted }]}>
              {equity_curve[equity_curve.length - 1]?.date}
            </Text>
          </View>
        </View>
      )}

      {/* Tab selector */}
      <View style={[styles.tabBar, { backgroundColor: colors.bgCard }]}>
        {(["open", "history", "perf"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === t ? accentColor : colors.textMuted },
              ]}
            >
              {t === "open" ? `Open (${open_positions.length})` : t === "history" ? `History (${transaction_history.length})` : "Performance"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {tab === "open" && (
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          {open_positions.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No open positions
            </Text>
          ) : (
            open_positions.map((pos) => (
              <PositionRow
                key={pos.id}
                pos={pos}
                onPress={() => handlePositionPress(pos.id)}
              />
            ))
          )}
        </View>
      )}

      {tab === "history" && (
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          {transaction_history.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No transactions yet
            </Text>
          ) : (
            transaction_history.map((tx) => {
              const pnl = Number(tx.realized_pnl_pct ?? 0);
              const pnlColor = pnl >= 0 ? colors.success : colors.danger;
              const entrySnapshot = (tx.entry_snapshot_json ?? {}) as Record<string, unknown>;
              const exitSnapshot = (tx.exit_snapshot_json ?? {}) as Record<string, unknown>;
              const outcome = String(tx.outcome_class ?? "SCRATCH");
              return (
                <View key={tx.id} style={[styles.posRow, { borderBottomColor: colors.borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.posTicker, { color: colors.textPrimary }]}>{tx.ticker}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Entry snapshot: {String(entrySnapshot.rating ?? "n/a")} / {String(entrySnapshot.stage ?? "n/a")}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Exit why: {String(tx.exit_reason).replace(/_/g, " ")} / {String(exitSnapshot?.rating ?? "n/a")}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Outcome: {outcome}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Persisted: {formatList(tx.persisted_fields_json)}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Flipped: {formatList(tx.flipped_fields_json)}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Sessions to flip: {formatRecord(tx.sessions_to_flip_json)}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>Attribution: {formatRecord(tx.attribution_json)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.posPnl, { color: pnlColor }]}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>{Number(tx.holding_sessions ?? 0)} sessions</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>MFE {Number(tx.mfe_pct ?? 0).toFixed(1)}% / MAE {Number(tx.mae_pct ?? 0).toFixed(1)}%</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>MFE&gt;10 {tx.mfe_gt_10 ? "yes" : "no"}</Text>
                    <Text style={[styles.posMeta, { color: colors.textMuted }]}>MFE&gt;20 {tx.mfe_gt_20 ? "yes" : "no"}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {tab === "perf" && perf && (
        <>
          <BreakdownTable
            title="By Stage at Entry"
            rows={perf.by_stage as unknown as AnyRow[]}
            labelKey="stage"
          />
          <BreakdownTable
            title="By Confidence Band"
            rows={perf.by_confidence_band.map((r) => ({
              stage: r.band,
              trades: r.trades,
              win_rate: r.win_rate,
              avg_pnl_pct: r.avg_pnl_pct,
            } as AnyRow))}
            labelKey="stage"
          />
          <BreakdownTable
            title="By Exit Reason"
            rows={perf.by_exit_reason.map((r) => ({
              stage: r.exit_reason,
              trades: r.count,
              avg_pnl_pct: r.avg_pnl,
              win_rate: 0,
            } as AnyRow))}
            labelKey="stage"
          />
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 16, gap: 14 },

  backBtn: { marginBottom: 4 },
  backText: { fontSize: 14, fontWeight: "600" },
  pageTitle: { fontSize: 22, fontWeight: "700" },
  ruleText: { fontSize: 12, lineHeight: 17 },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    flex: 1,
    minWidth: "30%",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  kpiValue: { fontSize: 16, fontWeight: "700" },
  kpiLabel: { fontSize: 11, marginTop: 2 },

  card: { borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },

  equityLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  equityLabel: { fontSize: 10 },

  tabBar: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabText: { fontSize: 13, fontWeight: "600" },

  posRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  posTicker: { fontSize: 14, fontWeight: "700" },
  posMeta: { fontSize: 11, marginTop: 2 },
  posStatus: { fontSize: 12, fontWeight: "700" },
  posPnl: { fontSize: 14, fontWeight: "700" },

  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breakdownLabel: { flex: 2, fontSize: 12 },
  breakdownStat: { flex: 1, fontSize: 12, textAlign: "right" },

  emptyText: { fontSize: 13, textAlign: "center", padding: 24 },
});
