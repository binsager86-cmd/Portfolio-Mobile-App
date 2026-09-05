/**
 * SafeFlatList — A FlatList wrapper with defensive programming to prevent
 * IndexOutOfBoundsException crashes caused by synchronization mismatches between
 * the React Native JS thread and Android native UI thread.
 */

import React, { useMemo } from "react";
import { FlatList as RNFlatList, FlatListProps, Platform } from "react-native";

interface SafeFlatListProps<T> extends Omit<FlatListProps<T>, "stickyHeaderIndices"> {
  /**
   * Sticky header indices - will be safely validated to prevent crashes
   */
  stickyHeaderIndices?: number[];
  /**
   * If true, will disable removeClippedSubviews on Android to prevent index mismatches
   */
  safetyMode?: boolean;
}

/**
 * SafeFlatList wrapper component that prevents IndexOutOfBoundsException crashes
 * by:
 * 1. Validating stickyHeaderIndices against actual data length
 * 2. Disabling removeClippedSubviews on Android (causing agent of crashes)
 * 3. Ensuring proper batching and rendering modes
 */
export const SafeFlatList = React.forwardRef<
  RNFlatList<unknown>,
  SafeFlatListProps<unknown>
>(
  (
    {
      data = [],
      stickyHeaderIndices,
      removeClippedSubviews: originalRemoveClipped,
      safetyMode = true,
      maxToRenderPerBatch = 15,
      windowSize = 5,
      initialNumToRender = 15,
      ...otherProps
    },
    ref
  ) => {
    const isAndroid = Platform.OS === "android";

    // Validate sticky header indices against actual data length
    const safeStickyHeaderIndices = useMemo(() => {
      if (!stickyHeaderIndices || stickyHeaderIndices.length === 0) {
        return undefined;
      }

      // Filter out indices that are >= data length
      const validIndices = stickyHeaderIndices.filter(
        (index) => index >= 0 && index < data.length
      );

      return validIndices.length > 0 ? validIndices : undefined;
    }, [stickyHeaderIndices, data.length]);

    // On Android with safety mode, disable removeClippedSubviews to prevent crashes
    const removeClipped = useMemo(() => {
      if (!isAndroid || !safetyMode) {
        return originalRemoveClipped ?? true;
      }
      return false; // Disable on Android to prevent IndexOutOfBoundsException
    }, [isAndroid, safetyMode, originalRemoveClipped]);

    return (
      <RNFlatList
        ref={ref}
        data={data}
        stickyHeaderIndices={safeStickyHeaderIndices}
        removeClippedSubviews={removeClipped}
        maxToRenderPerBatch={maxToRenderPerBatch}
        windowSize={windowSize}
        initialNumToRender={initialNumToRender}
        keyboardShouldPersistTaps="handled"
        {...otherProps}
      />
    );
  }
);

SafeFlatList.displayName = "SafeFlatList";

/**
 * Hook to validate and sanitize stickyHeaderIndices
 * 
 * Usage:
 * ```tsx
 * const safeStickyIndices = useSafeStickyIndices(data.length, [3, 5]);
 * ```
 */
export function useSafeStickyIndices(
  dataLength: number,
  requestedIndices?: number[]
): number[] | undefined {
  return useMemo(() => {
    if (!requestedIndices || requestedIndices.length === 0) {
      return undefined;
    }

    const validIndices = requestedIndices.filter(
      (index) => index >= 0 && index < dataLength
    );

    return validIndices.length > 0 ? validIndices : undefined;
  }, [dataLength, requestedIndices]);
}
