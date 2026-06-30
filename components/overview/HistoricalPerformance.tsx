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
import { useAllTransactions } from "@/hooks/queries/useTransactionQueries";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency, formatSignedCurrency } from "@/lib/currency";
import type { RealizedProfitDetail, SnapshotRecord } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { tokens } from "@/theme/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome";

// ── Types ───────────────────────────────────────────────────────────

interface YearlyData {
  year: string;
  hasSnapshot: boolean;
  portfolioValue: number;       // year-end snapshot value
  growth: number;               // delta vs prior year-end value
  netDeposits: number;          // yearly change in accumulated invested cash
  dividends: number;            // total cash dividends (KWD) that year
  appreciation: number;         // growth − net deposits
  appreciationExIncome: number; // appreciation excluding dividends + realized
  realizedPnl: number;          // total realized P&L (KWD) that year
}

interface Props {
  snapshotData?: { snapshots: SnapshotRecord[]; count: number };
  realizedData?: { total_realized_kwd: number; total_profit_kwd: number; total_loss_kwd: number; details: RealizedProfitDetail[] };
  livePortfolioValue?: number;
  liveAsOfDate?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function groupSnapshotsByYear(snapshots: SnapshotRecord[]): Map<string, SnapshotRecord[]> {
  const map = new Map<string, SnapshotRecord[]>();
  for (const s of snapshots) {
    const year = s.snapshot_date.slice(0, 4);
    const arr = map.get(year) ?? [];
    arr.push(s);
    map.set(year, arr);
  }
  return map;
}

// ── Component ───────────────────────────────────────────────────────

export function HistoricalPerformance({ snapshotData, realizedData, livePortfolioValue, liveAsOfDate }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { isPhone, spacing, fonts } = useResponsive();

  // Fetch all dividends (need per-record dates)
  const { data: allDivData } = useAllDividends();

  // Fetch all transactions (buy/sell/dividend — spans full history)
  const { data: allTxnData } = useAllTransactions();

  // ── Compute yearly data ─────────────────────────────────────────

  const yearlyData = useMemo((): YearlyData[] => {
    const hasLiveValue = typeof livePortfolioValue === "number" && Number.isFinite(livePortfolioValue);
    const normalizedLiveAsOfDate =
      typeof liveAsOfDate === "string" && liveAsOfDate.length >= 10
        ? liveAsOfDate.slice(0, 10)
        : null;

    const snapshots = [...(snapshotData?.snapshots ?? [])].sort(
      (a, b) => a.snapshot_date.localeCompare(b.snapshot_date),
    );

    const byYear = groupSnapshotsByYear(snapshots);

    // Dividends by year
    const divByYear = new Map<string, number>();
    for (const d of (allDivData?.dividends ?? [])) {
      const yr = d.txn_date.slice(0, 4);
      divByYear.set(yr, (divByYear.get(yr) ?? 0) + d.cash_dividend_kwd);
    }

    // Realized P&L by year.
    // Keep this aligned with TradingSummaryCards semantics:
    // use net trade outcome first, and fall back to realized + allocated dividends.
    const realByYear = new Map<string, number>();
    for (const r of (realizedData?.details ?? [])) {
      const yr = r.txn_date.slice(0, 4);
      const netPnlKwd = r.net_pnl_kwd ?? (r.realized_pnl_kwd + (r.dividends_allocated_kwd ?? 0));
      realByYear.set(yr, (realByYear.get(yr) ?? 0) + netPnlKwd);
    }

    // Transaction years are included in the union so filter chips can still
    // show years with activity even when snapshot rows are missing.
    const txnCostByYear = new Map<string, number>();
    const txns = allTxnData?.transactions ?? [];
    for (const txn of txns) {
      if (txn.is_deleted) continue;
      const yr = txn.txn_date.slice(0, 4);
      const cost = txn.purchase_cost ?? 0;
      const sellVal = txn.sell_value ?? 0;
      txnCostByYear.set(yr, (txnCostByYear.get(yr) ?? 0) + cost - sellVal);
    }

    // Union all years from snapshots, dividends, realized trades, and transactions
    const allYearsSet = new Set<string>([
      ...byYear.keys(),
      ...divByYear.keys(),
      ...realByYear.keys(),
      ...txnCostByYear.keys(),
    ]);
    const years = Array.from(allYearsSet).sort();
    if (!years.length) return [];

    let hasPrevSnapshotYear = false;
    let prevYearEndValue = 0;
    // deposit_cash in snapshots is a per-snapshot flow, while accumulated_cash
    // is cumulative invested cash. Yearly net deposits must use accumulated deltas.
    let prevYearEndAccumulatedCash = 0;
    let cumulativeCost = 0;

    return years.map((year) => {
      const yearSnaps = byYear.get(year);

      // Accumulate cost basis for this year
      cumulativeCost += txnCostByYear.get(year) ?? 0;

      if (yearSnaps) {
        const sorted = [...yearSnaps].sort((a, b) =>
          a.snapshot_date.localeCompare(b.snapshot_date),
        );
        const yearEnd = sorted[sorted.length - 1];
        const yearStart = sorted[0];

        // Portfolio growth uses year-end snapshot value, with a live-value override
        // for the current year when snapshots are behind today's overview value.
        const snapshotYearEndValue = yearEnd.portfolio_value;
        let portfolioValue = snapshotYearEndValue;
        if (
          hasLiveValue &&
          normalizedLiveAsOfDate &&
          normalizedLiveAsOfDate.slice(0, 4) === year &&
          normalizedLiveAsOfDate >= yearEnd.snapshot_date
        ) {
          portfolioValue = livePortfolioValue;
        }

        // Dividends
        const dividends = divByYear.get(year) ?? 0;

        // Appreciation = (year-end − year-start) minus net new cash injected this year.
        // startValue: use prior year-end to bridge cross-year continuity.
        const startValue = hasPrevSnapshotYear ? prevYearEndValue : yearStart.portfolio_value;
        const depositBaseline = hasPrevSnapshotYear
          ? prevYearEndAccumulatedCash
          : yearStart.accumulated_cash;
        const netDepositsThisYear = yearEnd.accumulated_cash - depositBaseline;
        const growth = portfolioValue - startValue;
        // Keep decomposition additive with the displayed growth total,
        // including current-year live-value override when present.
        const appreciation = growth - netDepositsThisYear;

        // Realized P&L
        const realizedPnl = realByYear.get(year) ?? 0;
        const appreciationExIncome = appreciation - dividends - realizedPnl;

        hasPrevSnapshotYear = true;
        prevYearEndValue = portfolioValue;
        prevYearEndAccumulatedCash = yearEnd.accumulated_cash;

        return {
          year,
          hasSnapshot: true,
          portfolioValue,
          growth,
          netDeposits: netDepositsThisYear,
          dividends,
          appreciation,
          appreciationExIncome,
          realizedPnl,
        };
      }

      // Year has no snapshots — appreciation is indeterminate; do NOT use cost basis
      // as a portfolio-value proxy (cost basis ≠ market value, would be misleading).
      // Do NOT update prevYear* so the next snapshot year picks up from the last
      // real snapshot rather than from a gap-year estimate.
      const dividends = divByYear.get(year) ?? 0;
      const realizedPnl = realByYear.get(year) ?? 0;

      return {
        year,
        hasSnapshot: false,
        portfolioValue: 0,
        growth: 0,
        netDeposits: 0,
        dividends,
        appreciation: 0,
        appreciationExIncome: 0,
        realizedPnl,
      };
    });
  }, [snapshotData, allDivData, realizedData, allTxnData, livePortfolioValue, liveAsOfDate]);

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

  // ── Chart data ──────────────────────────────────────────────────

  // FIX: use filter().pop() to get the immediately prior year in yearlyData,
  // not find() which returns the FIRST year less-than (could be 2020 when
  // the first filtered year is 2023, skipping 2021/2022 in between).
  const growthChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.growth })),
    [filteredData],
  );

  const growthBreakdownRows = useMemo(
    () => filteredData.filter((d) => d.hasSnapshot).map((d) => ({
      year: d.year,
      totalGrowth: d.growth,
      deposits: d.netDeposits,
      appreciationCore: d.appreciationExIncome,
      dividends: d.dividends,
      realized: d.realizedPnl,
    })),
    [filteredData],
  );

  const dividendBarData = useMemo(
    () => filteredData.map((d) => ({ year: d.year, amount: d.dividends })),
    [filteredData],
  );

  const appreciationChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.appreciation })),
    [filteredData],
  );

  const realizedChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.realizedPnl })),
    [filteredData],
  );

  // ── Summary metrics ─────────────────────────────────────────────

  const summary = useMemo(() => {
    const totalDiv = filteredData.reduce((s, d) => s + d.dividends, 0);
    const totalAppr = filteredData.reduce((s, d) => s + d.appreciation, 0);
    const totalReal = filteredData.reduce((s, d) => s + d.realizedPnl, 0);
    const latestValue = filteredData.length > 0 ? filteredData[filteredData.length - 1].portfolioValue : 0;
    const earliestValue = filteredData.length > 0 ? filteredData[0].portfolioValue : 0;
    const totalGrowth = latestValue - earliestValue;
    return { totalDiv, totalAppr, totalReal, latestValue, totalGrowth };
  }, [filteredData]);

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

      <View style={[s.breakdownContainer, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
        <Text style={[s.breakdownTitle, { color: colors.textSecondary }]}>
          {t("historical.growthBreakdownTitle", "Yearly Growth Breakdown")}
        </Text>
        <Text style={[s.breakdownSubtitle, { color: colors.textMuted }]}>
          {t("historical.growthBreakdownHint", "Total Growth = Deposits + Appreciation + Dividends + Realized P/L")}
        </Text>

        <View style={[s.breakdownHeaderRow, { borderBottomColor: colors.borderColor }]}> 
          <Text style={[s.colYear, { color: colors.textSecondary }]}>{t("historical.colYear", "Year")}</Text>
          <Text style={[s.colVal, { color: colors.textSecondary }]}>{t("historical.colTotalGrowth", "Total")}</Text>
          <Text style={[s.colVal, { color: colors.textSecondary }]}>{t("historical.colDeposits", "Deposits")}</Text>
          <Text style={[s.colVal, { color: colors.textSecondary }]}>{t("historical.colAppreciation", "Apprec.")}</Text>
          <Text style={[s.colVal, { color: colors.textSecondary }]}>{t("historical.colDividends", "Div.")}</Text>
          <Text style={[s.colVal, { color: colors.textSecondary }]}>{t("historical.colRealized", "Realized")}</Text>
        </View>

        {growthBreakdownRows.map((row, idx) => (
          <View
            key={row.year}
            style={[
              s.breakdownDataRow,
              {
                borderBottomColor: colors.borderColor,
                borderBottomWidth: idx < growthBreakdownRows.length - 1 ? StyleSheet.hairlineWidth : 0,
              },
            ]}
          >
            <Text style={[s.colYear, { color: colors.textPrimary, fontWeight: "600" }]}>{row.year}</Text>
            <Text style={[s.colVal, { color: row.totalGrowth >= 0 ? colors.success : colors.danger }]}>{formatSignedCurrency(row.totalGrowth)}</Text>
            <Text style={[s.colVal, { color: row.deposits >= 0 ? colors.success : colors.danger }]}>{formatSignedCurrency(row.deposits)}</Text>
            <Text style={[s.colVal, { color: row.appreciationCore >= 0 ? colors.success : colors.danger }]}>{formatSignedCurrency(row.appreciationCore)}</Text>
            <Text style={[s.colVal, { color: row.dividends >= 0 ? colors.success : colors.danger }]}>{formatSignedCurrency(row.dividends)}</Text>
            <Text style={[s.colVal, { color: row.realized >= 0 ? colors.success : colors.danger }]}>{formatSignedCurrency(row.realized)}</Text>
          </View>
        ))}
      </View>

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
  breakdownContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  breakdownSubtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  breakdownHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  breakdownDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  colYear: {
    width: 56,
    fontSize: 12,
  },
  colVal: {
    flex: 1,
    fontSize: 11,
    textAlign: "right",
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
