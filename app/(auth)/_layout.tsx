/**
 * Auth group layout — minimal wrapper, no tabs.
 */
import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/services/authStore";

export default function AuthLayout() {
  const token = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);

  // If auth succeeds asynchronously (e.g. Google OAuth callback on web),
  // leave auth pages immediately so the user does not need a second login tap.
  if (!isLoading && token) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
