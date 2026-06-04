/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * RatingBadge — compact colored badge showing STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL.
 */
import { getRatingColors } from "@/constants/eagleEyeColors";
import { getRatingDescription, RATING_LABELS } from "@/constants/eagleEyeStrings";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BadgeHelpTooltip } from "./BadgeHelpTooltip";

interface RatingBadgeProps {
  rating: string;
  size?: "sm" | "md";
  showHelp?: boolean;
}

export const RatingBadge = React.memo(function RatingBadge({
  rating,
  size = "md",
  showHelp = true,
}: RatingBadgeProps) {
  const { colors } = useThemeStore();
  const c = getRatingColors(rating, colors);
  const label = RATING_LABELS[rating] ?? rating;
  const helper = getRatingDescription(rating);
  const small = size === "sm";
  const weight: "600" | "700" =
    rating === "HOLD" || rating === "SELL" ? "600" : "700";

  const badgeContent = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          minWidth: small ? 66 : 72,
          paddingHorizontal: small ? 8 : 10,
          paddingVertical: small ? 4 : 5,
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
            fontSize: small ? 10 : 11,
          },
        ]}
        numberOfLines={1}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );

  if (!showHelp || !helper) {
    return badgeContent;
  }

  return (
    <BadgeHelpTooltip title={label.toUpperCase()} body={helper}>
      {badgeContent}
    </BadgeHelpTooltip>
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
