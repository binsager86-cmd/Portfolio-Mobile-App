/**
 * StatementsPanel — Thin orchestrator composing AiExtractionFlow,
 * SavedPdfsList, StatementTabBar, and StatementsTable.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import type {
  FinancialStatement,
  LatestPreferredStatementPeriod,
} from "@/services/api";
import {
    deleteStockPdf,
    downloadStockPdf,
    type SavedPdf,
} from "@/services/api/analytics";
import { useStatementManager } from "../hooks/useStatementManager";
import { st } from "../styles";
import type { PanelWithSymbolProps } from "../types";
import { STMNT_META, STMNT_TYPES } from "../types";
import { AiExtractionFlow } from "./AiExtractionFlow";
import { Chip, StatementTabBar } from "./shared";
import { StatementsTable } from "./StatementsTable";

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function normalizeQuarter(raw: unknown): number | null {
  if (raw == null) return null;
  const q = Number(raw);
  if (!Number.isFinite(q)) return null;
  const qi = Math.trunc(q);
  return qi >= 1 && qi <= 4 ? qi : null;
}

function isQuarterlySource(sourceFile: string | null | undefined): boolean {
  return typeof sourceFile === "string" && sourceFile.toLowerCase().includes("p=quarterly");
}

function isAnnualStatement(statement: FinancialStatement): boolean {
  const quarter = normalizeQuarter(statement.fiscal_quarter);
  if (quarter === 4) return true;
  if (quarter != null) return false;
  if (isQuarterlySource(statement.source_file)) return false;
  // Unknown quarter defaults to annual so fiscal-year rows remain visible.
  return true;
}

type StatementPeriodView = "annual" | "quarter";

type StatementDisplaySelection = {
  rows: FinancialStatement[];
  ttmPeriodEndDate: string | null;
};

type StatementLineItem = FinancialStatement["line_items"][number];

function sortLineItems(statement: FinancialStatement): StatementLineItem[] {
  return [...(statement.line_items ?? [])].sort(
    (a, b) => (a.order_index ?? 10_000) - (b.order_index ?? 10_000),
  );
}

function buildSyntheticTtmStatement(
  latestQuarter: FinancialStatement | null,
  annualHistory: FinancialStatement[],
  quarterlyHistory: FinancialStatement[],
): FinancialStatement | null {
  if (!latestQuarter) return null;

  const statementType = String(latestQuarter.statement_type ?? "").toLowerCase();
  // TTM aggregation is only meaningful for flow statements.
  if (statementType !== "income" && statementType !== "cashflow") return null;

  const latestQuarterNum = normalizeQuarter(latestQuarter.fiscal_quarter);
  if (latestQuarterNum == null || latestQuarterNum === 4) return null;

  const priorAnnual = annualHistory.find(
    (statement) => statement.fiscal_year === latestQuarter.fiscal_year - 1,
  );
  if (!priorAnnual) return null;

  const priorSameQuarter = quarterlyHistory.find(
    (statement) => statement.fiscal_year === latestQuarter.fiscal_year - 1
      && normalizeQuarter(statement.fiscal_quarter) === latestQuarterNum,
  );
  if (!priorSameQuarter) return null;

  const annualByCode = new Map<string, StatementLineItem>();
  const priorByCode = new Map<string, StatementLineItem>();
  for (const lineItem of sortLineItems(priorAnnual)) {
    annualByCode.set(lineItem.line_item_code, lineItem);
  }
  for (const lineItem of sortLineItems(priorSameQuarter)) {
    priorByCode.set(lineItem.line_item_code, lineItem);
  }

  const syntheticLineItems: StatementLineItem[] = [];
  for (const latestItem of sortLineItems(latestQuarter)) {
    const annualItem = annualByCode.get(latestItem.line_item_code);
    const priorQuarterItem = priorByCode.get(latestItem.line_item_code);
    const annualAmount = annualItem?.amount ?? 0;
    const priorQuarterAmount = priorQuarterItem?.amount ?? 0;
    const ttmAmount = annualAmount + latestItem.amount - priorQuarterAmount;

    syntheticLineItems.push({
      ...latestItem,
      statement_id: latestQuarter.id,
      amount: ttmAmount,
      manually_edited: false,
    });
  }

  if (syntheticLineItems.length === 0) return null;

  return {
    ...latestQuarter,
    line_items: syntheticLineItems,
    source_file: latestQuarter.source_file
      ? `${latestQuarter.source_file}#derived-ttm`
      : "derived-ttm",
    notes: "Derived TTM from annual + latest quarter - prior-year same quarter",
  };
}

function selectStatementsForDisplay(
  statements: FinancialStatement[],
  latestPreferred: LatestPreferredStatementPeriod | null,
  periodView: StatementPeriodView,
): StatementDisplaySelection {
  if (statements.length === 0) return { rows: statements, ttmPeriodEndDate: null };

  const normalized = statements
    .map((s) => ({ ...s, fiscal_quarter: normalizeQuarter(s.fiscal_quarter) }))
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  // Annual rows can be non-December for non-calendar fiscal year-ends.
  const annualHistory = normalized.filter((s) => isAnnualStatement(s));

  // Quarter view should keep only quarter cadence rows.
  const quarterlyHistory = normalized.filter((s) => !isAnnualStatement(s));

  let latestQuarter: FinancialStatement | null = null;
  const preferredQuarter = normalizeQuarter(latestPreferred?.fiscal_quarter);
  if (latestPreferred && preferredQuarter != null) {
    latestQuarter = quarterlyHistory.find((s) => s.period_end_date === latestPreferred.period_end_date) ?? null;
  }
  if (!latestQuarter) {
    latestQuarter = quarterlyHistory[quarterlyHistory.length - 1] ?? null;
  }

  if (periodView === "quarter") {
    if (quarterlyHistory.length > 0) {
      return { rows: quarterlyHistory, ttmPeriodEndDate: null };
    }
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  const ttmStatement = buildSyntheticTtmStatement(
    latestQuarter,
    annualHistory,
    quarterlyHistory,
  );
  const annualTtmColumn = ttmStatement ?? latestQuarter;

  const combined = [
    ...annualHistory,
    ...(annualTtmColumn ? [annualTtmColumn] : []),
  ].sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const deduped = new Map<number, FinancialStatement>();
  for (const stmt of combined) deduped.set(stmt.id, stmt);
  const rows = [...deduped.values()];

  if (rows.length === 0) {
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  return {
    rows,
    ttmPeriodEndDate: annualTtmColumn?.period_end_date ?? null,
  };
}

export function StatementsPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const mgr = useStatementManager(stockId);
  const { statements, latestPreferred, isLoading, isFetching, refetch, savedPdfs, typeFilter, setTypeFilter } = mgr;
  const [periodView, setPeriodView] = useState<StatementPeriodView>("annual");

  return (
    <View style={{ flex: 1 }}>
      {/* Upload / import / online-fetch section */}
      <AiExtractionFlow mgr={mgr} colors={colors} />

      {/* Saved PDFs list */}
      <SavedPdfsList pdfs={savedPdfs} stockId={stockId} colors={colors} />

      {/* Period view filter */}
      <View style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgPrimary,
      }}>
        <Chip
          label="Annual + TTM"
          active={periodView === "annual"}
          onPress={() => setPeriodView("annual")}
          colors={colors}
          icon="calendar"
        />
        <Chip
          label="All Quarters"
          active={periodView === "quarter"}
          onPress={() => setPeriodView("quarter")}
          colors={colors}
          icon="bar-chart"
        />
      </View>

      {/* Type filter tabs */}
      <StatementTabBar value={typeFilter} onChange={setTypeFilter} colors={colors} showAll={true} />

      {isLoading ? (
        <FAPanelSkeleton />
      ) : typeFilter == null ? (
        /* "All" view: grouped by statement type */
        <ScrollView style={{ flex: 1 }}>
          {STMNT_TYPES.map((sType) => {
            const selection = selectStatementsForDisplay(
              statements.filter((s) => s.statement_type === sType),
              latestPreferred,
              periodView,
            );
            const filtered = selection.rows;
            if (filtered.length === 0) return null;
            const meta = STMNT_META[sType];
            return (
              <View key={sType}>
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: (meta?.color ?? colors.accentPrimary) + "12",
                  borderBottomWidth: 1, borderBottomColor: colors.borderColor,
                }}>
                  <FontAwesome name={meta?.icon ?? "file-text-o"} size={14} color={meta?.color ?? colors.accentPrimary} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: meta?.color ?? colors.textPrimary, letterSpacing: 0.3 }}>
                    {meta?.label ?? sType}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    ({filtered.length} period{filtered.length !== 1 ? "s" : ""})
                  </Text>
                </View>
                <StatementsTable
                  stockId={stockId} stockSymbol={stockSymbol} statements={filtered}
                  colors={colors} isDesktop={isDesktop} isFetching={isFetching}
                  onRefresh={refetch} statementType={sType}
                  periodView={periodView}
                  ttmPeriodEndDate={selection.ttmPeriodEndDate}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : (
        (() => {
          const selection = selectStatementsForDisplay(statements, latestPreferred, periodView);
          return (
            <StatementsTable
              stockId={stockId}
              stockSymbol={stockSymbol}
              statements={selection.rows}
              colors={colors}
              isDesktop={isDesktop}
              isFetching={isFetching}
              onRefresh={refetch}
              statementType={typeFilter}
              periodView={periodView}
              ttmPeriodEndDate={selection.ttmPeriodEndDate}
            />
          );
        })()
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SAVED PDFs LIST                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

function SavedPdfsList({ pdfs, stockId, colors }: { pdfs: SavedPdf[]; stockId: number; colors: ThemePalette }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const handleDownload = useCallback(async (pdf: SavedPdf) => {
    try {
      if (Platform.OS === "web") {
        await downloadStockPdf(stockId, pdf.id, pdf.original_name);
      } else {
        Alert.alert("Download", "PDF download is supported on web. On mobile, PDFs are stored on the server for reference.");
      }
    } catch {
      Alert.alert("Error", "Failed to download PDF.");
    }
  }, [stockId]);

  const doDelete = useCallback(async (pdf: SavedPdf) => {
    try {
      await deleteStockPdf(stockId, pdf.id);
      queryClient.invalidateQueries({ queryKey: ["stock-pdfs", stockId] });
      if (Platform.OS === "web") window.alert("PDF deleted successfully.");
      else Alert.alert("Deleted", "PDF deleted successfully.");
    } catch {
      if (Platform.OS === "web") window.alert("Failed to delete PDF.");
      else Alert.alert("Error", "Failed to delete PDF.");
    }
  }, [stockId, queryClient]);

  const handleDelete = useCallback((pdf: SavedPdf) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${pdf.original_name}"? This cannot be undone.`)) {
        doDelete(pdf);
      }
    } else {
      Alert.alert(
        "Delete PDF",
        `Delete "${pdf.original_name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => doDelete(pdf) },
        ],
      );
    }
  }, [doDelete]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.borderColor,
    }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Saved reports (${pdfs.length})`}
        accessibilityState={{ expanded }}
        style={[st.rowCenter, { gap: 8, paddingVertical: 4 }]}
      >
        <FontAwesome name="folder-open" size={14} color={colors.accentPrimary} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1 }}>
          Saved Reports ({pdfs.length})
        </Text>
        <FontAwesome
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 8, gap: 6 }}>
          {pdfs.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: "italic", paddingVertical: 8 }}>
              No saved reports yet. Upload a PDF above — it will be saved here automatically.
            </Text>
          )}
          {pdfs.map((pdf) => (
            <View
              key={pdf.id}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                paddingVertical: 8, paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: colors.bgInput,
              }}
            >
              <FontAwesome name="file-pdf-o" size={16} color={colors.danger + "90"} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary }}
                >
                  {pdf.original_name}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                  {formatFileSize(pdf.file_size)} · {formatDate(pdf.created_at)}
                </Text>
              </View>
              <Pressable onPress={() => handleDownload(pdf)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Download ${pdf.original_name}`} style={{ padding: 6 }}>
                <FontAwesome name="download" size={14} color={colors.accentPrimary} />
              </Pressable>
              <Pressable onPress={() => handleDelete(pdf)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${pdf.original_name}`} style={{ padding: 6 }}>
                <FontAwesome name="trash-o" size={14} color={colors.danger + "80"} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
