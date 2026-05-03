export const tokens = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const,
  radii: { sm: 6, md: 12, lg: 16, pill: 999, full: 9999 } as const,
  colors: {
    primary: "#0A66C2",
    primaryContainer: "#E6F0FA",
    surface: "#FFFFFF",
    surfaceVariant: "#F8FAFC",
    background: "#F1F5F9",
    onSurface: "#0F172A",
    onSurfaceVariant: "#475569",
    border: "#E2E8F0",
    error: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
  } as const,
  dark: {
    surface: "#0F172A",
    surfaceVariant: "#1E293B",
    background: "#0B1120",
    onSurface: "#F8FAFC",
    onSurfaceVariant: "#94A3B8",
    border: "#334155",
    primaryContainer: "#1E3A8A",
  } as const,
  typography: {
    display: { fontSize: 28, fontWeight: "700", lineHeight: 36 },
    h1: { fontSize: 24, fontWeight: "700", lineHeight: 32 },
    h2: { fontSize: 20, fontWeight: "600", lineHeight: 28 },
    body: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
    label: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  } as const,
  shadows: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px rgba(0,0,0,0.07)",
    lg: "0 10px 15px rgba(0,0,0,0.1)",
  } as const,
} as const;

// Backward-compatible aliases for existing components still reading old keys.
export const legacyColorAliases = {
  primaryLight: tokens.colors.primaryContainer,
  text: tokens.colors.onSurface,
  textSecondary: tokens.colors.onSurfaceVariant,
} as const;

export type ThemeTokens = typeof tokens;