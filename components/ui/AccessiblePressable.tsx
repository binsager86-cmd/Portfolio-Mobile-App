import React from "react";
import { Platform, Pressable, type PressableProps } from "react-native";

import { useHaptics } from "@/hooks/useHaptics";

interface AccessiblePressableProps extends PressableProps {
  a11yLabel: string;
  role?: "button" | "link";
}

export const AccessiblePressable: React.FC<AccessiblePressableProps> = ({
  children,
  a11yLabel,
  role = "button",
  onPress,
  ...props
}) => {
  const haptic = useHaptics();

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={a11yLabel}
      hitSlop={Platform.select({ ios: 8, android: 8, default: 12 })}
      onPress={(e) => {
        haptic.light();
        onPress?.(e);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
};
