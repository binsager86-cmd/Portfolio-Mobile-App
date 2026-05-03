import React from "react";
import { Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "@/theme";

interface SkeletonProps {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height,
  radius = 8,
  animate = true,
  style,
}) => {
  const { colors } = useAppTheme();
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    if (animate) {
      opacity.value = withRepeat(
        withTiming(0.6, {
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    }
  }, [animate, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const widthVal: DimensionValue =
    typeof width === "string"
      ? (parseFloat(width) / 100) * (Platform.OS === "web" && typeof window !== "undefined" ? window.innerWidth : 400)
      : width;

  return (
    <Animated.View
      style={[
        {
          width: widthVal,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceVariant,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

export const CardSkeleton = () => (
  <View style={styles.card}>
    <Skeleton width="40%" height={20} />
    <Skeleton width="85%" height={16} />
    <Skeleton width="70%" height={16} />
  </View>
);

export const RowSkeleton = () => (
  <View style={styles.row}>
    <Skeleton width={48} height={48} radius={999} />
    <View style={styles.rowContent}>
      <Skeleton width="60%" height={14} />
      <Skeleton width="90%" height={12} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: "row", gap: 12, padding: 16 },
  rowContent: { flex: 1, gap: 8 },
});
