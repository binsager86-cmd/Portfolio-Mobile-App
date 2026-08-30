 
import { Stack } from "expo-router";

/**
 * Stack navigator for the Eagle Eye tab.
 * - index           → scanner / stock list
 * - [ticker]        → stock detail
 * - [ticker]-dna    → DNA profile
 * - settings        → Eagle Eye settings
 * - trend-hold-book → auto paper-trading ledger for the trend-hold engine
 * - simulator       → paper trading simulator index (unrelated, 3-symbol
 *   backtest system -- do not confuse with trend-hold-book above)
 * - simulator/decision → decision transparency scanner
 * - simulator/decision/[ticker] → decision detail
 * - simulator/decision/[ticker]-dna → cycle history
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
      <Stack.Screen name="trend-hold-book" />
      <Stack.Screen name="simulator/index" />
      <Stack.Screen name="simulator/decision/index" />
      <Stack.Screen name="simulator/decision/[ticker]" />
      <Stack.Screen name="simulator/decision/[ticker]-dna" />
      <Stack.Screen name="simulator/[strategy]" />
      <Stack.Screen name="simulator/position/[id]" />
      <Stack.Screen name="methodology" />
    </Stack>
  );
}
