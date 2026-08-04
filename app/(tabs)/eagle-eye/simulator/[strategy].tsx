/* eslint-disable custom-styles/no-hardcoded-styles */
import {
  useReadOnlySimulatorIntegrity,
  useReadOnlySimulatorNav,
  useReadOnlySimulatorPositions,
  useReadOnlySimulatorTransactions,
  type SimulatorBook,
  type SimulatorIntegrity,
  type SimulatorPosition,
  type SimulatorTransaction,
} from "@/hooks/useSimulatorReadOnly";
import { useThemeStore } from "@/services/themeStore";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";

const BOOK_COLORS: Record<SimulatorBook, string> = { BUY: "#16A34A", WATCHLIST: "#2563EB" };

function normalizeBook(value?: string): SimulatorBook {
  return value?.toUpperCase() === "WATCHLIST" ? "WATCHLIST" : "BUY";
}

function formatKwd(value: number): string {
  return value.toLocaleString("en-KW", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function IntegrityStrip({ integrity, isLoading, isError }: { integrity?: SimulatorIntegrity; isLoading: boolean; isError: boolean }) {
  const { colors } = useThemeStore();
  const sealed = integrity?.seal_verification.pass === true && (integrity?.guard_trips_count ?? 0) === 0;
  const staleProjection = integrity?.projection_stale === true || integrity?.projection_status === "STALE";
  const ok = !!integrity && sealed && !staleProjection;
  const fetchFailed = isError;
  const warn = staleProjection || fetchFailed;
  const bg = ok ? colors.successBg : warn ? colors.warning + "22" : colors.dangerBg;
  const border = ok ? colors.success : warn ? colors.warning : colors.danger;
  const textColor = ok ? colors.successText : warn ? colors.warning : colors.dangerText;
  return (
    <View style={[styles.integrityStrip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.integrityText, { color: textColor }]}> 
        {isLoading && !integrity
          ? "Checking simulator integrity"
          : staleProjection
          ? `Projection stale · ${integrity?.projection_stale_reason ?? "verification mismatch"}`
          : fetchFailed
          ? `Integrity feed unavailable · ${integrity ? "showing cached status" : "status unknown"}`
          : ok
          ? `Seals verified · session ${integrity?.last_session_processed ?? "genesis"} · ${integrity?.guard_trips_count ?? 0} guard trips`
          : "Simulator integrity warning"}
      </Text>
    </View>
  );
}

function EquityLine({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const width = 340;
  const height = 96;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * (width - pad * 2);
      const y = pad + ((max - value) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}><Polyline points={points} fill="none" stroke={color} strokeWidth={2} /></Svg>;
}

function PositionRow({ position }: { position: SimulatorPosition }) {
  const { colors } = useThemeStore();
  const pnlColor = position.unrealized_pnl_pct >= 0 ? colors.success : colors.danger;
  return (
    <View style={[styles.tableRow, { borderBottomColor: colors.borderColor }]}>
      <View style={styles.symbolCell}>
        <Text style={[styles.symbolText, { color: colors.textPrimary }]}>{position.symbol}</Text>
        <Text style={[styles.mutedText, { color: colors.textMuted }]}>{position.entry_reason?.replace(/_/g, " ") ?? "entry"}</Text>
      </View>
      <Text style={[styles.cellText, { color: colors.textSecondary }]}>{position.entry_date ?? "-"}</Text>
      <Text style={[styles.cellText, { color: colors.textSecondary }]}>{position.sessions_held ?? 0}</Text>
      <Text style={[styles.cellText, { color: pnlColor }]}>{position.unrealized_pnl_pct >= 0 ? "+" : ""}{position.unrealized_pnl_pct.toFixed(2)}%</Text>
      <Text style={[styles.cellText, { color: colors.textMuted }]}>{position.current_lifecycle ?? "-"} · {position.avoid_tier}</Text>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: SimulatorTransaction }) {
  const { colors } = useThemeStore();
  const isVoid = transaction.transaction_type === "VOID" || transaction.status === "VOID";
  return (
    <View style={[styles.txRow, { borderBottomColor: colors.borderColor }]}>
      <View style={styles.symbolCell}>
        <Text style={[styles.symbolText, { color: colors.textPrimary }]}>{transaction.symbol}</Text>
        <Text style={[styles.mutedText, { color: colors.textMuted }]}>{transaction.fill_session} · {transaction.reason.replace(/_/g, " ")}</Text>
      </View>
      <View style={[styles.voidBadge, { backgroundColor: isVoid ? colors.dangerBg : colors.bgCardHover, borderColor: isVoid ? colors.danger : colors.borderColor }]}>
        <Text style={[styles.voidBadgeText, { color: isVoid ? colors.dangerText : colors.textSecondary }]}>{transaction.transaction_type}</Text>
      </View>
      <Text style={[styles.txValue, { color: colors.textSecondary }]}>{formatKwd(transaction.net_cash_delta_kwd)}</Text>
    </View>
  );
}

export default function SimulatorBookDetailScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { strategy } = useLocalSearchParams<{ strategy: string }>();
  const book = normalizeBook(strategy);
  const accent = BOOK_COLORS[book];
  const { data: positions = [], isLoading: positionsLoading, isRefetching, refetch } = useReadOnlySimulatorPositions(book);
  const { data: transactions = [] } = useReadOnlySimulatorTransactions(book, undefined, 25);
  const { data: nav = [] } = useReadOnlySimulatorNav(book, 90);
  const integrityQuery = useReadOnlySimulatorIntegrity();
  const integrity = integrityQuery.data;
  const onRefresh = useCallback(() => refetch(), [refetch]);
  const latest = nav[nav.length - 1];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={accent} />}
    >
      <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={[styles.backText, { color: accent }]}>Back to simulator</Text></Pressable>
      <IntegrityStrip integrity={integrity} isLoading={integrityQuery.isLoading} isError={integrityQuery.isError} />
      <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{book} Paper Book</Text>
      {book === "WATCHLIST" ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>Shadow book — entries the system vetoed, tracked to measure selectivity.</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>NAV</Text>
        <Text style={[styles.navText, { color: colors.textPrimary }]}>{formatKwd(latest?.nav_kwd ?? 100_000)} KWD</Text>
        <EquityLine values={nav.map((point) => point.nav_kwd)} color={accent} />
      </View>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Open positions</Text>
        {positionsLoading ? <ActivityIndicator color={accent} /> : positions.length === 0 ? <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open positions from the ledger.</Text> : positions.map((position) => <PositionRow key={position.symbol} position={position} />)}
      </View>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Recent transactions</Text>
        {transactions.length === 0 ? <Text style={[styles.emptyText, { color: colors.textMuted }]}>No ledger transactions yet.</Text> : transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, gap: 14 },
  backBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  backText: { fontSize: 14, fontWeight: "700" },
  integrityStrip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  integrityText: { fontSize: 12, fontWeight: "700" },
  pageTitle: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  kpiLabel: { fontSize: 12, fontWeight: "700" },
  navText: { fontSize: 26, fontWeight: "800" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  symbolCell: { flex: 1.4, minWidth: 96 },
  symbolText: { fontSize: 13, fontWeight: "800" },
  mutedText: { fontSize: 11, marginTop: 2 },
  cellText: { flex: 1, fontSize: 12, textAlign: "right" },
  txRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  voidBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  voidBadgeText: { fontSize: 11, fontWeight: "800" },
  txValue: { width: 96, textAlign: "right", fontSize: 12, fontWeight: "700" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", paddingVertical: 16 },
});
