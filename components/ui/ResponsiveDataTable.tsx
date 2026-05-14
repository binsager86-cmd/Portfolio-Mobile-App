import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { UITokens } from "@/constants/uiTokens";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import { PressableCard } from "./PressableCard";

export interface DataColumn<T = unknown> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  priority?: "high" | "medium" | "low";
}

interface Props<T = unknown> {
  data: T[];
  columns: DataColumn<T>[];
  /** Custom key extractor — defaults to item.id or index. */
  keyExtractor?: (item: T) => string;
  /** Desktop/tablet table renderer — falls through to this on wider screens. */
  desktopTable?: React.ReactNode;
  /** Card press handler */
  onPressItem?: (item: T) => void;
  /** Accessibility label factory per item */
  itemA11yLabel?: (item: T) => string;
}

export function ResponsiveDataTable<T>({
  data,
  columns,
  keyExtractor,
  desktopTable,
  onPressItem,
  itemA11yLabel,
}: Props<T>) {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const { colors } = useThemeStore();

  if ((isDesktop || isTablet) && desktopTable) {
    return <>{desktopTable}</>;
  }

  const visibleCols = columns;

  // Memoised to avoid creating a new function reference on every parent render.
  const renderCardItem = React.useCallback(
    ({ item }: { item: T }) => (
      <PressableCard
        onPress={onPressItem ? () => onPressItem(item) : undefined}
        style={StyleSheet.flatten([styles.mobileCard, isPhone ? styles.mobileCardPhone : null])}
        accessibilityLabel={itemA11yLabel?.(item)}
      >
        {visibleCols.map((col) => (
          <View key={col.key} style={styles.row}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {col.label}
            </Text>
            <View style={styles.valueWrap}>
              <Text
                style={[styles.value, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {col.render(item)}
              </Text>
            </View>
          </View>
        ))}
      </PressableCard>
    ),
    // visibleCols and callbacks are the real deps; colors from hook is stable.
    [visibleCols, colors, onPressItem, itemA11yLabel, isPhone],
  );

  return (
    <FlashList
      data={data}
      keyExtractor={keyExtractor ?? ((item, i) => String((item as { id?: string | number }).id ?? i))}
      renderItem={renderCardItem as (info: { item: T }) => React.ReactElement}
    />
  );
}

const styles = StyleSheet.create({
  mobileCard: { marginVertical: UITokens.spacing.xs },
  mobileCardPhone: {
    paddingVertical: UITokens.spacing.md,
    paddingHorizontal: UITokens.spacing.md,
    minHeight: UITokens.touchTarget.mobile,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: UITokens.spacing.xs,
    minHeight: 32,
  },
  label: {
    fontSize: UITokens.typography.caption.size,
    opacity: 0.7,
    flexShrink: 0,
    marginEnd: UITokens.spacing.sm,
  },
  valueWrap: {
    flex: 1,
    alignItems: "flex-end",
  },
  value: {
    fontSize: UITokens.typography.body.size,
    fontWeight: "500",
    textAlign: "right",
  },
  expansion: {
    marginTop: UITokens.spacing.sm,
    textAlign: "center",
    fontSize: UITokens.typography.caption.size,
  },
});
