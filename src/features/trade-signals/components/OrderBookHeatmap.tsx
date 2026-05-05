/**
 * OrderBookHeatmap — Kuwait Market Depth visualisation.
 *
 * Displays bid/ask imbalance gauge, liquidity wall alert, and the
 * top-5 price levels on each side as volume-scaled bars.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { KuwaitOrderBookMetrics } from "@/services/api/analytics/tradeSignals";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  volume: number;
  /** Normalised to 0-100 for bar width */
  normalizedVolume: number;
}

export interface OrderBookSnapshot {
  imbalance_ratio: number;
  bid_pressure: number;
  ask_pressure: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  liquidity_wall?: KuwaitOrderBookMetrics["liquidity_wall"];
}

interface Props {
  data: OrderBookSnapshot;
  onLiquidityWallPress?: (price: number, side: "bid" | "ask") => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFils(price: number): string {
  return price.toFixed(2);
}

function barColor(ratio: number): string {
  if (ratio > 0.3)  return "#22c55e";
  if (ratio > 0.1)  return "#86efac";
  if (ratio < -0.3) return "#ef4444";
  if (ratio < -0.1) return "#fca5a5";
  return "#e5e7eb";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderBookHeatmap({ data, onLiquidityWallPress }: Props) {
  const ratio = data.imbalance_ratio;
  const absRatio = Math.abs(ratio);
  const isLong = ratio >= 0;
  const color = barColor(ratio);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Book Imbalance</Text>

      {/* ── Imbalance gauge ─────────────────────────────────── */}
      <View style={styles.gaugeTrack}>
        <View
          style={[
            styles.gaugeFill,
            {
              width: `${absRatio * 100}%` as any,
              backgroundColor: color,
              alignSelf: isLong ? "flex-start" : "flex-end",
            },
          ]}
        />
      </View>
      <Text style={[styles.gaugeLabel, { color }]}>
        {isLong ? "▶ Bid" : "◀ Ask"} pressure: {absRatio.toFixed(2)}
      </Text>

      {/* ── Liquidity wall alert ─────────────────────────────── */}
      {data.liquidity_wall && (
        <Pressable
          style={styles.wallAlert}
          onPress={() =>
            onLiquidityWallPress?.(
              data.liquidity_wall!.price,
              data.liquidity_wall!.side,
            )
          }
        >
          <Text style={styles.wallText}>
            🧱{" "}
            {data.liquidity_wall.strength.toUpperCase()}{" "}
            {data.liquidity_wall.side.toUpperCase()} WALL @{" "}
            {formatFils(data.liquidity_wall.price)} fils
            {"  ·  "}vol {data.liquidity_wall.volume.toLocaleString()}
          </Text>
        </Pressable>
      )}

      {/* ── Top-5 bid/ask level bars ─────────────────────────── */}
      <View style={styles.levelsContainer}>
        {/* Bids — left side */}
        <View style={styles.side}>
          <Text style={styles.sideHeader}>Bids</Text>
          {data.bids.slice(0, 5).map((bid, i) => (
            <View key={`bid-${i}`} style={styles.levelRow}>
              <Text style={[styles.price, { color: "#22c55e" }]}>
                {formatFils(bid.price)}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${bid.normalizedVolume}%` as any,
                      backgroundColor: "#22c55e40",
                      alignSelf: "flex-start",
                    },
                  ]}
                />
              </View>
              <Text style={styles.volume}>{bid.volume.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        <View style={styles.separator} />

        {/* Asks — right side */}
        <View style={styles.side}>
          <Text style={[styles.sideHeader, { textAlign: "right" }]}>Asks</Text>
          {data.asks.slice(0, 5).map((ask, i) => (
            <View key={`ask-${i}`} style={[styles.levelRow, { flexDirection: "row-reverse" }]}>
              <Text style={[styles.price, { color: "#ef4444", textAlign: "right" }]}>
                {formatFils(ask.price)}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${ask.normalizedVolume}%` as any,
                      backgroundColor: "#ef444440",
                      alignSelf: "flex-end",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.volume, { textAlign: "left" }]}>
                {ask.volume.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Total summary ────────────────────────────────────── */}
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: "#22c55e" }]}>
          Total Bid: {(data.bid_pressure * 100).toFixed(1)}%
        </Text>
        <Text style={[styles.totalLabel, { color: "#ef4444" }]}>
          Total Ask: {(data.ask_pressure * 100).toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 10,
  },
  gaugeTrack: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    marginBottom: 4,
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 4,
  },
  gaugeLabel: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 10,
  },
  wallAlert: {
    backgroundColor: "#fef3c7",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  wallText: {
    fontSize: 12,
    color: "#92400e",
    fontWeight: "500",
  },
  levelsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  side: {
    flex: 1,
  },
  sideHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 4,
  },
  separator: {
    width: 1,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 4,
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 22,
    marginBottom: 2,
    gap: 4,
  },
  price: {
    width: 48,
    fontSize: 11,
    fontWeight: "600",
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  volume: {
    width: 44,
    fontSize: 10,
    color: "#9ca3af",
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});
