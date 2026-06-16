/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * BadgeHelpTooltip
 *
 * Wraps a badge/number and shows helper text:
 * - mobile/tablet: tap opens modal
 * - web: hover shows inline tooltip
 */

import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import React, { type ReactNode, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

interface BadgeHelpTooltipProps {
  title: string;
  body: string;
  children: ReactNode;
  align?: "left" | "right";
}

export function BadgeHelpTooltip({
  title,
  body,
  children,
  align = "left",
}: BadgeHelpTooltipProps) {
  const { colors } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const showWebTooltip = Platform.OS === "web" && hovered;

  return (
    <View style={styles.anchor}>
      <Pressable
        onPress={(event) => {
          (event as any).stopPropagation?.();
          if (Platform.OS !== "web") {
            setOpen(true);
          }
        }}
        onPressIn={(event) => {
          (event as any).stopPropagation?.();
        }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityLabel={`Info: ${title}`}
        accessibilityHint={body}
        style={Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : undefined}
      >
        {children}
      </Pressable>

      {showWebTooltip ? (
        <View
          pointerEvents="none"
          style={[
            styles.webTooltip,
            align === "right" ? styles.webTooltipRight : styles.webTooltipLeft,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <Text style={[styles.title, { color: colors.accentPrimary }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
        </View>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityRole="button">
          <Pressable
            onPress={(event) => {
              (event as any).stopPropagation?.();
            }}
            style={[
              styles.modalCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[styles.title, { color: colors.accentPrimary }]}>{title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              style={[styles.close, { borderTopColor: colors.borderColor }]}
            >
              <Text style={[styles.closeText, { color: colors.accentPrimary }]}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "relative",
  },
  webTooltip: {
    position: "absolute",
    top: "100%",
    marginTop: 6,
    width: 240,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    zIndex: 90,
    ...UITokens.shadows.card,
  },
  webTooltipLeft: {
    left: 0,
  },
  webTooltipRight: {
    right: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    ...UITokens.shadows.card,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
  },
  close: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
    alignItems: "center",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
