/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Trend-Hold Book screen.
 *
 * Read-only view of the virtual-money paper-trading ledger that
 * mechanically fills the trend_hold_engine's BUY/SCALE_OUT/SELL_SIGNAL
 * decisions across the full scanner universe. No manual buy/sell controls
 * -- every fill here was executed automatically by the 14:18 Asia/Kuwait
 * scheduler step, never by a person.
 *
 * This is SIMULATED. It is independent of the real portfolio
 * (holdings.tsx / trading.tsx) and of the unrelated eagle-eye/simulator
 * screens (a different, already-existing 3-symbol backtest system).
 */
import SnapshotLineChart, { ChartDataPoint } from "@/components/charts/SnapshotLineChart";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import type { ThemePalette } from "@/constants/theme";
import {
  useTrendHoldBookLessons,
  useTrendHoldBookLessonsSummary,
  useTrendHoldBookNavHistory,
  useTrendHoldBookPortfolio,
  useTrendHoldBookPositions,
  useTrendHoldBookTrades,
  useTrendHoldDecisionLog,
  type TrendHoldBookLesson,
  type TrendHoldBookPosition,
  type TrendHoldBookTrade,
  type TrendHoldDecisionLogEntry,
} from "@/hooks/useTrendHoldBook";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/currency";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── KPI card palette — deliberately its own violet/amber identity, not the
// green/blue used for the real portfolio, so this never visually reads as
// "real money" even at a glance. ───────────────────────────────────────────

const KPI_STYLES = {
  equity: {
    dark: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)", accent: "#a78bfa" },
    light: { bg: "rgba(124,58,237,0.08)", border: "rgba(124,58,237,0.2)", accent: "#7c3aed" },
  },
  cash: {
    dark: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", accent: "#f59e0b" },
    light: { bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.2)", accent: "#d97706" },
  },
  returnPositive: {
    dark: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", accent: "#10b981" },
    light: { bg: "rgba(4,120,87,0.08)", border: "rgba(4,120,87,0.2)", accent: "#047857" },
  },
  returnNegative: {
    dark: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", accent: "#f87171" },
    light: { bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)", accent: "#dc2626" },
  },
  positions: {
    dark: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.3)", accent: "#06b6d4" },
    light: { bg: "rgba(29,78,216,0.08)", border: "rgba(29,78,216,0.2)", accent: "#1D4ED8" },
  },
} as const;

const DECISION_COLOR_KEY: Record<string, keyof typeof KPI_STYLES> = {
  BUY: "returnPositive",
  HOLD: "cash",
  SCALE_OUT: "equity",
  SELL_SIGNAL: "returnNegative",
  WAIT: "positions",
};

const OUTCOME_COLOR_KEY: Record<string, keyof typeof KPI_STYLES> = {
  WIN: "returnPositive",
  LOSS: "returnNegative",
  PARTIAL: "equity",
  UNKNOWN: "positions",
};

function KpiCard({
  label,
  value,
  subtitle,
  kpiStyle,
  colors,
}: {
  label: string;
  value: string;
  subtitle?: string;
  kpiStyle: { bg: string; border: string; accent: string };
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: kpiStyle.bg, borderColor: kpiStyle.border }]}>
      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: kpiStyle.accent }]}>{value}</Text>
      {subtitle ? <Text style={[styles.kpiSub, { color: kpiStyle.accent }]}>{subtitle}</Text> : null}
    </View>
  );
}

function SimulatedBanner() {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.simBanner, { backgroundColor: colors.warning + "1a", borderColor: colors.warning }]}>
      <FontAwesome name="flask" size={13} color={colors.warning} style={{ marginTop: 1 }} />
      <Text style={[styles.simBannerText, { color: colors.warning }]}>
        SIMULATED — virtual money only. No real trades are executed. Every fill below was placed
        automatically by the trend-hold engine's daily scan; there is no manual buy/sell here.
      </Text>
    </View>
  );
}

function InlineError({ message }: { message: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.errorPanel, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
      <FontAwesome name="exclamation-triangle" size={13} color={colors.dangerText} />
      <Text style={[styles.errorText, { color: colors.dangerText }]}>{message}</Text>
    </View>
  );
}

function SectionTitle({ icon, title, colors }: { icon: React.ComponentProps<typeof FontAwesome>["name"]; title: string; colors: ThemePalette }) {
  return (
    <View style={styles.sectionHeader}>
      <FontAwesome name={icon} size={14} color={colors.accentPrimary} />
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

function PositionRow({ position }: { position: TrendHoldBookPosition }) {
  const { colors } = useThemeStore();
  const pnl = position.unrealized_pnl_kwd;
  const pnlColor = pnl == null ? colors.textMuted : pnl >= 0 ? colors.success : colors.danger;
  return (
    <View style={[styles.row, { borderColor: colors.borderColor }]}>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{position.ticker}</Text>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
          {fmtNum(position.quantity, 2)} sh @ {formatCurrency(position.avg_cost)}
        </Text>
        {position.opened_date ? (
          <Text style={[styles.rowMetaSmall, { color: colors.textMuted }]}>Opened {position.opened_date}</Text>
        ) : null}
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{formatCurrency(position.market_value_kwd)}</Text>
        <Text style={[styles.rowMeta, { color: pnlColor }]}>{formatSignedCurrency(pnl)}</Text>
      </View>
    </View>
  );
}

function TradeCard({ trade }: { trade: TrendHoldBookTrade }) {
  const { colors } = useThemeStore();
  const kpiKey = trade.side === "BUY" ? "returnPositive" : trade.side === "SCALE_OUT" ? "cash" : "returnNegative";
  const isDark = colors.mode === "dark";
  const sideStyle = KPI_STYLES[kpiKey][isDark ? "dark" : "light"];
  const pnl = trade.realized_pnl_kwd;
  const pnlColor = pnl == null ? colors.textMuted : pnl >= 0 ? colors.success : colors.danger;

  return (
    <View style={[styles.tradeCard, { borderColor: colors.borderColor }]}>
      <View style={styles.tradeHeaderLine}>
        <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{trade.ticker}</Text>
        <View style={[styles.sideBadge, { backgroundColor: sideStyle.bg, borderColor: sideStyle.border }]}>
          <Text style={[styles.sideBadgeText, { color: sideStyle.accent }]}>{trade.side}</Text>
        </View>
        <Text style={[styles.rowMetaSmall, { color: colors.textMuted, marginLeft: "auto" }]}>{trade.trade_date}</Text>
      </View>

      <View style={styles.tradeDetailGrid}>
        <View style={styles.tradeDetailCell}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Quantity</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(trade.quantity, 2)} sh</Text>
        </View>
        <View style={styles.tradeDetailCell}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Price</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatCurrency(trade.price)}</Text>
        </View>
        <View style={styles.tradeDetailCell}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Gross</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatCurrency(trade.gross_kwd)}</Text>
        </View>
        <View style={styles.tradeDetailCell}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Commission</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatCurrency(trade.commission_kwd)}</Text>
        </View>
        {pnl != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Realized P&L</Text>
            <Text style={[styles.detailValue, { color: pnlColor, fontWeight: "800" }]}>{formatSignedCurrency(pnl)}</Text>
          </View>
        ) : null}
      </View>

      {trade.reason ? (
        <Text style={[styles.reasonText, { color: colors.textMuted }]}>{trade.reason}</Text>
      ) : null}
    </View>
  );
}

function LessonCard({ lesson }: { lesson: TrendHoldBookLesson }) {
  const { colors } = useThemeStore();
  const isDark = colors.mode === "dark";
  const outcomeKey = OUTCOME_COLOR_KEY[lesson.outcome] ?? "positions";
  const outcomeStyle = KPI_STYLES[outcomeKey][isDark ? "dark" : "light"];

  return (
    <View style={[styles.tradeCard, { borderColor: colors.borderColor }]}>
      <View style={styles.tradeHeaderLine}>
        <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{lesson.ticker}</Text>
        <View style={[styles.sideBadge, { backgroundColor: outcomeStyle.bg, borderColor: outcomeStyle.border }]}>
          <Text style={[styles.sideBadgeText, { color: outcomeStyle.accent }]}>{lesson.classification}</Text>
        </View>
        <Text style={[styles.rowMetaSmall, { color: colors.textMuted, marginLeft: "auto" }]}>{lesson.trade_date}</Text>
      </View>

      <View style={styles.tradeDetailGrid}>
        {lesson.holding_days != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Held</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{lesson.holding_days}d</Text>
          </View>
        ) : null}
        {lesson.mfe_pct != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Peak gain</Text>
            <Text style={[styles.detailValue, { color: colors.success }]}>{formatPercent(lesson.mfe_pct)}</Text>
          </View>
        ) : null}
        {lesson.mae_pct != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Worst drawdown</Text>
            <Text style={[styles.detailValue, { color: colors.danger }]}>-{fmtNum(lesson.mae_pct, 1)}%</Text>
          </View>
        ) : null}
        {lesson.giveback_pct != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Giveback</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.giveback_pct, 1)}pp</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.reasonText, { color: colors.textPrimary, fontStyle: "normal" }]}>{lesson.reason}</Text>
      <View style={[styles.enhancementBox, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
        <FontAwesome name="lightbulb-o" size={11} color={colors.accentPrimary} />
        <Text style={[styles.enhancementText, { color: colors.textMuted }]}>{lesson.enhancement}</Text>
      </View>
    </View>
  );
}

function DecisionLogRow({ entry }: { entry: TrendHoldDecisionLogEntry }) {
  const { colors } = useThemeStore();
  const isDark = colors.mode === "dark";
  const kpiKey = DECISION_COLOR_KEY[entry.decision] ?? "positions";
  const style = KPI_STYLES[kpiKey][isDark ? "dark" : "light"];
  return (
    <View style={[styles.row, { borderColor: colors.borderColor }]}>
      <View style={styles.rowMain}>
        <View style={styles.tradeHeaderLine}>
          <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{entry.ticker}</Text>
          <View style={[styles.sideBadge, { backgroundColor: style.bg, borderColor: style.border }]}>
            <Text style={[styles.sideBadgeText, { color: style.accent }]}>{entry.decision}</Text>
          </View>
        </View>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={2}>
          {entry.trade_date} · {entry.reason ?? "—"}
        </Text>
      </View>
      {entry.close != null ? (
        <View style={styles.rowEnd}>
          <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{formatCurrency(entry.close)}</Text>
          {entry.structural_stop != null ? (
            <Text style={[styles.rowMetaSmall, { color: colors.textMuted }]}>stop {formatCurrency(entry.structural_stop)}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function TrendHoldBookScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const isDark = colors.mode === "dark";
  const [chartWidth, setChartWidth] = useState(320);
  const onChartLayout = useCallback((e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width), []);

  const portfolioQuery = useTrendHoldBookPortfolio();
  const positionsQuery = useTrendHoldBookPositions();
  const tradesQuery = useTrendHoldBookTrades(100);
  const navHistoryQuery = useTrendHoldBookNavHistory(180);
  const decisionLogQuery = useTrendHoldDecisionLog(150, false);
  const lessonsQuery = useTrendHoldBookLessons(100);
  const lessonsSummaryQuery = useTrendHoldBookLessonsSummary();

  const isRefetching =
    portfolioQuery.isRefetching ||
    positionsQuery.isRefetching ||
    tradesQuery.isRefetching ||
    navHistoryQuery.isRefetching ||
    decisionLogQuery.isRefetching ||
    lessonsQuery.isRefetching ||
    lessonsSummaryQuery.isRefetching;

  const onRefresh = useCallback(() => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    tradesQuery.refetch();
    navHistoryQuery.refetch();
    decisionLogQuery.refetch();
    lessonsQuery.refetch();
    lessonsSummaryQuery.refetch();
  }, [portfolioQuery, positionsQuery, tradesQuery, navHistoryQuery, decisionLogQuery, lessonsQuery, lessonsSummaryQuery]);

  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data?.positions ?? [];
  const trades = tradesQuery.data?.trades ?? [];
  const navPoints = navHistoryQuery.data?.points ?? [];
  const decisionEntries = decisionLogQuery.data?.entries ?? [];
  const lessons = lessonsQuery.data?.lessons ?? [];
  const lessonsSummary = lessonsSummaryQuery.data;

  const chartData: ChartDataPoint[] = navPoints.map((p) => ({ label: p.nav_date, value: p.equity_kwd }));
  const isPositive = (portfolio?.total_return_pct ?? 0) >= 0;
  const returnStyle = KPI_STYLES[isPositive ? "returnPositive" : "returnNegative"][isDark ? "dark" : "light"];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />
      <ScrollView
        style={{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Trend-Hold Book</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
          Auto paper-trades the trend-hold engine's decisions across the full scanner universe.
        </Text>
        <SimulatedBanner />

        {portfolioQuery.isError ? (
          <InlineError message="Could not load the Trend-Hold Book portfolio. Pull to refresh to retry." />
        ) : portfolioQuery.isLoading && !portfolio ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : portfolio ? (
          <View style={styles.kpiRow}>
            <KpiCard
              label="Portfolio Value"
              value={formatCurrency(portfolio.equity_kwd)}
              subtitle={formatPercent(portfolio.total_return_pct)}
              kpiStyle={returnStyle}
              colors={colors}
            />
            <KpiCard
              label="Dummy Cash Remaining"
              value={formatCurrency(portfolio.cash_kwd)}
              subtitle={`of ${formatCurrency(portfolio.starting_capital_kwd)} starting`}
              kpiStyle={KPI_STYLES.cash[isDark ? "dark" : "light"]}
              colors={colors}
            />
            <KpiCard
              label="Open Positions"
              value={String(portfolio.open_position_count)}
              subtitle={`of 10 max slots`}
              kpiStyle={KPI_STYLES.positions[isDark ? "dark" : "light"]}
              colors={colors}
            />
          </View>
        ) : null}

        {chartData.length >= 2 ? (
          <View onLayout={onChartLayout}>
            <SectionTitle icon="line-chart" title="Equity Curve" colors={colors} />
            <SnapshotLineChart
              data={chartData}
              title="Trend-Hold Book Equity"
              colors={colors}
              lineColor={isDark ? "#a78bfa" : "#7c3aed"}
              height={220}
              width={chartWidth}
              formatValue={(v) => fmtNum(v, 0)}
            />
          </View>
        ) : null}

        <SectionTitle icon="briefcase" title="Open Positions" colors={colors} />
        {positionsQuery.isError ? (
          <InlineError message="Could not load open positions." />
        ) : positionsQuery.isLoading && positions.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : positions.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open paper positions right now.</Text>
          </View>
        ) : (
          <View style={[styles.listPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            {positions.map((p) => (
              <PositionRow key={p.ticker} position={p} />
            ))}
          </View>
        )}

        <SectionTitle icon="exchange" title="Recent Trades" colors={colors} />
        {tradesQuery.isError ? (
          <InlineError message="Could not load the trade ledger." />
        ) : tradesQuery.isLoading && trades.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : trades.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No trades recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.tradesList}>
            {trades.map((t) => (
              <TradeCard key={t.id} trade={t} />
            ))}
          </View>
        )}

        <SectionTitle icon="graduation-cap" title="Lessons Learned" colors={colors} />
        <Text style={[styles.pageSubtitle, { color: colors.textMuted, marginTop: -8 }]}>
          A rule-based autopsy of every closed trade — why it won or lost, using the actual price
          path, not a black box. This never auto-adjusts the engine; it's evidence for you to act on.
        </Text>
        {lessonsSummaryQuery.data && lessonsSummary && lessonsSummary.total_closed > 0 ? (
          <View style={styles.kpiRow}>
            <KpiCard
              label="Closed Trades"
              value={String(lessonsSummary.total_closed)}
              subtitle={`${lessonsSummary.by_outcome.WIN ?? 0}W / ${lessonsSummary.by_outcome.LOSS ?? 0}L / ${lessonsSummary.by_outcome.PARTIAL ?? 0} scale-outs`}
              kpiStyle={KPI_STYLES.positions[isDark ? "dark" : "light"]}
              colors={colors}
            />
            {lessonsSummary.avg_loss_mae_pct != null ? (
              <KpiCard
                label="Avg Loss Drawdown"
                value={`-${fmtNum(lessonsSummary.avg_loss_mae_pct, 1)}%`}
                subtitle="before the stop caught it"
                kpiStyle={KPI_STYLES.returnNegative[isDark ? "dark" : "light"]}
                colors={colors}
              />
            ) : null}
            {lessonsSummary.avg_win_giveback_pct != null ? (
              <KpiCard
                label="Avg Win Giveback"
                value={`${fmtNum(lessonsSummary.avg_win_giveback_pct, 1)}pp`}
                subtitle="given back from the peak"
                kpiStyle={KPI_STYLES.equity[isDark ? "dark" : "light"]}
                colors={colors}
              />
            ) : null}
          </View>
        ) : null}
        {lessonsQuery.isError ? (
          <InlineError message="Could not load the lessons log." />
        ) : lessonsQuery.isLoading && lessons.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : lessons.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No closed trades yet — lessons appear once a position scales out or exits.
            </Text>
          </View>
        ) : (
          <View style={styles.tradesList}>
            {lessons.map((l) => (
              <LessonCard key={`${l.ticker}-${l.trade_date}`} lesson={l} />
            ))}
          </View>
        )}

        <SectionTitle icon="history" title="Decision Log" colors={colors} />
        <Text style={[styles.pageSubtitle, { color: colors.textMuted, marginTop: -8 }]}>
          Every non-WAIT decision the trend-hold engine has made, so you can learn from what it saw —
          not just the trades the book acted on.
        </Text>
        {decisionLogQuery.isError ? (
          <InlineError message="Could not load the decision log." />
        ) : decisionLogQuery.isLoading && decisionEntries.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : decisionEntries.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No decisions logged yet.</Text>
          </View>
        ) : (
          <View style={[styles.listPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            {decisionEntries.map((e, idx) => (
              <DecisionLogRow key={`${e.ticker}-${e.trade_date}-${idx}`} entry={e} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  pageTitle: { fontSize: 24, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, lineHeight: 19 },
  simBanner: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 8, padding: 12 },
  simBannerText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "700" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { minWidth: 150, flex: 1, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  kpiLabel: { fontSize: 11, marginBottom: 6, fontWeight: "600" },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiSub: { fontSize: 11, marginTop: 4, fontWeight: "600" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },

  listPanel: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  emptyPanel: { borderWidth: 1, borderRadius: 8, padding: 14 },
  emptyText: { fontSize: 12, lineHeight: 18 },
  errorPanel: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, padding: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  rowEnd: { alignItems: "flex-end", gap: 2 },
  rowTicker: { fontSize: 14, fontWeight: "800" },
  rowMeta: { fontSize: 11, lineHeight: 15 },
  rowMetaSmall: { fontSize: 10, lineHeight: 14 },
  rowValue: { fontSize: 13, fontWeight: "700" },

  tradesList: { gap: 8 },
  tradeCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  tradeHeaderLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  sideBadgeText: { fontSize: 10, fontWeight: "800" },
  tradeDetailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tradeDetailCell: { minWidth: 88 },
  detailLabel: { fontSize: 10, fontWeight: "600" },
  detailValue: { fontSize: 13, fontWeight: "700", marginTop: 1 },
  reasonText: { fontSize: 11, lineHeight: 16, fontStyle: "italic" },
  enhancementBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  enhancementText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
