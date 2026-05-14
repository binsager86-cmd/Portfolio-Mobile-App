/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * StageTag — colored chip showing the Wyckoff/lifecycle stage name with a status dot.
 */
import { getStageColors } from "@/constants/eagleEyeColors";
import { getStageLabelFull, getStageLabelShort } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface StageTagProps {
  stage: string;
  size?: "sm" | "md";
  variant?: "short" | "full";
}

export const StageTag = React.memo(function StageTag({
  stage,
  size = "md",
  variant = "short",
}: StageTagProps) {
  const { colors } = useThemeStore();
  const c = getStageColors(stage, colors);
  const label = variant === "full" ? getStageLabelFull(stage) : getStageLabelShort(stage);
  const small = size === "sm";

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: c.bg,
          borderColor: colors.borderColor,
          paddingHorizontal: small ? 7 : 10,
          paddingVertical: small ? 2 : 4,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text
        style={[
          styles.label,
          {
            color: c.text,
            fontSize: small ? 11 : 12,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontWeight: "500",
  },
});
