/**
 * NativeFlashList — opinionated wrapper around `@shopify/flash-list` with:
 *   - Pull-to-refresh with haptic snap feedback
 *   - Native-feel RefreshControl tint from the active theme
 *   - Bottom padding for tab-bar clearance (iOS 100 / Android 80)
 *   - `removeClippedSubviews` on Android for memory savings
 *   - Sensible render-window defaults for 60 fps scroll
 *
 * This is the preferred list component for all screens. Prefer it over
 * `SmoothFlashList` when you need pull-to-refresh or end-reached pagination.
 *
 * Usage:
 *   <NativeFlashList
 *     data={transactions}
 *     renderItem={({ item }) => <TxRow item={item} />}
 *     keyExtractor={(item) => item.id.toString()}
 *     estimatedItemSize={72}
 *     isLoading={isLoading}
 *     onRefresh={refetch}
 *     isRefreshing={isRefetching}
 *   />
 */

import React, { useCallback } from "react";
import { Platform, RefreshControl, type StyleProp, type ViewStyle } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { UITokens } from "@/constants/uiTokens";
import { useHaptics } from "@/hooks/useHaptics";
import { useThemeStore } from "@/services/themeStore";

const { spacing } = UITokens;

const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 100 : 80;

export interface NativeFlashListProps<T> {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
  keyExtractor: (item: T, index: number) => string;
  estimatedItemSize: number;
  isLoading?: boolean;
  /** If true, renders nothing (caller can show its own empty state). */
  isEmpty?: boolean;
  onRefresh?: () => void | Promise<void>;
  isRefreshing?: boolean;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType | React.ReactElement | null;
  getItemType?: (item: T, index: number) => string | number;
  onEndReached?: () => void;
  /** Extra padding appended to the default bottom clearance. */
  extraBottomPadding?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function NativeFlashList<T>({
  data,
  renderItem,
  keyExtractor,
  estimatedItemSize,
  isLoading = false,
  isEmpty = false,
  onRefresh,
  isRefreshing = false,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  getItemType,
  onEndReached,
  extraBottomPadding = 0,
  contentContainerStyle,
}: NativeFlashListProps<T>) {
  const { colors } = useThemeStore();
  const haptics = useHaptics();

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    await onRefresh();
    haptics.success(); // satisfying snap when the list settles
  }, [haptics, onRefresh]);

  // Bail early if loading or genuinely empty (let the caller render a skeleton/empty state)
  if (isLoading || isEmpty) return null;

  return (
    <FlashList<T>
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={estimatedItemSize}
      getItemType={getItemType}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      contentContainerStyle={[
        {
          padding: spacing.md,
          paddingBottom: TAB_BAR_CLEARANCE + extraBottomPadding,
        },
        contentContainerStyle,
      ]}
      // Pull-to-refresh
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        ) : undefined
      }
      // Scroll behaviour
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.15}
      // Render window tuning (per-platform)
      initialNumToRender={12}
      drawDistance={Platform.OS === "ios" ? 600 : 400}
      removeClippedSubviews={Platform.OS === "android"}
    />
  );
}
