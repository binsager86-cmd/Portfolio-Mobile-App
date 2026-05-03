import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { tokens } from "@/theme/tokens";

interface SkeletonProps {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
}

export function SkeletonLoader({
  width = "100%",
  height,
  radius = tokens.radii.md,
  style,
  animate = true,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    if (!animate) {
      opacity.value = 0.3;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [animate, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width: width as DimensionValue,
          height,
          borderRadius: radius,
          backgroundColor: tokens.colors.surfaceVariant,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonLoader width="40%" height={20} />
      <SkeletonLoader width="70%" height={16} />
      <SkeletonLoader width="90%" height={16} />
    </View>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.listRow}>
          <SkeletonLoader width={48} height={48} radius={tokens.radii.full} />
          <View style={styles.listTextWrap}>
            <SkeletonLoader width="60%" height={14} />
            <SkeletonLoader width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
  card: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  list: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  listRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    alignItems: "center",
  },
  listTextWrap: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
});