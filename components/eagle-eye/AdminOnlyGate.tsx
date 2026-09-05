/**
 * AdminOnlyGate — screen-level defense-in-depth for the Eagle Eye
 * admin-only routes (Simulator, Trend-Hold Book).
 *
 * EagleEyeTopTabs.tsx already hides these tabs from non-admins, and the
 * backend rejects non-admin tokens on these routers too (require_admin).
 * This gate closes the remaining gap: a non-admin who reaches the route
 * directly (a stale deep link, a bookmark, manual URL entry) still sees a
 * blocked message instead of the screen's content, matching the pattern
 * app/(tabs)/admin.tsx already established for the Admin Dashboard.
 */
import { UITokens } from "@/constants/uiTokens";
import { useAdminGate } from "@/hooks/useAdminGate";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

export function AdminOnlyGate({
  children,
  message = "Admin access required.",
}: {
  children: React.ReactNode;
  message?: string;
}) {
  const { colors } = useThemeStore();
  const { isAdmin, isLoading } = useAdminGate();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: UITokens.spacing.lg }}>
        <Text style={{ color: colors.textMuted, fontSize: UITokens.typography.body.size, textAlign: "center" }}>
          {message}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
