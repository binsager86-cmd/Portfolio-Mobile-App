/* eslint-disable custom-styles/no-hardcoded-styles */

import { BehavioralDnaScreenContent } from "@/components/eagle-eye/BehavioralDnaScreenContent";
import { EE } from "@/constants/eagleEyeStrings";
import { isSimulatorFeatureEnabled } from "@/constants/Config";
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import {
  useEagleEyeDna,
  useEagleEyeDnaRecentBars,
  useEagleEyeStock,
} from "@/hooks/useEagleEye";
import {
  findSimulatorState,
  useReadOnlySimulatorSymbolCycles,
  useReadOnlySimulatorSymbolStates,
  type SimulatorCycle,
  type SimulatorSymbolState,
} from "@/hooks/useSimulatorReadOnly";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DecisionTraceChart, formatKwd, formatPct } from "./simulator/decision/_shared";

type DnaTab = "dna" | "cycles";

export default function EagleEyeDnaScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const rawParam = params.ticker ?? "";
  const ticker = rawParam.replace(/-dna$/i, "").toUpperCase().trim();

  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DnaTab>("dna");
  const simulatorEnabled = isSimulatorFeatureEnabled();
  const { data, isLoading, isError, refetch } = useEagleEyeDna(ticker);
  const { data: stockData } = useEagleEyeStock(ticker, 0, !!ticker);
  const {
    data: recentBarsData,
    isLoading: isRecentBarsLoading,
    isError: isRecentBarsError,
  } = useEagleEyeDnaRecentBars(ticker, !!ticker);
  const { data: cycles } = useReadOnlySimulatorSymbolCycles(ticker, simulatorEnabled && !!ticker);
  const { data: simulatorStates } = useReadOnlySimulatorSymbolStates(simulatorEnabled && !!ticker);
  const simulatorState = findSimulatorState(simulatorStates, ticker);

  const isPending = data?.status === "pending";
  const isUnavailable = data?.status === "unavailable";
  const isServerError = data?.status === "error";
  const dna = data?.data;
  const screenTitle = `Behavioral DNA - ${ticker}`;

  const tabBar = simulatorEnabled ? (
    <DnaTabBar activeTab={activeTab} onChange={setActiveTab} colors={colors} />
  ) : null;

  if (activeTab === "cycles") {
    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
        <CycleHistoryPanel ticker={ticker} cycles={cycles ?? []} simulatorState={simulatorState} colors={colors} />
      </ScreenFrame>
    );
  }

  if (isLoading) {
    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      </ScreenFrame>
    );
  }

  if (isPending) {
    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
          <Text style={[styles.errorText, { color: colors.textMuted, marginTop: UITokens.spacing.sm }]}>Computing Behavioral DNA...</Text>
          <Text style={[styles.helperText, { color: colors.textMuted, textAlign: "center" }]}>
            {data?.message ?? "This runs in the background. Check back in a few minutes."}
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  if (isError || isServerError || !dna) {
    if (isUnavailable) {
      return (
        <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
          <View style={styles.centred}>
            <FontAwesome name="bar-chart" size={28} color={colors.textMuted} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Insufficient Price History</Text>
            <Text style={[styles.helperText, { color: colors.textMuted, textAlign: "center" }]}>
              {data?.message ?? "Not enough trading history to build Behavioral DNA for this stock."}
            </Text>
          </View>
        </ScreenFrame>
      );
    }

    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
        <View style={styles.centred}>
          <FontAwesome name="exclamation-triangle" size={28} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {isServerError && data?.message ? data.message : EE.errorLoading}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={styles.retryBtnText}>{EE.retry}</Text>
          </Pressable>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top} tabBar={tabBar}>
      <BehavioralDnaScreenContent
        ticker={ticker}
        dna={dna}
        stock={stockData?.data}
        recentBars={recentBarsData?.bars ?? []}
        recentBarsLoading={isRecentBarsLoading}
        recentBarsError={isRecentBarsError}
        colors={colors}
        bottomInset={insets.bottom}
      />
    </ScreenFrame>
  );
}

function ScreenFrame({
  title,
  colors,
  topInset,
  tabBar,
  children,
}: {
  title: string;
  colors: ThemePalette;
  topInset: number;
  tabBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: topInset }]}>
      <BackHeader title={title} colors={colors} />
      {tabBar}
      {children}
    </View>
  );
}

function DnaTabBar({
  activeTab,
  onChange,
  colors,
}: {
  activeTab: DnaTab;
  onChange: (tab: DnaTab) => void;
  colors: ThemePalette;
}) {
  const tabs: Array<{ key: DnaTab; label: string }> = [
    { key: "dna", label: "Behavioral DNA" },
    { key: "cycles", label: "V2 Cycle History" },
  ];
  return (
    <View style={[styles.dnaTabBar, { borderBottomColor: colors.borderColor }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.dnaTabBtn, isActive && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.dnaTabText, { color: isActive ? colors.accentPrimary : colors.textMuted }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CycleHistoryPanel({
  ticker,
  cycles,
  simulatorState,
  colors,
}: {
  ticker: string;
  cycles: SimulatorCycle[];
  simulatorState?: SimulatorSymbolState;
  colors: ThemePalette;
}) {
  return (
    <ScrollView contentContainerStyle={styles.cycleContent}>
      <Text style={[styles.cycleHelper, { color: colors.textSecondary }]}>
        Completed lifecycle cycles for {ticker || "—"}, projected read-only from the sealed simulator replay (sim_cycles). This is causal history from the frozen machine, not pattern retrieval.
      </Text>

      <DecisionTraceChart state={simulatorState} cycle={cycles[0] ?? null} />

      {cycles.length === 0 ? (
        <View style={[styles.cycleEmpty, { backgroundColor: colors.bgSecondary }]}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No completed cycles have been projected yet for this symbol.</Text>
        </View>
      ) : (
        cycles.map((cycle) => (
          <View key={cycle.id} style={[styles.cycleCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <View style={styles.cycleCardHeader}>
              <Text style={[styles.cycleCardTitle, { color: colors.textPrimary }]}>{cycle.book} · {cycle.entry_path ?? "unknown path"}</Text>
              <Text style={[styles.cycleCardPnl, { color: cycle.pnl_pct >= 0 ? colors.success : colors.danger }]}>{formatPct(cycle.pnl_pct)}</Text>
            </View>
            <DecisionTraceChart state={simulatorState} cycle={cycle} />
            <View style={styles.cycleCardStatsRow}>
              <Text style={[styles.cycleCardStat, { color: colors.textMuted }]}>Base {cycle.base_start ?? "—"} → {cycle.base_end ?? "—"}</Text>
              <Text style={[styles.cycleCardStat, { color: colors.textMuted }]}>Entry {cycle.entry_date ?? "—"} @ {formatKwd(cycle.entry_price)}</Text>
              <Text style={[styles.cycleCardStat, { color: colors.textMuted }]}>Peak MFE {formatPct(cycle.peak_mfe)}</Text>
              <Text style={[styles.cycleCardStat, { color: colors.textMuted }]}>Shakeouts {cycle.shakeout_dates.length}</Text>
              <Text style={[styles.cycleCardStat, { color: colors.textMuted }]}>Exit {cycle.exit_date ?? "—"} @ {formatKwd(cycle.exit_price)} ({cycle.exit_reason ?? "—"})</Text>
            </View>
          </View>
        ))
      )}

      <View style={[styles.mlBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}>
        <FontAwesome name="flask" size={14} color={colors.warning} />
        <Text style={[styles.mlBannerText, { color: colors.textPrimary }]}>Experimental ML section stays visible elsewhere on this ticker; cycle history is rule-engine replay only.</Text>
      </View>
    </ScrollView>
  );
}

function BackHeader({ title, colors }: { title: string; colors: ThemePalette }) {
  const router = useRouter();

  return (
    <View style={[styles.backHeader, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={UITokens.spacing.sm}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 28,
  },
  dnaTabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dnaTabBtn: {
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm,
  },
  dnaTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  cycleContent: {
    padding: UITokens.spacing.md,
    gap: 12,
  },
  cycleHelper: {
    fontSize: 12,
    lineHeight: 18,
  },
  cycleEmpty: {
    borderRadius: UITokens.radius.md,
    padding: 14,
  },
  cycleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  cycleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cycleCardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  cycleCardPnl: {
    fontSize: 13,
    fontWeight: "800",
  },
  cycleCardStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cycleCardStat: {
    fontSize: 11,
  },
  mlBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mlBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: UITokens.spacing.xl,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: UITokens.radius.md,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
});
