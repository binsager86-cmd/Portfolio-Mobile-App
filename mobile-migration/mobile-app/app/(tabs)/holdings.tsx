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
import { exportHoldingsExcel, type Holding } from "@/services/api";
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
import { donutStyles, s } from "@/src/features/holdings/styles";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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
});

