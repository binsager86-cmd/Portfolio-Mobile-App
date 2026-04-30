import React, { useState } from "react";
import { Platform, StyleSheet, TextInput, type TextInputProps } from "react-native";

import { useAppTheme } from "@/theme";

type CurrencyCode = "KWD" | "USD";

interface CurrencyInputProps extends TextInputProps {
  currency?: CurrencyCode;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  currency = "KWD",
  value,
  onChangeText,
  style,
  ...props
}) => {
  const { colors, typography } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const handleChange = (text: string) => {
    const numeric = text.replace(/[^0-9.]/g, "");
    const parts = numeric.split(".");
    const formatted =
      parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
      (parts[1] ? `.${parts[1].slice(0, 2)}` : "");
    onChangeText?.(formatted);
  };

  return (
    <TextInput
      value={value}
      onChangeText={handleChange}
      keyboardType="decimal-pad"
      placeholder={currency === "KWD" ? "0.000" : "0.00"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.input,
        {
          color: colors.onSurface,
          borderColor: focused ? colors.primary : colors.outline,
          backgroundColor: colors.surface,
        },
        typography.body,
        style,
      ]}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    textAlign: Platform.select({ ios: "right", android: "right", default: "right" }),
  },
});
