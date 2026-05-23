/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye Simulator — Position Detail Page
 *
 * Shows full entry context, trade plan, P&L, and a "Close Position" button
 * for open positions.
 *
 * Route: /eagle-eye/simulator/position/[id]
 */

import { useThemeStore } from "@/services/themeStore";
import {
  useCloseSimulatorPosition,
  useSimulatorTrades,
  type SimPosition,
} from "@/hooks/useSimulator";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
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

// ── Strategy metadata ─────────────────────────────────────────────────────────

type TaggedPosition = SimPosition & { strategyName: string };

const PORTFOLIO_META: Record<number, {
  name: string;
  minConfidence: number;
  color: string;
  allowedStages: readonly string[];
}> = {
  1: { name: "Conservative", minConfidence: 65, color: "#22c55e", allowedStages: ["EARLY_BREAKOUT", "MARKUP_TRENDING"] },
  2: { name: "Moderate",     minConfidence: 60, color: "#f59e0b", allowedStages: ["STEALTH_ACCUMULATION", "EARLY_BREAKOUT", "MARKUP_TRENDING"] },
  3: { name: "Aggressive",   minConfidence: 55, color: "#ef4444", allowedStages: ["STEALTH_ACCUMULATION", "EARLY_BREAKOUT", "MARKUP_TRENDING", "CAPITULATION_EXHAUSTION"] },
};

// ── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ── Trade plan strip ─────────────────────────────────────────────────────────

function TradePlanStrip({ pos, accentColor }: { pos: SimPosition; accentColor: string }) {
  const { colors } = useThemeStore();
  const stop = pos.planned_stop_loss;
  const tp1 = pos.planned_tp1;
  const tp2 = pos.planned_tp2;
  const tp3 = pos.planned_tp3;
  const entry = pos.entry_price;

  if (!entry) return null;

  const levels = [
    { label: "STOP", price: stop, color: colors.danger },
    { label: "ENTRY", price: entry, color: accentColor },
    { label: "TP1", price: tp1, color: colors.success },
    { label: "TP2", price: tp2, color: colors.success },
    { label: "TP3", price: tp3, color: colors.success },
  ].filter((l) => l.price != null) as Array<{ label: string; price: number; color: string }>;

  levels.sort((a, b) => a.price - b.price);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Trade Plan</Text>
      {levels.map((l) => (
        <View
          key={l.label}
          style={[styles.levelRow, { borderLeftColor: l.color }]}
        >
          <Text style={[styles.levelLabel, { color: l.color }]}>{l.label}</Text>
          <Text style={[styles.levelPrice, { color: colors.textPrimary }]}>
            {l.price.toFixed(4)} KWD
            {entry && l.label !== "ENTRY" ? (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {"  "}({(((l.price - entry) / entry) * 100).toFixed(2)}%)
              </Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Close position modal ─────────────────────────────────────────────────────

function ClosePositionSection({ pos }: { pos: SimPosition }) {
  const { colors } = useThemeStore();
  const [price, setPrice] = useState(String(pos.entry_price ?? ""));
  const { mutate, isPending } = useCloseSimulatorPosition();

  const handleClose = useCallback(() => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert("Invalid price", "Please enter a valid positive price.");
      return;
    }
    Alert.alert(
      "Close Position",
      `Close ${pos.ticker} at ${priceNum.toFixed(4)} KWD?\n\nThis is a manual override and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          style: "destructive",
          onPress: () => {
            mutate(
              { positionId: pos.id, currentPrice: priceNum },
              {
                onSuccess: () => {
                  Alert.alert("Done", "Position closed.");
                  router.back();
                },
                onError: (e: Error) => {
                  Alert.alert("Error", e.message);
                },
              }
            );
          },
        },
      ]
    );
  }, [price, pos, mutate]);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
        Manual Override Close
      </Text>
      <Text style={[styles.overrideNote, { color: colors.textMuted }]}>
        Enter the current market price to close this position immediately.
      </Text>
      <View style={styles.priceRow}>
        <TextInput
          style={[
            styles.priceInput,
            {
              backgroundColor: colors.bgInput,
              color: colors.textPrimary,
              borderColor: colors.borderColor,
            },
          ]}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="Current price"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={[styles.priceUnit, { color: colors.textMuted }]}>KWD</Text>
      </View>
      <Pressable
        onPress={handleClose}
        disabled={isPending}
        style={[styles.closeBtn, { backgroundColor: colors.danger + "CC" }]}
      >
        {isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.closeBtnText}>Close Position at {price} KWD</Text>
        )}
      </Pressable>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function SimulatorPositionDetailScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const positionId = parseInt(id ?? "0", 10);

  // We query all trades and find the right one by id.
  // In a larger system we'd have a dedicated GET /simulator/positions/:id endpoint.
  // For now we search through the trades pages — position ids are small enough.
  const { data: conservativeTrades } = useSimulatorTrades("CONSERVATIVE", 1);
  const { data: moderateTrades } = useSimulatorTrades("MODERATE", 1);
  const { data: aggressiveTrades } = useSimulatorTrades("AGGRESSIVE", 1);

  const taggedTrades: TaggedPosition[] = [
    ...(conservativeTrades?.trades ?? []).map((t) => ({ ...t, strategyName: "Conservative" })),
    ...(moderateTrades?.trades ?? []).map((t) => ({ ...t, strategyName: "Moderate" })),
    ...(aggressiveTrades?.trades ?? []).map((t) => ({ ...t, strategyName: "Aggressive" })),
  ];

  const pos = taggedTrades.find((t) => t.id === positionId);

  if (!pos) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading position…
        </Text>
      </View>
    );
  }

  const isOpen = pos.status === "OPEN";
  const pnl = pos.pnl_pct ?? 0;
  const pnlKwd = pos.pnl_kwd ?? 0;
  const pnlColor = pnl >= 0 ? colors.success : colors.danger;
  const accentColor = isOpen ? colors.accentPrimary : pnlColor;

  const meta = PORTFOLIO_META[pos.portfolio_id] ?? { name: "Unknown", minConfidence: 0, color: colors.accentPrimary, allowedStages: [] };
  const crossStrategyOpen = taggedTrades.filter(
    (t) => t.ticker === pos.ticker && t.status === "OPEN" && t.id !== pos.id
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      {/* Back */}
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: colors.accentPrimary }]}>← Back</Text>
      </Pressable>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.ticker, { color: colors.textPrimary }]}>{pos.ticker}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isOpen ? colors.accentPrimary + "22" : pnlColor + "22" },
          ]}
        >
          <Text style={[styles.statusText, { color: isOpen ? colors.accentPrimary : pnlColor }]}>
            {pos.status}
          </Text>
        </View>
      </View>

      {/* P&L hero */}
      {!isOpen && (
        <View style={[styles.pnlHero, { backgroundColor: pnlColor + "18" }]}>
          <Text style={[styles.pnlPct, { color: pnlColor }]}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
          </Text>
          <Text style={[styles.pnlKwd, { color: pnlColor }]}>
            {pnlKwd >= 0 ? "+" : ""}{pnlKwd.toFixed(2)} KWD
          </Text>
          <Text style={[styles.pnlDays, { color: colors.textMuted }]}>
            {pos.days_held ?? 0} days held
          </Text>
        </View>
      )}

      {/* Entry context */}
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Entry Context</Text>
        <InfoRow label="Ticker" value={pos.ticker} />
        <InfoRow label="Entry Date" value={pos.entry_date ?? "—"} />
        <InfoRow label="Entry Price" value={pos.entry_price ? `${pos.entry_price.toFixed(4)} KWD` : "—"} />
        <InfoRow label="Stage" value={(pos.entry_stage ?? "—").replace(/_/g, " ")} />
        <InfoRow label="Rating" value={pos.entry_rating ?? "—"} valueColor={accentColor} />
        <InfoRow
          label="Confidence"
          value={pos.entry_confidence ? `${pos.entry_confidence.toFixed(1)}%` : "—"}
          valueColor={accentColor}
        />
        <InfoRow label="Position Size" value={pos.size_kwd ? `${pos.size_kwd.toFixed(0)} KWD` : "—"} />
        {pos.entry_thesis ? (
          <View style={[styles.thesisContainer, { borderTopColor: colors.borderColor }]}>
            <Text style={[styles.thesisLabel, { color: colors.textMuted }]}>Thesis</Text>
            <Text style={[styles.thesisText, { color: colors.textSecondary }]}>
              {pos.entry_thesis}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Trigger Details */}
      <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Trigger Details</Text>

        <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Strategy</Text>
          <View style={[styles.stratBadge, { backgroundColor: meta.color + "22" }]}>
            <Text style={[styles.stratBadgeText, { color: meta.color }]}>{meta.name}</Text>
          </View>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Confidence Gate</Text>
          <Text style={[styles.infoValue, { color: colors.success }]}>
            {pos.entry_confidence != null ? `${pos.entry_confidence.toFixed(1)}%` : "—"}{" "}
            {"\u2265"} {meta.minConfidence}% min
          </Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Stage Gate</Text>
          <Text style={[styles.infoValue, { color: colors.success }]}>
            {(pos.entry_stage ?? "—").replace(/_/g, " ")} (allowed)
          </Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Price Source</Text>
          <Text style={[styles.infoValue, { color: colors.textMuted }]}>Same-day close</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Also Open In</Text>
          <Text
            style={[
              styles.infoValue,
              { color: crossStrategyOpen.length > 0 ? colors.textSecondary : colors.textMuted },
            ]}
          >
            {crossStrategyOpen.length > 0
              ? crossStrategyOpen.map((t) => t.strategyName).join(", ")
              : "This strategy only"}
          </Text>
        </View>
      </View>

      {/* Trade plan */}
      <TradePlanStrip pos={pos} accentColor={accentColor} />

      {/* Exit context (if closed) */}
      {!isOpen && (
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Exit Context</Text>
          <InfoRow label="Exit Date" value={pos.exit_date ?? "—"} />
          <InfoRow label="Exit Price" value={pos.exit_price ? `${pos.exit_price.toFixed(4)} KWD` : "—"} />
          <InfoRow label="Exit Reason" value={(pos.exit_reason ?? "—").replace(/_/g, " ")} />
          <InfoRow label="Days Held" value={String(pos.days_held ?? "—")} />
          <InfoRow
            label="Best Unrealized"
            value={pos.max_unrealized_gain_pct != null ? `+${pos.max_unrealized_gain_pct.toFixed(2)}%` : "—"}
            valueColor={colors.success}
          />
          <InfoRow
            label="Worst Unrealized"
            value={pos.max_unrealized_loss_pct != null ? `${pos.max_unrealized_loss_pct.toFixed(2)}%` : "—"}
            valueColor={colors.danger}
          />
        </View>
      )}

      {/* Manual override close (open only) */}
      {isOpen && <ClosePositionSection pos={pos} />}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { paddingHorizontal: 16, gap: 14 },

  backBtn: { marginBottom: 4 },
  backText: { fontSize: 14, fontWeight: "600" },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  ticker: { fontSize: 26, fontWeight: "800", flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },

  pnlHero: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  pnlPct: { fontSize: 32, fontWeight: "800" },
  pnlKwd: { fontSize: 18, fontWeight: "600" },
  pnlDays: { fontSize: 12, marginTop: 4 },

  card: { borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },

  thesisContainer: { marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thesisLabel: { fontSize: 11, marginBottom: 4 },
  thesisText: { fontSize: 13, lineHeight: 18 },

  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    marginVertical: 3,
    gap: 12,
  },
  levelLabel: { fontSize: 12, fontWeight: "700", width: 50 },
  levelPrice: { fontSize: 14, fontWeight: "600" },

  overrideNote: { fontSize: 13, marginBottom: 12 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  priceUnit: { fontSize: 14 },
  closeBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  stratBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  stratBadgeText: { fontSize: 12, fontWeight: "700" },
});
