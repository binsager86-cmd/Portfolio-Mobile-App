/**
 * useHeaderScroll — hides the navigation header when scrolling down,
 * reveals it when scrolling back up.
 *
 * Works with any scroll view ref (ScrollView, FlatList, FlashList).
 *
 * Usage:
 *   const scrollRef = useRef<FlashList<any>>(null);
 *   const { onScroll } = useHeaderScroll();
 *
 *   <FlashList ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} ... />
 */

import { useNavigation } from "@react-navigation/native";
import { useCallback, useRef } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

const HIDE_THRESHOLD = 50; // px scrolled down before header hides
const SHOW_THRESHOLD = 10; // px scrolled up before header re-appears

export function useHeaderScroll() {
  const navigation = useNavigation();
  const lastOffset = useRef(0);
  const headerVisible = useRef(true);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      const delta = offset - lastOffset.current;

      if (delta > 0 && offset > HIDE_THRESHOLD && headerVisible.current) {
        // Scrolling down past threshold → hide
        navigation.setOptions({ headerShown: false });
        headerVisible.current = false;
      } else if (delta < -SHOW_THRESHOLD && !headerVisible.current) {
        // Scrolling up — reveal immediately
        navigation.setOptions({ headerShown: true });
        headerVisible.current = true;
      }

      lastOffset.current = offset;
    },
    [navigation],
  );

  return { onScroll };
}
