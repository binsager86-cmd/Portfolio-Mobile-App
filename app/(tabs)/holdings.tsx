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
import { HoldingsTableSkeleton } from "@/components/ui/PageSkeletons";
import { ResponsiveDataTable, type DataColumn } from "@/components/ui/ResponsiveDataTable";
import { UITokens } from "@/constants/uiTokens";
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
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Main screen ─────────────────────────────────────────────────────

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { spacing } = useResponsive();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();

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

  const portfolios = [undefined, "KFH", "BBYN", "USA"];
  const filterLabels = ["All", "KFH", "BBYN", "USA"];

  return (
    <DataScreen
      loading={isLoading}
      error={isError ? getApiErrorMessage(error, t("holdingsScreen.failedToLoad")) : null}
      onRetry={() => refetch()}
      loadingSkeleton={<HoldingsTableSkeleton />}
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

        {/* ── Scrollable content ──────────────────────────────── */}
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

