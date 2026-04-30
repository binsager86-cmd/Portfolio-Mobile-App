/**
 * NativeFormButton — primary CTA button with loading/disabled states.
 *
 * - Loading: replaces label with ActivityIndicator, blocks re-press.
 * - Disabled: muted background + reduced opacity.
 * - Haptic "medium" on each confirmed press.
 * - Min-height 48 px for WCAG touch-target compliance.
 *
 * Usage:
 *   <NativeFormButton title="Save" loading={isMutating} onPress={handleSubmit} />
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { UITokens } from "@/constants/uiTokens";
import { NativePressable } from "@/components/ui/NativePressable";
import { useThemeStore } from "@/services/themeStore";

const { spacing, radius, typography } = UITokens;

export interface NativeFormButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Override background colour (e.g. for destructive "Delete" buttons). */
  color?: string;
  testID?: string;
}

export const NativeFormButton: React.FC<NativeFormButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  color,
  testID,
}) => {
  const { colors } = useThemeStore();

  const isBlocked = disabled || loading;
  const bgColor = isBlocked
    ? colors.textMuted
    : (color ?? colors.accentPrimary);

  return (
    <NativePressable
      onPress={onPress}
      haptic="medium"
      disabled={isBlocked}
      testID={testID}
      style={[
        styles.btn,
        {
          backgroundColor: bgColor,
          opacity: disabled && !loading ? 0.6 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      accessibilityLabel={loading ? `${title}, loading` : title}
    >
      {loading ? (
        <ActivityIndicator color={colors.bgPrimary} size="small" />
      ) : (
        <Text
          style={[
            styles.label,
            {
              color: colors.bgPrimary,
              fontSize: typography.body.size,
            },
          ]}
        >
          {title}
        </Text>
      )}
    </NativePressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.sm + 6, // 14 px
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: 48, // WCAG minimum
  },
  label: {
    fontWeight: "700",
  },
});
