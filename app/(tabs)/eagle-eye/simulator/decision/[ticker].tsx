/* eslint-disable custom-styles/no-hardcoded-styles */
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { hasSimulatorIntegrityIssue, isSimulatorFeatureEnabled } from "@/constants/Config";
import { useReadOnlySimulatorIntegrity, useReadOnlySimulatorTrace } from "@/hooks/useSimulatorReadOnly";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DecisionTraceChart, formatKwd, jsonEntries, jsonValues, readText } from "./_shared";

export default function DecisionDetailScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const ticker = (params.ticker ?? "").toUpperCase().trim();
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();
  const simulatorEnabled = isSimulatorFeatureEnabled();
  const integrityQuery = useReadOnlySimulatorIntegrity(simulatorEnabled);
  const { data: trace, isLoading, isError, refetch } = useReadOnlySimulatorTrace(ticker, !!ticker && simulatorEnabled);

  const state = trace?.state ?? null;
  const cycles = trace?.cycles ?? [];
  const events = trace?.events ?? [];
  const simulatorBlocked = !simulatorEnabled;
  const simulatorUnavailable = simulatorEnabled && (integrityQuery.isError || hasSimulatorIntegrityIssue(integrityQuery.data));

  const thesis = useMemo(() => buildThesis(state, events.length), [state, events.length]);
  const gates = jsonValues(state?.gates).slice(0, 9);

  if (simulatorBlocked) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
        <EagleEyeTopTabs />
        <View style={[styles.blockState, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Simulator disabled</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>EXPO_PUBLIC_ENABLE_SIMULATOR is off. The local sealed-ledger simulator remains the only permitted environment.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <EagleEyeTopTabs />
      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.loadingState}>
          <FontAwesome name="exclamation-triangle" size={28} color={colors.danger} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Unable to load projected trace.</Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          {simulatorUnavailable ? (
            <View style={[styles.blockState, { backgroundColor: colors.dangerBg, borderColor: colors.danger }]}>
              <Text style={[styles.heroTitle, { color: colors.dangerText }]}>Simulator unavailable</Text>
              <Text style={[styles.emptyText, { color: colors.dangerText }]}>The simulator endpoint is unreachable or stale; the decision view will not present a false empty book.</Text>
            </View>
          ) : null}
          <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{ticker}</Text>
                <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>Decision trace</Text>
              </View>
              <View style={styles.heroBadges}>
                <Badge label={state?.book ?? "—"} color={colors.accentPrimary} />
                <Badge label={state?.lifecycle ?? "NEUTRAL"} color={colors.success} />
                <Badge label={state?.tier ?? "NONE"} color={colors.warning} />
              </View>
            </View>

            <Text style={[styles.thesis, { color: colors.textSecondary }]}>{thesis}</Text>

            <View style={styles.statRow}>
              <Stat label="Gates passing" value={state?.gates_passing != null ? `${state.gates_passing}/9` : "—"} />
              <Stat label="Confidence" value={state?.confidence != null ? `${state.confidence.toFixed(0)}%` : "—"} />
              <Stat label="Last event" value={state?.last_disposition ?? state?.last_kind ?? "—"} />
              <Stat label="Session" value={state?.session ?? "genesis"} />
            </View>
          </View>

          <DecisionTraceChart state={state} cycle={cycles[0] ?? null} />

          <SectionTitle title="9-gate grid" />
          <View style={styles.gateGrid}>
            {gates.length === 0 ? (
              <EmptyCard message="No gate payload was projected for this symbol." />
            ) : (
              gates.map((gate, index) => <GateCard key={`${index}-${String(gate.name ?? gate.key ?? index)}`} gate={gate} />)
            )}
          </View>

          <SectionTitle title="Evidence panels" />
          <View style={styles.evidenceGrid}>
            <EvidencePanel title="Soft conditions" items={jsonEntries(state?.soft_conditions)} />
            <EvidencePanel title="Hard refs" items={jsonEntries(state?.hard_refs)} />
            <EvidencePanel title="Base" items={jsonEntries(state?.base)} />
            <EvidencePanel title="Entry paths" items={jsonEntries(state?.entry_paths)} />
            <EvidencePanel title="Exit watch" items={jsonEntries(state?.exit_watch)} />
          </View>

          <SectionTitle title="Decision history" />
          <View style={[styles.historyCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            {events.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No decision history was projected for this symbol.</Text>
            ) : (
              events.map((event) => <EventRow key={event.id} event={event} />)
            )}
          </View>

          <View style={[styles.navRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/eagle-eye/simulator/decision/[ticker]-dna", params: { ticker } })}
              style={({ pressed }) => [styles.navBtn, { backgroundColor: pressed ? colors.accentSecondary : colors.accentPrimary }]}
            >
              <Text style={styles.navBtnText}>Cycle history</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.navBtnSecondary, { borderColor: colors.borderColor, backgroundColor: pressed ? colors.bgCardHover : colors.bgSecondary }]}
            >
              <Text style={[styles.navBtnSecondaryText, { color: colors.textPrimary }]}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function buildThesis(state: any, eventCount: number): string {
  if (!state) return "No projected trace is available yet.";
  const base = state.base ?? {};
  const width = typeof base.width_pct === "number" ? `${base.width_pct.toFixed(0)}% wide base` : "projected base";
  const gateText = state.gates_passing != null ? `${state.gates_passing}/9 gates passing` : "gate posture unavailable";
  const last = state.last_disposition ?? state.last_kind ?? "no recent event";
  return `${state.symbol ?? "Symbol"} sits in ${state.lifecycle ?? "NEUTRAL"} / ${state.tier ?? "NONE"} with ${gateText}, ${width}, and ${eventCount} projected events. Latest event: ${last}.`;
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

function GateCard({ gate }: { gate: Record<string, unknown> }) {
  const { colors } = useThemeStore();
  const name = readText(gate.name ?? gate.key ?? gate.signal ?? gate.label) ?? "Gate";
  const value = readText(gate.value ?? gate.current ?? gate.observed);
  const threshold = readText(gate.threshold ?? gate.target ?? gate.limit);
  const passed = Boolean(gate.pass ?? gate.passed ?? gate.ok ?? gate.fired);
  return (
    <View style={[styles.gateCard, { backgroundColor: colors.bgCard, borderColor: passed ? colors.success : colors.borderColor }]}>
      <Text style={[styles.gateName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
      <Text style={[styles.gateMeta, { color: colors.textMuted }]} numberOfLines={1}>
        {value ?? "—"} vs {threshold ?? "—"}
      </Text>
      <Text style={[styles.gateState, { color: passed ? colors.success : colors.danger }]}>{passed ? "PASS" : "BLOCK"}</Text>
    </View>
  );
}

function EvidencePanel({ title, items }: { title: string; items: Array<[string, unknown]> }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.evidenceCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[styles.evidenceTitle, { color: colors.textPrimary }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No projected evidence.</Text>
      ) : (
        items.slice(0, 6).map(([key, raw]) => (
          <View key={key} style={styles.evidenceRow}>
            <Text style={[styles.evidenceKey, { color: colors.textMuted }]}>{key}</Text>
            <Text style={[styles.evidenceValue, { color: colors.textPrimary }]} numberOfLines={2}>
              {typeof raw === "string" ? raw : JSON.stringify(raw)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function EventRow({ event }: { event: any }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.eventRow, { borderBottomColor: colors.borderColor }]}>
      <View style={styles.eventHeader}>
        <Text style={[styles.eventKind, { color: colors.textPrimary }]}>{event.kind}</Text>
        <Text style={[styles.eventDisposition, { color: event.disposition?.includes("VETO") ? colors.danger : colors.success }]}>{event.disposition}</Text>
      </View>
      <Text style={[styles.eventMeta, { color: colors.textMuted }]} numberOfLines={2}>
        {event.decision_session} · {event.payload?.reason ?? event.payload?.would_have_entry_reason ?? "no reason"}
      </Text>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  const { colors } = useThemeStore();
  return <View style={[styles.emptyCard, { backgroundColor: colors.bgSecondary }]}><Text style={[styles.emptyText, { color: colors.textMuted }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blockState: { flex: 1, margin: 16, padding: 24, borderWidth: 1, borderRadius: 12, justifyContent: "center" },
  content: { padding: 14, gap: 14 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  hero: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  heroTitle: { fontSize: 24, fontWeight: "800" },
  heroSubtitle: { fontSize: 12, marginTop: 2 },
  heroBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  thesis: { fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { minWidth: 120, flexGrow: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  statLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 13, fontWeight: "700" },
  gateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gateCard: { width: "31%", minWidth: 98, borderWidth: 1, borderRadius: 14, padding: 10, gap: 4 },
  gateName: { fontSize: 12, fontWeight: "800" },
  gateMeta: { fontSize: 10, lineHeight: 14 },
  gateState: { fontSize: 11, fontWeight: "800" },
  evidenceGrid: { gap: 10 },
  evidenceCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  evidenceTitle: { fontSize: 13, fontWeight: "800" },
  evidenceRow: { gap: 3 },
  evidenceKey: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  evidenceValue: { fontSize: 12, lineHeight: 17 },
  historyCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  eventRow: { paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  eventKind: { fontSize: 12, fontWeight: "800" },
  eventDisposition: { fontSize: 11, fontWeight: "800" },
  eventMeta: { fontSize: 11, lineHeight: 16 },
  navRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "space-between" },
  navBtn: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10 },
  navBtnText: { color: "#fff", fontWeight: "800" },
  navBtnSecondary: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  navBtnSecondaryText: { fontWeight: "800" },
  emptyCard: { borderRadius: 12, padding: 12 },
  emptyText: { fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
});