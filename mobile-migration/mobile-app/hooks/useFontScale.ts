import { Platform, useWindowDimensions } from "react-native";

export function useFontScale() {
  const { width } = useWindowDimensions();
  const base = Platform.OS === "web" ? 16 : 14;

  return (size: number) => {
    const normalized = (size / base) * base;
    const scaled = normalized * (width > 400 ? 1.1 : 1);
    return Math.max(12, Math.min(scaled, 32));
  };
}
