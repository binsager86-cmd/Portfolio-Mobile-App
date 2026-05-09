import { useColorScheme } from "react-native";
import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

import { tokens } from "./tokens";

export function useAppTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  const c = isDark ? tokens.dark : undefined;

  const colors = {
    ...base.colors,
    primary: tokens.colors.primary,
    primaryContainer: c?.primaryContainer ?? tokens.colors.primaryContainer,
    background: c?.background ?? tokens.colors.background,
    surface: c?.surface ?? tokens.colors.surface,
    surfaceVariant: c?.surfaceVariant ?? tokens.colors.surfaceVariant,
    onSurface: c?.onSurface ?? tokens.colors.onSurface,
    onSurfaceVariant: c?.onSurfaceVariant ?? tokens.colors.onSurfaceVariant,
    error: tokens.colors.error,
    outline: c?.border ?? tokens.colors.border,
  };

  return {
    ...base,
    colors,
    typography: tokens.typography,
    spacing: tokens.spacing,
    radii: tokens.radii,
    shadows: tokens.shadows,
    isDark,
  } as const;
}
