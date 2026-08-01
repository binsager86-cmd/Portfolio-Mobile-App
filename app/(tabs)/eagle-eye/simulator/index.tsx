/* eslint-disable custom-styles/no-hardcoded-styles */
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import {
  useReadOnlySimulatorIntegrity,
  useReadOnlySimulatorNav,
  useReadOnlySimulatorPortfolios,
  type SimulatorBook,
  type SimulatorIntegrity,
  type SimulatorNavPoint,
  type SimulatorPortfolioSummary,
} from "@/hooks/useSimulatorReadOnly";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import { router } from "expo-router";
import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";

const BOOKS: SimulatorBook[] = ["BUY", "WATCHLIST"];
const BOOK_COLORS: Record<SimulatorBook, string> = { BUY: "#16A34A", WATCHLIST: "#2563EB" };
const GENESIS_NAV = 100_000;

function formatKwd(value: number): string {
  return value.toLocaleString("en-KW", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function Sparkline({ points, color }: { points: SimulatorNavPoint[]; color: string }) {
  const data = points.length > 0 ? points.map((point) => point.nav_kwd) : [GENESIS_NAV];
  if (data.length < 2) return <View style={styles.sparklineBlank} />;
  const width = 120;
  const height = 36;
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const coordinates = data
    .map((value, index) => {
      const x = pad + (index / (data.length - 1)) * (width - pad * 2);
      const y = pad + ((max - value) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={coordinates} fill="none" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function IntegrityStrip({ integrity }: { integrity?: SimulatorIntegrity }) {
  const { colors } = useThemeStore();
  const sealed = integrity?.seal_verification.pass === true && (integrity?.guard_trips_count ?? 0) === 0;
  const staleProjection = integrity?.projection_stale === true || integrity?.projection_status === "STALE";
  const ok = sealed && !staleProjection;
  const message = ok
    ? `Seals verified · session ${integrity?.last_session_processed ?? "genesis"} · ${integrity?.guard_trips_count ?? 0} guard trips`
    : staleProjection
    ? `Projection stale · ${integrity?.projection_stale_reason ?? "verification mismatch"}`
    : integrity
    ? `Seal warning · ${integrity.seal_verification.failures[0]?.reason ?? `${integrity.guard_trips_count} guard trips`}`
    : "Checking simulator integrity";
  const bg = ok ? colors.successBg : staleProjection ? colors.warning + "22" : colors.dangerBg;
  const border = ok ? colors.success : staleProjection ? colors.warning : colors.danger;
  const textColor = ok ? colors.successText : staleProjection ? colors.warning : colors.dangerText;
  return (
    <View style={[styles.integrityStrip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.integrityText, { color: textColor }]}>{message}</Text>
    </View>
  );
}

function PortfolioCard({ summary, nav }: { summary: SimulatorPortfolioSummary; nav: SimulatorNavPoint[] }) {
  const { colors } = useThemeStore();
  const accent = BOOK_COLORS[summary.book];
  const isPositive = summary.change_since_inception_pct >= 0;
  return (
    <Pressable
      onPress={() => router.push(`/eagle-eye/simulator/${summary.book.toLowerCase()}`)}
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: accent }]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.bookLabel, { color: accent }]}>{summary.book}</Text>
        <Text style={[styles.positionsText, { color: colors.textMuted }]}>{summary.open_position_count} open</Text>
      </View>
      <Text style={[styles.navText, { color: colors.textPrimary }]}>{formatKwd(summary.nav_kwd)} KWD</Text>
      <Text style={[styles.changeText, { color: isPositive ? colors.success : colors.danger }]}> 
        {isPositive ? "+" : ""}{summary.change_since_inception_pct.toFixed(2)}% since inception
      </Text>
      <View style={styles.cardBodyRow}>
        <View>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>Cash {formatKwd(summary.cash_kwd)}</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>Invested {formatKwd(summary.invested_kwd)}</Text>
        </View>
        <Sparkline points={nav} color={accent} />
      </View>
      <Text style={[styles.tapText, { color: colors.textMuted }]}>Tap for positions and ledger rows</Text>
    </Pressable>
  );
}

function SimulatorCard({ book, summary }: { book: SimulatorBook; summary?: SimulatorPortfolioSummary }) {
  const { data: nav = [] } = useReadOnlySimulatorNav(book, 60);
  const fallback: SimulatorPortfolioSummary = summary ?? {
    book,
    nav_kwd: GENESIS_NAV,
    cash_kwd: GENESIS_NAV,
    invested_kwd: 0,
    open_position_count: 0,
    total_pnl_kwd: 0,
    change_since_inception_pct: 0,
    inception_date: null,
  };
  return <PortfolioCard summary={fallback} nav={nav} />;
}

export default function SimulatorIndexScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const { data: portfolios = [], isLoading, isRefetching, refetch } = useReadOnlySimulatorPortfolios();
  const { data: integrity } = useReadOnlySimulatorIntegrity();
  const onRefresh = useCallback(() => refetch(), [refetch]);
  const byBook = Object.fromEntries(portfolios.map((portfolio) => [portfolio.book, portfolio])) as Partial<Record<SimulatorBook, SimulatorPortfolioSummary>>;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />
      <ScrollView
        style={{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
      >
        <IntegrityStrip integrity={integrity} />
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Forward Paper Books</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>Daily cycle writes the ledger. This screen reads the sealed ledger only.</Text>
        {isLoading ? <ActivityIndicator color={colors.accentPrimary} /> : null}
        <View style={styles.cardsGrid}>{BOOKS.map((book) => <SimulatorCard key={book} book={book} summary={byBook[book]} />)}</View>
        <View style={[styles.emptyPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Genesis baseline</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>100,000.000 KWD per book. No synthetic activity is displayed before the first live session writes ledger rows.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  integrityStrip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  integrityText: { fontSize: 12, fontWeight: "700" },
  pageTitle: { fontSize: 24, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, lineHeight: 19 },
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexGrow: 1, flexBasis: 280, borderWidth: 1, borderRadius: 8, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bookLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  positionsText: { fontSize: 12, fontWeight: "600" },
  navText: { fontSize: 26, fontWeight: "800" },
  changeText: { fontSize: 13, fontWeight: "700" },
  cardBodyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  metaText: { fontSize: 12, lineHeight: 18 },
  tapText: { fontSize: 11, fontWeight: "600" },
  sparklineBlank: { width: 120, height: 36 },
  emptyPanel: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyText: { fontSize: 12, lineHeight: 18 },
});
