import React, { useCallback } from "react";
import type { RefreshControlProps, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { EmptyState } from "@/components/ui/EmptyState";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useAppTheme } from "@/theme";

interface ListContainerProps<T> {
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  isLoading: boolean;
  isEmpty: boolean;
  estimatedItemSize: number;
  getItemType?: (item: T) => string;
  ListHeaderComponent?: React.ComponentType<unknown> | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType<unknown> | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType<unknown> | React.ReactElement | null;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyTitle?: string;
  emptyDesc?: string;
  emptyIcon?: React.ComponentProps<typeof EmptyState>["icon"];
  emptyAction?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  showsVerticalScrollIndicator?: boolean;
  scrollEnabled?: boolean;
}

export function ListContainer<T>({
  data,
  renderItem,
  keyExtractor,
  isLoading,
  isEmpty,
  estimatedItemSize,
  getItemType,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  onEndReachedThreshold = 0.2,
  contentContainerStyle,
  emptyTitle = "No data available",
  emptyDesc,
  emptyIcon,
  emptyAction,
  refreshControl,
  showsVerticalScrollIndicator = false,
  scrollEnabled = true,
}: ListContainerProps<T>) {
  const { spacing } = useAppTheme();

  const memoizedRender = useCallback(
    ({ item, index }: { item: T; index: number }) => renderItem({ item, index }),
    [renderItem],
  );
  const memoizedKey = useCallback(
    (item: T, index: number) => keyExtractor(item, index),
    [keyExtractor],
  );

  if (isLoading) {
    return <CardSkeleton />;
  }

  const emptyFallback = (
    <EmptyState
      title={emptyTitle}
      description={emptyDesc}
      icon={emptyIcon}
      action={emptyAction}
    />
  );

  const FlashListAny = FlashList as unknown as React.ComponentType<Record<string, unknown>>;

  return (
    <FlashListAny
      data={data}
      renderItem={memoizedRender}
      keyExtractor={memoizedKey}
      estimatedItemSize={estimatedItemSize}
      getItemType={getItemType}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent ?? (isEmpty ? emptyFallback : null)}
      contentContainerStyle={[
        styles.list,
        { padding: spacing.md, gap: spacing.sm },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      removeClippedSubviews={true}
      initialNumToRender={8}
      maxToRenderPerBatch={5}
      windowSize={10}
      optimizeItemArrangement={true}
      drawDistance={400}
      refreshControl={refreshControl}
      scrollEnabled={scrollEnabled}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
});