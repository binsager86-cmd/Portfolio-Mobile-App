import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import React, { useRef } from "react";
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type EagleEyeTab = {
  key: "scanner" | "simulator" | "methodology" | "settings";
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  href:
    | "/(tabs)/eagle-eye"
    | "/(tabs)/eagle-eye/simulator"
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
    key: "simulator",
    label: "Simulator",
    icon: "play-circle",
    href: "/(tabs)/eagle-eye/simulator",
    matches: ["/eagle-eye/simulator"],
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

/** Minimum horizontal drag distance (dp) to trigger a tab change. */
const SWIPE_THRESHOLD = 60;

/**
 * How much more the horizontal movement must dominate vertical movement before
 * a gesture is claimed as a horizontal swipe (vs. a vertical scroll attempt).
 * A ratio of 2 means dx must be at least 2× larger than dy.
 */
const VERTICAL_TO_HORIZONTAL_RATIO = 2;

/** Returns the index of the currently active tab, or -1 if none matches. */
function findActiveTabIndex(pathname: string): number {
  return EAGLE_EYE_TABS.findIndex((tab) =>
    tab.matches.some((prefix) =>
      prefix === "/eagle-eye" ? pathname === prefix : pathname.startsWith(prefix)
    )
  );
}

export function EagleEyeTopTabs() {
  const { colors } = useThemeStore();
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const activeTextColor = "#ffffff";
  const activeTabIndex = findActiveTabIndex(pathname);

  // Keep a live ref so the PanResponder callbacks (created once) always read
  // the latest pathname without needing to be recreated on every render.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Swipe-to-navigate: left swipe → next tab, right swipe → previous tab.
  // PanResponder is lazily initialized once; handlers are only applied on native
  // (Platform.OS is a constant — it never changes at runtime).
  const isNative = Platform.OS !== "web";
  const panResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (panResponderRef.current === null) {
    panResponderRef.current = PanResponder.create({
      // Don't claim on touch start — let Pressable children handle taps normally.
      onStartShouldSetPanResponder: () => false,
      // Claim the gesture only when horizontal movement clearly dominates.
      onMoveShouldSetPanResponder: (_, { dx, dy }) => {
        const hasMinimumDistance = Math.abs(dx) > SWIPE_THRESHOLD;
        const isHorizontallyDominant =
          Math.abs(dx) > Math.abs(dy) * VERTICAL_TO_HORIZONTAL_RATIO;
        return hasMinimumDistance && isHorizontallyDominant;
      },
      onPanResponderRelease: (_, { dx }) => {
        const currentIndex = findActiveTabIndex(pathnameRef.current);
        if (currentIndex === -1) return;
        if (dx < -SWIPE_THRESHOLD && currentIndex < EAGLE_EYE_TABS.length - 1) {
          router.push(EAGLE_EYE_TABS[currentIndex + 1].href);
        } else if (dx > SWIPE_THRESHOLD && currentIndex > 0) {
          router.push(EAGLE_EYE_TABS[currentIndex - 1].href);
        }
      },
    });
  }
  const panResponder = panResponderRef.current;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
      ]}
      {...(isNative ? panResponder.panHandlers : {})}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {EAGLE_EYE_TABS.map((tab, index) => {
          // When activeTabIndex is -1 (no route match), all tabs show as inactive — correct fallback.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: UITokens.spacing.sm,
    gap: UITokens.spacing.xs,
    alignItems: "center",
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
