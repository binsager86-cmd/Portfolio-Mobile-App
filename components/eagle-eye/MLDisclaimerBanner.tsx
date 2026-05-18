/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * MLDisclaimerBanner — Phase 3 mandatory experimental disclaimer.
 *
 * Appears at the top of the scanner page.  Dismissible per session
 * (just a local useState — reappears on every fresh mount / new session).
 * NOT permanently dismissible by design.
 *
 * When ML is auto-disabled, the message changes to reflect that state.
 */
import { EE } from "@/constants/eagleEyeStrings";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface MLDisclaimerBannerProps {
  autoDisabled?: boolean;
  disabledReason?: string | null;
}

export function MLDisclaimerBanner({
  autoDisabled = false,
  disabledReason,
}: MLDisclaimerBannerProps) {
  const { colors } = useThemeStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const bgColor = autoDisabled ? "#7F1D1D" : "#78350F";
  const borderColor = autoDisabled ? "#EF4444" : "#F59E0B";

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: bgColor, borderColor },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconRow}>
        <FontAwesome name="exclamation-triangle" size={14} color="#FCD34D" />
        <Text style={styles.title}>
          {autoDisabled
            ? EE.mlAutoDisabled
            : EE.mlDisclaimerTitle}
        </Text>
      </View>

      {!autoDisabled && (
        <Text style={styles.body}>{EE.mlDisclaimerBody}</Text>
      )}

      {autoDisabled && disabledReason && (
        <Text style={styles.body}>{disabledReason}</Text>
      )}

      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={8}
        style={styles.dismissBtn}
        accessibilityRole="button"
        accessibilityLabel={EE.mlDisclaimerDismiss}
      >
        <Text style={styles.dismissText}>{EE.mlDisclaimerDismiss}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: "#FCD34D",
    fontWeight: "700",
    fontSize: 12,
    flex: 1,
    flexWrap: "wrap",
  },
  body: {
    color: "#FDE68A",
    fontSize: 11,
    lineHeight: 16,
  },
  dismissBtn: {
    alignSelf: "flex-end",
    marginTop: 2,
  },
  dismissText: {
    color: "#FCD34D",
    fontSize: 11,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
