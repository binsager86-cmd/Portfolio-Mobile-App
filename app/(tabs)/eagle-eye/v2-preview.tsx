/* eslint-disable custom-styles/no-hardcoded-styles */

import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { UITokens } from "@/constants/uiTokens";
import { useResponsive } from "@/hooks/useResponsive";
import api from "@/services/api/client";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PreviewSummary = {
  validation_status: "UNVALIDATED_PRE_R15";
  authority: string;
  modules: Record<string, Record<string, unknown>>;
  findings_carried_to_r15: string[];
};

type PreviewRows = {
  validation_status: "UNVALIDATED_PRE_R15";
  authority: string;
  rows: Array<Record<string, unknown>>;
};

function valueText(value: unknown): string {
  if (value == null) return "PENDING";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function EagleEyeV2PreviewScreen() {
  const { colors } = useThemeStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSidebar } = useResponsive();

  const summaryQuery = useQuery({
    queryKey: ["eagle-eye", "v2-preview", "summary"],
    queryFn: async () => {
      const { data } = await api.get<PreviewSummary>("/api/v1/eagle-eye/v2-preview/summary");
      return data;
    },
    staleTime: 10 * 60_000,
  });

  const predictionsQuery = useQuery({
    queryKey: ["eagle-eye", "v2-preview", "predictions"],
    queryFn: async () => {
      const { data } = await api.get<PreviewRows>("/api/v1/eagle-eye/v2-preview/module-g/predictions");
      return data;
    },
    staleTime: 10 * 60_000,
  });

  const gradesQuery = useQuery({
    queryKey: ["eagle-eye", "v2-preview", "grades"],
    queryFn: async () => {
      const { data } = await api.get<PreviewRows>("/api/v1/eagle-eye/v2-preview/module-g/grades");
      return data;
    },
    staleTime: 10 * 60_000,
  });

  const loading = summaryQuery.isLoading || predictionsQuery.isLoading || gradesQuery.isLoading;
  const error = summaryQuery.error || predictionsQuery.error || gradesQuery.error;
  const summary = summaryQuery.data;
  const predictionRows = predictionsQuery.data?.rows ?? [];
  const gradeRows = gradesQuery.data?.rows ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: showSidebar ? insets.top : 0 }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>V2 Preview</Text>
        <View style={{ width: 28 }} />
      </View>

      <EagleEyeTopTabs />

      <View style={[styles.banner, { backgroundColor: "#7a1f1f", borderColor: "#f2a65a" }]}>
        <FontAwesome name="exclamation-triangle" size={14} color="#fff7ed" />
        <Text style={styles.bannerText}>UNVALIDATED — PRE-R15</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + UITokens.spacing.xl }]}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accentPrimary} />
            <Text style={[styles.muted, { color: colors.textSecondary }]}>Loading sealed preview artifacts</Text>
          </View>
        ) : error ? (
          <View style={[styles.panel, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}> 
            <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Artifact Load Failed</Text>
            <Text style={[styles.muted, { color: colors.textSecondary }]}>Sealed R14 preview artifacts are unavailable.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.panel, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}> 
              <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Closure Snapshot</Text>
              {summary ? (
                <View style={styles.metricsGrid}>
                  <Metric label="Module E" value={valueText(summary.modules?.e?.status)} />
                  <Metric label="Module F" value={valueText(summary.modules?.f?.status)} />
                  <Metric label="Module G" value={valueText(summary.modules?.g?.status)} />
                  <Metric label="Predictions" value={valueText(summary.modules?.g?.prediction_count)} />
                  <Metric label="Grades" value={valueText(summary.modules?.g?.grade_count)} />
                  <Metric label="Findings" value={summary.findings_carried_to_r15.join(", ")} />
                </View>
              ) : null}
            </View>

            <EvidenceTable
              title="Forward Predictions"
              rows={predictionRows.slice(0, 16)}
              emptyLabel="No prediction rows"
              columns={["symbol", "prediction_date", "event_type", "execution_state", "entry_tier"]}
            />

            <EvidenceTable
              title="Prediction Grades"
              rows={gradeRows.slice(0, 16)}
              emptyLabel="No grade rows"
              columns={["symbol", "prediction_date", "materialization_verdict", "grade_status", "mfe_120"]}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.metric, { borderColor: colors.borderColor }]}> 
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function EvidenceTable({
  title,
  rows,
  columns,
  emptyLabel,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  emptyLabel: string;
}) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.panel, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}> 
      <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>{emptyLabel}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[styles.tableRow, { borderBottomColor: colors.borderColor }]}> 
              {columns.map((column) => (
                <Text key={column} style={[styles.tableHeader, { color: colors.textSecondary }]}>
                  {column}
                </Text>
              ))}
            </View>
            {rows.map((row, index) => (
              <View key={`${row.prediction_id ?? index}`} style={[styles.tableRow, { borderBottomColor: colors.borderColor }]}> 
                {columns.map((column) => (
                  <Text key={column} style={[styles.tableCell, { color: colors.textPrimary }]} numberOfLines={1}>
                    {valueText(row[column])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  banner: {
    minHeight: 38,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: UITokens.spacing.sm,
    paddingHorizontal: UITokens.spacing.md,
  },
  bannerText: {
    color: "#fff7ed",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  scroll: {
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.md,
  },
  centerState: {
    paddingVertical: UITokens.spacing.xl,
    alignItems: "center",
    gap: UITokens.spacing.sm,
  },
  panel: {
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.md,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: UITokens.spacing.sm,
  },
  metric: {
    minWidth: 150,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: UITokens.radius.sm,
    padding: UITokens.spacing.sm,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "800",
  },
  tableRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeader: {
    width: 170,
    paddingVertical: 8,
    paddingRight: 12,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  tableCell: {
    width: 170,
    paddingVertical: 8,
    paddingRight: 12,
    fontSize: 12,
    fontWeight: "600",
  },
});