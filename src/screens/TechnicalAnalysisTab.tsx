/**
 * TechnicalAnalysisTab — Full Kuwait signal engine view for a single stock.
 *
 * Uses React Query for async data fetching (NOT Redux).
 * Displays TechnicalAnalysisPanel with full signal output plus an
 * OrderBookHeatmap for Premier-segment stocks.
 *
 * Props:
 *   stock   — { symbol, market_segment } of the stock to analyse.
 *   onTrade — optional callback when the user taps the trade CTA.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { SignalOutput } from "@/src/features/trade-signals/components/TechnicalAnalysisPanel";
import { OrderBookHeatmap, type OrderBookSnapshot } from "@/src/features/trade-signals/components/OrderBookHeatmap";
import {
  getKuwaitSignal,
  type KuwaitSignal,
} from "@/services/api/analytics/tradeSignals";
import { useThemeStore } from "@/services/themeStore";
import type { ThemePalette } from "@/constants/theme";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  stock: {
    symbol: string;
    market_segment: string;
  };
  onTrade?: (signal: KuwaitSignal) => void;
}

// ── Helper: build a mock OrderBookSnapshot from the OB metrics ─────────────────
// The backend currently only returns aggregate imbalance + wall; individual
// price levels are not yet in the API.  We synthesise dummy levels so the
// heatmap renders gracefully and can be replaced once the backend exposes them.

function buildOrderBookSnapshot(signal: KuwaitSignal): OrderBookSnapshot | null {
  const ob = signal.confluence_details.orderbook_metrics;
  if (!ob?.available || ob.imbalance_ratio == null) return null;

  const bidPressure = Math.max(0, 0.5 + ob.imbalance_ratio / 2);
  const askPressure = 1 - bidPressure;

  // Synthetic levels centred around entry zone mid
  const basePx =
    signal.execution_details.entry_zone_fils[0] != null
      ? (signal.execution_details.entry_zone_fils[0]! + signal.execution_details.entry_zone_fils[1]!) / 2
      : 100;

  const makeLevels = (
    side: "bid" | "ask",
    count: number,
  ) =>
    Array.from({ length: count }, (_, i) => {
      const offset = side === "bid" ? -(i + 1) * 0.5 : (i + 1) * 0.5;
      const vol = Math.round(100_000 * (1 - i * 0.15) * (side === "bid" ? bidPressure : askPressure));
      return { price: basePx + offset, volume: vol, normalizedVolume: 100 - i * 15 };
    });

  return {
    imbalance_ratio: ob.imbalance_ratio,
    bid_pressure: bidPressure,
    ask_pressure: askPressure,
    bids: makeLevels("bid", 5),
    asks: makeLevels("ask", 5),
    liquidity_wall: ob.liquidity_wall ?? undefined,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TechnicalAnalysisTab({ stock, onTrade }: Props) {
  const { theme } = useThemeStore();
  const colors = theme as ThemePalette;

  const [refreshing, setRefreshing] = useState(false);

  const queryKey = ["kuwaitSignal", stock.symbol] as const;

  const {
    data: signal,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () =>
      getKuwaitSignal({ symbol: stock.symbol, segment: stock.market_segment }),
    staleTime: 5 * 60 * 1000,  // treat data as fresh for 5 min
    retry: 2,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Analysing {stock.symbol}…
        </Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError || !signal) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.bgPrimary }]}>
        <FontAwesome name="exclamation-circle" size={40} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
          Signal Unavailable
        </Text>
        <Text style={[styles.errorBody, { color: colors.textMuted }]}>
          {(error as Error)?.message ?? "Could not fetch signal data."}
        </Text>
        <Pressable
          style={[styles.retryButton, { backgroundColor: colors.accentPrimary }]}
          onPress={() => refetch()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // ── Order book snapshot (Premier only) ────────────────────────────────────
  const isPremier = stock.market_segment.toLowerCase() === "premier";
  const obSnapshot = isPremier ? buildOrderBookSnapshot(signal) : null;

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing || isFetching}
          onRefresh={handleRefresh}
          tintColor={colors.accentPrimary}
          colors={[colors.accentPrimary]}
        />
      }
    >
      {/* Signal panel */}
      <SignalOutput signal={signal} colors={colors} />

      {/* Order book heatmap — Premier market only */}
      {obSnapshot && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Market Depth
          </Text>
          <OrderBookHeatmap data={obSnapshot} />
        </View>
      )}

      {/* Trade CTA */}
      {onTrade &&
        (signal.signal === "BUY" ||
          signal.signal === "STRONG_BUY" ||
          signal.signal === "SELL") && (
          <Pressable
            style={[styles.tradeButton, { backgroundColor: signal.signal.includes("BUY") ? "#22c55e" : "#ef4444" }]}
            onPress={() => onTrade(signal)}
          >
            <Text style={styles.tradeButtonText}>
              {signal.signal.includes("BUY") ? "▶ Place Buy Order" : "▶ Place Sell Order"}
            </Text>
          </Pressable>
        )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  errorBody: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  tradeButton: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  tradeButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
