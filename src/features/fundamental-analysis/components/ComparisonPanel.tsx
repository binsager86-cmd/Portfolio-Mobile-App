/**
 * ComparisonPanel — Multi-period side-by-side comparison with YoY changes.
 */

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useStatements } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import type { TableData } from "@/lib/exportAnalysis";
import {
  mergeLineItems,
  reorderLineItems,
  type FinancialStatement,
  type LatestPreferredStatementPeriod,
} from "@/services/api";
import { st } from "../styles";
import { STMNT_META, type PanelWithSymbolProps } from "../types";
import { formatLineItemValue } from "../utils";
import { ExportBar, StatementTabBar } from "./shared";

type ComparePeriodView = "annual" | "quarter" | "ttm";
type ComparisonSelection = {
  rows: FinancialStatement[];
  ttmPeriodEndDate: string | null;
};

type CompPeriod = {
  label: string;
  period: string;
  fiscalYear: number;
  fiscalQuarter: number | null;
  items: Record<string, { id: number; amount: number; name: string; isTotal: boolean }>;
};

function getYoYBaseValue(periods: CompPeriod[], periodView: ComparePeriodView, i: number, code: string): number | undefined {
  if (i <= 0) return undefined;

  if (periodView !== "quarter") {
    return periods[i - 1].items[code]?.amount;
  }

  const current = periods[i];
  if (current.fiscalQuarter == null) return undefined;

  const targetYear = current.fiscalYear - 1;
  const match = periods.find(
    (p) => p.fiscalYear === targetYear && p.fiscalQuarter === current.fiscalQuarter,
  );
  return match?.items[code]?.amount;
}

function getYoYHeaderLabel(periodView: ComparePeriodView): string {
  return periodView === "quarter" ? "YoY % (same Q LY)" : "YoY %";
}

function calculateYoYPercent(currentValue: number | null | undefined, previousValue: number | null | undefined): number | null {
  if (currentValue == null || previousValue == null || previousValue === 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}
type StatementLineItem = FinancialStatement["line_items"][number];

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
  return true;
}

function isQuarterlyStatement(statement: FinancialStatement): boolean {
  return !isAnnualStatement(statement);
}

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

function selectComparisonStatements(
  statements: FinancialStatement[],
  latestPreferred: LatestPreferredStatementPeriod | null | undefined,
  periodView: ComparePeriodView,
): ComparisonSelection {
  if (statements.length === 0) return { rows: statements, ttmPeriodEndDate: null };

  const normalized = statements
    .map((statement) => ({ ...statement, fiscal_quarter: normalizeQuarter(statement.fiscal_quarter) }))
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const annualHistory = normalized.filter((statement) => isAnnualStatement(statement));
  const quarterlyHistory = normalized.filter((statement) => isQuarterlyStatement(statement));

  let latestQuarter: FinancialStatement | null = null;
  const preferredQuarter = normalizeQuarter(latestPreferred?.fiscal_quarter);
  if (latestPreferred && preferredQuarter != null) {
    latestQuarter = quarterlyHistory.find(
      (statement) => statement.period_end_date === latestPreferred.period_end_date,
    ) ?? null;
  }
  if (!latestQuarter) {
    latestQuarter = quarterlyHistory[quarterlyHistory.length - 1] ?? null;
  }

  if (periodView === "quarter") {
    if (quarterlyHistory.length > 0) return { rows: quarterlyHistory, ttmPeriodEndDate: null };
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  if (periodView === "annual") {
    if (annualHistory.length > 0) return { rows: annualHistory, ttmPeriodEndDate: null };
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

  const deduped = new Map<string, FinancialStatement>();
  for (const statement of combined) {
    deduped.set(statement.period_end_date, statement);
  }
  const rows = [...deduped.values()];

  if (rows.length === 0) return { rows: normalized, ttmPeriodEndDate: null };
  return {
    rows,
    ttmPeriodEndDate: annualTtmColumn?.period_end_date ?? null,
  };
}

export function ComparisonPanel({ stockId, stockSymbol, colors, isDesktop: _isDesktop }: PanelWithSymbolProps) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("income");
  const [periodView, setPeriodView] = useState<ComparePeriodView>("ttm");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  // ── Merge mode state ────────────────────────────────────────────
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  const statements = data?.statements ?? [];
  const latestPreferred = data?.latest_preferred ?? null;
  const selection = useMemo(
    () => selectComparisonStatements(statements, latestPreferred, periodView),
    [statements, latestPreferred, periodView],
  );
  const comparisonStatements = selection.rows;
  const ttmPeriodEndDate = selection.ttmPeriodEndDate;

  const periods = useMemo(() =>
    [...comparisonStatements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => {
        const q = normalizeQuarter(s.fiscal_quarter);
        const isTtmPeriod = periodView === "ttm"
          && ttmPeriodEndDate != null
          && s.period_end_date === ttmPeriodEndDate
          && q != null;
        const label = isTtmPeriod
          ? "TTM"
          : periodView === "quarter"
            ? `FY${s.fiscal_year}${q != null ? ` Q${q}` : ""}`
            : `FY${s.fiscal_year}`;
        return {
        label,
        period: s.period_end_date,
        fiscalYear: s.fiscal_year,
        fiscalQuarter: q,
        items: Object.fromEntries(
          (s.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total }])
        ),
      };
      }),
  [comparisonStatements, periodView, ttmPeriodEndDate]);

  const allCodes = useMemo(() => {
    const map = new Map<string, { name: string; isTotal: boolean; minOrder: number }>();
    for (const s of comparisonStatements) {
      for (const li of s.line_items ?? []) {
        const idx = li.order_index ?? 9999;
        const existing = map.get(li.line_item_code);
        if (!existing) {
          map.set(li.line_item_code, { name: li.line_item_name, isTotal: li.is_total, minOrder: idx });
        } else if (idx < existing.minOrder) {
          existing.minOrder = idx;
        }
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].minOrder - b[1].minOrder)
      .map(([code, v]) => ({ code, name: v.name, isTotal: v.isTotal }));
  }, [comparisonStatements]);

  const handleRecalculate = useCallback(() => {
    void refetch();
  }, [refetch]);

  // ── Merge line items mutation ───────────────────────────────────
  const mergeMut = useMutation({
    mutationFn: ({ keepCode, removeCode }: { keepCode: string; removeCode: string }) =>
      mergeLineItems(stockId, keepCode, removeCode),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      setMergeResult(res.message);
      setMergeSelection([]);
      setMergeMode(false);
    },
    onError: (err: Error) => { showErrorAlert("Merge Failed", err); },
  });

  const handleToggleMerge = useCallback((code: string) => {
    setMergeSelection((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return [prev[1], code];
      return [...prev, code];
    });
  }, []);

  const handleMerge = useCallback(() => {
    if (mergeSelection.length !== 2) return;
    const [keepCode, removeCode] = mergeSelection;
    const keepName = allCodes.find((r) => r.code === keepCode)?.name ?? keepCode;
    const removeName = allCodes.find((r) => r.code === removeCode)?.name ?? removeCode;
    const msg = `Merge "${removeName}" into "${keepName}"?\n\nValues from "${removeName}" will fill empty cells in "${keepName}", then "${removeName}" row will be deleted.`;
    const doMerge = () => mergeMut.mutate({ keepCode, removeCode });
    if (Platform.OS === "web") {
      if (confirm(msg)) doMerge();
    } else {
      Alert.alert("Merge Rows", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Merge", style: "default", onPress: doMerge },
      ]);
    }
  }, [mergeSelection, allCodes, mergeMut]);

  // ── Drag-and-drop state ─────────────────────────────────────────
  const [localOrder, setLocalOrder] = useState<{ code: string; name: string; isTotal: boolean }[] | null>(null);

  const allCodesKey = useMemo(() => allCodes.map((r) => r.code).join(","), [allCodes]);
  useEffect(() => { setLocalOrder(null); }, [allCodesKey]);

  const displayRows = localOrder ?? allCodes;

  const reorderMut = useMutation({
    mutationFn: (items: Array<{ id: number; order_index: number }>) => reorderLineItems(stockId, items),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); },
    onError: (err: Error) => { showErrorAlert("Reorder Failed", err); setLocalOrder(null); },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rows = localOrder ?? allCodes;
    const oldIndex = rows.findIndex((r) => r.code === active.id);
    const newIndex = rows.findIndex((r) => r.code === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(rows, oldIndex, newIndex);
    setLocalOrder(newOrder);
    const reorderItems: Array<{ id: number; order_index: number }> = [];
    newOrder.forEach((row, idx) => {
      for (const p of periods) {
        const cell = p.items[row.code];
        if (cell?.id != null) {
          reorderItems.push({ id: cell.id, order_index: idx + 1 });
        }
      }
    });
    if (reorderItems.length > 0) reorderMut.mutate(reorderItems);
  }, [localOrder, allCodes, periods, reorderMut]);

  const exportTables = useCallback((): TableData[] => {
    const headers = ["Line Item"];
    for (let i = 0; i < periods.length; i++) {
      headers.push(periods[i].label);
      if (i > 0) headers.push(getYoYHeaderLabel(periodView));
    }
    const rows = displayRows.map((item) => {
      const row: (string | number | null)[] = [item.name];
      for (let i = 0; i < periods.length; i++) {
        const val = periods[i].items[item.code]?.amount;
        row.push(val != null ? formatLineItemValue(item.name, val) : null);
        if (i > 0) {
          const prevVal = getYoYBaseValue(periods, periodView, i, item.code);
          const yoy = calculateYoYPercent(val, prevVal);
          row.push(yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : null);
        }
      }
      return row;
    });
    const typeName = STMNT_META[typeFilter]?.label ?? typeFilter;
    return [{ title: `${typeName} — Period Comparison`, headers, rows }];
  }, [periods, displayRows, typeFilter, periodView]);

  return (
    <View style={{ flex: 1 }}>
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} />
      <View style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgPrimary,
      }}>
        <Pressable
          onPress={() => setPeriodView("annual")}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: periodView === "annual" ? colors.accentPrimary : colors.borderColor,
            backgroundColor: periodView === "annual" ? colors.accentPrimary + "15" : colors.bgCard,
          }}
        >
          <Text style={{ color: periodView === "annual" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>Annual</Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriodView("quarter")}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: periodView === "quarter" ? colors.accentPrimary : colors.borderColor,
            backgroundColor: periodView === "quarter" ? colors.accentPrimary + "15" : colors.bgCard,
          }}
        >
          <Text style={{ color: periodView === "quarter" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>All Quarters</Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriodView("ttm")}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: periodView === "ttm" ? colors.accentPrimary : colors.borderColor,
            backgroundColor: periodView === "ttm" ? colors.accentPrimary + "15" : colors.bgCard,
          }}
        >
          <Text style={{ color: periodView === "ttm" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>Annual + TTM</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <FAPanelSkeleton />
      ) : periods.length < 2 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="columns" size={32} color={colors.warning} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Need 2+ periods</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Upload statements for multiple fiscal years to compare.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}>
          {/* Merge result banner */}
          {mergeResult && (
            <View style={{ marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.success + "18", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="check-circle" size={14} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.success }}>{mergeResult}</Text>
              <Pressable onPress={() => setMergeResult(null)} accessibilityRole="button" accessibilityLabel="Dismiss merge result"><FontAwesome name="times" size={14} color={colors.textMuted} /></Pressable>
            </View>
          )}

          <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Merge confirm button */}
            {mergeMode && mergeSelection.length === 2 && (
              <Pressable
                onPress={handleMerge}
                disabled={mergeMut.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Merge ${mergeSelection.length} rows`}
                accessibilityState={{ disabled: mergeMut.isPending, busy: mergeMut.isPending }}
                style={({ pressed }) => [{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: colors.accentPrimary, opacity: pressed ? 0.8 : 1,
                }]}
              >
                {mergeMut.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="compress" size={12} color="#fff" />
                )}
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Merge ({mergeSelection.length})</Text>
              </Pressable>
            )}
            {/* Merge toggle button */}
            <Pressable
              onPress={() => { setMergeMode((v) => !v); setMergeSelection([]); }}
              accessibilityRole="button"
              accessibilityLabel={mergeMode ? "Cancel merge" : "Enable merge rows"}
              accessibilityState={{ selected: mergeMode }}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", gap: 5,
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                backgroundColor: mergeMode ? colors.accentPrimary + "15" : colors.bgInput,
                borderWidth: 1, borderColor: mergeMode ? colors.accentPrimary : colors.borderColor,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <FontAwesome name={mergeMode ? "times" : "compress"} size={12} color={mergeMode ? colors.accentPrimary : colors.textMuted} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: mergeMode ? colors.accentPrimary : colors.textMuted }}>
                {mergeMode ? "Cancel Merge" : "Merge Rows"}
              </Text>
            </Pressable>

            <View style={{ flex: 1 }} />
            <Pressable
              onPress={handleRecalculate}
              accessibilityRole="button"
              accessibilityLabel="Refresh comparison"
              style={({ pressed }) => [{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.borderColor,
                backgroundColor: colors.bgCard,
                opacity: pressed ? 0.8 : 1,
                marginRight: 8,
              }]}
            >
              <FontAwesome name="refresh" size={12} color={colors.accentPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>Refresh</Text>
            </Pressable>
            <ExportBar
              onExport={async (fmt) => {
                const { exportExcel, exportCSV, exportPDF } = await import("@/lib/exportAnalysis");
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Comparison");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Comparison");
                else await exportPDF(t, stockSymbol, "Comparison");
              }}
              colors={colors}
              disabled={periods.length < 2}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 80 }}>
            <View>
              {/* Header row */}
              <View style={[st.compHeaderRow, { borderBottomColor: colors.borderColor }]}>
                <Text style={[st.compCellName, { color: colors.textPrimary, fontWeight: "800" }]}>Line Item</Text>
                {periods.map((p, i) => (
                  <React.Fragment key={p.period}>
                    <Text style={[st.compCellVal, { color: colors.textPrimary, fontWeight: "800" }]}>{p.label}</Text>
                    {i > 0 && <Text style={[st.compCellYoy, { color: colors.accentPrimary, fontWeight: "700" }]}>{getYoYHeaderLabel(periodView)}</Text>}
                  </React.Fragment>
                ))}
              </View>

              {/* Data rows */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={displayRows.map((r) => r.code)} strategy={verticalListSortingStrategy}>
                  {displayRows.map((item, rowIdx) => (
                    <SortableCompRow
                      key={item.code}
                      id={item.code}
                      item={item}
                      rowIdx={rowIdx}
                      periods={periods}
                      periodView={periodView}
                      colors={colors}
                      mergeMode={mergeMode}
                      mergeSelected={mergeSelection.includes(item.code)}
                      onToggleMerge={handleToggleMerge}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

function SortableCompRow({
  id, item, rowIdx, periods, colors,
  periodView,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  id: string;
  item: { code: string; name: string; isTotal: boolean };
  rowIdx: number;
  periods: CompPeriod[];
  periodView: ComparePeriodView;
  colors: ThemePalette;
  mergeMode: boolean;
  mergeSelected: boolean;
  onToggleMerge: (code: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 5,
    backgroundColor: isDragging
      ? (colors.accentPrimary + "20")
      : item.isTotal ? (colors.bgInput + "50") : rowIdx % 2 === 0 ? "transparent" : (colors.bgPrimary + "30"),
    borderTopWidth: item.isTotal ? 1 : 0,
    borderTopColor: colors.borderColor,
    borderTopStyle: item.isTotal ? "solid" as const : undefined,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setNodeRef} style={{
      ...style,
      ...(mergeSelected ? { backgroundColor: colors.accentPrimary + "25", borderLeft: `3px solid ${colors.accentPrimary}` } : {}),
    }}>
      {/* Merge checkbox */}
      {mergeMode && (
        <Pressable
          onPress={() => onToggleMerge(item.code)}
          hitSlop={4}
          accessibilityRole="checkbox"
          accessibilityLabel={`Select ${item.name} for merge`}
          accessibilityState={{ checked: mergeSelected }}
          style={{ marginRight: 4, padding: 2 }}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
            borderColor: mergeSelected ? colors.accentPrimary : colors.textMuted,
            backgroundColor: mergeSelected ? colors.accentPrimary : "transparent",
            alignItems: "center", justifyContent: "center",
          }}>
            {mergeSelected && <FontAwesome name="check" size={10} color="#fff" />}
          </View>
        </Pressable>
      )}

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          padding: 2,
          marginRight: 4,
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
      >
        <Text style={{ fontSize: 12, color: colors.textMuted }}>⠿</Text>
      </div>

      <Text numberOfLines={1} style={[st.compCellName, { color: item.isTotal ? colors.textPrimary : colors.textSecondary, fontWeight: item.isTotal ? "700" : "400" }]}>
        {item.name}
      </Text>
      {periods.map((p, i) => {
        const val = p.items[item.code]?.amount;
        const prevVal = getYoYBaseValue(periods, periodView, i, item.code);
        const yoy = calculateYoYPercent(val, prevVal);
        return (
          <React.Fragment key={p.period}>
            <Text style={[st.compCellVal, {
              color: val != null && val < 0 ? colors.danger : (item.isTotal ? colors.textPrimary : colors.textSecondary),
              fontWeight: item.isTotal ? "700" : "500",
            }]}>
              {val != null ? formatLineItemValue(item.name, val) : "–"}
            </Text>
            {i > 0 && (
              <Text style={[st.compCellYoy, {
                color: yoy == null ? colors.textMuted : yoy >= 0 ? colors.success : colors.danger,
                fontWeight: "600",
              }]}>
                {yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : "–"}
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
