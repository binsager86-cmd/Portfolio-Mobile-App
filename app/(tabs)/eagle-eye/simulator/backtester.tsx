/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye Strategy Backtester
 *
 * Deterministic point-in-time backtest using historical ratings.
 *
 * IMPORTANT: If ratings_history table is empty, status shows
 * HISTORICAL_SIGNAL_DATA_UNAVAILABLE — this is not a bug,
 * it means historical point-in-time signals haven't been snapshotted yet.
 *
 * Route: /(tabs)/eagle-eye/simulator/backtester
 */

import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import { useThemeStore } from "@/services/themeStore";
import {
  useRunBacktest,
  useBacktestResult,
  useBacktestList,
  type BacktestSummary,
} from "@/hooks/useBacktest";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtKWD(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-KW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(val: string | number | null | undefined): string {
  return fmt(val) + "%";
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.summaryValue, { color: color ?? colors.textPrimary }]}>
        {value}
      </Text>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BacktesterScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();

  // Form state
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2026-07-13");
  const [initialCash, setInitialCash] = useState("100000");
  const [maxPositions, setMaxPositions] = useState("10");
  const [commissionPct, setCommissionPct] = useState("0.001");
  const [slippagePct, setSlippagePct] = useState("0.001");

  // Active run state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BacktestSummary | null>(null);

  const runBacktest = useRunBacktest();
  const resultQuery = useBacktestResult(activeRunId);
  const _listQuery = useBacktestList(5); // prefetch recent runs

  const handleRun = useCallback(() => {
    const body = {
      start_date: startDate,
      end_date: endDate,
      initial_cash: parseFloat(initialCash) || 100000,
      max_positions: parseInt(maxPositions) || 10,
      commission_pct: parseFloat(commissionPct) || 0.001,
      slippage_pct: parseFloat(slippagePct) || 0.001,
      execution_rule: "next_open" as const,
    };

    runBacktest.mutate(body, {
      onSuccess: (data) => {
        setLastResult(data);
        setActiveRunId(data.run_id);
        if (data.status === "FAILED") {
          Alert.alert(
            "Simulation Failed",
            data.error_message ?? "Unknown error"
          );
        }
      },
      onError: (err) => {
        Alert.alert("Error", err.message);
      },
    });
  }, [startDate, endDate, initialCash, maxPositions, commissionPct, slippagePct, runBacktest]);

  const handleReset = useCallback(() => {
    setActiveRunId(null);
    setLastResult(null);
  }, []);

  const result = resultQuery.data;
  const isRunning = runBacktest.isPending;

  // Determine signal data status display
  const signalStatus = lastResult?.signal_data_status ?? result?.signal_data_status;
  const isHistoricalReplay = signalStatus === "STORED_POINT_IN_TIME_REPLAY";
  const isForwardPaper   = signalStatus === "FORWARD_PAPER_SIMULATION";
  const isDataUnavailable = signalStatus === "HISTORICAL_SIGNAL_DATA_UNAVAILABLE";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <EagleEyeTopTabs />

      {/* Page title */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Strategy Backtester
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Deterministic point-in-time Eagle Eye backtest
        </Text>
      </View>

      {/* ── Configuration form ─────────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Configuration
        </Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Start Date</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>End Date</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Initial Cash (KWD)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={initialCash}
              onChangeText={setInitialCash}
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Positions</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={maxPositions}
              onChangeText={setMaxPositions}
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Commission</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={commissionPct}
              onChangeText={setCommissionPct}
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Slippage</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.borderColor, color: colors.textPrimary, backgroundColor: colors.bgInput }]}
              value={slippagePct}
              onChangeText={setSlippagePct}
              keyboardType="numeric"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Run button */}
        <View style={styles.btnRow}>
          <Pressable
            onPress={handleRun}
            disabled={isRunning}
            style={[styles.runBtn, { opacity: isRunning ? 0.6 : 1 }]}
          >
            {isRunning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.runBtnText}>▶  Run Backtest</Text>
            )}
          </Pressable>
          <Pressable
            onPress={handleReset}
            disabled={isRunning}
            style={[styles.resetBtn, { borderColor: colors.borderColor }]}
          >
            <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>
              Reset
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Signal Data Status Warning ──────────────────────────────────────── */}
      {signalStatus && (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: isHistoricalReplay
                ? "#064e3b"
                : isDataUnavailable
                ? "#7c2d12"
                : "#1e3a5f",
            },
          ]}
        >
          <Text style={styles.statusIcon}>
            {isHistoricalReplay ? "✓" : isDataUnavailable ? "⚠" : "ℹ"}
          </Text>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>
              {isHistoricalReplay
                ? "Stored Point-in-Time Replay"
                : isForwardPaper
                ? "Forward Paper Simulation"
                : isDataUnavailable
                ? "Historical Signal Data Unavailable"
                : signalStatus ?? "Unknown Status"}
            </Text>
            <Text style={styles.statusDesc}>
              {isHistoricalReplay
                ? "Using immutable point-in-time ratings from ratings_history table. Results are valid historical evidence."
                : isForwardPaper
                ? "Using signals stored prospectively from activation date. Returns shown are forward paper performance."
                : isDataUnavailable
                ? "Historical point-in-time Eagle Eye signals are unavailable. Historical performance cannot currently be calculated. Forward paper tracking can begin from the activation date."
                : "Unknown signal source status."}
            </Text>
          </View>
        </View>
      )}

      {/* ── Data-unavailability notice (no metrics shown) ─────────────────── */}
      {isDataUnavailable && (
        <View style={[styles.unavailableBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.unavailableTitle, { color: colors.textPrimary }]}>
            No Historical Performance Available
          </Text>
          <Text style={[styles.unavailableBody, { color: colors.textSecondary }]}>
            Historical point-in-time Eagle Eye signals are unavailable.{"\n"}
            Historical performance cannot currently be calculated.{"\n\n"}
            Forward paper tracking can begin from the activation date.
          </Text>
        </View>
      )}

      {/* ── Disclaimer ──────────────────────────────────────────────────────── */}
      <View style={[styles.disclaimer, { borderColor: colors.borderColor }]}>
        <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
          Historical simulation only — not a guarantee of future performance.
        </Text>
      </View>

      {/* ── Results (only shown for STORED_POINT_IN_TIME_REPLAY) ────────────── */}
      {(lastResult || result) && !isDataUnavailable && (() => {
        const r = result?.summary ? result.summary : lastResult;
        return (
          <>
            <Text style={[styles.sectionTitle2, { color: colors.textPrimary }]}>
              Results
              {isForwardPaper && (
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {" "}(forward paper — not historical)
                </Text>
              )}
            </Text>

            {/* Summary cards — return metrics only shown for historical replay */}
            <View style={styles.cardsGrid}>
              {isHistoricalReplay && (
                <SummaryCard
                  label="Total Return"
                  value={fmtPct(r?.total_return_pct ?? lastResult?.total_return_pct)}
                  color={
                  parseFloat(String(r?.total_return_pct ?? lastResult?.total_return_pct ?? "0")) >= 0
                    ? "#22c55e"
                    : "#ef4444"
                }
              />
              )}
              <SummaryCard
                label="Ending Equity"
                value={fmtKWD(r?.ending_equity ?? lastResult?.ending_equity) + " KWD"}
              />
              {isHistoricalReplay && (
              <SummaryCard
                label="Max Drawdown"
                value={fmtPct(r?.max_drawdown_pct ?? lastResult?.max_drawdown_pct)}
                color="#ef4444"
              />
              )}
              <SummaryCard
                label="Trades"
                value={String(r?.trades_count ?? lastResult?.trades_count ?? "—")}
              />
              {isHistoricalReplay && (
              <SummaryCard
                label="Win Rate"
                value={fmtPct(r?.win_rate_pct ?? lastResult?.win_rate_pct)}
              />
              )}
              {isHistoricalReplay && (
              <SummaryCard
                label="Profit Factor"
                value={fmt(r?.profit_factor ?? lastResult?.profit_factor)}
              />
              )}
            </View>

            {/* Reconciliation flags */}
            <View style={[styles.reconRow, { backgroundColor: colors.bgCard }]}>
              <Text style={[styles.reconItem, { color: r?.cash_reconciliation_ok ?? lastResult?.cash_reconciliation_ok ? "#22c55e" : "#ef4444" }]}>
                {r?.cash_reconciliation_ok ?? lastResult?.cash_reconciliation_ok ? "✓" : "✗"} Cash Reconciliation
              </Text>
              <Text style={[styles.reconItem, { color: r?.equity_reconciliation_ok ?? lastResult?.equity_reconciliation_ok ? "#22c55e" : "#ef4444" }]}>
                {r?.equity_reconciliation_ok ?? lastResult?.equity_reconciliation_ok ? "✓" : "✗"} Equity Reconciliation
              </Text>
            </View>
          </>
        );
      })()}

      {/* ── Trade Ledger ─────────────────────────────────────────────────────── */}
      {result?.trades && result.trades.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Trades ({result.trades.length})
          </Text>
          {result.trades.map((trade, idx) => (
            <View key={idx} style={[styles.tradeRow, { borderBottomColor: colors.borderColor }]}>
              <Text style={[styles.tradeSymbol, { color: colors.textPrimary }]}>
                {trade.symbol}
              </Text>
              <Text style={[styles.tradeDate, { color: colors.textSecondary }]}>
                {trade.entry_date} → {trade.exit_date ?? "Open"}
              </Text>
              <Text
                style={[
                  styles.tradePnl,
                  {
                    color:
                      parseFloat(trade.realized_pnl_pct) >= 0
                        ? "#22c55e"
                        : "#ef4444",
                  },
                ]}
              >
                {parseFloat(trade.realized_pnl_pct).toFixed(2)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Validation Warnings ──────────────────────────────────────────────── */}
      {lastResult?.validation_warnings && lastResult.validation_warnings.length > 0 && (
        <View style={[styles.warnBox, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: "#f59e0b" }]}>
            Warnings
          </Text>
          {lastResult.validation_warnings.map((w, i) => (
            <Text key={i} style={[styles.warnText, { color: colors.textSecondary }]}>
              • {w}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  section: { margin: 12, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 12 },
  sectionTitle2: { fontSize: 15, fontWeight: "600", marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  halfField: { flex: 1 },
  label: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  runBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  runBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  resetBtn: {
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  resetBtnText: { fontSize: 14 },
  statusBanner: {
    margin: 12,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
  statusIcon: { fontSize: 16, color: "#fff", marginTop: 1 },
  statusText: { flex: 1 },
  statusTitle: { color: "#fff", fontWeight: "600", fontSize: 13 },
  statusDesc: { color: "#e5e7eb", fontSize: 12, marginTop: 2 },
  unavailableBox: {
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
  },
  unavailableTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  unavailableBody: { fontSize: 13, lineHeight: 20 },
  disclaimer: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  disclaimerText: { fontSize: 11, fontStyle: "italic", textAlign: "center" },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    gap: 8,
  },
  summaryCard: {
    width: "31%",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  summaryValue: { fontSize: 16, fontWeight: "700" },
  summaryLabel: { fontSize: 11, marginTop: 2, textAlign: "center" },
  reconRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    margin: 12,
    borderRadius: 10,
    padding: 12,
  },
  reconItem: { fontWeight: "600", fontSize: 13 },
  tradeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tradeSymbol: { fontWeight: "600", fontSize: 13, minWidth: 80 },
  tradeDate: { fontSize: 12, flex: 1, textAlign: "center" },
  tradePnl: { fontWeight: "600", fontSize: 13, minWidth: 60, textAlign: "right" },
  warnBox: { margin: 12, borderRadius: 10, padding: 12 },
  warnText: { fontSize: 12, marginBottom: 4 },
});
