import React, { useCallback } from "react";
import { Platform, StyleSheet, type RefreshControlProps, type StyleProp, type ViewStyle } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { ListSkeleton } from "@/components/ui/SkeletonLoader";
import { tokens } from "@/theme/tokens";

interface SmoothFlashListProps<T> {
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  isLoading: boolean;
  estimatedItemSize: number;
  getItemType?: (item: T) => string;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType | React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  onEndReached?: () => void;
}

export function SmoothFlashList<T>({
  data,
  renderItem,
  keyExtractor,
  isLoading,
  estimatedItemSize,
  getItemType,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  contentContainerStyle,
  refreshControl,
  onEndReached,
}: SmoothFlashListProps<T>) {
  const velocity = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      velocity.value = event.velocity?.y || 0;
    },
  });

  const skeletonOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(velocity.value), [0, 2000], [1, 0.2], "clamp"),
  }));

  const memoRender = useCallback(
    ({ item, index }: { item: T; index: number }) => renderItem({ item, index }),
    [renderItem],
  );
  const memoKey = useCallback(
    (item: T, index: number) => keyExtractor(item, index),
    [keyExtractor],
  );

  if (isLoading) {
    return (
      <Animated.View style={[skeletonOpacity, { flex: 1 }]}>
        <ListSkeleton count={8} />
      </Animated.View>
    );
  }

  return (
    <Animated.ScrollView
      scrollEventThrottle={16}
      onScroll={scrollHandler}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
      refreshControl={refreshControl}
    >
      <FlashList<T>
        data={data}
        renderItem={memoRender as (info: { item: T; index: number }) => React.ReactElement}
        keyExtractor={memoKey}
        estimatedItemSize={estimatedItemSize}
        getItemType={getItemType}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={[styles.list, contentContainerStyle]}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.15}
        removeClippedSubviews={Platform.OS === "android"}
        optimizeItemArrangement={true}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={15}
        drawDistance={500}
      />
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flex: 1 },
  list: { padding: tokens.spacing.md, gap: tokens.spacing.sm },
});
