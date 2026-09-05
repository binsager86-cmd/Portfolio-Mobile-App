/* eslint-disable custom-styles/no-hardcoded-styles */
import { AdminOnlyGate } from "@/components/eagle-eye/AdminOnlyGate";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { useReadOnlySimulatorTrace } from "@/hooks/useSimulatorReadOnly";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DecisionTraceChart, formatKwd, formatPct, readText } from "./_shared";

export default function DecisionCycleHistoryScreen() {
  return (
    <AdminOnlyGate message="Simulator is available to admin users only.">
      <DecisionCycleHistoryScreenContent />
    </AdminOnlyGate>
  );
}

function DecisionCycleHistoryScreenContent() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase().trim();
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const router = useRouter();
  const { data: trace } = useReadOnlySimulatorTrace(ticker, !!ticker);

  const state = trace?.state ?? null;
  const cycles = trace?.cycles ?? [];
  const events = trace?.events ?? [];

  const pathStats = useMemo(() => buildEntryPathStats(cycles), [cycles]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Cycle history</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>{ticker || "—"}</Text>
            </View>
            <View style={styles.heroBadges}>
              <Badge label={state?.book ?? "—"} color={colors.accentPrimary} />
              <Badge label={state?.lifecycle ?? "NEUTRAL"} color={colors.success} />
            </View>
          </View>
          <Text style={[styles.thesis, { color: colors.textSecondary }]}>Completed lifecycle cycles are projected from the sealed replay, with no client-side signal derivation.</Text>
          <View style={styles.statRow}>
            <Stat label="Cycles" value={String(cycles.length)} />
            <Stat label="Events" value={String(events.length)} />
            <Stat label="ml_prob_min" value="—" />
          </View>
        </View>

        <DecisionTraceChart state={state} cycle={cycles[0] ?? null} />

        <SectionTitle title="Cycle cards" />
        {cycles.length === 0 ? (
          <EmptyState message="No completed cycles have been projected yet." />
        ) : (
          cycles.map((cycle) => (
            <View key={cycle.id} style={[styles.cycleCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={styles.cycleHeader}>
                <View>
                  <Text style={[styles.cycleTitle, { color: colors.textPrimary }]}>{cycle.symbol}</Text>
                  <Text style={[styles.cycleMeta, { color: colors.textMuted }]}>{cycle.book} · {cycle.entry_path ?? "unknown path"}</Text>
                </View>
                <Badge label={formatPct(cycle.pnl_pct)} color={cycle.pnl_pct >= 0 ? colors.success : colors.danger} />
              </View>
              <DecisionTraceChart state={state} cycle={cycle} />
              <View style={styles.cycleStatsRow}>
                <Stat label="Entry" value={`${cycle.entry_date ?? "—"} @ ${formatKwd(cycle.entry_price)}`} />
                <Stat label="Exit" value={`${cycle.exit_date ?? "—"} @ ${formatKwd(cycle.exit_price)}`} />
                <Stat label="Peak MFE" value={formatPct(cycle.peak_mfe)} />
              </View>
              <View style={styles.cycleStatsRow}>
                <Stat label="Base" value={`${cycle.base_start ?? "—"} → ${cycle.base_end ?? "—"}`} />
                <Stat label="Shakeouts" value={String(cycle.shakeout_dates.length)} />
                <Stat label="Exit reason" value={cycle.exit_reason ?? "—"} />
              </View>
            </View>
          ))
        )}

        <SectionTitle title="Condition timeline" />
        <View style={[styles.timelineCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {events.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No projected events are available.</Text>
          ) : (
            events.slice(0, 12).map((event) => (
              <View key={event.id} style={styles.timelineRow}>
                <Text style={[styles.timelineSession, { color: colors.textMuted }]}>{event.decision_session}</Text>
                <View style={styles.timelineBody}>
                  <Text style={[styles.timelineKind, { color: colors.textPrimary }]}>{event.kind}</Text>
                  <Text style={[styles.timelineMeta, { color: colors.textMuted }]} numberOfLines={2}>
                    {readText(event.payload?.reason) ?? readText(event.payload?.would_have_entry_reason) ?? "Projected state snapshot"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <SectionTitle title="Outcome by entry path" />
        <View style={styles.pathGrid}>
          {pathStats.length === 0 ? (
            <EmptyState message="No completed cycles yet, so path stats are empty." />
          ) : (
            pathStats.map((stat) => (
              <View key={stat.path} style={[styles.pathCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <Text style={[styles.pathTitle, { color: colors.textPrimary }]} numberOfLines={1}>{stat.path}</Text>
                <Text style={[styles.pathStat, { color: colors.textMuted }]}>{stat.count} cycles</Text>
                <Text style={[styles.pathStat, { color: stat.avgPnl >= 0 ? colors.success : colors.danger }]}>{formatPct(stat.avgPnl)} avg pnl</Text>
                {stat.count < 3 ? <Text style={[styles.warningText, { color: colors.warning }]}>Small sample</Text> : null}
              </View>
            ))
          )}
        </View>

        <View style={[styles.mlBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}>
          <FontAwesome name="flask" size={14} color={colors.warning} />
          <Text style={[styles.mlBannerText, { color: colors.textPrimary }]}>Experimental ML section stays visible, but ml_prob_min is intentionally empty until Campaign 2.</Text>
        </View>

        <View style={styles.footerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.bgCardHover : colors.bgSecondary, borderColor: colors.borderColor }]}>
            <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function buildEntryPathStats(cycles: Array<{ entry_path: string | null; pnl_pct: number }>) {
  const map = new Map<string, { count: number; totalPnl: number }>();
  for (const cycle of cycles) {
    const path = cycle.entry_path ?? "unknown";
    const current = map.get(path) ?? { count: 0, totalPnl: 0 };
    current.count += 1;
    current.totalPnl += cycle.pnl_pct;
    map.set(path, current);
  }
  return Array.from(map.entries())
    .map(([path, summary]) => ({ path, count: summary.count, avgPnl: summary.totalPnl / summary.count }))
    .sort((left, right) => right.count - left.count || right.avgPnl - left.avgPnl);
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.stat, { backgroundColor: colors.bgSecondary }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useThemeStore();
  return <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>;
}

function EmptyState({ message }: { message: string }) {
  const { colors } = useThemeStore();
  return <View style={[styles.emptyState, { backgroundColor: colors.bgSecondary }]}><Text style={[styles.emptyText, { color: colors.textMuted }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 14 },
  hero: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  heroTitle: { fontSize: 22, fontWeight: "800" },
  heroSubtitle: { fontSize: 12, marginTop: 2 },
  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  thesis: { fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { minWidth: 100, flexGrow: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  statLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 13, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  cycleCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  cycleHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  cycleTitle: { fontSize: 16, fontWeight: "800" },
  cycleMeta: { fontSize: 11, marginTop: 2 },
  cycleStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timelineCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  timelineRow: { flexDirection: "row", gap: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  timelineSession: { width: 92, fontSize: 11, fontWeight: "700" },
  timelineBody: { flex: 1, gap: 3 },
  timelineKind: { fontSize: 12, fontWeight: "800" },
  timelineMeta: { fontSize: 11, lineHeight: 16 },
  pathGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pathCard: { minWidth: 140, flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  pathTitle: { fontSize: 12, fontWeight: "800" },
  pathStat: { fontSize: 11, fontWeight: "700" },
  warningText: { fontSize: 10, fontWeight: "800" },
  mlBanner: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  mlBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  footerRow: { alignItems: "flex-start" },
  backBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  backBtnText: { fontWeight: "800" },
  emptyState: { borderRadius: 12, padding: 12 },
  emptyText: { fontSize: 12, lineHeight: 18 },
});