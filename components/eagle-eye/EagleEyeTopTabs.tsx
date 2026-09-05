import { isSimulatorFeatureEnabled } from "@/constants/Config";
import { UITokens } from "@/constants/uiTokens";
import { useAdminGate } from "@/hooks/useAdminGate";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type EagleEyeTab = {
  key: "scanner" | "trend-hold-book" | "simulator" | "methodology" | "settings";
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  href:
    | "/(tabs)/eagle-eye"
    | "/(tabs)/eagle-eye/trend-hold-book"
    | "/(tabs)/eagle-eye/simulator"
    | "/(tabs)/eagle-eye/simulator/decision"
    | "/(tabs)/eagle-eye/methodology"
    | "/(tabs)/eagle-eye/settings";
  matches: string[];
};

const EAGLE_EYE_TABS: readonly EagleEyeTab[] = [
  {
    key: "scanner",
    label: "Scanner",
    icon: "eye",
    href: "/(tabs)/eagle-eye",
    matches: ["/eagle-eye"],
  },
  {
    key: "trend-hold-book",
    label: "Trend-Hold Book",
    icon: "book",
    href: "/(tabs)/eagle-eye/trend-hold-book",
    matches: ["/eagle-eye/trend-hold-book"],
  },
  {
    key: "simulator",
    label: "Simulator",
    icon: "play-circle",
    href: "/(tabs)/eagle-eye/simulator/decision",
    matches: ["/eagle-eye/simulator/decision", "/eagle-eye/simulator"],
  },
  {
    key: "methodology",
    label: "Methodology",
    icon: "graduation-cap",
    href: "/(tabs)/eagle-eye/methodology",
    matches: ["/eagle-eye/methodology"],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "sliders",
    href: "/(tabs)/eagle-eye/settings",
    matches: ["/eagle-eye/settings"],
  },
] as const;

function normalizePath(pathname: string): string {
  return pathname.replace("/(tabs)", "");
}

const SWIPE_THRESHOLD = 60;
const VERTICAL_TO_HORIZONTAL_RATIO = 2;

function findActiveTabIndex(pathname: string, tabs: readonly EagleEyeTab[]): number {
  return tabs.findIndex((tab) =>
    tab.matches.some((prefix) =>
      prefix === "/eagle-eye" ? pathname === prefix : pathname.startsWith(prefix)
    )
  );
}

export function EagleEyeTopTabs({ rightSlot }: { rightSlot?: React.ReactNode } = {}) {
  const { colors } = useThemeStore();
  const { isAdmin } = useAdminGate();
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const activeTextColor = "#ffffff";
  const simulatorEnabled = isSimulatorFeatureEnabled();
  const visibleTabs = EAGLE_EYE_TABS.filter(
    (tab) =>
      (tab.key !== "simulator" || (isAdmin && simulatorEnabled)) &&
      (tab.key !== "trend-hold-book" || isAdmin),
  );
  const activeTabIndex = findActiveTabIndex(pathname, visibleTabs);

  // Kept fresh via effect (not during render) so the pan responder --
  // created once below, closure fixed at that point -- can still read the
  // latest pathname/tabs when a gesture fires much later.
  const pathnameRef = useRef(pathname);
  const visibleTabsRef = useRef(visibleTabs);
  useEffect(() => {
    pathnameRef.current = pathname;
    visibleTabsRef.current = visibleTabs;
  });

  const isNative = Platform.OS !== "web";
  // Built in an effect, not a render-phase useState initializer -- the
  // react-hooks/refs lint rule flags *any* ref access reachable from a
  // useState/useMemo initializer, even one only actually invoked later by
  // PanResponder on a real gesture, since it can't prove that. An effect is
  // the sanctioned place for this per that rule's own guidance. Created
  // once (empty deps) for the same stable identity the old ref-based
  // lazy-init gave the gesture handlers.
  const [panResponder, setPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);
  useEffect(() => {
    setPanResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, { dx, dy }) => {
          const hasMinimumDistance = Math.abs(dx) > SWIPE_THRESHOLD;
          const isHorizontallyDominant =
            Math.abs(dx) > Math.abs(dy) * VERTICAL_TO_HORIZONTAL_RATIO;
          return hasMinimumDistance && isHorizontallyDominant;
        },
        onPanResponderRelease: (_, { dx }) => {
          const currentTabs = visibleTabsRef.current;
          const currentIndex = findActiveTabIndex(pathnameRef.current, currentTabs);
          if (currentIndex === -1) return;
          if (dx < -SWIPE_THRESHOLD && currentIndex < currentTabs.length - 1) {
            router.push(currentTabs[currentIndex + 1].href);
          } else if (dx > SWIPE_THRESHOLD && currentIndex > 0) {
            router.push(currentTabs[currentIndex - 1].href);
          }
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; handlers read latest state via the refs above
  }, []);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
      ]}
      {...(isNative && panResponder ? panResponder.panHandlers : {})}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        style={styles.tabsScroll}
        contentContainerStyle={styles.content}
      >
        {visibleTabs.map((tab, index) => {
          const active = index === activeTabIndex;

          return (
            <Pressable
              key={tab.key}
              onPress={() => router.push(tab.href)}
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: active ? colors.accentPrimary : colors.bgSecondary,
                  borderColor: active ? colors.accentPrimary : colors.borderColor,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <FontAwesome
                name={tab.icon}
                size={13}
                color={active ? activeTextColor : colors.textPrimary}
              />
              <Text
                style={[
                  styles.label,
                  { color: active ? activeTextColor : colors.textPrimary },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsScroll: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: UITokens.spacing.sm,
    gap: UITokens.spacing.xs,
    alignItems: "center",
  },
  rightSlot: {
    paddingRight: UITokens.spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: UITokens.spacing.sm,
    paddingHorizontal: UITokens.filter.chipPaddingH,
    paddingVertical: UITokens.spacing.sm + 2,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1.25,
    minHeight: UITokens.touchTarget.mobile,
  },
  label: {
    fontSize: UITokens.filter.chipFontSize,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
