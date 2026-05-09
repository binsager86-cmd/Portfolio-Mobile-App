import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeStore } from "@/services/themeStore";

type ExitSignalLike = {
  action?: string | null;
  reason?: string | null;
  notes?: string[] | null;
  confidence?: number | null;
  confidence_score?: number | null;
  suggested_trim_pct?: number | null;
  trim_pct?: number | null;
  recommended_trim_pct?: number | null;
};

export interface PositionMonitorCardProps {
  symbol: string;
  pnlPct: number;
  exitSignal: ExitSignalLike;
  onTrim?: (trimPct: number) => void;
  onExit: () => void;
}

function normalizeAction(signal: ExitSignalLike): "EXIT" | "TRIM" | "HOLD" {
  const raw = String(signal.action ?? "").trim().toUpperCase();
  if (raw.includes("EXIT") || raw.includes("SELL")) {
    return "EXIT";
  }
  if (raw.includes("TRIM") || raw.includes("REDUCE")) {
    return "TRIM";
  }
  return "HOLD";
}

function getTrimPct(signal: ExitSignalLike): number | null {
  const candidates = [
    Number(signal.suggested_trim_pct),
    Number(signal.trim_pct),
    Number(signal.recommended_trim_pct),
  ];
  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.max(1, Math.min(100, Math.round(candidate)));
    }
  }
  return null;
}

function getConfidence(signal: ExitSignalLike): number | null {
  const value = Number(signal.confidence ?? signal.confidence_score);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value <= 1) {
    return Math.round(value * 100);
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function PositionMonitorCard({ symbol, pnlPct, exitSignal, onTrim, onExit }: PositionMonitorCardProps) {
  const { colors } = useThemeStore();

  const action = useMemo(() => normalizeAction(exitSignal), [exitSignal]);
  const trimPct = useMemo(() => getTrimPct(exitSignal), [exitSignal]);
  const confidence = useMemo(() => getConfidence(exitSignal), [exitSignal]);
  const reason = useMemo(() => {
    if (typeof exitSignal.reason === "string" && exitSignal.reason.trim()) {
      return exitSignal.reason.trim();
    }
    if (Array.isArray(exitSignal.notes) && exitSignal.notes.length > 0) {
      const firstNote = String(exitSignal.notes[0] ?? "").trim();
      return firstNote || null;
    }
    return null;
  }, [exitSignal]);

  const pnlPositive = pnlPct >= 0;
  const actionColor =
    action === "EXIT"
      ? colors.danger
      : action === "TRIM"
        ? colors.warning
        : colors.success;

  return (
    <View style={[styles.card, { borderColor: colors.borderColor, backgroundColor: colors.bgPrimary }]}> 
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.symbol, { color: colors.textPrimary }]}>{symbol}</Text>
          <Text style={[styles.pnl, { color: pnlPositive ? colors.success : colors.danger }]}>
            {pnlPositive ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </Text>
        </View>
        <View style={[styles.actionPill, { backgroundColor: `${actionColor}22`, borderColor: `${actionColor}66` }]}>
          <Text style={[styles.actionText, { color: actionColor }]}>{action}</Text>
        </View>
      </View>

      {confidence != null ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>Confidence: {confidence}%</Text>
      ) : null}

      {reason ? (
        <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={2}>
          {reason}
        </Text>
      ) : null}

      <View style={styles.buttonRow}>
        {onTrim && trimPct != null ? (
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              {
                borderColor: colors.warning,
                backgroundColor: pressed ? `${colors.warning}22` : "transparent",
              },
            ]}
            onPress={() => onTrim(trimPct)}
          >
            <Text style={[styles.btnText, { color: colors.warning }]}>Trim {trimPct}%</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            {
              borderColor: colors.danger,
              backgroundColor: pressed ? `${colors.danger}22` : "transparent",
            },
          ]}
          onPress={onExit}
        >
          <Text style={[styles.btnText, { color: colors.danger }]}>Exit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  symbol: {
    fontSize: 15,
    fontWeight: "700",
  },
  pnl: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  actionPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  meta: {
    fontSize: 12,
    marginBottom: 4,
  },
  reason: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
