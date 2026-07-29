/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye Simulator — Index Page
 *
 * Displays two paper trading cards, a comparison table,
 * and a recent activity feed.
 */

import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { StageTag } from "@/components/eagle-eye/StageTag";
import { useAdminGate } from "@/hooks/useAdminGate";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import {
  useResetSimulator,
  useSimulatorStatus,
  useSimulatorActivity,
  useSimulatorCompare,
  useSimulatorPortfolios,
  useRunSimulatorNow,
  useStartSimulator,
  useStopSimulator,
  type SimPortfolioSummary,
  type StrategyName,
} from "@/hooks/useSimulator";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
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

const STRATEGY_COLORS: Partial<Record<StrategyName, string>> = {
  CONSERVATIVE: "#22c55e",
  MODERATE: "#f59e0b",
  AGGRESSIVE: "#ef4444",
  BUY: "#22c55e",
  WATCHLIST: "#38bdf8",
};

const STRATEGY_LABELS: Partial<Record<StrategyName, string>> = {
  CONSERVATIVE: "Conservative",
  MODERATE: "Moderate",
  AGGRESSIVE: "Aggressive",
  BUY: "Buy Signals",
  WATCHLIST: "Watchlist",
};

function strategyLabel(strategy: string) {
  return STRATEGY_LABELS[strategy as StrategyName] ?? strategy.replace(/_/g, " ");
}

const ACTIVE_SIMULATOR_CARDS: StrategyName[] = ["BUY", "WATCHLIST"];

function emptySummary(strategyName: StrategyName, id: number): SimPortfolioSummary {
  return {
    id,
    strategy_name: strategyName,
    starting_capital_kwd: 100000,
    cash_balance_kwd: 100000,
    total_value_kwd: 100000,
    cumulative_return_pct: 0,
    open_positions_count: 0,
    pending_orders_count: 0,
    total_trades: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    avg_win_pct: 0,
    avg_loss_pct: 0,
    profit_factor: 0,
    max_drawdown_pct: 0,
    equity_curve: [{ date: new Date().toISOString().slice(0, 10), value: 100000, return_pct: 0 }],
    live_since: null,
  };
}

const EMPTY_SIMULATOR_CARDS = ACTIVE_SIMULATOR_CARDS.map((strategyName, index) =>
  emptySummary(strategyName, index + 1)
);

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
        {strategyLabel(summary.strategy_name)}
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
        {summary.total_trades === 0
          ? "Waiting for Eagle Eye signal"
          : `${summary.wins}W / ${summary.losses}L = ${((summary.wins / summary.total_trades) * 100).toFixed(1)}%`}
      </Text>

      <Text style={[styles.metaText, { color: colors.textMuted }]}>
        {summary.open_positions_count} open positions
        {summary.pending_orders_count ? ` • ${summary.pending_orders_count} pending` : ""}
      </Text>

      <Text style={[styles.metaText, { color: colors.textMuted }]}>
        Live since:{" "}
        {summary.live_since
          ? new Date(summary.live_since).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "today"}
      </Text>

      <View style={styles.sparklineContainer}>
        <Sparkline
          data={sparkData.length > 0 ? sparkData : [summary.starting_capital_kwd]}
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

  const strategies = portfolios.map((p) => p.strategy_name);

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
              { color: STRATEGY_COLORS[s] ?? colors.accentPrimary },
            ]}
          >
            {strategyLabel(s).slice(0, 4)}
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

function ActivityFeed({ enabled }: { enabled: boolean }) {
  const { colors } = useThemeStore();
  const { data: feed, isLoading } = useSimulatorActivity(20, enabled);

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
                {strategyLabel(item.strategy_name).slice(0, 4)}
              </Text>
            </View>
            <Text style={[styles.feedTicker, { color: colors.textPrimary }]}>
              {item.ticker}
            </Text>
            <Text style={[styles.feedAction, { color: isExit ? colors.textSecondary : colors.accentPrimary }]}>
              {isExit
                ? `EXIT (${item.exit_reason?.replace("_", " ")})`
                : item.scheduled_date
                ? `ENTRY queued ${item.scheduled_date}`
                : "ENTRY"}
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
  const { showSidebar } = useResponsive();
  const { isAdmin, isLoading: isAdminLoading } = useAdminGate();

  const { data: portfolios, isLoading, refetch, isRefetching } = useSimulatorPortfolios(isAdmin);
  const { data: simStatus } = useSimulatorStatus(isAdmin);
  const runNow = useRunSimulatorNow();
  const startNow = useStartSimulator();
  const stopNow = useStopSimulator();
  const resetNow = useResetSimulator();
  const [runStatus, setRunStatus] = useState<"idle" | "ok" | "err">("idle");
  const [controlStatus, setControlStatus] = useState<"idle" | "ok" | "err">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "ok" | "err">("idle");

  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleRunNow = useCallback(async () => {
    setRunStatus("idle");
    try {
      await runNow.mutateAsync();
      setRunStatus("ok");
      setTimeout(() => setRunStatus("idle"), 4000);
    } catch {
      setRunStatus("err");
      setTimeout(() => setRunStatus("idle"), 4000);
    }
  }, [runNow]);

  const handleToggleRunning = useCallback(() => {
    const isRunning = simStatus?.running ?? true;
    const runToggle = async () => {
      setControlStatus("idle");
      try {
        if (isRunning) {
          await stopNow.mutateAsync();
        } else {
          await startNow.mutateAsync();
        }
        setControlStatus("ok");
        setTimeout(() => setControlStatus("idle"), 4000);
      } catch {
        setControlStatus("err");
        setTimeout(() => setControlStatus("idle"), 4000);
      }
    };

    if (isRunning) {
      Alert.alert(
        "Stop Simulator?",
        "This pauses automatic Eagle Eye paper buys and sells. Existing paper positions remain unchanged until you start it again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Stop", style: "destructive", onPress: () => void runToggle() },
        ]
      );
      return;
    }

    void runToggle();
  }, [simStatus?.running, startNow, stopNow]);

  const handleResetNow = useCallback(() => {
    Alert.alert(
      "Reset Simulator?",
      "This will clear all simulator trades and restart both paper cards from today.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setResetStatus("idle");
              try {
                await resetNow.mutateAsync({ runAfterReset: false });
                setResetStatus("ok");
                setTimeout(() => setResetStatus("idle"), 4000);
              } catch {
                setResetStatus("err");
                setTimeout(() => setResetStatus("idle"), 4000);
              }
            })();
          },
        },
      ]
    );
  }, [resetNow]);

  const handleCardPress = useCallback((strategy: string) => {
    router.push(`/eagle-eye/simulator/${strategy.toLowerCase()}`);
  }, []);

  const activePortfolios = (portfolios ?? []).filter((p) =>
    ACTIVE_SIMULATOR_CARDS.includes(p.strategy_name)
  );
  const visiblePortfolios = activePortfolios.length > 0 ? activePortfolios : EMPTY_SIMULATOR_CARDS;

  if (isAdminLoading || (isAdmin && isLoading)) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {isAdminLoading ? "Checking simulator access…" : "Loading simulators…"}
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
        <EagleEyeTopTabs />
        <View style={[styles.centered, { paddingHorizontal: 24 }]}>
          <Text style={[styles.pageTitle, { color: colors.textPrimary, textAlign: "center" }]}>Admin Access Required</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textMuted, textAlign: "center" }]}> 
            Eagle Eye simulator controls and paper-trading results are available to admin users only.
          </Text>
          <Pressable
            onPress={() => router.replace("/(tabs)/eagle-eye")}
            style={[styles.runBtn, { backgroundColor: colors.accentPrimary, marginTop: 12 }]}
          >
            <Text style={styles.runBtnText}>Back to Scanner</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />

      <ScrollView
        style={{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
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
          Two paper cards • 100,000 KWD each • Live forward from today
        </Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusPill,
              {
                borderColor: simStatus?.running === false ? colors.danger : colors.success,
                backgroundColor: simStatus?.running === false ? colors.danger + "1A" : colors.success + "1A",
              },
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                { color: simStatus?.running === false ? colors.danger : colors.success },
              ]}
            >
              {simStatus?.running === false ? "Simulator paused" : "Simulator running"}
            </Text>
          </View>
          <Text style={[styles.statusHint, { color: colors.textMuted }]}> 
            {simStatus?.running === false
              ? "No automatic paper buys or sells will execute."
              : "Automatic Eagle Eye paper buys and sells are enabled."}
          </Text>
        </View>

        <Pressable
          onPress={handleToggleRunning}
          disabled={startNow.isPending || stopNow.isPending || runNow.isPending || resetNow.isPending}
          style={[
            styles.controlBtn,
            {
              backgroundColor:
                controlStatus === "err"
                  ? colors.danger
                  : simStatus?.running === false
                  ? colors.success
                  : colors.danger,
              opacity: startNow.isPending || stopNow.isPending ? 0.6 : 1,
            },
          ]}
        >
          {startNow.isPending || stopNow.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>
              {controlStatus === "ok"
                ? simStatus?.running === false
                  ? "✓ Simulator stopped"
                  : "✓ Simulator running"
                : controlStatus === "err"
                ? "✗ Control failed"
                : simStatus?.running === false
                ? "▶ Start Automatic Simulator"
                : "■ Stop Automatic Simulator"}
            </Text>
          )}
        </Pressable>

        {/* Manual run button */}
        <Pressable
          onPress={handleRunNow}
          disabled={runNow.isPending || simStatus?.running === false}
          style={[
            styles.runBtn,
            {
              backgroundColor:
                runStatus === "ok"
                  ? colors.success
                  : runStatus === "err"
                  ? colors.danger
                  : colors.accentPrimary,
              opacity: runNow.isPending || simStatus?.running === false ? 0.6 : 1,
            },
          ]}
        >
          {runNow.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>
              {runStatus === "ok"
                ? "✓ Simulator ran successfully"
                : runStatus === "err"
                ? "✗ Run failed — check logs"
                : simStatus?.running === false
                ? "Start simulator to run now"
                : "▶  Run Simulator Now"}
            </Text>
          )}
        </Pressable>

        {/* Reset button */}
        <Pressable
          onPress={handleResetNow}
          disabled={resetNow.isPending || runNow.isPending}
          style={[
            styles.resetBtn,
            {
              borderColor:
                resetStatus === "ok"
                  ? colors.success
                  : resetStatus === "err"
                  ? colors.danger
                  : colors.borderColor,
              opacity: resetNow.isPending ? 0.6 : 1,
            },
          ]}
        >
          {resetNow.isPending ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={[styles.resetBtnText, { color: colors.textPrimary }]}> 
              {resetStatus === "ok"
                ? "✓ Simulator reset"
                : resetStatus === "err"
                ? "✗ Reset failed"
                : "Reset Simulator Data"}
            </Text>
          )}
        </Pressable>

        {/* Strategy cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardsRow}
          contentContainerStyle={styles.cardsContent}
        >
          {visiblePortfolios.map((p) => (
            <StrategyCard
              key={p.strategy_name}
              summary={p}
              onPress={() => handleCardPress(p.strategy_name)}
            />
          ))}
        </ScrollView>

        {/* Comparison table */}
        <ComparisonTable portfolios={visiblePortfolios} />

        {/* Activity feed */}
        <ActivityFeed enabled={isAdmin} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { paddingHorizontal: 16, gap: 16 },
  pageTitle: { fontSize: 22, fontWeight: "700", marginBottom: 2 },
  pageSubtitle: { fontSize: 13, marginBottom: 8 },
  statusRow: { gap: 6 },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  statusHint: { fontSize: 12 },
  controlBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },

  cardsRow: { marginHorizontal: -4, minHeight: 220 },
  cardsContent: { paddingHorizontal: 4, paddingBottom: 8, alignItems: "stretch" },
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

  runBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 44,
  },
  runBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  resetBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 44,
  },
  resetBtnText: { fontSize: 14, fontWeight: "600" },
});
