/* eslint-disable custom-styles/no-hardcoded-styles */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
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
import * as FileSystem from "expo-file-system/legacy";
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

function scoreCellColor(score: number | null | undefined, colors: ThemePalette): string {
  if (!Number.isFinite(score)) return colors.textMuted;
  return scoreColor(Number(score), colors);
}

const ACTION_PRIORITY: Record<"EXECUTE" | "HOLD" | "WATCH" | "AVOID" | "FLAG", number> = {
  EXECUTE: 0,
  HOLD: 1,
  WATCH: 2,
  AVOID: 3,
  FLAG: 4,
};

type ActionName = keyof typeof ACTION_PRIORITY;

function normalizeAction(value: string | null | undefined): keyof typeof ACTION_PRIORITY | null {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "EXECUTE" || normalized === "HOLD" || normalized === "WATCH" || normalized === "AVOID" || normalized === "FLAG") {
    return normalized;
  }
  return null;
}

function deriveActionFromRow(row: TechnicalBatchRow): {
  action: ActionName | null;
  note: string | null;
  gap: number | null;
  priority: number | null;
} {
  const explicitAction = normalizeAction(row.action_recommendation);
  const explicitNote = String(row.action_note || "").trim();
  const explicitPriority = Number.isFinite(row.action_priority) ? Number(row.action_priority) : null;
  const gap = scoreGap(row);

  if (explicitAction) {
    return {
      action: explicitAction,
      note: explicitNote || null,
      gap,
      priority: explicitPriority ?? ACTION_PRIORITY[explicitAction],
    };
  }

  if (row.error) {
    return { action: null, note: null, gap, priority: null };
  }

  const adjusted = adjustedOverallScore(row);
  if (!Number.isFinite(adjusted) || !Number.isFinite(gap)) {
    return { action: null, note: null, gap, priority: null };
  }

  const adjustedScore = Number(adjusted);
  const scoreGapValue = Number(gap);
  const trend = Number.isFinite(row.trend_directional) ? Number(row.trend_directional) : 0;

  if (scoreGapValue < 0 && trend < 30) {
    return {
      action: "FLAG",
      note: `Negative gap ${scoreGapValue} with trend ${trend} < 30; review factor logic.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.FLAG,
    };
  }

  if (scoreGapValue < 0) {
    if (adjustedScore < 55) {
      return {
        action: "AVOID",
        note: `Negative gap ${scoreGapValue} but adjusted ${adjustedScore} < 55.`,
        gap: scoreGapValue,
        priority: ACTION_PRIORITY.AVOID,
      };
    }

    if (trend >= 50 && adjustedScore >= 65) {
      return {
        action: "EXECUTE",
        note: `Negative gap ${scoreGapValue} with trend ${trend} and adjusted ${adjustedScore}; qualified execute.`,
        gap: scoreGapValue,
        priority: ACTION_PRIORITY.EXECUTE,
      };
    }

    return {
      action: "HOLD",
      note: `Negative gap ${scoreGapValue} without trend>=50 and adjusted>=65; downgraded to hold.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.HOLD,
    };
  }

  if (scoreGapValue >= 0 && scoreGapValue <= 5 && adjustedScore >= 68) {
    return {
      action: "EXECUTE",
      note: `Gap +${scoreGapValue} with adjusted ${adjustedScore} in execute band.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.EXECUTE,
    };
  }

  if ((scoreGapValue >= 6 && scoreGapValue <= 10) || (scoreGapValue >= 0 && scoreGapValue <= 5 && adjustedScore >= 60 && adjustedScore <= 67)) {
    return {
      action: "HOLD",
      note: `Gap +${scoreGapValue} with adjusted ${adjustedScore} in hold band.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.HOLD,
    };
  }

  if (scoreGapValue >= 11 && scoreGapValue <= 15) {
    return {
      action: "WATCH",
      note: `Gap +${scoreGapValue} in watch band.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.WATCH,
    };
  }

  if (scoreGapValue >= 16 || (adjustedScore < 55 && scoreGapValue >= 0)) {
    return {
      action: "AVOID",
      note: `Gap +${scoreGapValue} with adjusted ${adjustedScore} in avoid band.`,
      gap: scoreGapValue,
      priority: ACTION_PRIORITY.AVOID,
    };
  }

  return {
    action: "AVOID",
    note: `Gap +${scoreGapValue} with adjusted ${adjustedScore} outside action bands.`,
    gap: scoreGapValue,
    priority: ACTION_PRIORITY.AVOID,
  };
}

function scoreGap(row: TechnicalBatchRow): number | null {
  if (Number.isFinite(row.score_gap)) return Number(row.score_gap);
  const base = baseOverallScore(row);
  const adjusted = adjustedOverallScore(row);
  if (!Number.isFinite(base) || !Number.isFinite(adjusted)) return null;
  return Number(base) - Number(adjusted);
}

function formatGap(gap: number | null): string {
  if (!Number.isFinite(gap)) return "-";
  const value = Number(gap);
  return value >= 0 ? `+${value}` : `${value}`;
}

function truncateActionNote(note: string | null | undefined, maxLength = 58): string {
  const value = String(note || "").trim();
  if (!value) return "-";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function gapColor(gap: number | null, colors: ThemePalette): string {
  if (!Number.isFinite(gap)) return colors.textMuted;
  if (Number(gap) < 0) return colors.success;
  if (Number(gap) <= 10) return colors.warning;
  return colors.danger;
}

function actionChipColors(action: keyof typeof ACTION_PRIORITY, colors: ThemePalette): { bg: string; fg: string } {
  if (action === "EXECUTE") {
    return { bg: colors.successBg, fg: colors.successText };
  }
  if (action === "HOLD") {
    return { bg: colors.warningBg, fg: colors.warningText };
  }
  if (action === "WATCH") {
    return { bg: colors.bgInput, fg: colors.textSecondary };
  }
  if (action === "AVOID") {
    return { bg: colors.dangerBg, fg: colors.dangerText };
  }
  return { bg: colors.dangerBg, fg: colors.dangerText };
}

function actionPriority(row: TechnicalBatchRow): number {
  const derived = deriveActionFromRow(row);
  if (Number.isFinite(derived.priority)) return Number(derived.priority);
  return 99;
}

function sortTechnicalRows(rows: TechnicalBatchRow[]): TechnicalBatchRow[] {
  return [...rows].sort((a, b) => {
    const priorityDelta = actionPriority(a) - actionPriority(b);
    if (priorityDelta !== 0) return priorityDelta;

    const bucket = actionPriority(a);
    const adjA = sortableScore(adjustedOverallScore(a));
    const adjB = sortableScore(adjustedOverallScore(b));
    const baseA = sortableScore(baseOverallScore(a));
    const baseB = sortableScore(baseOverallScore(b));
    const gapA = Number.isFinite(scoreGap(a)) ? Number(scoreGap(a)) : Number.POSITIVE_INFINITY;
    const gapB = Number.isFinite(scoreGap(b)) ? Number(scoreGap(b)) : Number.POSITIVE_INFINITY;

    if (bucket === ACTION_PRIORITY.EXECUTE) {
      if (adjA !== adjB) return adjB - adjA;
      if (gapA !== gapB) return gapA - gapB;
      if (a.trend_directional !== b.trend_directional) return b.trend_directional - a.trend_directional;
      return a.symbol.localeCompare(b.symbol);
    }

    if (bucket === ACTION_PRIORITY.HOLD) {
      if (adjA !== adjB) return adjB - adjA;
      if (a.buying_pressure !== b.buying_pressure) return b.buying_pressure - a.buying_pressure;
      if (a.trend_directional !== b.trend_directional) return b.trend_directional - a.trend_directional;
      return a.symbol.localeCompare(b.symbol);
    }

    if (bucket === ACTION_PRIORITY.WATCH) {
      if (a.speed_momentum !== b.speed_momentum) return b.speed_momentum - a.speed_momentum;
      if (a.trend_directional !== b.trend_directional) return b.trend_directional - a.trend_directional;
      return a.symbol.localeCompare(b.symbol);
    }

    if (bucket === ACTION_PRIORITY.AVOID || bucket === ACTION_PRIORITY.FLAG) {
      if (gapA !== gapB) return gapA - gapB;
      if (a.trend_directional !== b.trend_directional) return b.trend_directional - a.trend_directional;
      return a.symbol.localeCompare(b.symbol);
    }

    if (baseA !== baseB) return baseB - baseA;
    return a.symbol.localeCompare(b.symbol);
  });
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

function scoreText(value: number | null | undefined): string {
  return Number.isFinite(value) ? String(value) : "-";
}

function sortableScore(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function baseOverallScore(row: TechnicalBatchRow): number | null {
  if (row.raw_technical_score != null) return row.raw_technical_score;
  return null;
}

function adjustedOverallScore(row: TechnicalBatchRow): number | null {
  if (row.risk_adjusted_score != null) return row.risk_adjusted_score;
  if (row.raw_technical_score != null) return row.raw_technical_score;
  if (row.overall_score != null) return row.overall_score;
  return null;
}

function buildLayout(windowWidth: number) {
  const contentWidth = Math.max(windowWidth - 64, 760);
  const wide = windowWidth >= 1200;
  const medium = windowWidth >= 900 && windowWidth < 1200;

  const rankWidth = wide ? 56 : 50;
  const companyWidth = wide ? 280 : medium ? 250 : 220;
  const metricWidth = wide ? 148 : medium ? 138 : 130;
  const baseOverallWidth = wide ? 170 : medium ? 158 : 148;
  const adjustedOverallWidth = wide ? 176 : medium ? 164 : 154;
  const gapWidth = wide ? 100 : medium ? 94 : 88;
  const actionWidth = wide ? 136 : medium ? 126 : 118;
  const actionNoteWidth = wide ? 300 : medium ? 270 : 240;
  const minTableWidth = rankWidth + companyWidth + metricWidth * 4 + baseOverallWidth + adjustedOverallWidth + gapWidth + actionWidth + actionNoteWidth + 16;

  return {
    rankWidth,
    companyWidth,
    metricWidth,
    baseOverallWidth,
    adjustedOverallWidth,
    gapWidth,
    actionWidth,
    actionNoteWidth,
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
    const ordered = [...rows];
    const data = ordered.map((row, index) => {
      const derived = deriveActionFromRow(row);
      return {
      "#": index + 1,
      COMPANY: row.company_name || row.symbol,
      SYMBOL: row.symbol,
      TREND_DIRECTIONAL: row.trend_directional,
      SPEED_MOMENTUM: row.speed_momentum,
      BUYING_PRESSURE: row.buying_pressure,
      KEY_PRICE_LEVEL: row.key_price_level,
      COMBINED_SCORE_NO_ADJUSTMENT: baseOverallScore(row),
      COMBINED_SCORE_WITH_ADJUSTMENT: adjustedOverallScore(row),
      GAP: derived.gap,
      ACTION: derived.action || "-",
      ACTION_NOTE: row.action_note || derived.note || "-",
      SIGNAL: row.signal || "-",
      REASON: row.reason || "-",
      STATUS: row.error ? "ERROR" : "OK",
      ERROR: row.error || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 15 },
      { wch: 30 },
      { wch: 32 },
      { wch: 8 },
      { wch: 10 },
      { wch: 46 },
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
      <Text style={[styles.hOverall, { width: layout.baseOverallWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Combined (No Dir Adjust)</Text>
      <Text style={[styles.hOverall, { width: layout.adjustedOverallWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Combined (Dir Adjust)</Text>
      <Text style={[styles.hGap, { width: layout.gapWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Gap</Text>
      <Text style={[styles.hAction, { width: layout.actionWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Action</Text>
      <Text style={[styles.hActionNote, { width: layout.actionNoteWidth, color: colors.textSecondary, fontSize: layout.sectionLabelSize }]}>Action Note</Text>
    </View>
  );
}

function TableRow({
  row,
  colors,
  index,
  layout,
  openActionNoteSymbol,
  onToggleActionNote,
}: {
  row: TechnicalBatchRow;
  colors: ThemePalette;
  index: number;
  layout: ReturnType<typeof buildLayout>;
  openActionNoteSymbol: string | null;
  onToggleActionNote: (symbol: string) => void;
}) {
  const zebra = index % 2 === 0 ? "transparent" : colors.bgPrimary;
  const baseScore = baseOverallScore(row);
  const adjustedScore = adjustedOverallScore(row);
  const derivedAction = deriveActionFromRow(row);
  const gap = derivedAction.gap;
  const action = derivedAction.action;
  const fullActionNote = String(row.action_note || derivedAction.note || "").trim();
  const hasActionNote = fullActionNote.length > 0;
  const isActionNoteOpen = hasActionNote && openActionNoteSymbol === row.symbol;
  const actionNotePreview = truncateActionNote(fullActionNote);
  const actionColors = action ? actionChipColors(action, colors) : null;
  const overallBaseTone = scoreCellColor(baseScore, colors);
  const overallAdjustedTone = scoreCellColor(adjustedScore, colors);

  return (
    <View
      style={[
        styles.tableRow,
        {
          minHeight: layout.rowHeight,
          borderBottomColor: colors.borderColor,
          backgroundColor: zebra,
          zIndex: isActionNoteOpen ? 30 : 1,
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

      <Text style={[styles.overallCell, { width: layout.baseOverallWidth, fontSize: layout.overallSize, color: overallBaseTone }]}>
        {scoreText(baseScore)}
      </Text>

      <Text style={[styles.overallCell, { width: layout.adjustedOverallWidth, fontSize: layout.overallSize, color: overallAdjustedTone }]}>
        {scoreText(adjustedScore)}
      </Text>

      <Text style={[styles.gapCell, { width: layout.gapWidth, color: gapColor(gap, colors), fontSize: layout.bodySize }]}>
        {formatGap(gap)}
      </Text>

      <View style={[styles.actionCell, { width: layout.actionWidth }]}> 
        {action && actionColors ? (
          <View style={[styles.actionPill, { backgroundColor: actionColors.bg }]}> 
            <Text style={[styles.actionPillText, { color: actionColors.fg }]}>{action}</Text>
          </View>
        ) : (
          <Text style={[styles.actionFallback, { color: colors.textMuted }]}>{row.error ? "ERROR" : "-"}</Text>
        )}
      </View>

      <View style={[styles.actionNoteCell, { width: layout.actionNoteWidth }]}> 
        {hasActionNote ? (
          <Pressable
            onPress={() => onToggleActionNote(row.symbol)}
            accessibilityRole="button"
            accessibilityLabel={`Action note for ${row.symbol}`}
            style={styles.actionNoteTrigger}
          >
            <Text numberOfLines={1} style={[styles.actionNoteText, { color: colors.textSecondary }]}>
              {actionNotePreview}
            </Text>
            <FontAwesome name="info-circle" size={12} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Text style={[styles.actionNoteEmpty, { color: colors.textMuted }]}>-</Text>
        )}

        {isActionNoteOpen ? (
          <View
            style={[
              styles.actionNotePopover,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderColor,
              },
            ]}
          >
            <Text style={[styles.actionNotePopoverTitle, { color: colors.textPrimary }]}>{row.symbol} Action Note</Text>
            <Text style={[styles.actionNotePopoverText, { color: colors.textSecondary }]}>{fullActionNote}</Text>
            <Pressable
              onPress={() => onToggleActionNote(row.symbol)}
              style={[styles.actionNoteCloseBtn, { borderColor: colors.borderColor, backgroundColor: colors.bgPrimary }]}
            >
              <Text style={[styles.actionNoteCloseText, { color: colors.textPrimary }]}>Close</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
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
  const [openActionNoteSymbol, setOpenActionNoteSymbol] = useState<string | null>(null);

  const latestQ = useQuery({
    queryKey: ["trade-signals", "technical-batch", "latest"],
    queryFn: () => getTechnicalBatchLatest(300),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const runMut = useMutation({
    mutationFn: () =>
      runTechnicalBatchScan({
        // Safer in development: finish in-request instead of fragile in-process background task.
        background: false,
        segment: "PREMIER",
        max_concurrency: 3,
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
    () => sortTechnicalRows(rows),
    [rows],
  );

  const toggleActionNote = (symbol: string) => {
    setOpenActionNoteSymbol((current) => (current === symbol ? null : symbol));
  };
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
                      openActionNoteSymbol={openActionNoteSymbol}
                      onToggleActionNote={toggleActionNote}
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
  hGap: {
    width: 88,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "right",
  },
  hAction: {
    width: 118,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  hActionNote: {
    width: 240,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "left",
    paddingLeft: 10,
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
  gapCell: {
    width: 88,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  actionCell: {
    width: 118,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 8,
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  actionFallback: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionNoteCell: {
    width: 240,
    paddingLeft: 10,
    justifyContent: "center",
    position: "relative",
    zIndex: 40,
  },
  actionNoteTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
  },
  actionNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  actionNoteEmpty: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionNotePopover: {
    position: "absolute",
    right: 0,
    top: 34,
    width: 320,
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  actionNotePopoverTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  actionNotePopoverText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  actionNoteCloseBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionNoteCloseText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
