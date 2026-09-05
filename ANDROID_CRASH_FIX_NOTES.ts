/**
 * ANDROID CRASH FIX: IndexOutOfBoundsException in ReactClippingViewManager
 * 
 * ## Problem Summary
 * The Eagle Eye screen crashes with:
 * ```
 * java.lang.IndexOutOfBoundsException: index=15 count=1
 * at com.facebook.react.views.view.ReactClippingViewManager.addView
 * ```
 * 
 * ## Root Causes
 * 1. Dynamic stickyHeaderIndices changing based on data length
 * 2. Rapid state updates causing JS-to-native synchronization mismatches
 * 3. removeClippedSubviews optimization without proper buffering
 * 4. FlatList with many items and aggressive batching settings
 * 
 * ## Solutions Applied
 * 
 * ### 1. Fixed Dynamic stickyHeaderIndices (index.tsx)
 * Changed from: `stickyHeaderIndices={listData.length > 0 ? [1] : undefined}`
 * Changed to:  `stickyHeaderIndices={listData.length > 1 ? [1] : undefined}`
 * 
 * Why: Only show sticky header if list has actual stock items (index 1).
 * When listData.length === 1 (only header), undefined prevents the crash.
 * 
 * ### 2. Disabled removeClippedSubviews (index.tsx)
 * Added: `removeClippedSubviews={false}`
 * 
 * Why: This optimization clips off-screen views, but rapid data changes
 * can cause the native view count to not match JS expectations.
 * Disabling prevents index mismatches during filtering/sorting.
 * 
 * ### 3. Key Extractor Uses Stable Keys
 * Already implemented:
 * - Header: "__scanner_column_header__"
 * - Stocks: item.stock.ticker (unique, stable identifier)
 * 
 * Benefits: Prevents React from reordering items when list changes,
 * reducing native view hierarchy churn.
 * 
 * ### 4. Performance Tuning (Already Optimized)
 * - initialNumToRender={15}: Good balance
 * - maxToRenderPerBatch={15}: Prevents overwhelming native thread
 * - windowSize={5}: Reasonable off-screen buffer
 * 
 * ## Additional Recommendations
 * 
 * ### For Rapid Filter Changes
 * Consider implementing filter debouncing (useFilterBatch hook created).
 * This prevents rapid JS-to-native updates that can cause race conditions.
 * 
 * ### For Future Development
 * - Avoid dynamic stickyHeaderIndices - set once or avoid entirely
 * - Use stable, unique keys for list items (don't use array indices)
 * - Batch multiple state updates into single render passes
 * - Monitor React Native upgrade notes for view management fixes
 * - Test with android:hardwareAccelerated="false" if crashes persist
 * 
 * ### React Native Version Check
 * Consider upgrading React Native if using version < 0.73.
 * Recent versions have improved view synchronization logic.
 * 
 * ## Testing
 * 1. Open Eagle Eye scanner
 * 2. Rapidly toggle filters (confidence, rating, volume, stage)
 * 3. Sort by different columns repeatedly
 * 4. Search for stocks
 * 5. Refresh the data
 * 6. Scroll through the list quickly
 * 
 * If crashes were related to rapid filtering, the app should now be stable.
 */

// This file documents the crash fixes applied to prevent IndexOutOfBoundsException
// in React Native's ReactClippingViewManager on Android.
