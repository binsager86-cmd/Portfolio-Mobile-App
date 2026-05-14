/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * SignalBreakdown — expandable section listing each signal that fired/didn't.
 *
 * Groups signals by category, collapsible per group.
 * Tapping the header expands/collapses the group.
 */
import { CATEGORY_LABELS, signalLabel } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SignalItem } from "@/hooks/useEagleEye";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  trend: ["ema", "supertrend", "ichimoku", "markup", "markdown"],
  momentum: ["rsi", "macd", "adx", "plus_di", "minus_di"],
  volume_flow: ["obv", "cmf", "mfi", "volume"],
  volatility: ["bb", "bollinger", "squeeze"],
  structure: ["wyckoff", "support", "resistance", "breakout"],
  institutional: ["accumulation", "smart_money"],
  statistical: ["slope", "regression"],
  regime: ["regime", "breadth"],
};

function categorize(signal: string): string {
  const key = signal.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some((kw) => key.includes(kw))) return cat;
  }
  return "trend";
}

interface GroupMap {
  [cat: string]: SignalItem[];
}

interface SignalBreakdownProps {
  signals: SignalItem[];
  initialExpanded?: boolean;
}

export const SignalBreakdown = React.memo(function SignalBreakdown({
  signals,
  initialExpanded = false,
}: SignalBreakdownProps) {
  const { colors } = useThemeStore();

  const grouped: GroupMap = useMemo(() => {
    const m: GroupMap = {};
    for (const s of signals) {
      const cat = categorize(s.signal);
      if (!m[cat]) m[cat] = [];
      m[cat].push(s);
    }
    return m;
  }, [signals]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        Object.keys(grouped).map((k) => [k, initialExpanded])
      )
  );

  const toggle = (cat: string) =>
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const catKeys = Object.keys(grouped);

  return (
    <View style={styles.wrapper}>
      {catKeys.map((cat) => {
        const items = grouped[cat];
        const firedCount = items.filter((s) => s.fired).length;
        const isExpanded = expanded[cat] ?? false;

        return (
          <View
            key={cat}
            style={[styles.group, { borderColor: colors.borderColor }]}
          >
            <Pressable
              onPress={() => toggle(cat)}
              style={({ pressed }) => [
                styles.groupHeader,
                {
                  backgroundColor: pressed ? colors.bgCardHover : colors.bgCard,
                },
              ]}
            >
              <View style={styles.headerLeft}>
                <Text style={[styles.catLabel, { color: colors.textPrimary }]}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </Text>
                <View
                  style={[
                    styles.countBubble,
                    {
                      backgroundColor:
                        firedCount > 0 ? colors.successBg : colors.bgCardHover,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      {
                        color:
                          firedCount > 0 ? colors.success : colors.textMuted,
                      },
                    ]}
                  >
                    {firedCount}/{items.length}
                  </Text>
                </View>
              </View>
              <FontAwesome
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={12}
                color={colors.textMuted}
              />
            </Pressable>

            {isExpanded &&
              items.map((s) => (
                <View
                  key={s.signal}
                  style={[
                    styles.signalRow,
                    {
                      backgroundColor: s.fired
                        ? colors.successBg
                        : colors.bgCard,
                      borderTopColor: colors.borderColor,
                    },
                  ]}
                >
                  <FontAwesome
                    name={s.fired ? "check-circle" : "circle-o"}
                    size={14}
                    color={s.fired ? colors.success : colors.textMuted}
                    style={styles.signalIcon}
                  />
                  <View style={styles.signalContent}>
                    <Text
                      style={[
                        styles.signalName,
                        {
                          color: s.fired
                            ? colors.textPrimary
                            : colors.textMuted,
                        },
                      ]}
                    >
                      {signalLabel(s.signal)}
                    </Text>
                    {s.value != null && (
                      <Text style={[styles.signalValue, { color: colors.textMuted }]}>
                        {typeof s.value === "number"
                          ? s.value.toFixed(4)
                          : String(s.value)}
                      </Text>
                    )}
                    {s.description ? (
                      <Text style={[styles.signalDesc, { color: colors.textMuted }]}>
                        {s.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
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
  group: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: UITokens.spacing.sm + 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: UITokens.spacing.sm,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  countBubble: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: UITokens.radius.pill,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: UITokens.spacing.sm + 4,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  signalIcon: {
    marginTop: 1,
  },
  signalContent: {
    flex: 1,
    gap: 2,
  },
  signalName: {
    fontSize: 13,
  },
  signalValue: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  signalDesc: {
    fontSize: 11,
    fontStyle: "italic",
  },
});
