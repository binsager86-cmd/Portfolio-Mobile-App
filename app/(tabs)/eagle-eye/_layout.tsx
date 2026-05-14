 
import { Stack } from "expo-router";

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
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[ticker]" />
      <Stack.Screen name="[ticker]-dna" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="simulator/index" />
      <Stack.Screen name="simulator/[strategy]" />
      <Stack.Screen name="simulator/position/[id]" />
    </Stack>
  );
}
