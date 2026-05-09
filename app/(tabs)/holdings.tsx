/**
 * Holdings Screen — Thin orchestrator.
 *
 * All data logic lives in useHoldingsView, table cells in HoldingsDataGrid,
 * and the merge modal in StockMergeModal. This file wires them together
 * as the Expo Router default export.
 */

import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { CashBalancesSection } from "@/components/portfolio/CashBalancesSection";
import { KpiCard } from "@/components/portfolio/KpiWidgets";
import { DataScreen } from "@/components/screens";
import { FilterChip } from "@/components/ui/FilterChip";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { ResponsiveDataTable, type DataColumn } from "@/components/ui/ResponsiveDataTable";
import { CardSkeleton, ListSkeleton, SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { UITokens } from "@/constants/uiTokens";
import type { ThemePalette } from "@/constants/theme";
import { useCashBalances } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import { showErrorAlert } from "@/lib/errorHandling";
import {
  exportHoldingsExcel,
  getTransactions,
  type Holding,
  type TransactionRecord,
} from "@/services/api";
import {
  getExitSignal,
  type PositionMonitor,
} from "@/services/api/analytics/tradeSignals";
import { useThemeStore } from "@/services/themeStore";
import { getApiErrorMessage } from "@/src/features/fundamental-analysis/types";
import {
  DataCell,
  HeaderCell,
  TotalCell,
  ts,
} from "@/src/features/holdings/components/HoldingsDataGrid";
import { StockMergeModal } from "@/src/features/holdings/components/StockMergeModal";
import {
  SUMMARY_COLUMNS,
  SUMMARY_TABLE_WIDTH,
  TABLE_COLUMNS,
  TOTAL_TABLE_WIDTH,
  cleanCompanyName,
  useHoldingsView,
} from "@/src/features/holdings/hooks/useHoldingsView";
import { PositionMonitorCard } from "@/src/features/portfolio/components/PositionMonitorCard";
import { donutStyles, s } from "@/src/features/holdings/styles";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Surface, Text as PaperText } from "react-native-paper";

import { tokens } from "@/theme/tokens";

function HoldingsScreenSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.colors.background }}>
      <View style={phoneStyles.skeletonHeader}>
        <View style={phoneStyles.skeletonChipRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={index} width={58} height={32} radius={tokens.radii.pill} />
          ))}
        </View>
        <SkeletonLoader width={72} height={20} />
      </View>
      <View style={phoneStyles.skeletonCardsWrap}>
        <CardSkeleton />
      </View>
      <ListSkeleton count={6} />
    </View>
  );
}

const HoldingListRow = React.memo(function HoldingListRow({
  item,
  colors,
  viewMode,
  onPress,
}: {
  item: Holding;
  colors: ThemePalette;
  viewMode: "summary" | "detailed";
  onPress: (holding: Holding) => void;
}) {
  const pnlPositive = item.unrealized_pnl_kwd >= 0;

  return (
    <Pressable onPress={() => onPress(item)}>
      {({ pressed }) => (
        <Surface
          style={[
            phoneStyles.row,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          elevation={1}
        >
          <View style={phoneStyles.rowTop}>
            <View style={phoneStyles.symbolWrap}>
              <PaperText variant="titleMedium" style={[phoneStyles.symbol, { color: colors.textPrimary }]}>
                {item.symbol}
              </PaperText>
              <PaperText variant="bodySmall" style={[phoneStyles.company, { color: colors.textMuted }]} numberOfLines={1}>
                {cleanCompanyName(item.company)}
              </PaperText>
            </View>
            <View style={phoneStyles.metricWrap}>
              <PaperText variant="bodyMedium" style={[phoneStyles.price, { color: colors.textPrimary }]}>
                {fmtNum(item.market_price)}
              </PaperText>
              <PaperText
                variant="bodySmall"
                style={[phoneStyles.delta, { color: pnlPositive ? tokens.colors.success : tokens.colors.error }]}
              >
                {item.unrealized_pnl_kwd >= 0 ? "+" : ""}
                {fmtNum(item.unrealized_pnl_kwd)}
              </PaperText>
            </View>
          </View>

          <View style={phoneStyles.rowBottom}>
            <View>
              <PaperText variant="labelSmall" style={[phoneStyles.metaLabel, { color: colors.textMuted }]}>
                Market Value
              </PaperText>
              <PaperText variant="bodyMedium" style={{ color: colors.textPrimary }}>
                {formatCurrency(item.market_value_kwd)}
              </PaperText>
            </View>
            <View style={phoneStyles.rightMeta}>
              <PaperText variant="labelSmall" style={[phoneStyles.metaLabel, { color: colors.textMuted }]}>
                P&L %
              </PaperText>
              <PaperText
                variant="bodyMedium"
                style={{ color: pnlPositive ? tokens.colors.success : tokens.colors.error, fontWeight: "600" }}
              >
                {item.pnl_pct >= 0 ? "+" : ""}
                {item.pnl_pct.toFixed(2)}%
              </PaperText>
            </View>
          </View>

          {viewMode === "detailed" ? (
            <View style={[phoneStyles.detailRow, { borderTopColor: colors.borderColor }]}> 
              <View>
                <PaperText variant="labelSmall" style={[phoneStyles.metaLabel, { color: colors.textMuted }]}>Avg Cost</PaperText>
                <PaperText variant="bodySmall" style={{ color: colors.textPrimary }}>{fmtNum(item.avg_cost)}</PaperText>
              </View>
              <View>
                <PaperText variant="labelSmall" style={[phoneStyles.metaLabel, { color: colors.textMuted }]}>Shares</PaperText>
                <PaperText variant="bodySmall" style={{ color: colors.textPrimary }}>{fmtNum(item.shares_qty)}</PaperText>
              </View>
              <View style={phoneStyles.rightMeta}>
                <PaperText variant="labelSmall" style={[phoneStyles.metaLabel, { color: colors.textMuted }]}>Dividends</PaperText>
                <PaperText variant="bodySmall" style={{ color: colors.textPrimary }}>{fmtNum(item.cash_dividends)}</PaperText>
              </View>
            </View>
          ) : null}
        </Surface>
      )}
    </Pressable>
  );
});

const KUWAIT_TRADING_DAYS = new Set(["Sun", "Mon", "Tue", "Wed", "Thu"]);
const KUWAIT_OPEN_MINUTES = 9 * 60 + 30;
const KUWAIT_CLOSE_MINUTES = 12 * 60 + 30;

function isKuwaitMarketHours(date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuwait",
    weekday: "short",
  }).format(date);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
  const minute = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuwait",
      minute: "2-digit",
    }).format(date),
  );

  if (!KUWAIT_TRADING_DAYS.has(weekday) || Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  const mins = hour * 60 + minute;
  return mins >= KUWAIT_OPEN_MINUTES && mins <= KUWAIT_CLOSE_MINUTES;
}

function resolvePortfolioForHolding(holding: Holding): "KFH" | "BBYN" | "USA" {
  const rawPortfolio = ((holding as Holding & { portfolio?: string }).portfolio ?? "").toUpperCase();
  if (rawPortfolio === "KFH" || rawPortfolio === "BBYN" || rawPortfolio === "USA") {
    return rawPortfolio;
  }
  if ((holding.currency ?? "").toUpperCase() === "USD") {
    return "USA";
  }
  return "KFH";
}

function parseIsoDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  const [yy, mm, dd] = raw.split("-").map((part) => Number(part));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
    return null;
  }
  const parsed = new Date(Date.UTC(yy, mm - 1, dd));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countKuwaitTradingBars(startUtc: Date, endUtc: Date): number {
  if (startUtc.getTime() > endUtc.getTime()) {
    return 0;
  }

  const cursor = new Date(startUtc.getTime());
  let bars = 0;
  while (cursor.getTime() <= endUtc.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 5 && day !== 6) {
      bars += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

function estimateBarsHeldForPosition(
  symbol: string,
  portfolio: "KFH" | "BBYN" | "USA",
  transactions: TransactionRecord[],
): number {
  const targetSymbol = symbol.trim().toUpperCase();
  const positionTxns = transactions
    .filter((txn) => {
      const txnSymbol = String(txn.stock_symbol ?? "").trim().toUpperCase();
      const txnPortfolio = String(txn.portfolio ?? "").trim().toUpperCase();
      return txnSymbol === targetSymbol && txnPortfolio === portfolio && !txn.is_deleted;
    })
    .sort((a, b) => {
      const aDate = parseIsoDateOnly(a.txn_date)?.getTime() ?? 0;
      const bDate = parseIsoDateOnly(b.txn_date)?.getTime() ?? 0;
      if (aDate !== bDate) {
        return aDate - bDate;
      }
      return Number(a.id) - Number(b.id);
    });

  if (positionTxns.length === 0) {
    return 6;
  }

  let openShares = 0;
  let lotStart: Date | null = null;

  for (const txn of positionTxns) {
    const txnDate = parseIsoDateOnly(txn.txn_date);
    if (!txnDate) {
      continue;
    }

    const type = String(txn.txn_type ?? "").trim().toUpperCase();
    const shares = Math.max(0, Number(txn.shares ?? 0));
    const bonusShares = Math.max(0, Number(txn.bonus_shares ?? 0));
    const isSell = type.includes("SELL");
    const isBuy = type.includes("BUY");

    let shareDelta = 0;
    if (isBuy) {
      shareDelta += shares;
    }
    if (isSell) {
      shareDelta -= shares;
    }
    if (!isSell) {
      shareDelta += bonusShares;
    }

    if (shareDelta > 0 && openShares <= 0) {
      lotStart = txnDate;
    }

    openShares = Math.max(0, openShares + shareDelta);
    if (openShares <= 0) {
      lotStart = null;
    }
  }

  if (!lotStart) {
    return 6;
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.max(0, countKuwaitTradingBars(lotStart, todayUtc));
}

async function getAllTransactionsForMonitor(): Promise<TransactionRecord[]> {
  const pageSize = 100;
  const first = await getTransactions({ page: 1, page_size: pageSize });
  const all = [...first.transactions];
  const totalPages = Number(first.pagination?.total_pages ?? 1);

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await getTransactions({ page, page_size: pageSize });
    all.push(...next.transactions);
  }

  return all;
}

// ── Main screen ─────────────────────────────────────────────────────

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { spacing, isPhone } = useResponsive();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  const {
    filter, setFilter,
    sortCol, sortDir, onSort,
    resp, isLoading, isError, error, refetch, isRefetching, isFetching, dataUpdatedAt,
    sortedHoldings, totals, allocationData, depositTotals,
  } = useHoldingsView();

  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");

  // Ensure Summary is shown first when screen mounts so mode difference is immediately visible.
  useEffect(() => {
    setViewMode("summary");
  }, []);

  const activeColumns = viewMode === "summary" ? SUMMARY_COLUMNS : TABLE_COLUMNS;
  const activeTableWidth = viewMode === "summary" ? SUMMARY_TABLE_WIDTH : TOTAL_TABLE_WIDTH;
  const firstColumn = activeColumns[0];
  const trailingColumns = activeColumns.slice(1);
  const trailingTableWidth = Math.max(0, activeTableWidth - firstColumn.width);

  const { data: cashData, refetch: refetchCash } = useCashBalances();

  // ── Mobile card columns (priority-filtered on phone) ────────────
  const mobileColumns = useMemo<DataColumn<Holding>[]>(() => [
    { key: "symbol", label: t("holdings.symbol", "Symbol"), render: (h) => `${h.symbol} — ${cleanCompanyName(h.company)}`, priority: "high" },
    { key: "value", label: t("holdings.marketValue", "Market Value"), render: (h) => formatCurrency(h.market_value_kwd), priority: "high" },
    { key: "pnl", label: t("dashboard.unrealizedPL", "Unrealized P&L"), render: (h) => formatCurrency(h.unrealized_pnl_kwd), priority: "high" },
    { key: "pnl_pct", label: t("holdings.pnlPct", "P&L %"), render: (h) => `${h.pnl_pct >= 0 ? "+" : ""}${h.pnl_pct.toFixed(2)}%`, priority: "medium" },
    { key: "cost", label: t("holdings.avgCost", "Avg Cost"), render: (h) => fmtNum(h.total_cost_kwd), priority: "low" },
  ], [t]);

  const mobileHoldingKeyExtractor = useCallback((item: Holding) => item.symbol, []);
  const desktopHoldingRowKey = useCallback(
    (item: Holding, index: number) => `${item.symbol}-${item.currency}-${index}`,
    [],
  );
  const phoneHoldingRowKey = useCallback(
    (item: Holding, index: number) => `${item.symbol}-${item.currency}-${index}`,
    [],
  );
  const renderPhoneHolding = useCallback(
    ({ item }: { item: Holding }) => (
      <HoldingListRow item={item} colors={colors} viewMode={viewMode} onPress={setSelectedHolding} />
    ),
    [colors, viewMode],
  );

  const monitoredHoldings = useMemo(
    () => sortedHoldings.filter((holding) => Number(holding.shares_qty ?? 0) > 0),
    [sortedHoldings],
  );

  const transactionsQuery = useQuery({
    queryKey: ["portfolio", "transactions", "holdings-monitor"],
    queryFn: getAllTransactionsForMonitor,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const barsHeldByPosition = useMemo(() => {
    const barsMap = new Map<string, number>();
    const txns = transactionsQuery.data ?? [];

    for (const holding of monitoredHoldings) {
      const portfolio = resolvePortfolioForHolding(holding);
      const key = `${holding.symbol.toUpperCase()}::${portfolio}`;
      if (barsMap.has(key)) {
        continue;
      }
      barsMap.set(
        key,
        estimateBarsHeldForPosition(holding.symbol, portfolio, txns),
      );
    }

    return barsMap;
  }, [monitoredHoldings, transactionsQuery.data]);

  const exitSignalQueries = useQueries({
    queries: monitoredHoldings.map((holding) => {
      const entryPrice = Number(holding.avg_cost ?? 0);
      const exchange = (holding.currency ?? "").toUpperCase() === "USD" ? "USA" : "KSE";
      const portfolio = resolvePortfolioForHolding(holding);
      const positionKey = `${holding.symbol.toUpperCase()}::${portfolio}`;
      const barsHeld = barsHeldByPosition.get(positionKey) ?? 6;
      return {
        queryKey: ["exit-signal", holding.symbol, portfolio, entryPrice, exchange, barsHeld],
        queryFn: () =>
          getExitSignal(holding.symbol, {
            entry_price: entryPrice,
            bars_held: barsHeld,
            exchange,
          }),
        enabled: entryPrice > 0 && holding.symbol.trim().length > 0,
        staleTime: 60_000,
        refetchInterval: () => (isKuwaitMarketHours() ? 5 * 60_000 : false),
        refetchIntervalInBackground: true,
        retry: 1,
      };
    }),
  });

  const positionMonitors = useMemo<PositionMonitor[]>(
    () =>
      monitoredHoldings
        .map((holding, index) => {
          const exitSignal = exitSignalQueries[index]?.data;
          if (!exitSignal) return null;
          return {
            symbol: holding.symbol,
            shares: Number(holding.shares_qty ?? 0),
            entry_price: Number(holding.avg_cost ?? 0),
            current_price: Number(holding.market_price ?? 0),
            pnl_pct: Number(holding.pnl_pct ?? 0),
            exit_signal: exitSignal,
          };
        })
        .filter((item): item is PositionMonitor => item !== null),
    [monitoredHoldings, exitSignalQueries],
  );

  const holdingBySymbol = useMemo(
    () => new Map(monitoredHoldings.map((holding) => [holding.symbol, holding])),
    [monitoredHoldings],
  );

  const monitorLoading =
    monitoredHoldings.length > 0 && (
      transactionsQuery.isLoading ||
      exitSignalQueries.some((query) => query.isLoading || query.isFetching)
    );
  const monitorErrors = exitSignalQueries.some((query) => query.isError);

  const openSellTicket = useCallback(
    (holding: Holding) => {
      const portfolio = resolvePortfolioForHolding(holding);
      router.push(
        {
          pathname: "/(tabs)/add-transaction",
          params: {
            symbol: holding.symbol,
            portfolio,
            editId: "",
            createKey: String(Date.now()),
          },
        } as Href,
      );
    },
    [router],
  );

  const launchSellFlow = useCallback(
    (holding: Holding, trimPct?: number) => {
      if (trimPct == null) {
        openSellTicket(holding);
        return;
      }

      const title = "Trim Position";
      const message = `Suggested trim for ${holding.symbol}: ${Math.round(trimPct)}%. Open sell ticket?`;

      if (
        Platform.OS === "web" &&
        typeof globalThis !== "undefined" &&
        typeof globalThis.confirm === "function"
      ) {
        const confirmed = globalThis.confirm(`${title}\n\n${message}`);
        if (confirmed) {
          openSellTicket(holding);
        }
        return;
      }

      Alert.alert(title, message, [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: "Open Sell Ticket",
          onPress: () => openSellTicket(holding),
        },
      ]);
    },
    [openSellTicket, t],
  );

  const monitorSection = useMemo(
    () => (
      <View
        style={[
          phoneStyles.monitorSection,
          {
            marginHorizontal: spacing.pagePx,
            backgroundColor: colors.bgCard,
            borderColor: colors.borderColor,
          },
        ]}
      >
        <View style={phoneStyles.monitorHeader}>
          <Text style={[phoneStyles.monitorTitle, { color: colors.textPrimary }]}>Position Monitor</Text>
          {monitorLoading ? (
            <Text style={[phoneStyles.monitorStatus, { color: colors.textMuted }]}>Refreshing...</Text>
          ) : null}
        </View>

        {positionMonitors.length === 0 && !monitorLoading ? (
          <Text style={[phoneStyles.monitorEmpty, { color: colors.textMuted }]}>No active exit alerts.</Text>
        ) : null}

        {positionMonitors.map((monitor) => {
          const holding = holdingBySymbol.get(monitor.symbol);
          if (!holding) return null;
          return (
            <PositionMonitorCard
              key={`${monitor.symbol}-${monitor.exit_signal.timestamp}`}
              symbol={monitor.symbol}
              pnlPct={monitor.pnl_pct}
              exitSignal={monitor.exit_signal}
              onTrim={(pct) => launchSellFlow(holding, pct)}
              onExit={() => launchSellFlow(holding)}
            />
          );
        })}

        {monitorErrors ? (
          <Text style={[phoneStyles.monitorError, { color: colors.danger }]}>Some exit signals are unavailable.</Text>
        ) : null}
      </View>
    ),
    [
      colors.bgCard,
      colors.borderColor,
      colors.danger,
      colors.textMuted,
      colors.textPrimary,
      holdingBySymbol,
      launchSellFlow,
      monitorErrors,
      monitorLoading,
      positionMonitors,
      spacing.pagePx,
    ],
  );

  const portfolios = [undefined, "KFH", "BBYN", "USA"];
  const filterLabels = ["All", "KFH", "BBYN", "USA"];

  return (
    <DataScreen
      loading={isLoading}
      error={isError ? getApiErrorMessage(error, t("holdingsScreen.failedToLoad")) : null}
      onRetry={() => refetch()}
      loadingSkeleton={<HoldingsScreenSkeleton />}
      bare
    >
      <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
        {/* ── Portfolio filter tabs ────────────────────────────── */}
        <View style={s.filterRow}>
          {portfolios.map((p, i) => (
            <FilterChip
              key={filterLabels[i]}
              label={filterLabels[i]}
              active={filter === p}
              onPress={() => setFilter(p)}
              colors={colors}
            />
          ))}
          <LastUpdated timestamp={dataUpdatedAt} isFetching={isFetching} />        </View>

        {/* ── Summary KPI Cards ───────────────────────────────── */}
        {resp && (
          <View style={[s.kpiCardRow, { borderBottomColor: colors.borderColor }]}>
            <KpiCard label={t("holdings.title")} value={String(resp.count)} color={colors.accentPrimary} colors={colors} />
            <KpiCard label={t("holdings.marketValue")} value={`${fmtNum(resp.totals.total_market_value_kwd)} KWD`} colors={colors} />
            <KpiCard label={t("holdings.avgCost")} value={`${fmtNum(resp.totals.total_cost_kwd)} KWD`} colors={colors} />
            <KpiCard
              label={t("dashboard.unrealizedPL")}
              value={`${resp.totals.total_unrealized_pnl_kwd >= 0 ? "+" : ""}${fmtNum(resp.totals.total_unrealized_pnl_kwd)} KWD`}
              color={resp.totals.total_unrealized_pnl_kwd > 0 ? colors.success : resp.totals.total_unrealized_pnl_kwd < 0 ? colors.danger : colors.textMuted}
              colors={colors}
            />
          </View>
        )}

        {isPhone ? (
          <FlashList
            data={sortedHoldings}
            renderItem={renderPhoneHolding}
            keyExtractor={phoneHoldingRowKey}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchCash(); }} />
            }
            contentContainerStyle={{
              paddingBottom: bottom + UITokens.spacing.lg,
            }}
            ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
            ListHeaderComponent={
              <View>
                <CashBalancesSection
                  cashData={cashData ?? {}}
                  depositTotals={depositTotals}
                  colors={colors}
                  spacing={spacing}
                  queryClient={queryClient}
                />

                {monitorSection}

                <View style={[s.holdingsHeaderRow, { marginHorizontal: spacing.pagePx }]}>
                  <Text style={[s.holdingsTitle, { color: colors.textPrimary }]}>
                    <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} />
                    {"  "}{t("holdings.title")}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={async () => {
                      if (Platform.OS !== "web") {
                        Alert.alert(t("holdingsScreen.export"), t("holdingsScreen.exportWebOnly"));
                        return;
                      }
                      try {
                        const blob = await exportHoldingsExcel(filter ?? undefined);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `holdings_${todayISO()}.xlsx`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (e: unknown) {
                        showErrorAlert(t("holdingsScreen.exportFailed"), e);
                      }
                    }}
                    style={s.holdingsExportBtn}
                  >
                    <FontAwesome name="download" size={14} color="#10b981" style={{ marginRight: 8 }} />
                    <Text style={s.holdingsExportText}>{t("holdingsScreen.exportExcel")}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginHorizontal: spacing.pagePx, marginTop: 4, marginBottom: tokens.spacing.md }}>
                  <View
                    style={[
                      s.viewToggleRow,
                      {
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: colors.borderColor,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: colors.bgCard,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <FontAwesome
                        name={viewMode === "summary" ? "list" : "table"}
                        size={13}
                        color={colors.accentPrimary}
                      />
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}>
                        {viewMode === "summary"
                          ? `${t("holdings.summary", "Summary")} (${sortedHoldings.length})`
                          : `${t("holdings.detailed", "Detailed")} (${sortedHoldings.length})`}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                        {t("holdings.summary", "Summary")}
                      </Text>
                      <Switch
                        value={viewMode === "detailed"}
                        onValueChange={(isDetailed) => setViewMode(isDetailed ? "detailed" : "summary")}
                        thumbColor="#ffffff"
                        trackColor={{ false: colors.textMuted + "55", true: colors.accentPrimary }}
                        accessibilityLabel={t("holdings.viewMode", "Holdings table view mode")}
                      />
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                        {t("holdings.detailed", "Detailed")}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            }
            ListFooterComponent={
              allocationData.length > 0 ? (
                <View
                  style={[
                    donutStyles.section,
                    {
                      marginHorizontal: spacing.pagePx,
                      marginTop: tokens.spacing.md,
                      backgroundColor: colors.bgCard,
                      borderColor: colors.borderColor,
                    },
                  ]}
                >
                  <Text style={[donutStyles.sectionLabel, { color: colors.textPrimary }]}>
                    <FontAwesome name="pie-chart" size={14} color={colors.accentPrimary} />{" "}
                    {t("holdingsScreen.weightByCost")}
                  </Text>
                  <AllocationDonut
                    data={allocationData}
                    title={t("holdingsScreen.portfolioAllocation")}
                    colors={colors}
                    size={280}
                    showLegend={true}
                  />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={[phoneStyles.emptyState, { marginHorizontal: spacing.pagePx, backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
                <FontAwesome name="briefcase" size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
                <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 12 }}>
                  {t("holdingsScreen.noActiveHoldings")}
                </Text>
                <Pressable
                  onPress={() => router.push("/(tabs)/add-stock")}
                  accessibilityRole="button"
                  accessibilityLabel={t("holdingsScreen.addFirstStock")}
                  style={{ backgroundColor: colors.accentPrimary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("holdingsScreen.addFirstStock")}</Text>
                </Pressable>
              </View>
            }
          />
        ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchCash(); }} />
          }
        >
          {/* Cash Management */}
          <CashBalancesSection
            cashData={cashData ?? {}}
            depositTotals={depositTotals}
            colors={colors}
            spacing={spacing}
            queryClient={queryClient}
          />

          {monitorSection}

          {/* Holdings header + Export */}
          <View style={[s.holdingsHeaderRow, { marginHorizontal: spacing.pagePx }]}>
            <Text style={[s.holdingsTitle, { color: colors.textPrimary }]}>
              <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} />
              {"  "}{t("holdings.title")}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={async () => {
                if (Platform.OS !== "web") {
                  Alert.alert(t("holdingsScreen.export"), t("holdingsScreen.exportWebOnly"));
                  return;
                }
                try {
                  const blob = await exportHoldingsExcel(filter ?? undefined);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `holdings_${todayISO()}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (e: unknown) {
                  showErrorAlert(t("holdingsScreen.exportFailed"), e);
                }
              }}
              style={s.holdingsExportBtn}
            >
              <FontAwesome name="download" size={14} color="#10b981" style={{ marginRight: 8 }} />
              <Text style={s.holdingsExportText}>{t("holdingsScreen.exportExcel")}</Text>
            </TouchableOpacity>
          </View>

          {/* Holdings table — ResponsiveDataTable auto-switches to cards on phone */}
          <View style={{ marginHorizontal: spacing.pagePx, marginTop: 4, marginBottom: UITokens.spacing.lg }}>
            <View
              style={[
                s.viewToggleRow,
                {
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.borderColor,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: colors.bgCard,
                  marginBottom: 8,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <FontAwesome
                  name={viewMode === "summary" ? "list" : "table"}
                  size={13}
                  color={colors.accentPrimary}
                />
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}>
                  {viewMode === "summary"
                    ? `${t("holdings.summary", "Summary")} (9)`
                    : `${t("holdings.detailed", "Detailed")} (18)`}
                </Text>
              </View>
              {Platform.OS === "web" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("holdings.summary", "Summary")}
                    onPress={() => setViewMode("summary")}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: viewMode === "summary" ? colors.accentPrimary : colors.borderColor,
                      backgroundColor: viewMode === "summary" ? colors.accentPrimary + "22" : "transparent",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: viewMode === "summary" ? colors.accentPrimary : colors.textMuted,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {t("holdings.summary", "Summary")}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("holdings.detailed", "Detailed")}
                    onPress={() => setViewMode("detailed")}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: viewMode === "detailed" ? colors.accentPrimary : colors.borderColor,
                      backgroundColor: viewMode === "detailed" ? colors.accentPrimary + "22" : "transparent",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: viewMode === "detailed" ? colors.accentPrimary : colors.textMuted,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {t("holdings.detailed", "Detailed")}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                    {t("holdings.summary", "Summary")}
                  </Text>
                  <Switch
                    value={viewMode === "detailed"}
                    onValueChange={(isDetailed) => setViewMode(isDetailed ? "detailed" : "summary")}
                    thumbColor="#ffffff"
                    trackColor={{ false: colors.textMuted + "55", true: colors.accentPrimary }}
                    accessibilityLabel={t("holdings.viewMode", "Holdings table view mode")}
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                    {t("holdings.detailed", "Detailed")}
                  </Text>
                </View>
              )}
            </View>
            <ResponsiveDataTable<Holding>
              key={viewMode}
              data={sortedHoldings}
              columns={mobileColumns}
              keyExtractor={mobileHoldingKeyExtractor}
              onPressItem={setSelectedHolding}
              itemA11yLabel={(h) => `${h.symbol} ${cleanCompanyName(h.company)}, value ${formatCurrency(h.market_value_kwd)}`}
              desktopTable={
                <View
                  style={[
                    ts.tableOuter,
                    {
                      borderColor: colors.borderColor,
                      backgroundColor: colors.bgCard,
                      overflow: "hidden",
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", minWidth: 0 }}>
                    {/* ── Frozen company column ─────────────────────────────────── */}
                    <View
                      style={{
                        width: firstColumn.width,
                        borderRightWidth: 1,
                        borderRightColor: colors.borderColor,
                        backgroundColor: colors.bgCard,
                        zIndex: 1,
                        flexShrink: 0,
                        shadowColor: "#000",
                        shadowOpacity: 0.16,
                        shadowRadius: 6,
                        shadowOffset: { width: 3, height: 0 },
                        elevation: 3,
                      }}
                    >
                      {/* Header */}
                      <View style={[ts.headerRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
                        <HeaderCell col={firstColumn} colors={colors} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                      </View>
                      {/* Data rows */}
                      {sortedHoldings.map((item, index) => {
                        const rowBg = index % 2 === 0 ? "transparent" : colors.bgCardHover + "30";
                        return (
                          <Pressable
                            key={desktopHoldingRowKey(item, index)}
                            onPress={() => setSelectedHolding(item)}
                            accessibilityRole="link"
                            accessibilityLabel={t("holdingsScreen.viewDetails", { company: cleanCompanyName(item.company) })}
                            style={({ pressed }) => [
                              ts.dataRow,
                              {
                                backgroundColor: rowBg,
                                borderBottomColor: colors.borderColor,
                                width: firstColumn.width,
                                opacity: pressed ? 0.6 : 1,
                              },
                            ]}
                          >
                            <View style={[ts.dataCell, { width: firstColumn.width }]}>
                              <Text
                                style={[ts.cellText, {
                                  color: colors.accentPrimary,
                                  fontWeight: "700",
                                  textDecorationLine: "underline",
                                }]}
                                numberOfLines={1}
                              >
                                {cleanCompanyName(item.company)}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                      {/* Total row */}
                      {sortedHoldings.length > 0 && (
                        <View
                          style={[
                            ts.dataRow,
                            ts.totalRow,
                            {
                              borderBottomColor: colors.borderColor,
                              backgroundColor: colors.accentPrimary + "18",
                              borderTopColor: colors.accentPrimary,
                            },
                          ]}
                        >
                          <TotalCell col={firstColumn} totals={totals} colors={colors} />
                        </View>
                      )}
                      {/* Empty placeholder to match right panel height */}
                      {sortedHoldings.length === 0 && <View style={{ height: 120 }} />}
                    </View>

                    {/* ── Scrollable remaining columns ──────────────────────── */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator
                      contentContainerStyle={{ minWidth: trailingTableWidth }}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <View style={{ width: trailingTableWidth }}>
                        {/* Header */}
                        <View style={[ts.headerRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
                          {trailingColumns.map((col) => (
                            <HeaderCell key={col.key} col={col} colors={colors} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                          ))}
                        </View>
                        {/* Data rows */}
                        {sortedHoldings.map((item, index) => {
                          const rowBg = index % 2 === 0 ? "transparent" : colors.bgCardHover + "30";
                          return (
                            <View
                              key={desktopHoldingRowKey(item, index)}
                              style={[ts.dataRow, { backgroundColor: rowBg, borderBottomColor: colors.borderColor }]}
                            >
                              {trailingColumns.map((col) => (
                                <DataCell key={col.key} col={col} holding={item} colors={colors} />
                              ))}
                            </View>
                          );
                        })}
                        {/* Total row */}
                        {sortedHoldings.length > 0 && (
                          <View
                            style={[
                              ts.dataRow,
                              ts.totalRow,
                              {
                                borderBottomColor: colors.borderColor,
                                backgroundColor: colors.accentPrimary + "18",
                                borderTopColor: colors.accentPrimary,
                              },
                            ]}
                          >
                            {trailingColumns.map((col) => (
                              <TotalCell key={col.key} col={col} totals={totals} colors={colors} />
                            ))}
                          </View>
                        )}
                        {/* Empty state */}
                        {sortedHoldings.length === 0 && (
                          <View style={ts.emptyRow}>
                            <FontAwesome name="briefcase" size={36} color={colors.textMuted} style={{ marginBottom: 8 }} />
                            <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 12 }}>
                              {t("holdingsScreen.noActiveHoldings")}
                            </Text>
                            <Pressable
                              onPress={() => router.push("/(tabs)/add-stock")}
                              accessibilityRole="button"
                              accessibilityLabel={t("holdingsScreen.addFirstStock")}
                              style={{ backgroundColor: colors.accentPrimary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("holdingsScreen.addFirstStock")}</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              }
            />
          </View>

          {/* Allocation Donut Chart */}
          {allocationData.length > 0 && (
            <View
              style={[
                donutStyles.section,
                {
                  marginHorizontal: spacing.pagePx,
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <Text style={[donutStyles.sectionLabel, { color: colors.textPrimary }]}>
                <FontAwesome name="pie-chart" size={14} color={colors.accentPrimary} />{" "}
                {t("holdingsScreen.weightByCost")}
              </Text>
              <AllocationDonut
                data={allocationData}
                title={t("holdingsScreen.portfolioAllocation")}
                colors={colors}
                size={280}
                showLegend={true}
              />
            </View>
          )}
        </ScrollView>
        )}

        {/* Stock Merge Modal */}
        {selectedHolding && (
          <StockMergeModal
            holding={selectedHolding}
            colors={colors}
            onClose={() => setSelectedHolding(null)}
            onMerged={() => {
              queryClient.invalidateQueries({ queryKey: ["holdings"] });
              queryClient.invalidateQueries({ queryKey: ["overview"] });
              queryClient.invalidateQueries({ queryKey: ["all-stocks-for-merge"] });
            }}
          />
        )}
      </View>
    </DataScreen>
  );
}

const phoneStyles = StyleSheet.create({
  skeletonHeader: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  skeletonChipRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
  },
  skeletonCardsWrap: {
    marginTop: tokens.spacing.md,
    marginHorizontal: tokens.spacing.md,
    borderRadius: tokens.radii.lg,
    backgroundColor: tokens.colors.surface,
  },
  row: {
    borderRadius: tokens.radii.lg,
    padding: tokens.spacing.md,
    marginHorizontal: tokens.spacing.md,
    borderWidth: 1,
    gap: tokens.spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  symbolWrap: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  symbol: {
    fontWeight: "700",
  },
  company: {
    marginTop: 2,
  },
  metricWrap: {
    alignItems: "flex-end",
    minWidth: 88,
  },
  price: {
    fontWeight: "600",
  },
  delta: {
    marginTop: 2,
    fontWeight: "600",
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: tokens.spacing.sm,
  },
  metaLabel: {
    fontSize: tokens.typography.caption.fontSize,
    marginBottom: 2,
  },
  rightMeta: {
    alignItems: "flex-end",
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: tokens.radii.lg,
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.lg,
    alignItems: "center",
  },
  monitorSection: {
    borderWidth: 1,
    borderRadius: tokens.radii.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  monitorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacing.sm,
  },
  monitorTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  monitorStatus: {
    fontSize: 12,
    fontWeight: "600",
  },
  monitorEmpty: {
    fontSize: 12,
    marginBottom: tokens.spacing.sm,
  },
  monitorError: {
    fontSize: 12,
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
});

