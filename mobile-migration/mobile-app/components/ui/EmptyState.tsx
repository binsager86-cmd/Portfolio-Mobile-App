import React from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import { legacyColorAliases, tokens } from "@/theme/tokens";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon = "database-off",
  action,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon}
        size={48}
        color={legacyColorAliases.textSecondary}
      />
      <Text variant="titleMedium" style={styles.title}>{title}</Text>
      {description ? (
        <Text variant="bodyMedium" style={styles.desc}>{description}</Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing.xl,
  },
  title: {
    marginTop: tokens.spacing.sm,
    color: legacyColorAliases.text,
    textAlign: "center",
  },
  desc: {
    marginTop: tokens.spacing.xs,
    color: legacyColorAliases.textSecondary,
    textAlign: "center",
  },
});
