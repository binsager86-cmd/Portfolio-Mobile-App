/**
 * useFilterBatch - Batches rapid filter state updates to prevent React Native
 * view hierarchy synchronization mismatches (IndexOutOfBoundsException in ReactClippingViewManager).
 * 
 * This hook debounces filter changes to prevent rapid JS-to-native synchronization issues
 * that occur when the FlatList data changes too quickly.
 */

import { useCallback, useRef, useState, useEffect } from "react";

const BATCH_DELAY_MS = 150; // Throttle filter changes to prevent rapid view updates

interface FilterState {
  minConfidence: number;
  search: string;
  buyRatingOnly: boolean;
  sellRatingOnly: boolean;
  statusFilter: string | null;
  highVolumeOnly: boolean;
  stageFilter: string | null;
}

/**
 * Batches rapid filter state updates with debouncing to prevent
 * view hierarchy synchronization issues on Android.
 */
export function useFilterBatch(
  initialFilters: FilterState
) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const pendingFilters = useRef<Partial<FilterState> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Schedule a batch update
  const scheduleBatchUpdate = useCallback((newFilters: Partial<FilterState>) => {
    pendingFilters.current = { ...pendingFilters.current, ...newFilters };

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (pendingFilters.current) {
        setFilters((prev) => ({ ...prev, ...pendingFilters.current }));
        pendingFilters.current = null;
      }
    }, BATCH_DELAY_MS);
  }, []);

  // Batch update helper
  const updateFilters = useCallback(
    (updates: Partial<FilterState>) => {
      scheduleBatchUpdate(updates);
    },
    [scheduleBatchUpdate]
  );

  // Clear any pending updates on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { filters, updateFilters };
}
