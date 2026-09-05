/* eslint-disable custom-styles/no-hardcoded-styles */
import { AdminOnlyGate } from "@/components/eagle-eye/AdminOnlyGate";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { hasSimulatorIntegrityIssue, isSimulatorFeatureEnabled } from "@/constants/Config";
import {
  useReadOnlySimulatorIntegrity,
  useReadOnlySimulatorScannerColumns,
  useReadOnlySimulatorSymbolStates,
  type SimulatorBook,
  type SimulatorSymbolState,
} from "@/hooks/useSimulatorReadOnly";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatKwd } from "./_shared";
import type { ThemePalette } from "@/constants/theme";

type ChipFilter = "confirmed_today" | "vetoed_today" | null;

function uniqueValues(rows: SimulatorSymbolState[], key: keyof SimulatorSymbolState): string[] {
  return Array.from(new Set(rows.map((row) => String(row[key] ?? "")).filter(Boolean))).sort();
}

function matchesChip(row: SimulatorSymbolState, chip: ChipFilter): boolean {
  if (!chip) return true;
  const disposition = String(row.last_disposition ?? row.last_kind ?? "").toUpperCase();
  return chip === "confirmed_today"
    ? disposition.includes("ENTRY") || disposition.includes("CONFIRMED")
    : disposition.includes("VETO");
}

export default function DecisionScannerScreen() {
  return (
    <AdminOnlyGate message="Simulator is available to admin users only.">
      <DecisionScannerScreenContent />
    </AdminOnlyGate>
  );
}

function DecisionScannerScreenContent() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const simulatorEnabled = isSimulatorFeatureEnabled();
  const integrityQuery = useReadOnlySimulatorIntegrity();
  const { data: states = {}, isLoading } = useReadOnlySimulatorSymbolStates(simulatorEnabled);
  const { data: columnsData } = useReadOnlySimulatorScannerColumns(simulatorEnabled);
  const [bookFilter, setBookFilter] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [chipFilter, setChipFilter] = useState<ChipFilter>(null);

  const rows = useMemo(() => Object.values(states).sort((left, right) => left.symbol.localeCompare(right.symbol)), [states]);
  const books = useMemo(() => uniqueValues(rows, "book").filter(Boolean) as SimulatorBook[], [rows]);
  const lifecycles = useMemo(() => uniqueValues(rows, "lifecycle"), [rows]);
  const tiers = useMemo(() => uniqueValues(rows, "tier"), [rows]);
  const simulatorBlocked = !simulatorEnabled;
  const simulatorUnavailable = simulatorEnabled && (integrityQuery.isError || hasSimulatorIntegrityIssue(integrityQuery.data));

  if (simulatorBlocked) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
        <EagleEyeTopTabs />
        <View style={[styles.blockState, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Simulator disabled</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>EXPO_PUBLIC_ENABLE_SIMULATOR is off. V2 decision surfaces remain hidden in production.</Text>
        </View>
      </View>
    );
  }

  const filtered = rows.filter((row) => {
    const bookOk = !bookFilter || row.book === bookFilter;
    const stateOk = !stateFilter || row.lifecycle === stateFilter;
    const tierOk = !tierFilter || row.tier === tierFilter;
    const chipOk = matchesChip(row, chipFilter);
    return bookOk && stateOk && tierOk && chipOk;
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {simulatorUnavailable ? (
          <View style={[styles.blockState, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
            <Text style={[styles.title, { color: colors.dangerText }]}>Simulator unavailable</Text>
            <Text style={[styles.subtitle, { color: colors.dangerText }]}>The simulator projection is unreachable or stale. The UI will not show data until the sealed-ledger feed recovers.</Text>
          </View>
        ) : null}
        <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <View style={styles.heroRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Decision transparency scanner</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Read-only projection view. Book, state, tier, gates, and base fields are copied from the sealed ledger snapshot.</Text>
            </View>
            <Pressable
              onPress={() => Alert.alert("CONF advisory", "CONF is advisory only: it mirrors projected gate posture and should not be treated as a computed decision signal.")}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <FontAwesome name="info-circle" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {renderChip(colors, "All books", !bookFilter, () => setBookFilter(null), "book-all")}
            {books.map((book) => renderChip(colors, book, bookFilter === book, () => setBookFilter((current) => (current === book ? null : book)), `book-${book}`))}
          </View>
          <View style={styles.filterRow}>
            {renderChip(colors, "All states", !stateFilter, () => setStateFilter(null), "state-all")}
            {lifecycles.map((value) => renderChip(colors, value, stateFilter === value, () => setStateFilter((current) => (current === value ? null : value)), `state-${value}`))}
          </View>
          <View style={styles.filterRow}>
            {renderChip(colors, "All tiers", !tierFilter, () => setTierFilter(null), "tier-all")}
            {tiers.map((value) => renderChip(colors, value, tierFilter === value, () => setTierFilter((current) => (current === value ? null : value)), `tier-${value}`))}
          </View>
          <View style={styles.filterRow}>
            {renderChip(colors, "Confirmed today", chipFilter === "confirmed_today", () => setChipFilter((current) => (current === "confirmed_today" ? null : "confirmed_today")), "chip-confirmed")}
            {renderChip(colors, "Vetoed today", chipFilter === "vetoed_today", () => setChipFilter((current) => (current === "vetoed_today" ? null : "vetoed_today")), "chip-vetoed")}
          </View>
        </View>

        <View style={[styles.tableShell, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: colors.borderColor }]}>
                {(columnsData?.columns ?? [
                  { key: "book", label: "BOOK" },
                  { key: "symbol", label: "SYMBOL" },
                  { key: "lifecycle", label: "STATE" },
                  { key: "tier", label: "TIER" },
                  { key: "gates_passing", label: "GATES" },
                  { key: "base_json", label: "BASE" },
                  { key: "confidence", label: "CONF" },
                ]).map((column) => (
                  <Text key={column.key} style={[styles.headerCell, { color: colors.textMuted }]}>{column.label}</Text>
                ))}
              </View>

              {isLoading ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Loading projected states...</Text>
              ) : filtered.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No symbols match the current filters.</Text>
              ) : (
                filtered.map((row) => <ScannerRow key={row.symbol} row={row} colors={colors} />)
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function ScannerRow({ row, colors }: { row: SimulatorSymbolState; colors: ThemePalette }) {
  const labelColor = row.last_disposition?.includes("VETO") ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(tabs)/eagle-eye/simulator/decision/[ticker]", params: { ticker: row.symbol } })}
      style={({ pressed }) => [styles.tableRow, { backgroundColor: pressed ? colors.bgCardHover : colors.bgCard, borderBottomColor: colors.borderColor }]}
    >
      <Cell text={row.book ?? "—"} color={colors.textPrimary} />
      <Cell text={row.symbol} color={colors.textPrimary} bold />
      <Cell text={row.lifecycle} color={labelColor} />
      <Cell text={row.tier} color={colors.textPrimary} />
      <Cell text={row.gates_passing != null ? `${row.gates_passing}/9` : "—"} color={colors.textPrimary} />
      <Cell text={formatBase(row.base)} color={colors.textSecondary} />
      <Cell text={row.confidence != null ? `${row.confidence.toFixed(0)}%` : "—"} color={colors.success} />
      <Cell text={row.last_disposition ?? "—"} color={labelColor} />
    </Pressable>
  );
}

function formatBase(base?: Record<string, unknown> | null): string {
  if (!base) return "—";
  const width = typeof base.width_pct === "number" ? `${base.width_pct.toFixed(0)}%` : null;
  const top = typeof base.top === "number" ? formatKwd(base.top) : null;
  const low = typeof base.low === "number" ? formatKwd(base.low) : null;
  return [width ? `W ${width}` : null, top ? `Top ${top}` : null, low ? `Low ${low}` : null].filter(Boolean).join(" · ") || "Base";
}

function Cell({ text, color, bold = false }: { text: string; color: string; bold?: boolean }) {
  return <Text style={[styles.cell, { color, fontWeight: bold ? "800" : "600" }]} numberOfLines={1}>{text}</Text>;
}

function renderChip(colors: ThemePalette, label: string, active: boolean, onPress: () => void, key?: string) {
  return (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accentPrimary : colors.bgSecondary,
          borderColor: active ? colors.accentPrimary : colors.borderColor,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blockState: { flex: 1, margin: 16, padding: 24, borderWidth: 1, borderRadius: 12, justifyContent: "center" },
  content: { padding: 14, gap: 14 },
  hero: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontSize: 11, fontWeight: "700" },
  tableShell: { borderWidth: 1, borderRadius: 16, padding: 10 },
  tableHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  headerCell: { width: 104, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  cell: { width: 104, fontSize: 12 },
  emptyText: { padding: 16, fontSize: 13 },
});