/**
 * useRTL — returns layout helpers that mirror for RTL locales (Arabic).
 *
 * Reads the current i18n direction from `react-i18next`. Falls back to
 * React Native's global `I18nManager.isRTL` when i18n is not available
 * (e.g. in test environments).
 *
 * Usage:
 *   const { isRTL, flexRow, textAlign, iconFlip } = useRTL();
 *
 *   <View style={{ flexDirection: flexRow }}>
 *     <Text style={{ textAlign }}>Hello</Text>
 *   </View>
 */

import { I18nManager } from "react-native";

let useTranslation: (() => { i18n: { dir(): string } }) | null = null;
try {
  // Lazy import so the hook still works without i18n in isolated tests
  useTranslation = require("react-i18next").useTranslation;
} catch {
  // react-i18next not available — fall back to I18nManager
}

export interface RTLLayout {
  isRTL: boolean;
  /** `'row-reverse'` in RTL, `'row'` in LTR. */
  flexRow: "row" | "row-reverse";
  /** `'right'` in RTL, `'left'` in LTR. */
  textAlign: "right" | "left";
  /** Scale X to -1 to flip directional icons (e.g. chevron, back arrow). */
  iconFlip: { transform: [{ scaleX: number }] };
}

export function useRTL(): RTLLayout {
  let isRTL = I18nManager.isRTL;

  if (useTranslation) {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { i18n } = useTranslation();
      isRTL = i18n.dir() === "rtl";
    } catch {
      // hook called outside provider — use I18nManager fallback
    }
  }

  return {
    isRTL,
    flexRow: isRTL ? "row-reverse" : "row",
    textAlign: isRTL ? "right" : "left",
    iconFlip: { transform: [{ scaleX: isRTL ? -1 : 1 }] },
  };
}
