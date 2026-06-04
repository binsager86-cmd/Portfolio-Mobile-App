/**
 * HistoricalPerformance — Yearly breakdown of portfolio metrics.
 *
 * Sections:
 *  a) Portfolio growth by year (year-end portfolio value)
 *  b) Dividends received by year
 *  c) Appreciation in value each year (value change − deposits)
 *  d) Realized profit/loss each year
 *
 * Each section has a line chart.
 * A year-filter chip bar lets the user select which years to display (default: all).
 */

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import DividendYearlyChart from "@/components/charts/DividendYearlyChart";
import SnapshotLineChart, { type ChartDataPoint } from "@/components/charts/SnapshotLineChart";
import { MetricCard } from "@/components/ui/MetricCard";
import { useAllDividends } from "@/hooks/queries/useDividendQueries";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency, formatSignedCurrency } from "@/lib/currency";
import {
  buildYearlyHistoricalData,
  type YearlyPerformanceDataPoint,
} from "@/lib/historicalPerformanceData";
import type { RealizedProfitDetail, SnapshotRecord } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { tokens } from "@/theme/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome";

// ── Types ───────────────────────────────────────────────────────────

interface Props {
  snapshotData?: { snapshots: SnapshotRecord[]; count: number };
  realizedData?: { total_realized_kwd: number; total_profit_kwd: number; total_loss_kwd: number; details: RealizedProfitDetail[] };
  livePortfolioValue?: number;
}

function getLocalIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ── Component ───────────────────────────────────────────────────────

export function HistoricalPerformance({ snapshotData, realizedData, livePortfolioValue }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { isPhone, spacing, fonts } = useResponsive();

  // Fetch all dividends (need per-record dates)
  const { data: allDivData } = useAllDividends();

  const todayIso = getLocalIsoDate(new Date());

  // ── Compute yearly data ─────────────────────────────────────────

  const yearlyData = useMemo((): YearlyPerformanceDataPoint[] => {
    return buildYearlyHistoricalData({
      snapshots: snapshotData?.snapshots ?? [],
      dividends: allDivData?.dividends ?? [],
      realizedDetails: realizedData?.details ?? [],
      livePortfolioValue,
      liveAsOfDate: todayIso,
    });
  }, [snapshotData?.snapshots, allDivData?.dividends, realizedData?.details, livePortfolioValue, todayIso]);

  // ── Year filter ─────────────────────────────────────────────────

  const allYears = useMemo(() => yearlyData.map((d) => d.year), [yearlyData]);
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());

  // "All" = empty set means show everything
  const isAllSelected = selectedYears.size === 0;

  const toggleYear = (year: string) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const clearFilter = () => setSelectedYears(new Set());

  const filteredData = useMemo(() => {
    if (isAllSelected) return yearlyData;
    return yearlyData.filter((d) => selectedYears.has(d.year));
  }, [yearlyData, selectedYears, isAllSelected]);

  const snapshotBackedData = useMemo(
    () => filteredData.filter((d) => d.hasSnapshot),
    [filteredData],
  );

  // ── Chart data ──────────────────────────────────────────────────

  const growthChartData: ChartDataPoint[] = useMemo(
    () => snapshotBackedData.map((d) => ({ label: d.year, value: d.growth })),
    [snapshotBackedData],
  );

  const dividendBarData = useMemo(
    () => filteredData.map((d) => ({ year: d.year, amount: d.dividends })),
    [filteredData],
  );

  const appreciationChartData: ChartDataPoint[] = useMemo(
    () => snapshotBackedData.map((d) => ({ label: d.year, value: d.appreciation })),
    [snapshotBackedData],
  );

  const realizedChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.realizedPnl })),
    [filteredData],
  );

  // ── Summary metrics ─────────────────────────────────────────────

  const summary = useMemo(() => {
    const totalDiv = filteredData.reduce((s, d) => s + d.dividends, 0);
    const totalAppr = snapshotBackedData.reduce((s, d) => s + d.appreciation, 0);
    const totalReal = filteredData.reduce((s, d) => s + d.realizedPnl, 0);
    const latestValue = snapshotBackedData.length > 0 ? snapshotBackedData[snapshotBackedData.length - 1].portfolioValue : 0;
    const totalGrowth = snapshotBackedData.reduce((s, d) => s + d.growth, 0);
    return { totalDiv, totalAppr, totalReal, latestValue, totalGrowth };
  }, [filteredData, snapshotBackedData]);

  // ── Empty state ─────────────────────────────────────────────────

  if (!yearlyData.length) {
    return (
      <View style={[s.emptyContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <FontAwesome name="bar-chart" size={32} color={colors.textMuted} />
        <Text style={[s.emptyText, { color: colors.textMuted }]}>
          {t("historical.noData")}
        </Text>
      </View>
    );
  }

  const colW = isPhone ? "48%" : "24%";

  return (
    <View>
      {/* ── Year Filter ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t("historical.filterYears")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={{ marginBottom: tokens.spacing.md }}
      >
        <Pressable
          onPress={clearFilter}
          style={[
            s.filterChip,
            {
              backgroundColor: isAllSelected ? colors.accentPrimary + "18" : colors.bgCard,
              borderColor: isAllSelected ? colors.accentPrimary : colors.borderColor,
            },
          ]}
        >
          <Text
            style={[
              s.filterChipText,
              { color: isAllSelected ? colors.accentPrimary : colors.textSecondary },
            ]}
          >
            {t("historical.allYears")}
          </Text>
        </Pressable>
        {allYears.map((year) => {
          const active = selectedYears.has(year);
          return (
            <Pressable
              key={year}
              onPress={() => toggleYear(year)}
              style={[
                s.filterChip,
                {
                  backgroundColor: active ? colors.accentPrimary + "18" : colors.bgCard,
                  borderColor: active ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text
                style={[
                  s.filterChipText,
                  { color: active ? colors.accentPrimary : colors.textSecondary },
                ]}
              >
                {year}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Summary Cards ── */}
      <View style={[s.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          icon="line-chart"
          label={t("historical.portfolioGrowth")}
          value={formatSignedCurrency(summary.totalGrowth)}
          subline={`${t("historical.latestValue")}: ${formatCurrency(summary.latestValue)}`}
          trend={summary.totalGrowth >= 0 ? "up" : "down"}
          accentColor="#3b82f6"
          width={colW}
        />
        <MetricCard
          icon="money"
          label={t("historical.totalDividends")}
          value={formatCurrency(summary.totalDiv)}
          accentColor={colors.success}
          width={colW}
        />
        <MetricCard
          icon="arrow-up"
          label={t("historical.appreciation")}
          value={formatSignedCurrency(summary.totalAppr)}
          trend={summary.totalAppr >= 0 ? "up" : "down"}
          accentColor="#8b5cf6"
          width={colW}
        />
        <MetricCard
          icon="exchange"
          label={t("historical.realizedPL")}
          value={formatSignedCurrency(summary.totalReal)}
          trend={summary.totalReal >= 0 ? "up" : "down"}
          accentColor="#f59e0b"
          width={colW}
        />
      </View>

      {/* ── Chart: Portfolio Growth by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t("historical.portfolioGrowthChart")}
      </Text>
      {growthChartData.length >= 2 ? (
        <SnapshotLineChart
          data={growthChartData}
          title=""
          colors={colors}
          lineColor="#3b82f6"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}

      {/* ── Chart: Dividends by Year (bar chart) ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: tokens.spacing.md }]}>
        {t("historical.dividendsByYear")}
      </Text>
      <DividendYearlyChart data={dividendBarData} currency="KWD" height={260} />

      {/* ── Chart: Appreciation by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: tokens.spacing.md }]}>
        {t("historical.appreciationChart")}
      </Text>
      {appreciationChartData.length >= 2 ? (
        <SnapshotLineChart
          data={appreciationChartData}
          title=""
          colors={colors}
          lineColor="#8b5cf6"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}

      {/* ── Chart: Realized P/L by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: tokens.spacing.md }]}>
        {t("historical.realizedPLChart")}
      </Text>
      {realizedChartData.length >= 2 ? (
        <SnapshotLineChart
          data={realizedChartData}
          title=""
          colors={colors}
          lineColor="#f59e0b"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

/* eslint-disable custom-styles/no-hardcoded-styles */
const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginBottom: 24,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chartPlaceholder: {
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
});
/* eslint-enable custom-styles/no-hardcoded-styles */
