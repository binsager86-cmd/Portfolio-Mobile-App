import { DateInput } from "@/components/form/DateInput";
import { ResponsiveGrid } from "@/components/ui/ResponsiveGrid";
import { useResponsive } from "@/hooks/useResponsive";
import { exportRealizedTransactionsReport } from "@/lib/exportRealizedTransactionsReport";
import { fmtNum, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/currency";
import type { RealizedProfitData, RealizedProfitDetail, TradingSummary } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type SummaryTab = "capitalFlow" | "realizedTransactions";

type RealizedSortKey = "symbol" | "txn_date" | "purchaseValueKwd" | "shares" | "realized_pnl_kwd" | "dividendsKwd" | "netPnlKwd" | "pnlPct";
type RealizedSortDirection = "asc" | "desc";
type RealizedTransactionRow = RealizedProfitDetail & {
  purchaseValueKwd: number;
  dividendsKwd: number;
  netPnlKwd: number;
  pnlPct: number | null;
};

function compareSortValues(left: number | string | null, right: number | string | null, direction: RealizedSortDirection): number {
  const dir = direction === "asc" ? 1 : -1;
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
  return String(left).localeCompare(String(right)) * dir;
}

function sortRealizedTransactions(
  rows: RealizedTransactionRow[],
  key: RealizedSortKey,
  direction: RealizedSortDirection,
): RealizedTransactionRow[] {
  return [...rows].sort((left, right) => {
    switch (key) {
      case "symbol":
        return compareSortValues(left.symbol, right.symbol, direction);
      case "txn_date":
        return compareSortValues(left.txn_date, right.txn_date, direction);
      case "purchaseValueKwd":
        return compareSortValues(left.purchaseValueKwd, right.purchaseValueKwd, direction);
      case "shares":
        return compareSortValues(left.shares, right.shares, direction);
      case "realized_pnl_kwd":
        return compareSortValues(left.realized_pnl_kwd, right.realized_pnl_kwd, direction);
      case "dividendsKwd":
        return compareSortValues(left.dividendsKwd, right.dividendsKwd, direction);
      case "netPnlKwd":
        return compareSortValues(left.netPnlKwd, right.netPnlKwd, direction);
      case "pnlPct":
        return compareSortValues(left.pnlPct, right.pnlPct, direction);
      default:
        return 0;
    }
  });
}

export function TradingSummaryCards({
  summary,
  dateFrom,
  dateTo,
  realizedData,
  activeTab,
  onTabChange,
}: {
  summary: TradingSummary;
  dateFrom?: string;
  dateTo?: string;
  realizedData?: RealizedProfitData | null;
  activeTab: SummaryTab;
  onTabChange: (tab: SummaryTab) => void;
}) {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();
  const { t } = useTranslation();
  const [symbolFilter, setSymbolFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [sortKey, setSortKey] = useState<RealizedSortKey>("txn_date");
  const [sortDirection, setSortDirection] = useState<RealizedSortDirection>("desc");

  const hasDateFilter = !!(dateFrom || dateTo);
  const periodLabel = hasDateFilter
    ? `${dateFrom || t("trading.inception")} → ${dateTo || t("trading.today")}`
    : t("trading.sinceInception");
  const realizedTransactions = useMemo(() => {
      const normalizedSymbol = symbolFilter.trim().toLowerCase();
      const normalizedFrom = fromFilter.trim();
      const normalizedTo = toFilter.trim();

      const filteredRows: RealizedTransactionRow[] = [...(realizedData?.details ?? [])]
        .map((trade) => {
          const purchaseValueKwd = (trade.avg_cost_at_txn ?? 0) * (trade.shares ?? 0);
          const dividendsKwd = trade.dividends_allocated_kwd ?? 0;
          const netPnlKwd = trade.net_pnl_kwd ?? (trade.realized_pnl_kwd + dividendsKwd);

          return {
            ...trade,
            purchaseValueKwd,
            dividendsKwd,
            netPnlKwd,
            pnlPct: purchaseValueKwd ? (netPnlKwd / purchaseValueKwd) * 100 : null,
          };
        })
        .filter((trade) => {
          const matchesSymbol = !normalizedSymbol || trade.symbol.toLowerCase().includes(normalizedSymbol);
          const matchesFrom = !normalizedFrom || trade.txn_date >= normalizedFrom;
          const matchesTo = !normalizedTo || trade.txn_date <= normalizedTo;
          return matchesSymbol && matchesFrom && matchesTo;
        });

      return sortRealizedTransactions(filteredRows, sortKey, sortDirection);
    },
    [fromFilter, realizedData?.details, sortDirection, sortKey, symbolFilter, toFilter],
  );
  const visibleTradeStats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const trade of realizedTransactions) {
      if (trade.netPnlKwd > 0) wins += 1;
      else if (trade.netPnlKwd < 0) losses += 1;
    }
    const decidedTrades = wins + losses;
    return {
      wins,
      losses,
      winRate: decidedTrades ? (wins / decidedTrades) * 100 : 0,
    };
  }, [realizedTransactions]);

  const Card = ({
    icon,
    iconColor,
    label,
    value,
    sub,
    valueColor,
    borderAccent,
    testID,
    valueTestID,
  }: {
    icon: React.ComponentProps<typeof FontAwesome>["name"];
    iconColor: string;
    label: string;
    value: string;
    sub?: string;
    valueColor?: string;
    borderAccent?: string;
    testID?: string;
    valueTestID?: string;
  }) => (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: borderAccent || colors.borderColor,
          borderLeftWidth: borderAccent ? 3 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: iconColor + "18" }]}>
          <FontAwesome name={icon} size={isPhone ? 14 : 16} color={iconColor} />
        </View>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        testID={valueTestID}
        style={[
          styles.cardValue,
          {
            color: valueColor || colors.textPrimary,
            fontSize: isPhone ? 17 : 19,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>{sub}</Text>
      ) : null}
    </View>
  );

  const OutcomeCard = ({
    wins,
    losses,
    winRate,
  }: {
    wins: number;
    losses: number;
    winRate: number;
  }) => (
    <View
      testID="realized-outcome-card"
      style={[
        styles.card,
        styles.outcomeCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: colors.accentPrimary,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accentPrimary + "18" }]}>
          <FontAwesome name="bullseye" size={isPhone ? 14 : 16} color={colors.accentPrimary} />
        </View>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {t("realizedTrades.winRate", "Win Rate")}
        </Text>
      </View>

      <View style={styles.outcomeContentRow}>
        <View style={styles.outcomeRateBlock}>
          <Text testID="realized-outcome-rate" style={[styles.outcomeRateValue, { color: colors.textPrimary }]}>
            {formatPercent(winRate)}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {t("realizedTrades.filteredResults", "Based on visible results")}
          </Text>
        </View>

        <View style={styles.outcomeStatsColumn}>
          <View style={styles.outcomeStatRow}>
            <FontAwesome name="arrow-up" size={11} color={colors.success} />
            <Text testID="realized-outcome-wins" style={[styles.outcomeStatValue, { color: colors.success }]}>
              {fmtNum(wins, 0)}
            </Text>
            <Text style={[styles.outcomeStatLabel, { color: colors.success }]}>
              {t("realizedTrades.wins", "Wins")}
            </Text>
          </View>

          <View style={styles.outcomeStatRow}>
            <FontAwesome name="arrow-down" size={11} color={colors.danger} />
            <Text testID="realized-outcome-losses" style={[styles.outcomeStatValue, { color: colors.danger }]}>
              {fmtNum(losses, 0)}
            </Text>
            <Text style={[styles.outcomeStatLabel, { color: colors.danger }]}>
              {t("realizedTrades.losses", "Losses")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const pnlColor = (v: number) => (v > 0 ? colors.success : v < 0 ? colors.danger : colors.textMuted);
  const sortLabelByKey: Record<RealizedSortKey, string> = {
    symbol: t("realizedTrades.symbol", "Symbol"),
    txn_date: t("realizedTrades.date", "Date"),
    purchaseValueKwd: t("trading.purchaseValue", "Purchase Value"),
    shares: t("realizedTrades.shares", "Shares"),
    realized_pnl_kwd: t("trading.realizedPL", "Realized P&L"),
    dividendsKwd: t("trading.cashDividends", "Cash Dividends"),
    netPnlKwd: t("realizedTrades.netPL", "Net P/L"),
    pnlPct: t("trading.colPnlPct", "P&L %"),
  };
  const tabOptions: Array<{ key: SummaryTab; label: string; icon: React.ComponentProps<typeof FontAwesome>["name"] }> = [
    { key: "capitalFlow", label: t("trading.capitalFlowTab", "Transaction Details"), icon: "exchange" },
    { key: "realizedTransactions", label: t("trading.realizedTransactionsTab", "Realized Transactions"), icon: "list-alt" },
  ];
  const showRealizedTab = activeTab === "realizedTransactions";

  const onToggleSort = (key: RealizedSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "txn_date" ? "desc" : "asc");
  };

  const sortIndicator = (key: RealizedSortKey) => {
    if (sortKey !== key) return "⇅";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const handleExportRealized = async () => {
    try {
      await exportRealizedTransactionsReport({
        rows: realizedTransactions.map((trade) => ({
          symbol: trade.symbol,
          portfolio: trade.portfolio,
          txnDate: trade.txn_date,
          purchaseValueKwd: trade.purchaseValueKwd,
          shares: trade.shares,
          realizedPnlKwd: trade.realized_pnl_kwd,
          cashDividendsKwd: trade.dividendsKwd,
          netPnlKwd: trade.netPnlKwd,
          pnlPct: trade.pnlPct,
        })),
        filters: {
          symbol: symbolFilter.trim(),
          fromDate: fromFilter.trim(),
          toDate: toFilter.trim(),
        },
        summary: {
          totalRealizedKwd: realizedData?.total_realized_kwd ?? 0,
          grossGainsKwd: realizedData?.total_profit_kwd ?? 0,
          grossLossesKwd: realizedData?.total_loss_kwd ?? 0,
          totalTrades: realizedData?.details?.length ?? 0,
          visibleTrades: realizedTransactions.length,
          currency: "KWD",
          sortColumn: sortLabelByKey[sortKey],
          sortDirection,
        },
      });
    } catch (error) {
      Alert.alert("Export Failed", error instanceof Error ? error.message : "Could not export realized transactions.");
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.periodBadge, { backgroundColor: colors.accentPrimary + "12", borderColor: colors.accentPrimary + "30" }]}>
        <FontAwesome name="calendar" size={11} color={colors.accentPrimary} />
        <Text style={[styles.periodText, { color: colors.accentPrimary }]}>{periodLabel}</Text>
        <Text style={[styles.periodCcy, { color: colors.textMuted }]}>{t("trading.allValuesKWD")}</Text>
      </View>

      <View style={styles.tabRow}>
        {tabOptions.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[
                styles.tabButton,
                {
                  backgroundColor: active ? colors.accentPrimary + "18" : colors.bgCard,
                  borderColor: active ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <FontAwesome name={tab.icon} size={12} color={active ? colors.accentPrimary : colors.textMuted} />
              <Text style={[styles.tabButtonText, { color: active ? colors.accentPrimary : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {showRealizedTab
          ? t("trading.realizedTransactionsHeading", "REALIZED TRANSACTIONS")
          : t("trading.capitalFlow")}
      </Text>

      {showRealizedTab ? (
        <>
          <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
            <Card
              icon="check-circle"
              iconColor={pnlColor(realizedData?.total_realized_kwd ?? 0)}
              label={t("realizedTrades.totalRealized", "Total Realized")}
              value={formatSignedCurrency(realizedData?.total_realized_kwd ?? 0, "KWD")}
              sub={t("realizedTrades.netPL", "Net P/L")}
              borderAccent={pnlColor(realizedData?.total_realized_kwd ?? 0)}
            />
            <Card
              icon="arrow-up"
              iconColor={colors.success}
              label={t("realizedTrades.grossGains", "Gross Gains")}
              value={formatCurrency(realizedData?.total_profit_kwd ?? 0, "KWD")}
              sub={t("realizedTrades.winningTrades", "Winning trades")}
              borderAccent={colors.success}
            />
            <Card
              icon="arrow-down"
              iconColor={colors.danger}
              label={t("realizedTrades.grossLosses", "Gross Losses")}
              value={formatCurrency(Math.abs(realizedData?.total_loss_kwd ?? 0), "KWD")}
              sub={t("realizedTrades.losingTrades", "Losing trades")}
              borderAccent={colors.danger}
            />
            <Card
              icon="list-ol"
              iconColor={colors.accentSecondary}
              label={t("realizedTrades.totalTrades", "Total Trades")}
              value={fmtNum(realizedData?.details?.length ?? 0, 0)}
              sub={t("trading.recordsCount", { count: realizedData?.details?.length ?? 0 })}
              borderAccent={colors.accentSecondary}
            />
            <OutcomeCard
              wins={visibleTradeStats.wins}
              losses={visibleTradeStats.losses}
              winRate={visibleTradeStats.winRate}
            />
          </ResponsiveGrid>

          <View style={[styles.previewCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderRow}>
                <View style={styles.previewHeaderCopy}>
                  <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
                    {t("trading.realizedTransactionsList", "All realized transactions")}
                  </Text>
                  <Text style={[styles.previewSubtitle, { color: colors.textMuted }]}>
                    {t("trading.recordsCount", {
                      count: realizedTransactions.length,
                      defaultValue: "{{count}} records",
                    })}
                  </Text>
                </View>
                <Pressable
                  testID="export-realized-transactions"
                  onPress={handleExportRealized}
                  style={[
                    styles.exportButton,
                    {
                      backgroundColor: colors.accentPrimary + "18",
                      borderColor: colors.accentPrimary + "55",
                      opacity: realizedTransactions.length ? 1 : 0.5,
                    },
                  ]}
                  disabled={!realizedTransactions.length}
                >
                  <FontAwesome name="file-excel-o" size={14} color={colors.accentPrimary} />
                  <Text style={[styles.exportButtonText, { color: colors.accentPrimary }]}>
                    {t("trading.exportExcel", "Export Excel")}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.filterPanel, { backgroundColor: colors.accentPrimary + "08", borderColor: colors.borderColor }]}> 
              <View style={styles.filterPanelHeader}>
                <View>
                  <Text style={[styles.filterPanelTitle, { color: colors.textPrimary }]}>
                    {t("trading.filterRealizedTransactions", "Find transactions fast")}
                  </Text>
                  <Text style={[styles.filterPanelSubtitle, { color: colors.textMuted }]}>
                    {t("trading.filterRealizedTransactionsHint", "Search by ticker and narrow by trade date range.")}
                  </Text>
                </View>
                {(symbolFilter || fromFilter || toFilter) ? (
                  <Pressable
                    testID="clear-realized-filters"
                    onPress={() => {
                      setSymbolFilter("");
                      setFromFilter("");
                      setToFilter("");
                    }}
                    style={[styles.clearFiltersButton, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}
                  >
                    <FontAwesome name="times" size={12} color={colors.textMuted} />
                    <Text style={[styles.clearFiltersButtonText, { color: colors.textSecondary }]}>
                      {t("trading.clearFilters", "Clear")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.filterRow}>
                <View style={styles.searchFieldWrap}>
                  <Text style={[styles.filterLabel, { color: colors.textMuted }]}>
                    {t("trading.realizedSymbolFilterLabel", "Stock or Symbol")}
                  </Text>
                  <View style={[styles.searchInputShell, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
                    <FontAwesome name="search" size={13} color={colors.textMuted} />
                    <TextInput
                      value={symbolFilter}
                      onChangeText={setSymbolFilter}
                      placeholder={t("trading.realizedSymbolFilterPlaceholder", "Search stock or symbol")}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={[styles.searchInput, { color: colors.textPrimary }]}
                    />
                    {symbolFilter ? (
                      <Pressable testID="clear-symbol-filter" onPress={() => setSymbolFilter("")} hitSlop={8}>
                        <FontAwesome name="times-circle" size={14} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.dateRangeWrap}>
                  <View style={styles.dateField}>
                    <Text style={[styles.filterLabel, { color: colors.textMuted }]}>
                      {t("trading.fromDate", "From (YYYY-MM-DD)")}
                    </Text>
                    <DateInput
                      value={fromFilter}
                      onChangeText={setFromFilter}
                      compact
                      placeholder={t("trading.fromDateShort", "Start date")}
                    />
                  </View>
                  <View style={styles.dateDividerWrap}>
                    <Text style={[styles.dateDivider, { color: colors.textMuted }]}>to</Text>
                  </View>
                  <View style={styles.dateField}>
                    <Text style={[styles.filterLabel, { color: colors.textMuted }]}>
                      {t("trading.toDate", "To (YYYY-MM-DD)")}
                    </Text>
                    <DateInput
                      value={toFilter}
                      onChangeText={setToFilter}
                      compact
                      placeholder={t("trading.toDateShort", "End date")}
                    />
                  </View>
                </View>
              </View>
            </View>

            {realizedTransactions.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.previewTableWrap}>
                  <View style={[styles.previewTableHead, { borderBottomColor: colors.borderColor }]}>
                    <Pressable testID="realized-sort-symbol" onPress={() => onToggleSort("symbol")} style={styles.previewHeadSymbol}>
                      <View style={styles.sortHeaderStart}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "symbol" ? colors.accentPrimary : colors.textMuted }]}>{t("realizedTrades.symbol", "Symbol")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "symbol" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("symbol")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-txn_date" onPress={() => onToggleSort("txn_date")} style={styles.previewHeadDate}>
                      <View style={styles.sortHeaderStart}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "txn_date" ? colors.accentPrimary : colors.textMuted }]}>{t("realizedTrades.date", "Date")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "txn_date" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("txn_date")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-purchaseValueKwd" onPress={() => onToggleSort("purchaseValueKwd")} style={styles.previewHeadPurchaseValue}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "purchaseValueKwd" ? colors.accentPrimary : colors.textMuted }]}>{t("trading.purchaseValue", "Purchase Value")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "purchaseValueKwd" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("purchaseValueKwd")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-shares" onPress={() => onToggleSort("shares")} style={styles.previewHeadShares}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "shares" ? colors.accentPrimary : colors.textMuted }]}>{t("realizedTrades.shares", "Shares")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "shares" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("shares")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-realized_pnl_kwd" onPress={() => onToggleSort("realized_pnl_kwd")} style={styles.previewHeadPnl}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "realized_pnl_kwd" ? colors.accentPrimary : colors.textMuted }]}>{t("trading.realizedPL", "Realized P&L")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "realized_pnl_kwd" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("realized_pnl_kwd")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-dividendsKwd" onPress={() => onToggleSort("dividendsKwd")} style={styles.previewHeadDividend}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "dividendsKwd" ? colors.accentPrimary : colors.textMuted }]}>{t("trading.cashDividends", "Cash Dividends")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "dividendsKwd" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("dividendsKwd")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-netPnlKwd" onPress={() => onToggleSort("netPnlKwd")} style={styles.previewHeadNet}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "netPnlKwd" ? colors.accentPrimary : colors.textMuted }]}>{t("realizedTrades.netPL", "Net P/L")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "netPnlKwd" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("netPnlKwd")}</Text>
                      </View>
                    </Pressable>
                    <Pressable testID="realized-sort-pnlPct" onPress={() => onToggleSort("pnlPct")} style={styles.previewHeadPct}>
                      <View style={styles.sortHeaderEnd}>
                        <Text style={[styles.previewHeadText, { color: sortKey === "pnlPct" ? colors.accentPrimary : colors.textMuted }]}>{t("trading.colPnlPct", "P&L %")}</Text>
                        <Text style={[styles.sortIndicator, { color: sortKey === "pnlPct" ? colors.accentPrimary : colors.textMuted }]}>{sortIndicator("pnlPct")}</Text>
                      </View>
                    </Pressable>
                  </View>
                  {realizedTransactions.map((txn, index) => {
                    return (
                      <View
                        key={txn.id}
                        style={[
                          styles.previewRow,
                          {
                            borderBottomColor: colors.borderColor,
                            borderBottomWidth: index < realizedTransactions.length - 1 ? StyleSheet.hairlineWidth : 0,
                          },
                        ]}
                      >
                        <Text testID="realized-row-symbol" style={[styles.previewSymbol, { color: colors.textPrimary }]}>{txn.symbol}</Text>
                        <Text style={[styles.previewDate, { color: colors.textSecondary }]}>{txn.txn_date}</Text>
                        <Text style={[styles.previewPurchaseValue, { color: colors.textSecondary }]}>{formatCurrency(txn.purchaseValueKwd, "KWD")}</Text>
                        <Text style={[styles.previewShares, { color: colors.textSecondary }]}>{fmtNum(txn.shares, 0)}</Text>
                        <Text style={[styles.previewPnl, { color: pnlColor(txn.realized_pnl_kwd) }]}>
                          {txn.realized_pnl_kwd >= 0 ? "+" : ""}{formatCurrency(txn.realized_pnl_kwd, "KWD")}
                        </Text>
                        <Text style={[styles.previewDividend, { color: txn.dividendsKwd > 0 ? colors.success : colors.textMuted }]}>
                          {txn.dividendsKwd > 0 ? "+" : ""}{formatCurrency(txn.dividendsKwd, "KWD")}
                        </Text>
                        <Text style={[styles.previewNet, { color: pnlColor(txn.netPnlKwd) }]}>
                          {txn.netPnlKwd >= 0 ? "+" : ""}{formatCurrency(txn.netPnlKwd, "KWD")}
                        </Text>
                        <Text style={[styles.previewPct, { color: pnlColor(txn.pnlPct ?? 0) }]}>
                          {txn.pnlPct == null ? "-" : formatPercent(txn.pnlPct)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <Text style={[styles.emptyState, { color: colors.textMuted }]}>
                {t("trading.noRealizedTransactions", "No realized transactions yet.")}
              </Text>
            )}
          </View>
        </>
      ) : (
        <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
          <Card icon="bank" iconColor="#3b82f6" label={t("trading.deposits")} value={formatCurrency(summary.total_deposits, "KWD")} sub={t("trading.depositsCount", { count: summary.deposit_count })} borderAccent="#3b82f6" />
          <Card icon="sign-out" iconColor="#ef4444" label={t("trading.withdrawals")} value={formatCurrency(summary.total_withdrawals, "KWD")} sub={t("trading.transactionsCount", { count: summary.withdrawal_count })} borderAccent="#ef4444" />
        </ResponsiveGrid>
      )}

      {/* P&L row hidden per request (unrealized / realized / total P&L / total txns) */}

      {/* Returns & Income row hidden per request (cash dividends, total fees, total return) */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 8 },
  periodBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    gap: 6, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, marginBottom: 12,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  periodText: { fontSize: 12, fontWeight: "600" },
  periodCcy: { fontSize: 10, fontWeight: "500", marginLeft: 4 },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.2,
    textTransform: "uppercase", marginBottom: 6, marginTop: 4,
  },
  previewCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  previewHeader: {
    marginBottom: 10,
    gap: 2,
  },
  previewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  previewHeaderCopy: {
    flexGrow: 1,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterPanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  filterPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  filterPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  filterPanelSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 3,
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearFiltersButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
  },
  searchFieldWrap: {
    flexGrow: 1.25,
    flexBasis: 280,
  },
  dateRangeWrap: {
    flexGrow: 1,
    flexBasis: 360,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  dateField: {
    flexGrow: 1,
    flexBasis: 160,
  },
  dateDividerWrap: {
    paddingBottom: 14,
  },
  dateDivider: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  searchInputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  previewSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  previewTableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  previewTableWrap: {
    minWidth: 1080,
  },
  previewHeadSymbol: { flex: 1.3 },
  previewHeadDate: { flex: 1.1 },
  previewHeadPurchaseValue: { flex: 1.3 },
  previewHeadShares: { flex: 0.8 },
  previewHeadPnl: { flex: 1 },
  previewHeadDividend: { flex: 1.2 },
  previewHeadNet: { flex: 1.1 },
  previewHeadPct: { flex: 0.9 },
  sortHeaderStart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-start",
  },
  sortHeaderEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-end",
  },
  previewHeadText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sortIndicator: {
    fontSize: 10,
    fontWeight: "700",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
  },
  previewSymbol: { flex: 1.3, fontSize: 12, fontWeight: "600" },
  previewDate: { flex: 1.1, fontSize: 12 },
  previewPurchaseValue: { flex: 1.3, fontSize: 12, textAlign: "right" },
  previewShares: { flex: 0.8, fontSize: 12, textAlign: "right" },
  previewPnl: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  previewDividend: { flex: 1.2, fontSize: 12, fontWeight: "600", textAlign: "right" },
  previewNet: { flex: 1.1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  previewPct: { flex: 0.9, fontSize: 12, fontWeight: "700", textAlign: "right" },
  emptyState: {
    fontSize: 12,
    fontWeight: "500",
    paddingVertical: 8,
  },
  card: {
    borderRadius: 10, borderWidth: 1, padding: 14, minHeight: 96, width: "100%",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", flex: 1 },
  cardValue: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3, marginBottom: 2 },
  cardSub: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  outcomeCard: {
    justifyContent: "flex-start",
  },
  outcomeContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flex: 1,
  },
  outcomeRateBlock: {
    flex: 1,
    justifyContent: "center",
  },
  outcomeRateValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 0,
  },
  outcomeStatsColumn: {
    minWidth: 96,
    gap: 8,
    alignItems: "flex-start",
  },
  outcomeStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  outcomeStatValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  outcomeStatLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});
