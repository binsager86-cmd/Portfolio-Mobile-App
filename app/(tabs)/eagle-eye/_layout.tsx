import { Stack } from "expo-router";
import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { hasExpertiseAccess, useUserPrefsStore } from "@/src/store/userPrefsStore";

/**
 * Stack navigator for the Eagle Eye tab.
 * - index           → scanner / stock list
 * - [ticker]        → stock detail
 * - [ticker]-dna    → DNA profile
 * - settings        → Eagle Eye settings
 * - simulator       → paper trading simulator index
 * - simulator/[strategy]            → strategy detail
 * - simulator/position/[id]         → position detail
 */
export default function EagleEyeLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  useEffect(() => {
    if (!pathname.includes("/eagle-eye/simulator")) return;
    if (hasExpertiseAccess(expertiseLevel, "advanced")) return;
    router.replace("/(tabs)/eagle-eye");
  }, [expertiseLevel, pathname, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[ticker]" />
      <Stack.Screen name="[ticker]-dna" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="simulator/index" />
      <Stack.Screen name="simulator/[strategy]" />
      <Stack.Screen name="simulator/position/[id]" />
      <Stack.Screen name="methodology" />
    </Stack>
  );
}
