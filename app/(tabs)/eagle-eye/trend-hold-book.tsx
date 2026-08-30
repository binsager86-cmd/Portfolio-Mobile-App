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
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import {
  useTrendHoldBookPortfolio,
  useTrendHoldBookPositions,
  useTrendHoldBookTrades,
  type TrendHoldBookPosition,
  type TrendHoldBookTrade,
} from "@/hooks/useTrendHoldBook";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import React, { useCallback } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatKwd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-KW", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function SimulatedBanner() {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.simBanner, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
      <Text style={[styles.simBannerText, { color: colors.warning }]}>
        SIMULATED — virtual money only. No real trades are executed. Every fill below was placed
        automatically by the trend-hold engine's daily scan; there is no manual buy/sell here.
      </Text>
    </View>
  );
}

function PortfolioSummaryCard() {
  const { colors } = useThemeStore();
  const { data, isLoading } = useTrendHoldBookPortfolio();

  if (isLoading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }
  if (!data) return null;

  const isPositive = data.total_return_pct >= 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.equityText, { color: colors.textPrimary }]}>{formatKwd(data.equity_kwd)} KWD</Text>
      <Text style={[styles.changeText, { color: isPositive ? colors.success : colors.danger }]}>
        {formatPct(data.total_return_pct)} since inception
      </Text>
      <View style={styles.summaryRow}>
        <View>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Cash</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{formatKwd(data.cash_kwd)} KWD</Text>
        </View>
        <View>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Starting capital</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{formatKwd(data.starting_capital_kwd)} KWD</Text>
        </View>
        <View>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Open positions</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{data.open_position_count}</Text>
        </View>
      </View>
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
          {position.quantity.toFixed(2)} sh @ {position.avg_cost.toFixed(3)}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{formatKwd(position.market_value_kwd)}</Text>
        <Text style={[styles.rowMeta, { color: pnlColor }]}>{formatKwd(pnl)}</Text>
      </View>
    </View>
  );
}

function TradeRow({ trade }: { trade: TrendHoldBookTrade }) {
  const { colors } = useThemeStore();
  const sideColor =
    trade.side === "BUY" ? colors.accentPrimary : trade.side === "SCALE_OUT" ? colors.warning : colors.danger;
  const pnl = trade.realized_pnl_kwd;
  const pnlColor = pnl == null ? colors.textMuted : pnl >= 0 ? colors.success : colors.danger;
  return (
    <View style={[styles.row, { borderColor: colors.borderColor }]}>
      <View style={styles.rowMain}>
        <View style={styles.tradeHeaderLine}>
          <Text style={[styles.rowTicker, { color: colors.textPrimary }]}>{trade.ticker}</Text>
          <Text style={[styles.sideBadge, { color: sideColor, borderColor: sideColor }]}>{trade.side}</Text>
        </View>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={2}>
          {trade.trade_date} · {trade.quantity.toFixed(2)} sh @ {trade.price.toFixed(3)} · {trade.reason ?? ""}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{formatKwd(trade.gross_kwd)}</Text>
        {pnl != null ? <Text style={[styles.rowMeta, { color: pnlColor }]}>{formatKwd(pnl)}</Text> : null}
      </View>
    </View>
  );
}

export default function TrendHoldBookScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();

  const portfolioQuery = useTrendHoldBookPortfolio();
  const positionsQuery = useTrendHoldBookPositions();
  const tradesQuery = useTrendHoldBookTrades(100);

  const isRefetching = portfolioQuery.isRefetching || positionsQuery.isRefetching || tradesQuery.isRefetching;
  const onRefresh = useCallback(() => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    tradesQuery.refetch();
  }, [portfolioQuery, positionsQuery, tradesQuery]);

  const positions = positionsQuery.data?.positions ?? [];
  const trades = tradesQuery.data?.trades ?? [];

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

        <PortfolioSummaryCard />

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Open positions</Text>
        {positionsQuery.isLoading && positions.length === 0 ? (
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

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent trades</Text>
        {tradesQuery.isLoading && trades.length === 0 ? (
          <ActivityIndicator color={colors.accentPrimary} />
        ) : trades.length === 0 ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No trades recorded yet.</Text>
          </View>
        ) : (
          <View style={[styles.listPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            {trades.map((t) => (
              <TradeRow key={t.id} trade={t} />
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
  simBanner: { borderWidth: 1, borderRadius: 8, padding: 12 },
  simBannerText: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  equityText: { fontSize: 28, fontWeight: "800" },
  changeText: { fontSize: 13, fontWeight: "700" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  metaLabel: { fontSize: 11, fontWeight: "600" },
  metaValue: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  listPanel: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  emptyPanel: { borderWidth: 1, borderRadius: 8, padding: 14 },
  emptyText: { fontSize: 12, lineHeight: 18 },
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
  rowValue: { fontSize: 13, fontWeight: "700" },
  tradeHeaderLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideBadge: {
    fontSize: 10,
    fontWeight: "800",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
