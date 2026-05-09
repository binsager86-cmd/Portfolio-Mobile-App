import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";

interface TechnicalBatchOverviewProps {
  colors: ThemePalette;
}

const PREVIEW_ROWS = [
  { symbol: "KFH", company: "Kuwait Finance House", score: 84, signal: "BUY" },
  { symbol: "NBK", company: "National Bank of Kuwait", score: 78, signal: "BUY" },
  { symbol: "ZAIN", company: "Zain Kuwait", score: 64, signal: "NEUTRAL" },
  { symbol: "AGLTY", company: "Agility", score: 41, signal: "SELL" },
];

function signalColor(signal: string): string {
  if (signal === "BUY") return "#16a34a";
  if (signal === "SELL") return "#dc2626";
  return "#f59e0b";
}

export function TechnicalBatchOverview({ colors }: TechnicalBatchOverviewProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}> 
      <View style={[styles.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.accentPrimary}18` }]}>
            <FontAwesome name="table" size={16} color={colors.accentPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Technical Daily Scores</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Top symbols ranked by technical confluence score.</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.refreshBtn,
            {
              backgroundColor: `${colors.accentPrimary}12`,
              borderColor: `${colors.accentPrimary}40`,
            },
          ]}
        >
          <FontAwesome name="refresh" size={12} color={colors.accentPrimary} />
          <Text style={[styles.refreshLabel, { color: colors.accentPrimary }]}>Refresh Batch</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.tableWrap}>
        {PREVIEW_ROWS.map((row, index) => (
          <View
            key={`${row.symbol}-${index}`}
            style={[
              styles.row,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderColor,
              },
            ]}
          >
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.symbol, { color: colors.textPrimary }]}>{row.symbol}</Text>
              <Text style={[styles.company, { color: colors.textMuted }]}>{row.company}</Text>
            </View>
            <View style={styles.scoreCol}>
              <Text style={[styles.score, { color: colors.textPrimary }]}>{row.score}</Text>
              <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Score</Text>
            </View>
            <View style={[styles.signalPill, { backgroundColor: `${signalColor(row.signal)}22` }]}>
              <Text style={[styles.signalText, { color: signalColor(row.signal) }]}>{row.signal}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  refreshLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  tableWrap: {
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  symbol: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  company: {
    fontSize: 11,
  },
  scoreCol: {
    alignItems: "flex-end",
    minWidth: 42,
  },
  score: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
  },
  scoreLabel: {
    fontSize: 10,
  },
  signalPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 62,
    alignItems: "center",
  },
  signalText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
