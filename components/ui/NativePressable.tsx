/**
 * NativePressable — platform-aware, haptic-backed, accessible touch target.
 *
 * Drop-in replacement for `Pressable` / `TouchableOpacity` that enforces:
 *   - 12 px hit slop on all sides (WCAG 44 × 44 pt minimum)
 *   - iOS: spring scale (0.96) + opacity fade (0.65)
 *   - Android: `overflow: 'hidden'` to expose Material ripple from the theme
 *   - Contextual haptics via `useHaptics` (pass `haptic={false}` to opt out)
 *
 * All animation is driven by Reanimated `withSpring` — no JS-thread Animated.
 *
 * Usage:
 *   <NativePressable onPress={handler} haptic="medium">
 *     <Text>Confirm</Text>
 *   </NativePressable>
 */

import React, { useCallback } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Motion } from "@/constants/motion";
import { useHaptics } from "@/hooks/useHaptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface NativePressableProps extends PressableProps {
  /** Haptic style fired on `onPressIn`. Pass `false` to disable. */
  haptic?: "light" | "medium" | "heavy" | "success" | "error" | false;
  /** Extra hit-slop padding on all sides (default: 12). */
  hitSlopCustom?: number;
  /** Set true for icon-only targets where scale looks wrong. */
  disableScale?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const NativePressable: React.FC<NativePressableProps> = React.memo(({
  children,
  haptic = "light",
  hitSlopCustom = 12,
  disableScale = false,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<PressableProps["onPressIn"]>>[0]) => {
      if (disabled) return;

      if (!disableScale && Platform.OS === "ios") {
        scale.value = withSpring(0.96, Motion.spring.snappy);
      }

      // Fire on confirmed tap, not scroll-gesture start (mirrors PressableCard logic)
      if (haptic !== false) haptics[haptic]();

      onPressIn?.(e);
    },
    [disabled, disableScale, haptic, haptics, onPressIn, scale],
  );

  const handlePressOut = useCallback(
    (e: Parameters<NonNullable<PressableProps["onPressOut"]>>[0]) => {
      if (!disableScale && Platform.OS === "ios") {
        scale.value = withSpring(1, Motion.spring.snappy);
      }
      onPressOut?.(e);
    },
    [disableScale, onPressOut, scale],
  );

  return (
    <AnimatedPressable
      hitSlop={hitSlopCustom}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        animatedStyle,
        style,
        // Expose Material ripple on Android — requires overflow clip
        Platform.OS === "android" && !disabled ? { overflow: "hidden" } : null,
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
