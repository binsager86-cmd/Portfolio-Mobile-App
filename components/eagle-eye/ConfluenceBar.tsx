/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * ConfluenceBar — shows per-category signal confluence as filled blocks.
 *
 * Each category gets a filled bar from 0 to categoryMax signals.
 * Color reflects how many fired vs total possible.
 */
import { getConfidenceColor } from "@/constants/eagleEyeColors";
import { CATEGORY_LABELS } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SignalItem } from "@/hooks/useEagleEye";

interface ConfluenceBarProps {
  signals: SignalItem[];
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  trend: ["ema", "supertrend", "ichimoku", "markup", "markdown"],
  momentum: ["rsi", "macd", "adx", "plus_di", "minus_di"],
  volume_flow: ["obv", "cmf", "mfi", "volume"],
  volatility: ["bb", "bollinger", "squeeze"],
  structure: ["wyckoff", "support", "resistance", "breakout"],
  institutional: ["accumulation", "smart_money"],
  statistical: ["slope", "regression", "correlation"],
  regime: ["regime", "breadth"],
};

function categorizeSignal(signal: string): string {
  const key = signal.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => key.includes(kw))) return cat;
  }
  return "trend";
}

export const ConfluenceBar = React.memo(function ConfluenceBar({ signals }: ConfluenceBarProps) {
  const { colors } = useThemeStore();

  const categories = useMemo(() => {
    const map: Record<string, { fired: number; total: number }> = {};
    for (const s of signals) {
      const cat = categorizeSignal(s.signal);
      if (!map[cat]) map[cat] = { fired: 0, total: 0 };
      map[cat].total += 1;
      if (s.fired) map[cat].fired += 1;
    }
    return map;
  }, [signals]);

  const catKeys = Object.keys(categories);
  if (catKeys.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {catKeys.map((cat) => {
        const { fired, total } = categories[cat];
        const ratio = total > 0 ? fired / total : 0;
        const score = Math.round(ratio * 100);
        const barColor = getConfidenceColor(score, colors);

        return (
          <View key={cat} style={styles.row}>
            <Text style={[styles.catLabel, { color: colors.textSecondary }]}>
              {CATEGORY_LABELS[cat] ?? cat}
            </Text>
            <View style={[styles.trackBg, { backgroundColor: colors.bgCardHover }]}>
              <View
                style={[
                  styles.trackFill,
                  {
                    backgroundColor: barColor,
                    width: `${Math.max(2, ratio * 100)}%` as any,
                    opacity: fired === 0 ? 0.3 : 1,
                  },
                ]}
              />
            </View>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {fired}/{total}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catLabel: {
    width: 90,
    fontSize: 12,
    fontWeight: "500",
  },
  trackBg: {
    flex: 1,
    height: 8,
    borderRadius: UITokens.radius.pill,
    overflow: "hidden",
  },
  trackFill: {
    height: 8,
    borderRadius: UITokens.radius.pill,
  },
  count: {
    width: 36,
    fontSize: 11,
    textAlign: "right",
  },
});
