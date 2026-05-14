/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * SafetyConfirmModal — confirmation dialog for large/risky positions.
 *
 * Auto-shown when FullStockAnalysis.requires_confirmation === true.
 * Shows worst-case drawdown, position size suggestion, proceed / reduce options.
 */
import { EE } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface SafetyConfirmModalProps {
  visible: boolean;
  ticker: string;
  positionSizePct?: number | null;
  worstCasePct?: string | null;
  onProceed: () => void;
  onReduce: () => void;
  onDismiss: () => void;
}

export const SafetyConfirmModal = React.memo(function SafetyConfirmModal({
  visible,
  ticker,
  positionSizePct,
  worstCasePct,
  onProceed,
  onReduce,
  onDismiss,
}: SafetyConfirmModalProps) {
  const { colors } = useThemeStore();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <FontAwesome
                  name="warning"
                  size={20}
                  color={colors.warning}
                  style={styles.headerIcon}
                />
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {EE.safetyTitle}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

              {/* Ticker */}
              <Text style={[styles.tickerLabel, { color: colors.accentPrimary }]}>
                {ticker}
              </Text>

              {/* Position size */}
              {positionSizePct != null && (
                <View
                  style={[
                    styles.infoRow,
                    { backgroundColor: colors.warningBg },
                  ]}
                >
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                    {EE.suggestedSize}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.warning }]}>
                    {positionSizePct.toFixed(1)}%
                  </Text>
                </View>
              )}

              {/* Worst case */}
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {worstCasePct
                  ? EE.safetyWorstCase(worstCasePct)
                  : EE.safetyInsufficientHistory}
              </Text>

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable
                  onPress={onReduce}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnOutline,
                    {
                      borderColor: colors.borderColor,
                      backgroundColor: pressed
                        ? colors.bgCardHover
                        : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.btnText, { color: colors.textSecondary }]}>
                    {EE.reduceSize}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onProceed}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnFill,
                    {
                      backgroundColor: pressed
                        ? colors.accentSecondary
                        : colors.accentPrimary,
                    },
                  ]}
                >
                  <Text style={[styles.btnText, { color: "#fff" }]}>
                    {EE.proceedAnyway}
                  </Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: UITokens.spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    borderRadius: UITokens.radius.lg,
    borderWidth: 1,
    padding: UITokens.spacing.lg,
    gap: UITokens.spacing.md,
    ...UITokens.shadows.elevated,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: UITokens.spacing.sm,
  },
  headerIcon: {
    marginTop: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  tickerLabel: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm,
    borderRadius: UITokens.radius.sm,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: UITokens.spacing.sm,
    marginTop: UITokens.spacing.xs,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: UITokens.radius.md,
    alignItems: "center",
  },
  btnOutline: {
    borderWidth: 1,
  },
  btnFill: {},
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
