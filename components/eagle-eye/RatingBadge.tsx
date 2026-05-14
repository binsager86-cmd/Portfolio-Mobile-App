/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * RatingBadge — compact colored badge showing STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL.
 */
import { getRatingColors } from "@/constants/eagleEyeColors";
import { RATING_LABELS } from "@/constants/eagleEyeStrings";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface RatingBadgeProps {
  rating: string;
  size?: "sm" | "md";
}

export const RatingBadge = React.memo(function RatingBadge({
  rating,
}: RatingBadgeProps) {
  const { colors } = useThemeStore();
  const c = getRatingColors(rating, colors);
  const label = RATING_LABELS[rating] ?? rating;
  const weight: "600" | "700" =
    rating === "HOLD" || rating === "SELL" ? "600" : "700";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          opacity: 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: c.text,
            fontWeight: weight,
          },
        ]}
        numberOfLines={1}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
