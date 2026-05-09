import { ExitSignal } from "@/services/api/analytics/tradeSignals";
import { confirmAlert } from "../../../utils/crossPlatformAlert";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  symbol: string;
  pnlPct: number;
  exitSignal: ExitSignal;
  onTrim: (pct: number) => void;
  onExit: () => void;
}

const URGENCY_CONFIG = {
  LOW: { bg: "#1e293b", border: "#334155", text: "#94a3b8", icon: "time-outline" },
  MEDIUM: { bg: "#fef3c720", border: "#f59e0b", text: "#b45309", icon: "warning-outline" },
  HIGH: { bg: "#fee2e220", border: "#f97316", text: "#c2410c", icon: "alert-circle-outline" },
  CRITICAL: { bg: "#fef2f2", border: "#ef4444", text: "#dc2626", icon: "shield-outline" },
} as const;

const ACTION_CONFIG = {
  HOLD: { label: "HOLD", color: "#22c55e" },
  TRIM: { label: "TRIM", color: "#f59e0b" },
  EXIT: { label: "EXIT", color: "#ef4444" },
} as const;

export const PositionMonitorCard: React.FC<Props> = ({
  symbol,
  pnlPct,
  exitSignal,
  onTrim,
  onExit,
}) => {
  const urgency = URGENCY_CONFIG[exitSignal.urgency];
  const action = ACTION_CONFIG[exitSignal.action];
  const isCritical = exitSignal.urgency === "CRITICAL";
  const handleExit = () => {
    confirmAlert(
      "Exit Position",
      `Are you sure you want to exit all ${symbol} shares? This cannot be undone.`,
      onExit,
    );
  };

  return (
    <View style={[styles.card, { borderColor: urgency.border }]}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{symbol}</Text>
        <View style={[styles.actionBadge, { backgroundColor: action.color + "20" }]}>
          <Text style={[styles.actionText, { color: action.color }]}>{action.label}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>P&L</Text>
          <Text style={[styles.metricValue, { color: pnlPct >= 0 ? "#22c55e" : "#ef4444" }]}>
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(1)}%
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Dist to Stop</Text>
          <Text style={styles.metricValue}>{exitSignal.distance_to_stop_pct.toFixed(1)}%</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Exhaustion</Text>
          <Text
            style={[
              styles.metricValue,
              { color: exitSignal.momentum_exhaustion_score > 70 ? "#f97316" : "#94a3b8" },
            ]}
          >
            {exitSignal.momentum_exhaustion_score}/100
          </Text>
        </View>
      </View>

      <View style={[styles.reasonsBox, { backgroundColor: urgency.bg }]}>
        <Ionicons name={urgency.icon} size={16} color={urgency.text} />
        <Text style={[styles.reasonText, { color: urgency.text }]}>
          {exitSignal.reasons[0] || "Monitoring position"}
        </Text>
      </View>

      {exitSignal.distribution_detected && (
        <View style={styles.warningTag}>
          <Ionicons name="trending-down" size={12} color="#dc2626" />
          <Text style={styles.warningText}>Distribution Detected</Text>
        </View>
      )}
      {exitSignal.near_circuit && (
        <View style={styles.warningTag}>
          <Ionicons name="lock-closed" size={12} color="#dc2626" />
          <Text style={styles.warningText}>Near Circuit Limit</Text>
        </View>
      )}

      <View style={styles.actionsRow}>
        {exitSignal.action === "TRIM" && (
          <TouchableOpacity style={styles.trimButton} onPress={() => onTrim(exitSignal.suggested_trim_pct)}>
            <Text style={styles.trimText}>Trim {exitSignal.suggested_trim_pct}%</Text>
          </TouchableOpacity>
        )}
        {(exitSignal.action === "EXIT" || isCritical) && (
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Text style={styles.exitText}>Exit All</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  symbol: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metric: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 10,
    marginBottom: 2,
  },
  metricValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  reasonsBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  warningTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 4,
    padding: 4,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  warningText: {
    color: "#dc2626",
    fontSize: 10,
    marginLeft: 4,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
    gap: 8,
  },
  trimButton: {
    backgroundColor: "#f59e0b20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  trimText: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: "600",
  },
  exitButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  exitText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
