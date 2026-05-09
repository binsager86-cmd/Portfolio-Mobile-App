import { useCallback, useMemo } from "react";
import { useUserPrefsStore, type ExpertiseLevel } from "@/src/store/userPrefsStore";

const LEVEL_ORDER: ExpertiseLevel[] = ["normal", "intermediate", "advanced"];

export function useFeatureVisibility() {
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const hasAccess = useCallback(
    (minLevel: ExpertiseLevel): boolean =>
      LEVEL_ORDER.indexOf(expertiseLevel) >= LEVEL_ORDER.indexOf(minLevel),
    [expertiseLevel],
  );

  return useMemo(() => ({
    expertiseLevel,
    isNormal: expertiseLevel === "normal",
    isIntermediate: expertiseLevel === "intermediate",
    isAdvanced: expertiseLevel === "advanced",
    hasAccess,
  }), [expertiseLevel, hasAccess]);
}
