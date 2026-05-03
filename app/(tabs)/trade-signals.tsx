/**
 * Trade Signals — multi-tab screen for actionable trading insights.
 *
 * Sub-tabs:
 *   1. F. Signals          — fundamental-driven buy/sell signals (placeholder)
 *   2. Technical Analysis  — TA indicators / chart patterns        (placeholder)
 *
 * More tabs will be added later.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemeStore } from "@/services/themeStore";
import type { ThemePalette } from "@/constants/theme";
import { FSignalsPanel } from "@/src/features/trade-signals/components/FSignalsPanel";
import { TechnicalAnalysisPanel } from "@/src/features/trade-signals/components/TechnicalAnalysisPanel";
import { WhaleRadarPanel } from "@/src/features/trade-signals/components/WhaleRadarPanel";

type SubTabKey = "fsignals" | "technical" | "whaleRadar";

interface SubTab {
  key: SubTabKey;
  labelKey: string;
  fallback: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
}

const SUB_TABS: readonly SubTab[] = [
  { key: "fsignals", labelKey: "tradeSignals.fSignals", fallback: "F. Signals", icon: "flask" },
  { key: "technical", labelKey: "tradeSignals.technical", fallback: "Technical Analysis", icon: "line-chart" },
  { key: "whaleRadar", labelKey: "tradeSignals.whaleRadar", fallback: "Whale Radar", icon: "bullseye" },
] as const;

export default function TradeSignalsScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [tab, setTab] = useState<SubTabKey>("fsignals");

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {t("tradeSignals.title", "Trade Signals")}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {t("tradeSignals.subtitle", "Actionable buy / sell insights")}
        </Text>
      </View>

      {/* ── Sub-tab bar ────────────────────────────────────── */}
      <View
        style={[
          styles.tabContainer,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8 }}
        >
          {SUB_TABS.map((s) => {
            const active = tab === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setTab(s.key)}
                style={[
                  styles.tabBtn,
                  active && { backgroundColor: colors.accentPrimary + "12" },
                ]}
              >
                <FontAwesome
                  name={s.icon}
                  size={12}
                  color={active ? colors.accentPrimary : colors.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={{
                    color: active ? colors.accentPrimary : colors.textSecondary,
                    fontWeight: active ? "700" : "500",
                    fontSize: 12,
                  }}
                >
                  {t(s.labelKey, s.fallback)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ─────────────────────────────────────────── */}
      {tab === "fsignals" && (
        <View style={{ flex: 1 }}>
          <FSignalsPanel colors={colors} />
        </View>
      )}
      {tab === "technical" && (
        <View style={{ flex: 1 }}>
          <TechnicalAnalysisPanel colors={colors} />
        </View>
      )}
      {tab === "whaleRadar" && (
        <View style={{ flex: 1 }}>
          <WhaleRadarPanel colors={colors} />
        </View>
      )}
    </View>
  );
}

// ── Placeholder panel ─────────────────────────────────────────────────

interface PlaceholderPanelProps {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  title: string;
  description: string;
  colors: ThemePalette;
}

function PlaceholderPanel({ icon, title, description, colors }: PlaceholderPanelProps) {
  return (
    <View
      style={[
        styles.placeholder,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      <View
        style={[
          styles.placeholderIcon,
          { backgroundColor: colors.accentPrimary + "15" },
        ]}
      >
        <FontAwesome name={icon} size={28} color={colors.accentPrimary} />
      </View>
      <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.placeholderDesc, { color: colors.textMuted }]}>{description}</Text>
      <View style={[styles.comingSoonPill, { backgroundColor: colors.accentPrimary + "15" }]}>
        <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>
          COMING SOON
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  tabContainer: { borderBottomWidth: 1 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 8,
    marginVertical: 4,
  },
  content: { padding: 16, paddingBottom: 80 },
  placeholder: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTitle: { fontSize: 17, fontWeight: "700" },
  placeholderDesc: { fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 320 },
  comingSoonPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 4,
  },
});
