/* eslint-disable custom-styles/no-hardcoded-styles */

import { BehavioralDnaScreenContent } from "@/components/eagle-eye/BehavioralDnaScreenContent";
import { EE } from "@/constants/eagleEyeStrings";
import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
import {
  useEagleEyeDna,
  useEagleEyeDnaRecentBars,
  useEagleEyeStock,
} from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EagleEyeDnaScreen() {
  const params = useLocalSearchParams<{ ticker: string }>();
  const rawParam = params.ticker ?? "";
  const ticker = rawParam.replace(/-dna$/i, "").toUpperCase().trim();

  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useEagleEyeDna(ticker);
  const { data: stockData } = useEagleEyeStock(ticker, 0, !!ticker);
  const {
    data: recentBarsData,
    isLoading: isRecentBarsLoading,
    isError: isRecentBarsError,
  } = useEagleEyeDnaRecentBars(ticker, !!ticker);

  const isPending = data?.status === "pending";
  const isUnavailable = data?.status === "unavailable";
  const isServerError = data?.status === "error";
  const dna = data?.data;
  const screenTitle = `Behavioral DNA - ${ticker}`;

  if (isLoading) {
    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
      </ScreenFrame>
    );
  }

  if (isPending) {
    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
          <Text style={[styles.errorText, { color: colors.textMuted, marginTop: UITokens.spacing.sm }]}>Computing Behavioral DNA...</Text>
          <Text style={[styles.helperText, { color: colors.textMuted, textAlign: "center" }]}>
            {data?.message ?? "This runs in the background. Check back in a few minutes."}
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  if (isError || isServerError || !dna) {
    if (isUnavailable) {
      return (
        <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top}>
          <View style={styles.centred}>
            <FontAwesome name="bar-chart" size={28} color={colors.textMuted} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Insufficient Price History</Text>
            <Text style={[styles.helperText, { color: colors.textMuted, textAlign: "center" }]}>
              {data?.message ?? "Not enough trading history to build Behavioral DNA for this stock."}
            </Text>
          </View>
        </ScreenFrame>
      );
    }

    return (
      <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top}>
        <View style={styles.centred}>
          <FontAwesome name="exclamation-triangle" size={28} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {isServerError && data?.message ? data.message : EE.errorLoading}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={styles.retryBtnText}>{EE.retry}</Text>
          </Pressable>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame title={screenTitle} colors={colors} topInset={insets.top}>
      <BehavioralDnaScreenContent
        ticker={ticker}
        dna={dna}
        stock={stockData?.data}
        recentBars={recentBarsData?.bars ?? []}
        recentBarsLoading={isRecentBarsLoading}
        recentBarsError={isRecentBarsError}
        colors={colors}
        bottomInset={insets.bottom}
      />
    </ScreenFrame>
  );
}

function ScreenFrame({
  title,
  colors,
  topInset,
  children,
}: {
  title: string;
  colors: ThemePalette;
  topInset: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: topInset }]}>
      <BackHeader title={title} colors={colors} />
      {children}
    </View>
  );
}

function BackHeader({ title, colors }: { title: string; colors: ThemePalette }) {
  const router = useRouter();

  return (
    <View style={[styles.backHeader, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={UITokens.spacing.sm}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 28,
  },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: UITokens.spacing.xl,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: UITokens.radius.md,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
});
