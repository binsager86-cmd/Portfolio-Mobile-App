/**
 * Quarter Movement Panel — quarterly price & P/E movement analysis
 * with expected price forecast for the active quarter.
 *
 * Placed inside the F.Signals container under the "Quarter Movement" tab.
 * Spec: §6.1 summary block, §6.2 historical table, §6.3 formatting rules.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useStockList } from "@/hooks/queries";
import {
  exportQuarterMovementExcel,
  exportQuarterMovementPdf,
} from "@/lib/exportQuarterMovementReport";
import {
  fetchStockPrice,
  getQuarterMovement,
  type AnalysisStock,
  type Quarter,
  type QuarterMovementPriceCell,
  type QuarterMovementPECell,
  type QuarterMovementResponse,
} from "@/services/api";

// ── Formatting helpers (spec §6.3) ────────────────────────────────────────────

/** Format a percentage with sign and 1 decimal place. Returns "N/A" on null. */
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/** Format a P/E ratio to 2 decimal places. Returns "N/A" on null. */
function fmtPE(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return v.toFixed(2);
}

/** Format a price to 3 decimal places. Returns "N/A" on null. */
function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return v.toFixed(3);
}

function roundPrice(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function normalizeQuarterMovementPrice(
  rawPrice: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (rawPrice == null || !Number.isFinite(rawPrice)) return null;
  if ((currency ?? "").toUpperCase() === "KWD" && rawPrice >= 10) {
    return rawPrice / 1000;
  }
  return rawPrice;
}

function computePctExpectedPrice(
  baselinePrice: number | null,
  pctMove: number | null | undefined,
): number | null {
  if (baselinePrice == null || !Number.isFinite(baselinePrice) || baselinePrice <= 0) return null;
  if (pctMove == null || !Number.isFinite(pctMove)) return null;
  return roundPrice(baselinePrice * (1 + (pctMove / 100)));
}

function computePeExpectedPrice(
  ttmEps: number | null | undefined,
  peMean: number | null | undefined,
): number | null {
  if (ttmEps == null || !Number.isFinite(ttmEps) || ttmEps <= 0) return null;
  if (peMean == null || !Number.isFinite(peMean)) return null;
  return roundPrice(ttmEps * peMean);
}

function computeConsensusExpectedPrice(
  first: number | null,
  second: number | null,
): number | null {
  if (first == null || second == null) return null;
  return roundPrice((first + second) / 2);
}

const QUARTERS: readonly Quarter[] = ["q1", "q2", "q3", "q4"] as const;
const Q_LABEL: Record<Quarter, string> = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };

function formatEpsSourceLabel(source: string): string {
  switch (source) {
    case "stock_metrics":
      return "stored metrics";
    case "financials":
      return "financial statements";
    case "none":
      return "unavailable";
    default:
      return source.replace(/_/g, " ");
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryBlock({
  data,
  colors,
  currentPrice,
}: {
  data: QuarterMovementResponse;
  colors: ThemePalette;
  currentPrice: number | null;
}) {
  const activePriceMean = data.price_movement_means[data.active_quarter_key];
  const activePEMean = data.pe_movement_means[data.active_quarter_key];
  const activeLabel = `${data.active_quarter} ${data.active_year}`;
  const normalizedBaselinePrice = normalizeQuarterMovementPrice(data.baseline_price, data.currency);
  const methodOneExpectedPrice = computePctExpectedPrice(
    normalizedBaselinePrice,
    activePriceMean.high_pct_mean,
  );
  const methodOneExpectedLowPrice = computePctExpectedPrice(
    normalizedBaselinePrice,
    activePriceMean.low_pct_mean,
  );
  const methodTwoExpectedPrice = computePeExpectedPrice(
    data.ttm_eps,
    activePEMean.highest_pe_mean,
  );
  const methodTwoExpectedLowPrice = computePeExpectedPrice(
    data.ttm_eps,
    activePEMean.lowest_pe_mean,
  );
  const consensusExpectedPrice = computeConsensusExpectedPrice(
    methodOneExpectedPrice,
    methodTwoExpectedPrice,
  );
  const consensusExpectedLowPrice = computeConsensusExpectedPrice(
    methodOneExpectedLowPrice,
    methodTwoExpectedLowPrice,
  );

  const infoMetrics: { label: string; value: string; note?: string }[] = [
    {
      label: "Active Quarter",
      value: activeLabel,
    },
    {
      label: "Current Price",
      value: fmtPrice(currentPrice),
    },
    {
      label: "Baseline",
      value: normalizedBaselinePrice != null
        ? `${fmtPrice(normalizedBaselinePrice)} ${data.currency ?? ""}`.trim()
        : "N/A",
    },
    {
      label: "TTM EPS",
      value: data.ttm_eps != null ? data.ttm_eps.toFixed(4) : "N/A",
      note: data.ttm_eps != null ? formatEpsSourceLabel(data.ttm_eps_source) : undefined,
    },
  ];

  const groupedMetrics: Array<{
    key: "high" | "low";
    title: string;
    tone: string;
    note?: string;
    metrics: { label: string; value: string }[];
  }> = [
    {
      key: "high",
      title: "High Case",
      tone: colors.success,
      note: activePriceMean.reduced_sample ? "* limited historical sample" : undefined,
      metrics: [
        {
          label: "Hist. Mean High%",
          value: activePriceMean.high_pct_mean != null ? fmtPct(activePriceMean.high_pct_mean) : "N/A",
        },
        {
          label: "Expected (Price %)",
          value: fmtPrice(methodOneExpectedPrice),
        },
        {
          label: "Expected (P/E × EPS)",
          value: data.eps_coverage === "none" ? "N/A" : fmtPrice(methodTwoExpectedPrice),
        },
        {
          label: "Highest Expected",
          value: fmtPrice(consensusExpectedPrice),
        },
      ],
    },
    {
      key: "low",
      title: "Low Case",
      tone: colors.danger,
      note: activePriceMean.reduced_sample ? "* limited historical sample" : undefined,
      metrics: [
        {
          label: "Hist. Mean Low%",
          value: activePriceMean.low_pct_mean != null ? fmtPct(activePriceMean.low_pct_mean) : "N/A",
        },
        {
          label: "Expected (Price %)",
          value: fmtPrice(methodOneExpectedLowPrice),
        },
        {
          label: "Expected (P/E × EPS)",
          value: data.eps_coverage === "none" ? "N/A" : fmtPrice(methodTwoExpectedLowPrice),
        },
        {
          label: "Lowest Expected",
          value: fmtPrice(consensusExpectedLowPrice),
        },
      ],
    },
  ];

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.summaryHeader}>
        <Text style={[styles.summaryTitle, { color: colors.textMuted }]}>
          QUARTER MOVEMENT SUMMARY
        </Text>
        {data.stale && (
          <View style={[styles.stalePill, { backgroundColor: colors.danger + "20" }]}>
            <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "700" }}>STALE DATA</Text>
          </View>
        )}
      </View>

      <View style={styles.summaryGrid}>
        {infoMetrics.map((m, i) => (
          <View key={i} style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: colors.textMuted }]}>{m.label}</Text>
            <Text
              style={[
                styles.summaryMetricValue,
                { color: colors.textPrimary, opacity: m.value === "N/A" ? 0.45 : 1 },
              ]}
            >
              {m.value}
            </Text>
            {m.note ? (
              <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 1 }}>{m.note}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.summaryScenarioGrid}>
        {groupedMetrics.map((group) => (
          <View
            key={group.key}
            style={[
              styles.summaryScenarioCard,
              { backgroundColor: group.tone + "10", borderColor: group.tone + "55" },
            ]}
          >
            <View style={styles.summaryScenarioHeader}>
              <Text style={[styles.summaryScenarioTitle, { color: group.tone }]}>{group.title}</Text>
              {group.note ? (
                <Text style={[styles.summaryScenarioNote, { color: colors.textSecondary }]}>{group.note}</Text>
              ) : null}
            </View>

            {group.metrics.map((metric) => (
              <View key={metric.label} style={styles.summaryScenarioRow}>
                <Text style={[styles.summaryScenarioLabel, { color: colors.textSecondary }]}>{metric.label}</Text>
                <Text
                  style={[
                    styles.summaryScenarioValue,
                    { color: colors.textPrimary, opacity: metric.value === "N/A" ? 0.45 : 1 },
                  ]}
                >
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Price movement table — each cell shows "High% / Low%" */
function PriceMovementTable({ data, colors }: { data: QuarterMovementResponse; colors: ThemePalette }) {
  const priceMeans = data.price_movement_means;

  return (
    <View style={[styles.table, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
      {/* Header */}
      <View style={[styles.tableRow, { backgroundColor: colors.bgInput }]}>
        <Text style={[styles.thYear, { color: colors.textMuted }]}>Year</Text>
        {QUARTERS.map((q) => (
          <Text key={q} style={[styles.thCell, { color: colors.textMuted }]}>{Q_LABEL[q]}</Text>
        ))}
      </View>

      {/* Data rows */}
      {data.years.map((year, idx) => (
        <View
          key={year}
          style={[
            styles.tableRow,
            idx < data.years.length - 1 && { borderBottomColor: colors.borderColor, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[styles.thYear, { color: colors.textPrimary, fontWeight: "700" }]}>{year}</Text>
          {QUARTERS.map((q) => {
            const cell = data.price_movement_table[String(year)]?.[q] as QuarterMovementPriceCell | null;
            const content = renderPriceCell(cell);
            return (
              <DualValueCell
                key={q}
                colors={colors}
                highLabel="HIGH"
                lowLabel="LOW"
                highText={content.highText}
                lowText={content.lowText}
                highColor={colors.success}
                lowColor={colors.danger}
                inProgress={!!cell?.in_progress}
              />
            );
          })}
        </View>
      ))}

      {/* Means row */}
      <View style={[styles.tableRow, { backgroundColor: colors.accentPrimary + "08", borderTopColor: colors.borderColor, borderTopWidth: 1 }]}>
        <Text style={[styles.thYear, { color: colors.accentPrimary, fontWeight: "800" }]}>Avg</Text>
        {QUARTERS.map((q) => {
          const mean = priceMeans[q];
          return (
            <DualValueCell
              key={q}
              colors={colors}
              highLabel="HIGH"
              lowLabel="LOW"
              highText={`${mean.high_pct_mean != null ? fmtPct(mean.high_pct_mean) : "N/A"}${mean.reduced_sample ? "*" : ""}`}
              lowText={mean.low_pct_mean != null ? fmtPct(mean.low_pct_mean) : "N/A"}
              highColor={colors.success}
              lowColor={colors.danger}
            />
          );
        })}
      </View>
    </View>
  );
}

/** P/E movement table — each cell shows "High P/E / Low P/E" */
function PEMovementTable({ data, colors }: { data: QuarterMovementResponse; colors: ThemePalette }) {
  const peMeans = data.pe_movement_means;

  return (
    <View style={[styles.table, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
      <View style={[styles.tableRow, { backgroundColor: colors.bgInput }]}>
        <Text style={[styles.thYear, { color: colors.textMuted }]}>Year</Text>
        {QUARTERS.map((q) => (
          <Text key={q} style={[styles.thCell, { color: colors.textMuted }]}>{Q_LABEL[q]}</Text>
        ))}
      </View>

      {data.years.map((year, idx) => (
        <View
          key={year}
          style={[
            styles.tableRow,
            idx < data.years.length - 1 && { borderBottomColor: colors.borderColor, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[styles.thYear, { color: colors.textPrimary, fontWeight: "700" }]}>{year}</Text>
          {QUARTERS.map((q) => {
            const cell = data.pe_movement_table[String(year)]?.[q] as QuarterMovementPECell | null;
            return (
              <DualValueCell
                key={q}
                colors={colors}
                highLabel="HIGH"
                lowLabel="LOW"
                highText={cell == null || cell.insufficient_data ? "N/A" : fmtPE(cell.highest_pe)}
                lowText={cell == null || cell.insufficient_data ? "N/A" : fmtPE(cell.lowest_pe)}
                highColor={colors.success}
                lowColor={colors.danger}
                inProgress={!!cell?.in_progress}
              />
            );
          })}
        </View>
      ))}

      <View style={[styles.tableRow, { backgroundColor: colors.accentPrimary + "08", borderTopColor: colors.borderColor, borderTopWidth: 1 }]}>
        <Text style={[styles.thYear, { color: colors.accentPrimary, fontWeight: "800" }]}>Avg</Text>
        {QUARTERS.map((q) => {
          const mean = peMeans[q];
          return (
            <DualValueCell
              key={q}
              colors={colors}
              highLabel="HIGH"
              lowLabel="LOW"
              highText={`${mean.highest_pe_mean != null ? fmtPE(mean.highest_pe_mean) : "N/A"}${mean.reduced_sample ? "*" : ""}`}
              lowText={mean.lowest_pe_mean != null ? fmtPE(mean.lowest_pe_mean) : "N/A"}
              highColor={colors.success}
              lowColor={colors.danger}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Cell renderer helper ──────────────────────────────────────────────────────

function renderPriceCell(cell: QuarterMovementPriceCell | null): {
  highText: string;
  lowText: string;
} {
  if (cell == null || cell.insufficient_data) {
    return { highText: "N/A", lowText: "N/A" };
  }
  return {
    highText: cell.high_pct != null ? fmtPct(cell.high_pct) : "N/A",
    lowText: cell.low_pct != null ? fmtPct(cell.low_pct) : "N/A",
  };
}

function DualValueCell({
  colors,
  highLabel,
  lowLabel,
  highText,
  lowText,
  highColor,
  lowColor,
  inProgress,
}: {
  colors: ThemePalette;
  highLabel: string;
  lowLabel: string;
  highText: string;
  lowText: string;
  highColor: string;
  lowColor: string;
  inProgress?: boolean;
}) {
  return (
    <View style={styles.dualCell}>
      <View style={styles.dualMetricBlock}>
        <Text style={[styles.dualMetricLabel, { color: highColor }]}>{highLabel}</Text>
        <Text style={[styles.dualMetricValue, { color: highColor }]}>{highText}</Text>
      </View>
      <View style={styles.dualMetricBlock}>
        <Text style={[styles.dualMetricLabel, { color: lowColor }]}>{lowLabel}</Text>
        <Text style={[styles.dualMetricValue, { color: lowColor }]}>{lowText}</Text>
      </View>
      {inProgress ? (
        <View style={[styles.inProgressBadge, { backgroundColor: colors.accentPrimary + "14" }]}>
          <Text style={[styles.inProgressLabel, { color: colors.accentPrimary }]}>LIVE</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function QuarterMovementPanel({
  colors,
  selectedStock,
}: {
  colors: ThemePalette;
  selectedStock: AnalysisStock | null;
}) {
  const stockListMarket = selectedStock?.exchange === "KSE" || selectedStock?.currency === "KWD"
    ? "kuwait"
    : "us";
  const stockListQuery = useStockList(stockListMarket, !!selectedStock?.symbol);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const matchedStockEntry = useMemo(() => {
    if (!selectedStock?.symbol) return null;
    return stockListQuery.data?.stocks.find(
      (entry) => entry.symbol.trim().toUpperCase() === selectedStock.symbol.trim().toUpperCase(),
    ) ?? null;
  }, [selectedStock?.symbol, stockListQuery.data?.stocks]);

  const query = useQuery({
    queryKey: ["trade-signals", "quarter-movement", selectedStock?.id],
    queryFn: () => getQuarterMovement(selectedStock!.id),
    enabled: !!selectedStock?.id,
    staleTime: 60_000,
  });

  const currentPriceFallbackQuery = useQuery({
    queryKey: ["trade-signals", "quarter-movement-current-price", selectedStock?.id, matchedStockEntry?.yf_ticker],
    queryFn: () => fetchStockPrice(matchedStockEntry!.yf_ticker, selectedStock!.currency || "KWD"),
    enabled: !!selectedStock?.id && !!matchedStockEntry?.yf_ticker && query.data?.current_price == null,
    staleTime: 60_000,
  });

  if (!selectedStock) {
    return (
      <View style={[styles.placeholderCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={[styles.placeholderIcon, { backgroundColor: colors.accentPrimary + "14" }]}>
          <FontAwesome name="bar-chart" size={20} color={colors.accentPrimary} />
        </View>
        <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 16, marginTop: 12 }}>
          Quarter Movement
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: "center", maxWidth: 420 }}>
          Select a company to view quarterly price and P/E movement with expected price forecasts.
        </Text>
      </View>
    );
  }

  if (query.isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.accentPrimary} />
        <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
          Loading quarter movement data...
        </Text>
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={[styles.errorBox, { borderColor: colors.danger + "40", backgroundColor: colors.danger + "10" }]}>
        <FontAwesome name="exclamation-triangle" size={20} color={colors.danger} />
        <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13, textAlign: "center" }}>
          Could not load quarter movement data. The data source may be temporarily unavailable.
        </Text>
        <Pressable
          onPress={() => query.refetch()}
          style={[styles.retryBtn, { backgroundColor: colors.danger }]}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!query.data) return null;

  const data = query.data;
  const effectiveCurrentPrice = normalizeQuarterMovementPrice(
    data.current_price ?? currentPriceFallbackQuery.data?.price ?? null,
    data.currency ?? selectedStock?.currency,
  );

  const handleExport = async (format: "excel" | "pdf") => {
    if (exporting) return;
    try {
      setExporting(format);
      const reportInput = {
        data,
        stock: {
          symbol: selectedStock.symbol,
          company_name: selectedStock.company_name,
          currency: selectedStock.currency,
        },
        currentPrice: effectiveCurrentPrice,
      };
      if (format === "excel") {
        await exportQuarterMovementExcel(reportInput);
      } else {
        await exportQuarterMovementPdf(reportInput);
      }
    } catch (error) {
      console.error("Quarter movement export failed", error);
      Alert.alert("Export failed", "Could not export the quarter movement report.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <View style={[styles.exportCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.exportHeaderRow}>
          <View style={[styles.exportBadge, { backgroundColor: colors.accentPrimary + "14" }]}>
            <FontAwesome name="files-o" size={18} color={colors.accentPrimary} />
          </View>
          <View style={styles.exportTextWrap}>
            <Text style={[styles.exportTitle, { color: colors.textPrimary }]}>Quarter Movement Report</Text>
            <Text style={[styles.exportSubtitle, { color: colors.textMuted }]}>Export the live analysis as a styled Excel workbook or presentation-ready PDF.</Text>
          </View>
        </View>

        <View style={styles.exportActionsRow}>
          <Pressable
            onPress={() => void handleExport("excel")}
            disabled={exporting !== null}
            style={({ pressed }) => [
              styles.exportAction,
              {
                backgroundColor: colors.accentPrimary,
                opacity: pressed || exporting !== null ? 0.7 : 1,
              },
            ]}
          >
            <FontAwesome name="file-excel-o" size={16} color="#fff" />
            <Text style={styles.exportActionText}>
              {exporting === "excel" ? "Preparing Excel..." : "Export Excel"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void handleExport("pdf")}
            disabled={exporting !== null}
            style={({ pressed }) => [
              styles.exportActionSecondary,
              {
                borderColor: colors.borderColor,
                backgroundColor: colors.bgInput,
                opacity: pressed || exporting !== null ? 0.7 : 1,
              },
            ]}
          >
            <FontAwesome name="file-pdf-o" size={16} color={colors.textPrimary} />
            <Text style={[styles.exportActionSecondaryText, { color: colors.textPrimary }]}>
              {exporting === "pdf" ? "Preparing PDF..." : "Export PDF"}
            </Text>
          </Pressable>
        </View>
      </View>

      <SummaryBlock data={data} colors={colors} currentPrice={effectiveCurrentPrice} />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 18 }]}>
        Price Movement (High% / Low%)
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
        Green HIGH shows upside from the baseline. Red LOW shows downside. LIVE = in progress.{" "}
        {Object.values(data.price_movement_means).some((m) => m.reduced_sample) ? "* = limited historical sample." : ""}
      </Text>
      <PriceMovementTable data={data} colors={colors} />

      {data.eps_coverage !== "none" ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 18 }]}>
            P/E Movement (High P/E / Low P/E)
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Green HIGH marks the quarterly peak P/E. Red LOW marks the quarterly trough P/E.
            {data.eps_coverage === "latest_only" ? " * P/E computed using latest TTM EPS only." : ""}
          </Text>
          <PEMovementTable data={data} colors={colors} />
        </>
      ) : (
        <View style={[styles.naPillCard, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="info-circle" size={14} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8 }}>
            P/E movement unavailable — no EPS data found for this company.
          </Text>
        </View>
      )}

      <Text style={[styles.footerNote, { color: colors.textMuted }]}>
        Updated {data.last_updated} · Source: {data.data_source}
      </Text>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingBox: { paddingVertical: 36, alignItems: "center" },
  errorBox: { padding: 18, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },

  placeholderCard: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  placeholderIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  exportCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  exportHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  exportBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  exportTextWrap: {
    flex: 1,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  exportSubtitle: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 18,
  },
  exportActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  exportAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    minWidth: 150,
  },
  exportActionSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    minWidth: 150,
    borderWidth: 1,
  },
  exportActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  exportActionSecondaryText: {
    fontSize: 13,
    fontWeight: "800",
  },

  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  stalePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryMetric: { minWidth: "30%", flex: 1 },
  summaryMetricLabel: { fontSize: 10, fontWeight: "600", marginBottom: 3 },
  summaryMetricValue: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },

  summaryScenarioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  summaryScenarioCard: {
    flex: 1,
    minWidth: 260,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  summaryScenarioHeader: {
    marginBottom: 10,
  },
  summaryScenarioTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  summaryScenarioNote: {
    fontSize: 9,
    marginTop: 2,
  },
  summaryScenarioRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryScenarioLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  summaryScenarioValue: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },

  baselineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },

  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  sectionSubtitle: { fontSize: 11, marginBottom: 8 },

  table: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  tableRow: { flexDirection: "row", paddingVertical: 15, paddingHorizontal: 10, alignItems: "stretch" },
  thYear: { width: 70, fontSize: 15, fontWeight: "800", textAlignVertical: "center" },
  thCell: { flex: 1, fontSize: 14, fontWeight: "800", textAlign: "center" },

  dualCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 8 },
  dualMetricBlock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  dualMetricLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 3, textAlign: "center" },
  dualMetricValue: { fontSize: 18, fontWeight: "800", textAlign: "center", fontVariant: ["tabular-nums"] },
  inProgressBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  inProgressLabel: { fontSize: 10, textAlign: "center", fontWeight: "800", letterSpacing: 0.4 },

  naPillCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },

  footerNote: { fontSize: 10, marginTop: 14, textAlign: "right" },
});
