/**
 * ComparisonPanel (native variant) — same as the web version minus the
 * `@dnd-kit` drag-and-drop layer. dnd-kit is DOM-only and renders raw
 * HTML <div> elements, which crash React Native ("View config getter
 * callback for component `div`").
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useStatements } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import type { TableData } from "@/lib/exportAnalysis";
import { mergeLineItems } from "@/services/api";
import { st } from "../styles";
import { STMNT_META, type PanelWithSymbolProps } from "../types";
import { formatLineItemValue } from "../utils";
import { ExportBar, StatementTabBar } from "./shared";

export function ComparisonPanel({ stockId, stockSymbol, colors, isDesktop: _isDesktop }: PanelWithSymbolProps) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("income");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  const statements = data?.statements ?? [];

  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({
        label: `FY${s.fiscal_year}${s.fiscal_quarter ? ` Q${s.fiscal_quarter}` : ""}`,
        period: s.period_end_date,
        items: Object.fromEntries(
          (s.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total }])
        ),
      })),
  [statements]);

  const allCodes = useMemo(() => {
    const map = new Map<string, { name: string; isTotal: boolean; minOrder: number }>();
    for (const s of statements) {
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
  }, [statements]);

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
       
      if (typeof confirm === "function" && confirm(msg)) doMerge();
    } else {
      Alert.alert("Merge Rows", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Merge", style: "default", onPress: doMerge },
      ]);
    }
  }, [mergeSelection, allCodes, mergeMut]);

  const displayRows = allCodes;

  const exportTables = useCallback((): TableData[] => {
    const headers = ["Line Item"];
    for (let i = 0; i < periods.length; i++) {
      headers.push(periods[i].label);
      if (i > 0) headers.push("YoY %");
    }
    const rows = displayRows.map((item) => {
      const row: (string | number | null)[] = [item.name];
      for (let i = 0; i < periods.length; i++) {
        const val = periods[i].items[item.code]?.amount;
        row.push(val != null ? formatLineItemValue(item.name, val) : null);
        if (i > 0) {
          const prevVal = periods[i - 1].items[item.code]?.amount;
          const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
          row.push(yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : null);
        }
      }
      return row;
    });
    const typeName = STMNT_META[typeFilter]?.label ?? typeFilter;
    return [{ title: `${typeName} — Period Comparison`, headers, rows }];
  }, [periods, displayRows, typeFilter]);

  return (
    <View style={{ flex: 1 }}>
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} />

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
          {mergeResult && (
            <View style={{ marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.success + "18", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="check-circle" size={14} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.success }}>{mergeResult}</Text>
              <Pressable onPress={() => setMergeResult(null)} accessibilityRole="button" accessibilityLabel="Dismiss merge result"><FontAwesome name="times" size={14} color={colors.textMuted} /></Pressable>
            </View>
          )}

          <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              <View style={[st.compHeaderRow, { borderBottomColor: colors.borderColor }]}>
                <Text style={[st.compCellName, { color: colors.textPrimary, fontWeight: "800" }]}>Line Item</Text>
                {periods.map((p, i) => (
                  <React.Fragment key={p.period}>
                    <Text style={[st.compCellVal, { color: colors.textPrimary, fontWeight: "800" }]}>{p.label}</Text>
                    {i > 0 && <Text style={[st.compCellYoy, { color: colors.accentPrimary, fontWeight: "700" }]}>YoY %</Text>}
                  </React.Fragment>
                ))}
              </View>

              {displayRows.map((item, rowIdx) => (
                <CompRow
                  key={item.code}
                  item={item}
                  rowIdx={rowIdx}
                  periods={periods}
                  colors={colors}
                  mergeMode={mergeMode}
                  mergeSelected={mergeSelection.includes(item.code)}
                  onToggleMerge={handleToggleMerge}
                />
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

// ── Comparison row (no drag) ────────────────────────────────────────
type CompPeriod = {
  label: string;
  period: string;
  items: Record<string, { id: number; amount: number; name: string; isTotal: boolean }>;
};

function CompRow({
  item, rowIdx, periods, colors,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  item: { code: string; name: string; isTotal: boolean };
  rowIdx: number;
  periods: CompPeriod[];
  colors: ThemePalette;
  mergeMode: boolean;
  mergeSelected: boolean;
  onToggleMerge: (code: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 5,
        backgroundColor: mergeSelected
          ? (colors.accentPrimary + "25")
          : item.isTotal
          ? (colors.bgInput + "50")
          : rowIdx % 2 === 0
          ? "transparent"
          : (colors.bgPrimary + "30"),
        borderTopWidth: item.isTotal ? 1 : 0,
        borderTopColor: colors.borderColor,
        borderLeftWidth: mergeSelected ? 3 : 0,
        borderLeftColor: mergeSelected ? colors.accentPrimary : "transparent",
      }}
    >
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

      <Text numberOfLines={1} style={[st.compCellName, { color: item.isTotal ? colors.textPrimary : colors.textSecondary, fontWeight: item.isTotal ? "700" : "400" }]}>
        {item.name}
      </Text>
      {periods.map((p, i) => {
        const val = p.items[item.code]?.amount;
        const prevVal = i > 0 ? periods[i - 1].items[item.code]?.amount : undefined;
        const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
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
    </View>
  );
}
