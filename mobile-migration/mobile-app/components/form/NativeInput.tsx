/**
 * NativeInput — platform-aware text input with focus ring, inline validation,
 * and optional right-side icon action.
 *
 * Respects the app's UITokens spacing/radius/typography system and
 * reads colors from `useThemeStore`.
 *
 * Usage:
 *   <NativeInput
 *     label="Amount"
 *     value={amount}
 *     onChangeText={setAmount}
 *     keyboardType="decimal-pad"
 *     error={amountError}
 *     rightIcon={<MaterialIcon name="calculator" />}
 *     onRightPress={openCalculator}
 *   />
 */

import React, { forwardRef, useCallback, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  type TextInput as RNTextInput,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { UITokens } from "@/constants/uiTokens";
import { NativePressable } from "@/components/ui/NativePressable";
import { useThemeStore } from "@/services/themeStore";

const { spacing, radius, typography } = UITokens;

export interface NativeInputProps extends TextInputProps {
  /** Floating label above the input. */
  label?: string;
  /** Inline error message — turns border red when set. */
  error?: string;
  /** Turns border green when true (no error, validated). */
  success?: boolean;
  /** Icon node rendered inside the right edge of the input. */
  rightIcon?: React.ReactNode;
  /** Called when the right icon is tapped. */
  onRightPress?: () => void;
}

export const NativeInput = forwardRef<RNTextInput, NativeInputProps>(
  function NativeInput(
    { label, error, success, rightIcon, onRightPress, style, onFocus, onBlur, ...props },
    ref,
  ) {
    const { colors } = useThemeStore();
    const [focused, setFocused] = useState(false);
    const innerRef = useRef<RNTextInput>(null);
    const inputRef = (ref as React.RefObject<RNTextInput>) ?? innerRef;

    const borderColor = error
      ? colors.danger
      : success
        ? colors.success
        : focused
          ? colors.accentPrimary
          : colors.borderColor;

    const handleFocus = useCallback(
      (e: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
        setFocused(true);
        onFocus?.(e);
      },
      [onFocus],
    );

    const handleBlur = useCallback(
      (e: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
        setFocused(false);
        onBlur?.(e);
      },
      [onBlur],
    );

    return (
      <View style={styles.container}>
        {label ? (
          <NativePressable
            haptic={false}
            disableScale
            onPress={() => inputRef.current?.focus()}
            style={styles.labelRow}
          >
            <Text
              style={[
                styles.label,
                {
                  color: focused ? colors.accentPrimary : colors.textSecondary,
                  fontSize: typography.caption.size,
                },
              ]}
            >
              {label}
            </Text>
          </NativePressable>
        ) : null}

        <View
          style={[
            styles.wrapper,
            {
              borderColor,
              backgroundColor: colors.bgInput,
              borderWidth: focused ? 1.5 : 1,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor={error ? colors.danger : colors.textMuted}
            selectionColor={colors.accentPrimary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                fontSize: typography.body.size,
              },
              style,
            ]}
            {...props}
          />

          {rightIcon ? (
            <NativePressable
              onPress={onRightPress}
              haptic="light"
              disableScale
              hitSlopCustom={8}
              style={styles.rightIcon}
            >
              {rightIcon}
            </NativePressable>
          ) : null}
        </View>

        {error ? (
          <Text
            style={[
              styles.errorText,
              { color: colors.danger, fontSize: typography.caption.size },
            ]}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    alignSelf: "flex-start",
  },
  label: {
    fontWeight: "500",
    marginBottom: 2,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    // Never invert text direction — RTL is handled per-screen
  },
  rightIcon: {
    paddingLeft: spacing.sm,
  },
  errorText: {
    marginTop: 2,
  },
});
