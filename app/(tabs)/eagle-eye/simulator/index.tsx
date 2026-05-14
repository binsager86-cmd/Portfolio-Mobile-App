/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye Simulator — Index Page
 *
 * Displays three strategy cards side-by-side, a comparison table,
 * and a recent activity feed across all three strategies.
 */

import { StageTag } from "@/components/eagle-eye/StageTag";
import { useThemeStore } from "@/services/themeStore";
import {
  useSimulatorActivity,
  useSimulatorCompare,
  useSimulatorPortfolios,
  type SimPortfolioSummary,
  type StrategyName,
} from "@/hooks/useSimulator";
import { router } from "expo-router";
import React, { useCallback } from "react";
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
import Svg, { Polyline, Rect } from "react-native-svg";

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  width = 80,
  height = 32,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
}) {
  if (data.length < 2) {
    return <View style={{ width, height }} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2 * pad) + pad;
      const y = pad + ((max - v) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

// ── Strategy card ────────────────────────────────────────────────────────────

const STRATEGY_COLORS: Record<StrategyName, string> = {
  CONSERVATIVE: "#22c55e",
  MODERATE: "#f59e0b",
  AGGRESSIVE: "#ef4444",
};

const STRATEGY_LABELS: Record<StrategyName, string> = {
  CONSERVATIVE: "Conservative",
  MODERATE: "Moderate",
  AGGRESSIVE: "Aggressive",
};

function StrategyCard({
  summary,
  onPress,
}: {
  summary: SimPortfolioSummary;
  onPress: () => void;
}) {
  const { colors } = useThemeStore();
  const accentColor = STRATEGY_COLORS[summary.strategy_name] ?? colors.accentPrimary;
  const returnPct = summary.cumulative_return_pct ?? 0;
  const isPositive = returnPct >= 0;
  const sparkData = summary.equity_curve.map((p) => p.value);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: accentColor }]}
    >
      <Text style={[styles.strategyLabel, { color: accentColor }]}>
        {STRATEGY_LABELS[summary.strategy_name]}
      </Text>

      <Text style={[styles.totalValue, { color: colors.textPrimary }]}>
        {summary.total_value_kwd.toLocaleString("en-KW", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}{" "}
        <Text style={styles.unit}>KWD</Text>
      </Text>

      <Text
        style={[
          styles.returnPct,
          { color: isPositive ? colors.success : colors.danger },
        ]}
      >
        {isPositive ? "▲" : "▼"} {Math.abs(returnPct).toFixed(2)}%
      </Text>

      <Text style={[styles.metaText, { color: colors.textSecondary }]}>
        {summary.wins}W / {summary.losses}L ={" "}
        {summary.total_trades > 0
          ? ((summary.wins / summary.total_trades) * 100).toFixed(1)
          : "0.0"}
        %
      </Text>

      <Text style={[styles.metaText, { color: colors.textMuted }]}>
        {summary.open_positions_count} open positions
      </Text>

      <View style={styles.sparklineContainer}>
        <Sparkline
          data={sparkData.length > 0 ? sparkData : [10000]}
          color={accentColor}
        />
      </View>

      <Text style={[styles.tapHint, { color: colors.textMuted }]}>
        Tap to view details →
      </Text>
    </Pressable>
  );
}

// ── Comparison table ─────────────────────────────────────────────────────────

const METRICS: Array<{ label: string; key: keyof SimPortfolioSummary; fmt: (v: number) => string }> = [
  { label: "Total trades", key: "total_trades", fmt: (v) => String(v) },
  { label: "Win rate", key: "win_rate", fmt: (v) => `${v.toFixed(1)}%` },
  { label: "Avg win", key: "avg_win_pct", fmt: (v) => `+${v.toFixed(1)}%` },
  { label: "Avg loss", key: "avg_loss_pct", fmt: (v) => `-${v.toFixed(1)}%` },
  { label: "Profit factor", key: "profit_factor", fmt: (v) => v.toFixed(2) },
  { label: "Max drawdown", key: "max_drawdown_pct", fmt: (v) => `${v.toFixed(1)}%` },
  {
    label: "Current value (KWD)",
    key: "total_value_kwd",
    fmt: (v) =>
      v.toLocaleString("en-KW", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  },
];

function ComparisonTable({
  portfolios,
}: {
  portfolios: SimPortfolioSummary[];
}) {
  const { colors } = useThemeStore();

  if (portfolios.length === 0) return null;

  const byStrategy: Partial<Record<StrategyName, SimPortfolioSummary>> = {};
  for (const p of portfolios) byStrategy[p.strategy_name] = p;

  const strategies: StrategyName[] = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"];

  return (
    <View style={[styles.tableContainer, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        Strategy Comparison
      </Text>
      {/* Header */}
      <View style={[styles.tableRow, { borderBottomColor: colors.borderColor }]}>
        <Text style={[styles.tableMetricCell, { color: colors.textMuted }]}>Metric</Text>
        {strategies.map((s) => (
          <Text
            key={s}
            style={[
              styles.tableValueCell,
              { color: STRATEGY_COLORS[s] },
            ]}
          >
            {STRATEGY_LABELS[s].slice(0, 4)}
          </Text>
        ))}
      </View>
      {METRICS.map((m) => (
        <View
          key={m.key}
          style={[styles.tableRow, { borderBottomColor: colors.borderColor }]}
        >
          <Text style={[styles.tableMetricCell, { color: colors.textSecondary }]}>
            {m.label}
          </Text>
          {strategies.map((s) => {
            const p = byStrategy[s];
            const raw = p ? (p[m.key] as number) : 0;
            return (
              <Text
                key={s}
                style={[styles.tableValueCell, { color: colors.textPrimary }]}
              >
                {p ? m.fmt(raw) : "—"}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeed() {
  const { colors } = useThemeStore();
  const { data: feed, isLoading } = useSimulatorActivity(20);

  if (isLoading) {
    return <ActivityIndicator style={{ margin: 16 }} color={colors.accentPrimary} />;
  }
  if (!feed || feed.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        No activity yet — run the simulator or complete the backfill.
      </Text>
    );
  }

  return (
    <View style={[styles.tableContainer, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        Recent Activity
      </Text>
      {feed.map((item, idx) => {
        const isExit = item.action === "EXIT";
        const pnl = item.pnl_pct;
        const pnlColor = pnl != null ? (pnl >= 0 ? colors.success : colors.danger) : colors.textMuted;
        const stratColor = STRATEGY_COLORS[(item.strategy_name as StrategyName)] ?? colors.accentPrimary;

        return (
          <View
            key={idx}
            style={[styles.feedRow, { borderBottomColor: colors.borderColor }]}
          >
            <View style={[styles.feedStratBadge, { backgroundColor: stratColor + "22" }]}>
              <Text style={[styles.feedStratText, { color: stratColor }]}>
                {STRATEGY_LABELS[item.strategy_name as StrategyName]?.slice(0, 4) ?? item.strategy_name}
              </Text>
            </View>
            <Text style={[styles.feedTicker, { color: colors.textPrimary }]}>
              {item.ticker}
            </Text>
            <Text style={[styles.feedAction, { color: isExit ? colors.textSecondary : colors.accentPrimary }]}>
              {isExit ? `EXIT (${item.exit_reason?.replace("_", " ")})` : "ENTRY"}
            </Text>
            {pnl != null && (
              <Text style={[styles.feedPnl, { color: pnlColor }]}>
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SimulatorIndexScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();

  const { data: portfolios, isLoading, refetch, isRefetching } = useSimulatorPortfolios();

  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleCardPress = useCallback((strategy: string) => {
    router.push(`/eagle-eye/simulator/${strategy.toLowerCase()}`);
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading simulators…
        </Text>
      </View>
    );
  }

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
          tintColor={colors.accentPrimary}
        />
      }
    >
      {/* Header */}
      <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
        Paper Trading Simulator
      </Text>
      <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
        Three parallel strategies • 10,000 KWD each • Starting 2025-01-01
      </Text>

      {/* Strategy cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsRow}>
        {(portfolios ?? []).map((p) => (
          <StrategyCard
            key={p.strategy_name}
            summary={p}
            onPress={() => handleCardPress(p.strategy_name)}
          />
        ))}
      </ScrollView>

      {/* Comparison table */}
      {portfolios && <ComparisonTable portfolios={portfolios} />}

      {/* Activity feed */}
      <ActivityFeed />
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { paddingHorizontal: 16, gap: 16 },
  pageTitle: { fontSize: 22, fontWeight: "700", marginBottom: 2 },
  pageSubtitle: { fontSize: 13, marginBottom: 8 },

  cardsRow: { marginHorizontal: -4 },
  card: {
    width: 200,
    marginHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    gap: 4,
  },
  strategyLabel: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  totalValue: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  unit: { fontSize: 12, fontWeight: "400" },
  returnPct: { fontSize: 16, fontWeight: "700" },
  metaText: { fontSize: 12 },
  sparklineContainer: { marginTop: 8 },
  tapHint: { fontSize: 11, marginTop: 4 },

  tableContainer: { borderRadius: 12, padding: 14, gap: 0 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableMetricCell: { flex: 2, fontSize: 12 },
  tableValueCell: { flex: 1, fontSize: 12, textAlign: "right", fontWeight: "600" },

  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  feedStratBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  feedStratText: { fontSize: 10, fontWeight: "700" },
  feedTicker: { flex: 1, fontSize: 13, fontWeight: "600" },
  feedAction: { fontSize: 11 },
  feedPnl: { fontSize: 12, fontWeight: "700", minWidth: 52, textAlign: "right" },

  emptyText: { fontSize: 13, textAlign: "center", marginVertical: 24 },
});
