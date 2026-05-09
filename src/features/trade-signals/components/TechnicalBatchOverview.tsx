import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

import type { ThemePalette } from "@/constants/theme";
import { showErrorAlert } from "@/lib/errorHandling";
import {
  getTechnicalBatchLatest,
  runTechnicalBatchScan,
  type TechnicalBatchRow,
} from "@/services/api";

function formatUnix(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= 75) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.danger;
}

function statusChipColors(status: string, colors: ThemePalette): { bg: string; fg: string } {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") {
    return { bg: colors.successBg, fg: colors.successText };
  }
  if (normalized === "running") {
    return { bg: colors.warningBg, fg: colors.warningText };
  }
  if (normalized === "failed") {
    return { bg: colors.dangerBg, fg: colors.dangerText };
  }
  return { bg: colors.bgInput, fg: colors.textSecondary };
}

function scoreText(value: number): string {
  return Number.isFinite(value) ? String(value) : "-";
}

function sortableScore(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function buildLayout(windowWidth: number) {
  const contentWidth = Math.max(windowWidth - 64, 760);
  const wide = windowWidth >= 1200;
  const medium = windowWidth >= 900 && windowWidth < 1200;

  const rankWidth = wide ? 56 : 50;
  const companyWidth = wide ? 280 : medium ? 250 : 220;
  const metricWidth = wide ? 148 : medium ? 138 : 130;
  const overallWidth = wide ? 152 : medium ? 142 : 132;
  const minTableWidth = rankWidth + companyWidth + metricWidth * 4 + overallWidth + 16;

  return {
    rankWidth,
    companyWidth,
    metricWidth,
    overallWidth,
    tableWidth: Math.max(contentWidth, minTableWidth),
    titleSize: wide ? 24 : medium ? 22 : 20,
    subtitleSize: wide ? 15 : 14,
    sectionLabelSize: wide ? 13 : 12,
    bodySize: wide ? 16 : 15,
    companyNameSize: wide ? 17 : 16,
    symbolSize: wide ? 13 : 12,
    metricValueSize: wide ? 18 : medium ? 17 : 16,
    overallSize: wide ? 20 : medium ? 19 : 18,
    statusSize: wide ? 12 : 11,
    kpiValueSize: wide ? 30 : medium ? 27 : 24,
    rowHeight: wide ? 62 : 58,
    headerHeight: wide ? 50 : 48,
  };
}

async function exportTechnicalRowsToExcel(
  rows: TechnicalBatchRow[],
  runId: number | null | undefined,
): Promise<void> {
  try {
    const ordered = [...rows].sort((a, b) => sortableScore(b.overall_score) - sortableScore(a.overall_score));
    const data = ordered.map((row, index) => ({
      "#": index + 1,
      COMPANY: row.company_name || row.symbol,
      SYMBOL: row.symbol,
      TREND_DIRECTIONAL: row.trend_directional,
      SPEED_MOMENTUM: row.speed_momentum,
      BUYING_PRESSURE: row.buying_pressure,
      KEY_PRICE_LEVEL: row.key_price_level,
      OVERALL_SCORE: row.overall_score,
      SIGNAL: row.signal || "-",
      REASON: row.reason || "-",
      STATUS: row.error ? "ERROR" : "OK",
      ERROR: row.error || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 15 },
      { wch: 14 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
      { wch: 28 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Scores");

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `technical_daily_scores_${runId ?? "latest"}_${stamp}.xlsx`;

    if (Platform.OS === "web") {
      const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }

    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const fileUri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
      return;
    }

    Alert.alert("Export Complete", `File saved to ${fileUri}`);
  } catch (error) {
    console.error("Technical scores export failed", error);
    Alert.alert("Export Failed", "Could not export technical daily scores to Excel.");
  }
}

function TableHeader({
  colors,
  layout,
}: {
  colors: ThemePalette;
  layout: ReturnType<typeof buildLayout>;
}) {
  return (
    <View
      style={[
        styles.tableHeader,
        {
          minHeight: layout.headerHeight,
          borderBottomColor: colors.borderColor,
          backgroundColor: colors.bgPrimary,
        },
      ]}
    >
      <Text style={[styles.hRank, { width: layout.rankWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>#</Text>
      <Text
        style={[
          styles.hCompany,
          { width: layout.companyWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize },
        ]}
      >
        Company
      </Text>
      <Text style={[styles.hMetric, { width: layout.metricWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Trend Directional</Text>
      <Text style={[styles.hMetric, { width: layout.metricWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Speed Momentum</Text>
      <Text style={[styles.hMetric, { width: layout.metricWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Buying Pressure</Text>
      <Text style={[styles.hMetric, { width: layout.metricWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Key Price Level</Text>
      <Text style={[styles.hOverall, { width: layout.overallWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Overall Score</Text>
    </View>
  );
}

function TableRow({
  row,
  colors,
  index,
  layout,
}: {
  row: TechnicalBatchRow;
  colors: ThemePalette;
  index: number;
  layout: ReturnType<typeof buildLayout>;
}) {
  const zebra = index % 2 === 0 ? "transparent" : colors.bgPrimary;
  const overallTone = scoreColor(row.overall_score, colors);

  return (
    <View
      style={[
        styles.tableRow,
        {
          minHeight: layout.rowHeight,
          borderBottomColor: colors.borderColor,
          backgroundColor: zebra,
        },
      ]}
    >
      <Text
        style={[
          styles.rankCell,
          {
            width: layout.rankWidth,
            color: colors.textSecondary,
            fontSize: layout.bodySize,
          },
        ]}
      >
        {index + 1}
      </Text>

      <View style={[styles.companyCell, { width: layout.companyWidth }]}>
        <Text numberOfLines={1} style={[styles.companyName, { color: colors.textPrimary, fontSize: layout.companyNameSize }]}>
          {row.company_name || row.symbol}
        </Text>
        <Text style={[styles.symbolText, { color: colors.textMuted, fontSize: layout.symbolSize }]}>{row.symbol}</Text>
      </View>

      <Text style={[styles.metricCell, { width: layout.metricWidth, fontSize: layout.metricValueSize, color: scoreColor(row.trend_directional, colors) }]}>
        {scoreText(row.trend_directional)}
      </Text>
      <Text style={[styles.metricCell, { width: layout.metricWidth, fontSize: layout.metricValueSize, color: scoreColor(row.speed_momentum, colors) }]}>
        {scoreText(row.speed_momentum)}
      </Text>
      <Text style={[styles.metricCell, { width: layout.metricWidth, fontSize: layout.metricValueSize, color: scoreColor(row.buying_pressure, colors) }]}>
        {scoreText(row.buying_pressure)}
      </Text>
      <Text style={[styles.metricCell, { width: layout.metricWidth, fontSize: layout.metricValueSize, color: scoreColor(row.key_price_level, colors) }]}>
        {scoreText(row.key_price_level)}
      </Text>

      <Text style={[styles.overallCell, { width: layout.overallWidth, fontSize: layout.overallSize, color: overallTone }]}>
        {scoreText(row.overall_score)}
      </Text>
    </View>
  );
}

function MetaStat({
  label,
  value,
  colors,
  layout,
}: {
  label: string;
  value: string | number;
  colors: ThemePalette;
  layout: ReturnType<typeof buildLayout>;
}) {
  return (
    <View style={[styles.metaStatCard, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
      <Text style={[styles.metaStatValue, { color: colors.textPrimary, fontSize: layout.kpiValueSize }]}>
        {value}
      </Text>
      <Text style={[styles.metaStatLabel, { color: colors.textMuted, fontSize: layout.sectionLabelSize }]}>
        {label}
      </Text>
    </View>
  );
}

export function TechnicalBatchOverview({ colors }: { colors: ThemePalette }) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();

  const latestQ = useQuery({
    queryKey: ["trade-signals", "technical-batch", "latest"],
    queryFn: () => getTechnicalBatchLatest(300),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const runMut = useMutation({
    mutationFn: () =>
      runTechnicalBatchScan({
        background: true,
        segment: "PREMIER",
        max_concurrency: 4,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trade-signals", "technical-batch", "latest"] });
    },
    onError: (err: Error) => {
      showErrorAlert("Could not start technical scoring run", err);
    },
  });

  const run = latestQ.data?.run ?? null;
  const rows = latestQ.data?.rows ?? [];
  const layout = useMemo(() => buildLayout(width), [width]);
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => sortableScore(b.overall_score) - sortableScore(a.overall_score)),
    [rows],
  );
  const isRunning = String(run?.status || "").toLowerCase() === "running";
  const chip = statusChipColors(run?.status || "unknown", colors);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.topCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.topHeader}>
          <View style={{ flex: 1 }}>
            <View style={[styles.eyebrow, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
              <FontAwesome name="area-chart" size={11} color={colors.textSecondary} />
              <Text style={[styles.eyebrowText, { color: colors.textSecondary }]}>Live Daily Snapshot</Text>
            </View>
            <Text style={[styles.title, { color: colors.textPrimary, fontSize: layout.titleSize, lineHeight: layout.titleSize + 6 }]}>Technical Analysis Daily Scores</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: layout.subtitleSize }]}>
              Scheduled daily at 2:05 PM Asia/Kuwait with bounded concurrency to avoid overload.
            </Text>
          </View>

          <View style={styles.actionsCol}>
            <Pressable
              disabled={runMut.isPending || isRunning}
              onPress={() => runMut.mutate()}
              style={[
                styles.runBtn,
                {
                  backgroundColor: runMut.isPending || isRunning ? colors.bgInput : colors.accentPrimary,
                  borderColor: runMut.isPending || isRunning ? colors.borderColor : colors.accentPrimary,
                },
              ]}
            >
              {runMut.isPending ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <>
                  <FontAwesome
                    name={isRunning ? "spinner" : "play"}
                    size={13}
                    color={runMut.isPending || isRunning ? colors.textSecondary : "#ffffff"}
                  />
                  <Text
                    style={{
                      color: runMut.isPending || isRunning ? colors.textSecondary : "#ffffff",
                      fontSize: layout.bodySize,
                      fontWeight: "700",
                    }}
                  >
                    {isRunning ? "Running..." : "Run Scan"}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              disabled={sortedRows.length === 0 || latestQ.isLoading}
              onPress={() => {
                void exportTechnicalRowsToExcel(sortedRows, run?.id);
              }}
              style={[
                styles.exportBtn,
                {
                  backgroundColor:
                    sortedRows.length === 0 || latestQ.isLoading ? colors.bgInput : colors.bgPrimary,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <FontAwesome name="download" size={12} color={colors.textSecondary} />
              <Text style={[styles.exportBtnText, { color: colors.textSecondary, fontSize: layout.bodySize }]}>Export Excel</Text>
            </Pressable>
          </View>
        </View>

        {run ? (
          <View style={[styles.metaRow, { borderTopColor: colors.borderColor }, width < 980 && styles.metaRowStack]}>
            <View style={styles.metaLeft}>
              <View style={[styles.statusPill, { backgroundColor: chip.bg }]}>
                <Text style={[styles.statusText, { color: chip.fg, fontSize: layout.statusSize }]}>{run.status.toUpperCase()}</Text>
              </View>
              <Text style={[styles.metaText, { color: colors.textSecondary, fontSize: layout.bodySize }]}>Run #{run.id}</Text>
              <Text style={[styles.metaText, { color: colors.textMuted, fontSize: layout.bodySize }]}>Started: {formatUnix(run.started_at)}</Text>
              <Text style={[styles.metaText, { color: colors.textMuted, fontSize: layout.bodySize }]}>Finished: {formatUnix(run.finished_at)}</Text>
            </View>

            <View style={styles.metaRight}>
              <MetaStat label="Success" value={run.success_count} colors={colors} layout={layout} />
              <MetaStat label="Failed" value={run.failed_count} colors={colors} layout={layout} />
              <MetaStat
                label="Processed"
                value={`${run.processed_symbols}/${run.total_symbols}`}
                colors={colors}
                layout={layout}
              />
            </View>
          </View>
        ) : (
          <View style={[styles.emptyRun, { borderTopColor: colors.borderColor }]}>
            <Text style={[styles.emptyRunText, { color: colors.textMuted, fontSize: layout.bodySize }]}>
              No technical batch run found yet. Click Run Scan to generate the first snapshot.
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.tableCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        {latestQ.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accentPrimary} />
            <Text style={[styles.loadingText, { color: colors.textMuted, fontSize: layout.bodySize }]}>Loading latest technical scores...</Text>
          </View>
        ) : latestQ.isError ? (
          <View style={[styles.errorBox, { borderColor: colors.danger, backgroundColor: colors.dangerBg }]}>
            <FontAwesome name="exclamation-triangle" size={14} color={colors.dangerText} />
            <Text style={[styles.errorText, { color: colors.dangerText, fontSize: layout.bodySize }]}>Unable to load technical batch results.</Text>
            <Pressable
              onPress={() => latestQ.refetch()}
              style={[styles.retryBtn, { borderColor: colors.dangerText }]}
            >
              <Text style={[styles.retryText, { color: colors.dangerText, fontSize: layout.sectionLabelSize }]}>Retry</Text>
            </Pressable>
          </View>
        ) : sortedRows.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={[styles.loadingText, { color: colors.textMuted, fontSize: layout.bodySize }]}>No rows available for this run.</Text>
          </View>
        ) : (
          <View style={styles.tableScrollWrap}>
            <ScrollView
              horizontal
              style={styles.tableHorizontalScroll}
              contentContainerStyle={styles.tableHorizontalContent}
              showsHorizontalScrollIndicator
              nestedScrollEnabled
            >
              <View style={[styles.tableInner, { width: layout.tableWidth }]}>
                <TableHeader colors={colors} layout={layout} />
                <ScrollView
                  style={styles.tableVerticalScroll}
                  contentContainerStyle={styles.tableVerticalContent}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {sortedRows.map((row, index) => (
                    <TableRow
                      key={`${row.symbol}-${index}`}
                      row={row}
                      colors={colors}
                      index={index}
                      layout={layout}
                    />
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    padding: 14,
    paddingBottom: 80,
    gap: 12,
  },
  topCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topHeader: {
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  eyebrow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  actionsCol: {
    gap: 8,
    alignItems: "stretch",
  },
  runBtn: {
    minWidth: 132,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  exportBtn: {
    minWidth: 132,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  metaRow: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  metaRowStack: {
    flexDirection: "column",
  },
  metaLeft: {
    flex: 1,
    gap: 4,
  },
  metaRight: {
    minWidth: 280,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  metaStatCard: {
    flex: 1,
    minWidth: 90,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  metaStatValue: {
    fontWeight: "900",
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
  },
  metaStatLabel: {
    marginTop: 2,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metaText: {
    fontSize: 12,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
  },
  kpiLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  emptyRun: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyRunText: {
    fontSize: 12,
  },
  tableCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    minHeight: 220,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tableScrollWrap: {
    flex: 1,
  },
  tableHorizontalScroll: {
    flex: 1,
  },
  tableHorizontalContent: {
    minHeight: "100%",
  },
  tableInner: {
    minHeight: "100%",
  },
  tableVerticalScroll: {
    flex: 1,
  },
  tableVerticalContent: {
    minHeight: "100%",
  },
  loadingWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
  },
  loadingText: {
    fontSize: 12,
  },
  errorBox: {
    margin: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryText: {
    fontSize: 11,
    fontWeight: "700",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  hRank: {
    width: 50,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rankCell: {
    width: 50,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  companyCell: {
    width: 210,
    paddingRight: 12,
  },
  companyName: {
    fontSize: 12,
    fontWeight: "700",
  },
  symbolText: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  hCompany: {
    width: 210,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingRight: 12,
  },
  hMetric: {
    width: 128,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "right",
  },
  hOverall: {
    width: 118,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "right",
  },
  metricCell: {
    width: 128,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  overallCell: {
    width: 118,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
});
