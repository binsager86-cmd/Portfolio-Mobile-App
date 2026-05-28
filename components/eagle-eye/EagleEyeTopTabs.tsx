import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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

export function EagleEyeTopTabs() {
  const { colors } = useThemeStore();
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const activeTextColor = "#ffffff";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {EAGLE_EYE_TABS.map((tab) => {
          const active = tab.matches.some((prefix) =>
            prefix === "/eagle-eye" ? pathname === prefix : pathname.startsWith(prefix)
          );

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
