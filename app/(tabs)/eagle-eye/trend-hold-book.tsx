/* eslint-disable custom-styles/no-hardcoded-styles, max-lines */
/**
 * Paper Books screen.
 *
 * Read-only view of two independent, virtual-money paper-trading ledgers,
 * switchable via the selector at the top:
 *   - "Trend-Hold" : mechanically fills trend_hold_engine's BUY/SCALE_OUT/
 *     SELL_SIGNAL decisions (14:18 Asia/Kuwait scheduler step)
 *   - "V1 Rating"  : mechanically fills the V1 rating engine's BUY/SELL
 *     decisions (14:19 Asia/Kuwait scheduler step)
 * Both start from the same capital and use identical sizing/commission, so
 * their scorecards (shown side by side above the selector) are a fair,
 * direct comparison. No manual buy/sell controls in either -- every fill
 * was executed automatically, never by a person.
 *
 * This is SIMULATED. It is independent of the real portfolio
 * (holdings.tsx / trading.tsx) and of the unrelated eagle-eye/simulator
 * screens (a different, already-existing 3-symbol backtest system).
 */
import SnapshotLineChart, { ChartDataPoint } from "@/components/charts/SnapshotLineChart";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import type { ThemePalette } from "@/constants/theme";
import {
  useBookComparison,
  useRefreshTrendHoldBookPrices,
  useTrendHoldBookLessons,
  useTrendHoldBookLessonsSummary,
  useTrendHoldBookNavHistory,
  useTrendHoldBookPerformance,
  useTrendHoldBookPortfolio,
  useTrendHoldBookPositions,
  useTrendHoldBookTrades,
  useTrendHoldDecisionLog,
  type BookComparisonResponse,
  type PaperBookId,
  type TrendHoldBookLesson,
  type TrendHoldBookPosition,
  type TrendHoldBookTrade,
  type TrendHoldDecisionLogEntry,
} from "@/hooks/useTrendHoldBook";
import { useAdminGate } from "@/hooks/useAdminGate";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/currency";
import { exportLessonsLearnedPdf } from "@/lib/exportLessonsLearnedPdf";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, LayoutChangeEvent, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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

// ADX14-at-entry regime bands -- mirrors paper_book_store.py's _adx_bucket.
const ADX_BUCKET_ORDER = ["WEAK_LT20", "MODERATE_20_40", "STRONG_GT40"] as const;
const ADX_BUCKET_LABEL: Record<string, string> = {
  WEAK_LT20: "Weak trend (ADX < 20)",
  MODERATE_20_40: "Moderate trend (ADX 20-40)",
  STRONG_GT40: "Strong trend (ADX > 40)",
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

/** Compact stat tile -- denser than KpiCard, for the Performance scorecard grid. */
function StatTile({
  label,
  value,
  sub,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  colors: ThemePalette;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.statTileLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statTileValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      {sub ? <Text style={[styles.statTileSub, { color: colors.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}

const BOOK_LABEL: Record<PaperBookId, string> = {
  trend_hold: "Trend-Hold",
  v1_rating: "V1 Rating",
};

function BookSelector({
  selected,
  onSelect,
  colors,
}: {
  selected: PaperBookId;
  onSelect: (book: PaperBookId) => void;
  colors: ThemePalette;
}) {
  const books: PaperBookId[] = ["trend_hold", "v1_rating"];
  return (
    <View style={styles.bookSelectorRow}>
      {books.map((b) => {
        const active = b === selected;
        return (
          <Pressable
            key={b}
            onPress={() => onSelect(b)}
            style={[
              styles.bookSelectorPill,
              {
                backgroundColor: active ? colors.accentPrimary : colors.bgCard,
                borderColor: active ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <Text style={[styles.bookSelectorText, { color: active ? "#ffffff" : colors.textPrimary }]}>
              {BOOK_LABEL[b]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Compact head-to-head scorecard, always visible regardless of which book is selected below. */
function ComparisonStrip({ data, colors }: { data?: BookComparisonResponse; colors: ThemePalette }) {
  if (!data) return null;

  const rows: {
    label: string;
    sub?: string;
    format: (v: number | null | undefined) => string;
    th: number | null | undefined;
    v1: number | null | undefined;
    isPnl?: boolean;
  }[] = [
    {
      label: "Realized P&L",
      sub: "booked, closed trades only",
      format: (v) => formatSignedCurrency(v),
      th: data.trend_hold.total_realized_pnl_kwd,
      v1: data.v1_rating.total_realized_pnl_kwd,
      isPnl: true,
    },
    {
      label: "Unrealized P&L",
      sub: "open positions, marked to market",
      format: (v) => formatSignedCurrency(v),
      th: data.trend_hold_portfolio?.unrealized_pnl_kwd,
      v1: data.v1_rating_portfolio?.unrealized_pnl_kwd,
      isPnl: true,
    },
    {
      label: "Net P&L",
      sub: "realized + unrealized — true bottom line",
      format: (v) => formatSignedCurrency(v),
      th: data.trend_hold_portfolio?.net_pnl_kwd,
      v1: data.v1_rating_portfolio?.net_pnl_kwd,
      isPnl: true,
    },
    { label: "Win Rate", format: (v) => (v != null ? `${fmtNum(v, 0)}%` : "—"), th: data.trend_hold.win_rate_pct, v1: data.v1_rating.win_rate_pct },
    { label: "Profit Factor", format: (v) => (v != null ? fmtNum(v, 2) : "—"), th: data.trend_hold.profit_factor, v1: data.v1_rating.profit_factor },
  ];

  return (
    <View style={[styles.compareCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.compareTitle, { color: colors.textPrimary }]}>Head-to-Head</Text>
      <View style={styles.compareHeaderRow}>
        <View style={styles.compareLabelCol} />
        <Text style={[styles.compareColHeader, { color: colors.textMuted }]}>Trend-Hold</Text>
        <Text style={[styles.compareColHeader, { color: colors.textMuted }]}>V1 Rating</Text>
      </View>
      {rows.map((row) => {
        const thWins = row.th != null && row.v1 != null && row.th > row.v1;
        const v1Wins = row.th != null && row.v1 != null && row.v1 > row.th;
        // P&L rows: color always reflects the number's own sign (red = loss,
        // green = gain), independent of which book is ahead -- a smaller
        // gain must never read the same red as an outright loss. Win
        // Rate/Profit Factor aren't signed, so those keep the "winner is
        // green" comparison-only coloring. Either way, the winner is bold.
        const thColor = row.isPnl ? (row.th != null && row.th < 0 ? colors.danger : colors.success) : thWins ? colors.success : colors.textPrimary;
        const v1Color = row.isPnl ? (row.v1 != null && row.v1 < 0 ? colors.danger : colors.success) : v1Wins ? colors.success : colors.textPrimary;
        return (
          <View key={row.label} style={styles.compareRow}>
            <View style={styles.compareLabelCol}>
              <Text style={[styles.compareLabelText, { color: colors.textMuted }]}>{row.label}</Text>
              {row.sub ? <Text style={[styles.compareLabelSub, { color: colors.textMuted }]}>{row.sub}</Text> : null}
            </View>
            <Text style={[styles.compareColValue, { color: thColor, fontWeight: thWins ? "800" : "600" }]}>
              {row.format(row.th)}
            </Text>
            <Text style={[styles.compareColValue, { color: v1Color, fontWeight: v1Wins ? "800" : "600" }]}>
              {row.format(row.v1)}
            </Text>
          </View>
        );
      })}
      <Text style={[styles.compareCaption, { color: colors.textMuted }]}>
        {data.trend_hold.total_closed} closed trades (Trend-Hold) vs {data.v1_rating.total_closed} (V1 Rating) —
        highlighted = currently ahead on that metric.
      </Text>
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

/** Manual "Fetch Price" trigger for the Trend-Hold Book's open positions -- see useRefreshTrendHoldBookPrices. */
function FetchPriceButton({ onPress, pending, colors }: { onPress: () => void; pending: boolean; colors: ThemePalette }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={[
        styles.fetchPriceButton,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor, opacity: pending ? 0.6 : 1 },
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={colors.accentPrimary} />
      ) : (
        <FontAwesome name="refresh" size={12} color={colors.accentPrimary} />
      )}
      <Text style={[styles.fetchPriceText, { color: colors.accentPrimary }]}>Fetch Price</Text>
    </Pressable>
  );
}

/** Save/share the Lessons Learned log as a PDF -- see lib/exportLessonsLearnedPdf.ts. */
function ExportLessonsButton({
  onPress,
  pending,
  disabled,
  colors,
}: {
  onPress: () => void;
  pending: boolean;
  disabled: boolean;
  colors: ThemePalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending || disabled}
      style={[
        styles.fetchPriceButton,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor, opacity: pending || disabled ? 0.5 : 1 },
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color={colors.accentPrimary} />
      ) : (
        <FontAwesome name="file-pdf-o" size={12} color={colors.accentPrimary} />
      )}
      <Text style={[styles.fetchPriceText, { color: colors.accentPrimary }]}>
        {pending ? "Preparing…" : "Export PDF"}
      </Text>
    </Pressable>
  );
}

function PositionRow({ position }: { position: TrendHoldBookPosition }) {
  const { colors } = useThemeStore();
  const pnl = position.unrealized_pnl_kwd;
  const pnlColor = pnl == null ? colors.textMuted : pnl >= 0 ? colors.success : colors.danger;
  const hasEntryCtx = position.entry_path != null || position.entry_confidence != null;
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
        {hasEntryCtx ? (
          <Text style={[styles.rowMetaSmall, { color: colors.accentPrimary }]}>
            {position.entry_path === "DONCHIAN" ? "Donchian breakout" : position.entry_path === "EMA_CROSS" ? "EMA10/30 cross" : ""}
            {position.entry_confidence != null ? `  ·  confidence ${fmtNum(position.entry_confidence, 0)}/100` : ""}
          </Text>
        ) : null}
        {position.structural_stop != null ? (
          <Text style={[styles.rowMetaSmall, { color: colors.textMuted }]}>
            Current stop {fmtNum(position.structural_stop, 3)} (no fixed target price)
          </Text>
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
        {trade.confidence != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
              {trade.side === "BUY" ? "Buy Confidence" : "Sell Confidence"}
            </Text>
            <Text style={[styles.detailValue, { color: sideStyle.accent }]}>{fmtNum(trade.confidence, 0)}/100</Text>
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

      {lesson.entry_price != null || lesson.exit_price != null || lesson.quantity != null ? (
        <View style={styles.tradeDetailGrid}>
          {lesson.entry_price != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Bought</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.entry_price, 3)}</Text>
            </View>
          ) : null}
          {lesson.exit_price != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Sold</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.exit_price, 3)}</Text>
            </View>
          ) : null}
          {lesson.quantity != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Qty</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.quantity, 2)}</Text>
            </View>
          ) : null}
          {lesson.realized_pnl_kwd != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Realized P&L</Text>
              <Text style={[styles.detailValue, { color: lesson.realized_pnl_kwd >= 0 ? colors.success : colors.danger }]}>
                {lesson.realized_pnl_kwd >= 0 ? "+" : ""}{fmtNum(lesson.realized_pnl_kwd, 3)} KWD
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

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
        {lesson.pct_left_on_table != null ? (
          <View style={styles.tradeDetailCell}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Profit left on table</Text>
            <Text
              style={[
                styles.detailValue,
                { color: lesson.pct_left_on_table > 0.5 ? colors.success : colors.textMuted },
              ]}
            >
              {lesson.pct_left_on_table > 0.5 ? `+${fmtNum(lesson.pct_left_on_table, 1)}pp` : "none — efficient"}
            </Text>
          </View>
        ) : null}
      </View>

      {lesson.entry_path || lesson.entry_confidence != null || lesson.breakout_margin_pct != null ? (
        <View style={styles.tradeDetailGrid}>
          {lesson.entry_path ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Entry path</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {lesson.entry_path === "DONCHIAN" ? "Donchian breakout" : "EMA10/30 cross"}
              </Text>
            </View>
          ) : null}
          {lesson.entry_confidence != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Entry confidence</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.entry_confidence, 0)}/100</Text>
            </View>
          ) : null}
          {lesson.breakout_margin_pct != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Breakout margin</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>+{fmtNum(lesson.breakout_margin_pct, 1)}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {lesson.rel_volume_entry != null || lesson.cmf10_entry != null || lesson.adx14_entry != null || lesson.sma200_slope_entry != null ? (
        <View style={styles.tradeDetailGrid}>
          {lesson.rel_volume_entry != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Rel-volume (floor 0.80)</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.rel_volume_entry, 2)}</Text>
            </View>
          ) : null}
          {lesson.cmf10_entry != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>CMF10 (floor -0.05)</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.cmf10_entry, 3)}</Text>
            </View>
          ) : null}
          {lesson.adx14_entry != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>ADX14 (regime, not a gate)</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.adx14_entry, 1)}</Text>
            </View>
          ) : null}
          {lesson.sma200_slope_entry != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>SMA200 slope</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{lesson.sma200_slope_entry >= 0 ? "up" : "down"}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {lesson.structural_stop_at_exit != null || lesson.atr14_exit != null || lesson.adx14_exit != null ? (
        <View style={styles.tradeDetailGrid}>
          {lesson.structural_stop_at_exit != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Sell trigger: stop level</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.structural_stop_at_exit, 3)}</Text>
            </View>
          ) : null}
          {lesson.atr14_exit != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>ATR14 at exit</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.atr14_exit, 3)}</Text>
            </View>
          ) : null}
          {lesson.adx14_exit != null ? (
            <View style={styles.tradeDetailCell}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>ADX14 at exit</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{fmtNum(lesson.adx14_exit, 1)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {lesson.forward_1w_available || lesson.forward_sessions_available != null ? (
        <Text style={[styles.rowMetaSmall, { color: colors.textMuted, marginTop: 4 }]}>
          {lesson.forward_1w_available
            ? `Forward-look — 1wk after exit: ${formatPercent(lesson.forward_1w_return_pct ?? 0)}` +
              (lesson.forward_peak_20d_pct != null ? `  ·  best of next ~20 sessions: ${formatPercent(lesson.forward_peak_20d_pct)}` : "")
            : `Forward-look — pending (${lesson.forward_sessions_available ?? 0}/5 sessions elapsed since exit)`}
        </Text>
      ) : null}

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
          {entry.confidence != null ? (
            <Text style={[styles.rowMetaSmall, { color: style.accent, fontWeight: "700" }]}>{fmtNum(entry.confidence, 0)}/100</Text>
          ) : null}
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

// Admin-only: the tab bar (EagleEyeTopTabs) already hides this screen's tab
// for non-admins, but a stale link/direct navigation could still reach the
// route -- this is the same defense-in-depth gate app/(tabs)/admin.tsx uses.
export default function TrendHoldBookScreen() {
  const { isAdmin, isLoading: isAdminGateLoading } = useAdminGate();

  if (isAdminGateLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#888", fontSize: 16 }}>Admin access required.</Text>
      </View>
    );
  }
  return <TrendHoldBookScreenContent />;
}

function TrendHoldBookScreenContent() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const isDark = colors.mode === "dark";
  const [chartWidth, setChartWidth] = useState(320);
  const onChartLayout = useCallback((e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width), []);
  const [selectedBook, setSelectedBook] = useState<PaperBookId>("trend_hold");

  const comparisonQuery = useBookComparison();
  const portfolioQuery = useTrendHoldBookPortfolio(selectedBook);
  const positionsQuery = useTrendHoldBookPositions(selectedBook);
  const tradesQuery = useTrendHoldBookTrades(100, selectedBook);
  const navHistoryQuery = useTrendHoldBookNavHistory(180, selectedBook);
  const decisionLogQuery = useTrendHoldDecisionLog(150, false, selectedBook === "trend_hold");
  const lessonsQuery = useTrendHoldBookLessons(100, selectedBook);
  const lessonsSummaryQuery = useTrendHoldBookLessonsSummary(selectedBook);
  const performanceQuery = useTrendHoldBookPerformance(selectedBook);
  const refreshPricesMutation = useRefreshTrendHoldBookPrices();
  const [exportingLessons, setExportingLessons] = useState(false);

  const isRefetching =
    comparisonQuery.isRefetching ||
    portfolioQuery.isRefetching ||
    positionsQuery.isRefetching ||
    tradesQuery.isRefetching ||
    navHistoryQuery.isRefetching ||
    decisionLogQuery.isRefetching ||
    lessonsQuery.isRefetching ||
    lessonsSummaryQuery.isRefetching ||
    performanceQuery.isRefetching;

  const onRefresh = useCallback(() => {
    comparisonQuery.refetch();
    portfolioQuery.refetch();
    positionsQuery.refetch();
    tradesQuery.refetch();
    navHistoryQuery.refetch();
    decisionLogQuery.refetch();
    lessonsQuery.refetch();
    lessonsSummaryQuery.refetch();
    performanceQuery.refetch();
  }, [
    comparisonQuery, portfolioQuery, positionsQuery, tradesQuery, navHistoryQuery, decisionLogQuery,
    lessonsQuery, lessonsSummaryQuery, performanceQuery,
  ]);

  const handleExportLessons = useCallback(async () => {
    if (exportingLessons) return;
    setExportingLessons(true);
    try {
      await exportLessonsLearnedPdf({
        bookLabel: BOOK_LABEL[selectedBook],
        lessons: lessonsQuery.data?.lessons ?? [],
        summary: lessonsSummaryQuery.data,
        positions: positionsQuery.data?.positions ?? [],
      });
    } catch (error) {
      console.error("Failed to export lessons learned report", error);
      Alert.alert("Export failed", "Could not generate the Lessons Learned report.");
    } finally {
      setExportingLessons(false);
    }
  }, [exportingLessons, selectedBook, lessonsQuery.data, lessonsSummaryQuery.data, positionsQuery.data]);

  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data?.positions ?? [];
  const trades = tradesQuery.data?.trades ?? [];
  // "Closed" = any trade that realized P&L -- SCALE_OUT and EXIT, never BUY.
  // Same definition the backend's performance scorecard already uses
  // (ee_trend_hold_book_trades.realized_pnl_kwd IS NOT NULL).
  const closedTrades = trades.filter((t) => t.realized_pnl_kwd != null);
  const navPoints = navHistoryQuery.data?.points ?? [];
  const decisionEntries = decisionLogQuery.data?.entries ?? [];
  const lessons = lessonsQuery.data?.lessons ?? [];
  const lessonsSummary = lessonsSummaryQuery.data;
  const performance = performanceQuery.data;

  const chartData: ChartDataPoint[] = navPoints.map((p) => ({ label: p.nav_date, value: p.equity_kwd }));
  const isPositive = (portfolio?.total_return_pct ?? 0) >= 0;
  const returnStyle = KPI_STYLES[isPositive ? "returnPositive" : "returnNegative"][isDark ? "dark" : "light"];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs
        rightSlot={
          selectedBook === "trend_hold" ? (
            <FetchPriceButton
              onPress={() => refreshPricesMutation.mutate()}
              pending={refreshPricesMutation.isPending}
              colors={colors}
            />
          ) : undefined
        }
      />
      <ScrollView
        style={{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Paper Books</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
          Two independent auto paper-traders, run side by side so you can see which strategy actually performs better.
        </Text>
        <SimulatedBanner />

        {comparisonQuery.isError ? (
          <InlineError message="Could not load the head-to-head comparison." />
        ) : (
          <ComparisonStrip data={comparisonQuery.data} colors={colors} />
        )}

        <BookSelector selected={selectedBook} onSelect={setSelectedBook} colors={colors} />

        {portfolioQuery.isError ? (
          <InlineError message={`Could not load the ${BOOK_LABEL[selectedBook]} Book portfolio. Pull to refresh to retry.`} />
        ) : portfolioQuery.isLoading && !portfolio ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : portfolio ? (
          <View style={styles.kpiRow}>
            <KpiCard
              label={`${BOOK_LABEL[selectedBook]} Value`}
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

        {portfolio ? (
          <View>
            <SectionTitle icon="balance-scale" title="P&L Breakdown" colors={colors} />
            <View style={styles.statGrid}>
              <StatTile
                label="Realized P&L"
                sub="booked, closed trades only"
                value={formatSignedCurrency(portfolio.realized_pnl_kwd)}
                valueColor={portfolio.realized_pnl_kwd >= 0 ? colors.success : colors.danger}
                colors={colors}
              />
              <StatTile
                label="Unrealized P&L"
                sub="open positions, marked to market"
                value={formatSignedCurrency(portfolio.unrealized_pnl_kwd)}
                valueColor={portfolio.unrealized_pnl_kwd >= 0 ? colors.success : colors.danger}
                colors={colors}
              />
              <StatTile
                label="Net P&L"
                sub="realized + unrealized — true bottom line"
                value={formatSignedCurrency(portfolio.net_pnl_kwd)}
                valueColor={portfolio.net_pnl_kwd >= 0 ? colors.success : colors.danger}
                colors={colors}
              />
            </View>
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

        <SectionTitle icon="bar-chart" title="Performance" colors={colors} />
        {performanceQuery.isError ? (
          <InlineError message="Could not load performance stats." />
        ) : performanceQuery.isLoading && !performance ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : performance && performance.total_closed > 0 ? (
          <View style={styles.statGrid}>
            <StatTile
              label="Record (W-L)"
              value={`${performance.win_count}-${performance.loss_count}`}
              colors={colors}
            />
            <StatTile
              label="Win Rate"
              value={performance.win_rate_pct != null ? `${fmtNum(performance.win_rate_pct, 0)}%` : "—"}
              colors={colors}
            />
            <StatTile
              label="Realized P&L"
              value={formatSignedCurrency(performance.total_realized_pnl_kwd)}
              valueColor={performance.total_realized_pnl_kwd >= 0 ? colors.success : colors.danger}
              colors={colors}
            />
            <StatTile
              label="Max Profit"
              value={performance.max_profit_kwd != null ? formatSignedCurrency(performance.max_profit_kwd) : "—"}
              valueColor={colors.success}
              colors={colors}
            />
            <StatTile
              label="Max Loss"
              value={performance.max_loss_kwd != null ? formatSignedCurrency(performance.max_loss_kwd) : "—"}
              valueColor={colors.danger}
              colors={colors}
            />
            <StatTile
              label="Avg Win"
              value={performance.avg_win_kwd != null ? formatSignedCurrency(performance.avg_win_kwd) : "—"}
              valueColor={colors.success}
              colors={colors}
            />
            <StatTile
              label="Avg Loss"
              value={performance.avg_loss_kwd != null ? formatSignedCurrency(performance.avg_loss_kwd) : "—"}
              valueColor={colors.danger}
              colors={colors}
            />
            <StatTile
              label="Profit Factor"
              value={performance.profit_factor != null ? fmtNum(performance.profit_factor, 2) : "—"}
              colors={colors}
            />
            <StatTile
              label="Expectancy / Trade"
              value={performance.expectancy_kwd != null ? formatSignedCurrency(performance.expectancy_kwd) : "—"}
              valueColor={
                performance.expectancy_kwd != null
                  ? performance.expectancy_kwd >= 0
                    ? colors.success
                    : colors.danger
                  : undefined
              }
              colors={colors}
            />
            <StatTile
              label="Commission Paid"
              value={formatCurrency(performance.total_commission_paid_kwd)}
              colors={colors}
            />
          </View>
        ) : (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No closed trades yet — performance stats appear once a position exits.
            </Text>
          </View>
        )}

        <SectionTitle icon="check-circle" title="Closed Trades" colors={colors} />
        {tradesQuery.isError ? (
          <InlineError message="Could not load closed trades." />
        ) : tradesQuery.isLoading && closedTrades.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : closedTrades.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No closed trades yet — this fills in once a position scales out or exits.
            </Text>
          </View>
        ) : (
          <View style={styles.tradesList}>
            {closedTrades.map((t) => (
              <TradeCard key={t.id} trade={t} />
            ))}
          </View>
        )}

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

        <View style={styles.sectionHeaderRow}>
          <SectionTitle icon="graduation-cap" title="Lessons Learned" colors={colors} />
          <ExportLessonsButton
            onPress={handleExportLessons}
            pending={exportingLessons}
            disabled={lessons.length === 0}
            colors={colors}
          />
        </View>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted, marginTop: -8 }]}>
          A rule-based autopsy of every closed trade, focused on maximizing profit and win rate —
          using the actual price path, not a black box. This never auto-adjusts the engine; it's
          evidence for you to act on.
        </Text>
        <View style={[styles.enhancementBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, alignItems: "flex-start" }]}>
          <FontAwesome name="info-circle" size={11} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={[styles.enhancementText, { color: colors.textMuted }]}>
            <Text style={{ fontWeight: "700" }}>No fixed take-profit target</Text> is set at entry — this system
            exits only via the chandelier trailing stop (3.5×ATR14 off the post-entry high) or the automatic +20%
            profit-milestone scale-out. The stop level shown per trade is what actually governed the exit, not a
            target.{"\n\n"}
            <Text style={{ fontWeight: "700" }}>Indicator lag:</Text> EMA10/30/50, the Donchian-40 ceiling, ATR14,
            CMF10, OBV-slope40, and SMA200-slope are all lagging (built from trailing price/volume history — they
            confirm a move already in progress, never predict one). Relative-volume(20d) is same-session. ADX14 is
            regime context only, not a gate — like RSI14, it does not fire or block any decision today.
          </Text>
        </View>
        {lessonsSummaryQuery.data && lessonsSummary && lessonsSummary.total_closed > 0 ? (
          <View style={styles.kpiRow}>
            <KpiCard
              label="Closed Trades"
              value={String(lessonsSummary.total_closed)}
              subtitle={`${lessonsSummary.by_outcome.WIN ?? 0}W / ${lessonsSummary.by_outcome.LOSS ?? 0}L / ${lessonsSummary.by_outcome.PARTIAL ?? 0} scale-outs`}
              kpiStyle={KPI_STYLES.positions[isDark ? "dark" : "light"]}
              colors={colors}
            />
            {lessonsSummary.avg_pct_left_on_table != null ? (
              <KpiCard
                label="Profit Left on Table"
                value={`${fmtNum(lessonsSummary.avg_pct_left_on_table, 1)}pp`}
                subtitle={`avg, tested on wins/scale-outs — ${lessonsSummary.trades_with_room_to_improve ?? 0} had room`}
                kpiStyle={KPI_STYLES.equity[isDark ? "dark" : "light"]}
                colors={colors}
              />
            ) : null}
            {lessonsSummary.avg_entry_confidence_win != null || lessonsSummary.avg_entry_confidence_loss != null ? (
              <KpiCard
                label="Entry Confidence"
                value={`${lessonsSummary.avg_entry_confidence_win != null ? fmtNum(lessonsSummary.avg_entry_confidence_win, 0) : "—"} vs ${lessonsSummary.avg_entry_confidence_loss != null ? fmtNum(lessonsSummary.avg_entry_confidence_loss, 0) : "—"}`}
                subtitle="avg score: wins vs losses"
                kpiStyle={KPI_STYLES.cash[isDark ? "dark" : "light"]}
                colors={colors}
              />
            ) : null}
            {lessonsSummary.avg_loss_mae_pct != null ? (
              <KpiCard
                label="Avg Loss Drawdown"
                value={`-${fmtNum(lessonsSummary.avg_loss_mae_pct, 1)}%`}
                subtitle="before the stop caught it"
                kpiStyle={KPI_STYLES.returnNegative[isDark ? "dark" : "light"]}
                colors={colors}
              />
            ) : null}
          </View>
        ) : null}
        {lessonsSummary && lessonsSummary.by_entry_path && Object.keys(lessonsSummary.by_entry_path).length > 0 ? (
          <View style={[styles.listPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, padding: 12, gap: 8 }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
              By entry path — is one mechanism carrying the other?
            </Text>
            {Object.entries(lessonsSummary.by_entry_path).map(([path, stats]) => (
              <View key={path} style={styles.tradeHeaderLine}>
                <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>
                  {path === "DONCHIAN" ? "Donchian breakout" : "EMA10/30 cross"}
                </Text>
                <Text style={[styles.rowMetaSmall, { color: colors.textMuted, marginLeft: "auto" }]}>
                  {stats.wins}W / {stats.losses}L
                  {stats.win_rate_pct != null ? ` · ${fmtNum(stats.win_rate_pct, 0)}% win rate` : " · not enough data yet"}
                  {" "}({stats.closed} closed)
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {lessonsSummary && lessonsSummary.by_adx_bucket && Object.keys(lessonsSummary.by_adx_bucket).length > 0 ? (
          <View style={[styles.listPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, padding: 12, gap: 8 }]}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
              By trend strength at entry — does this only work in a strong trend?
            </Text>
            {ADX_BUCKET_ORDER.filter((key) => lessonsSummary.by_adx_bucket?.[key]).map((key) => {
              const stats = lessonsSummary.by_adx_bucket![key];
              return (
                <View key={key} style={styles.tradeHeaderLine}>
                  <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{ADX_BUCKET_LABEL[key]}</Text>
                  <Text style={[styles.rowMetaSmall, { color: colors.textMuted, marginLeft: "auto" }]}>
                    {stats.wins}W / {stats.losses}L
                    {stats.win_rate_pct != null ? ` · ${fmtNum(stats.win_rate_pct, 0)}% win rate` : " · not enough data yet"}
                    {" "}({stats.closed} closed)
                  </Text>
                </View>
              );
            })}
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

        {selectedBook === "trend_hold" ? (
          <>
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
          </>
        ) : (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No decision log for V1 Rating yet — only its executed trades (above) and lessons are tracked so far.
            </Text>
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

  bookSelectorRow: { flexDirection: "row", gap: 8 },
  bookSelectorPill: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  bookSelectorText: { fontSize: 13, fontWeight: "800" },

  compareCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  compareTitle: { fontSize: 14, fontWeight: "800" },
  compareHeaderRow: { flexDirection: "row", alignItems: "center" },
  compareLabelCol: { flex: 1.2 },
  compareColHeader: { flex: 1, fontSize: 11, fontWeight: "700", textAlign: "right" },
  compareRow: { flexDirection: "row", alignItems: "center" },
  compareLabelText: { fontSize: 12, fontWeight: "600" },
  compareLabelSub: { fontSize: 9, lineHeight: 12, marginTop: 1 },
  compareColValue: { flex: 1, fontSize: 14, textAlign: "right" },
  compareCaption: { fontSize: 10, lineHeight: 14, marginTop: 4 },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { minWidth: 150, flex: 1, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  kpiLabel: { fontSize: 11, marginBottom: 6, fontWeight: "600" },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiSub: { fontSize: 11, marginTop: 4, fontWeight: "600" },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: { minWidth: 100, flexGrow: 1, flexBasis: "30%", paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  statTileLabel: { fontSize: 10, fontWeight: "600", marginBottom: 3 },
  statTileValue: { fontSize: 14, fontWeight: "800" },
  statTileSub: { fontSize: 9, lineHeight: 12, marginTop: 2 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  fetchPriceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  fetchPriceText: { fontSize: 11, fontWeight: "700" },

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
