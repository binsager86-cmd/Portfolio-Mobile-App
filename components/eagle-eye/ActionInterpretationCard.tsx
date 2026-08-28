import { UITokens } from "@/constants/uiTokens";
import type { FullStockAnalysis } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { getActionInterpretation } from "./actionInterpretation";

interface ActionInterpretationCardProps {
  analysis: Partial<FullStockAnalysis>;
}

export const ActionInterpretationCard = React.memo(function ActionInterpretationCard({
  analysis,
}: ActionInterpretationCardProps) {
  const { colors } = useThemeStore();

  const interpretation = getActionInterpretation({
    rating: analysis.rating,
    continue_rising: analysis.continue_rising,
    continue_rising_exhaustion_count: analysis.continue_rising_exhaustion_count,
    risk_warning_score: analysis.risk_warning_score,
    risky_near_resistance: analysis.risky_near_resistance,
    risk_reward_ratio: analysis.risk_reward_ratio,
    close: analysis.last_price,
    stage: analysis.stage,
  });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Action plan</Text>
      <Text style={[styles.action, { color: colors.accentPrimary }]}>
        {interpretation.action}
      </Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>
        {interpretation.detail}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.sm,
  },
  title: {
    fontSize: UITokens.typography.label.size,
    fontWeight: UITokens.typography.label.weight,
    letterSpacing: UITokens.typography.label.letterSpacing,
    textTransform: "uppercase",
  },
  action: {
    fontSize: UITokens.typography.subtitle.size,
    fontWeight: UITokens.typography.subtitle.weight,
    lineHeight: UITokens.typography.subtitle.lineHeight,
  },
  detail: {
    fontSize: UITokens.typography.body.size,
    lineHeight: UITokens.typography.body.lineHeight,
  },
});
