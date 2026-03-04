/**
 * Cross-platform Google Sign-In helper.
 *
 * - **Web:** Uses `expo-auth-session/providers/google` via the
 *   `useGoogleAuth` React hook. The hook calls `makeRedirectUri()`
 *   internally so the redirect URI always matches the current origin —
 *   no more port-mismatch errors when Expo picks 8081, 8082, etc.
 *
 * - **Native (iOS/Android):** Uses `@react-native-google-signin/google-signin`
 *   for an OS-native sign-in experience and returns a Google id_token.
 *
 * Both paths ultimately give the backend a Google token that it can
 * verify via tokeninfo / userinfo.
 */

import { useEffect, useCallback, useState } from "react";
import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/constants/Config";

// ── Types ───────────────────────────────────────────────────────────

export type GoogleAuthResult =
  | { success: true; idToken: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Hook for Web (used inside React components) ─────────────────────

/**
 * React hook that wraps `Google.useAuthRequest`.
 *
 * Returns:
 *   - `promptAsync()` — call this from a button press to open Google consent.
 *   - `result`        — the latest `GoogleAuthResult` (updates via useEffect).
 *   - `loading`       — true while waiting for the consent screen.
 *   - `ready`         — true once the auth request is ready to prompt.
 */
export function useGoogleAuth() {
  const [result, setResult] = useState<GoogleAuthResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-import so the Google provider isn't bundled for native-only builds
  const [hookData, setHookData] = useState<{
    request: any;
    response: any;
    promptAsync: () => Promise<any>;
  } | null>(null);

  // We need to use the hook at the top level — but since we can't
  // conditionally call hooks, we always call it (web) and no-op on native.
  // Instead, we use a wrapper component approach:
  // On web we initialise via dynamic import inside useEffect.

  // Actually the proper way: we define a custom wrapper that calls the
  // Google hook. But hooks can't be called conditionally or inside useEffect.
  // So we take a different approach: keep using AuthRequest but generate
  // the redirect URI dynamically every time.

  // ── APPROACH: Dynamic redirect via makeRedirectUri ──
  // This avoids the hook constraint while correctly adapting to any port.

  const promptGoogleSignIn = useCallback(async (): Promise<GoogleAuthResult> => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      console.error("[GoogleAuth] GOOGLE_WEB_CLIENT_ID is empty!");
      return {
        success: false,
        cancelled: false,
        error: "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
      };
    }

    console.log("[GoogleAuth] Starting sign-in on platform:", Platform.OS);

    if (Platform.OS !== "web") {
      return performNativeGoogleSignIn();
    }

    setLoading(true);
    try {
      const webResult = await performWebGoogleSignIn();
      setResult(webResult);
      return webResult;
    } finally {
      setLoading(false);
    }
  }, []);

  return { promptGoogleSignIn, result, loading };
}

// ── Standalone function (backward-compat) ───────────────────────────

export async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.error("[GoogleAuth] GOOGLE_WEB_CLIENT_ID is empty!");
    return {
      success: false,
      cancelled: false,
      error: "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
    };
  }

  console.log("[GoogleAuth] Starting sign-in on platform:", Platform.OS);

  if (Platform.OS === "web") {
    return performWebGoogleSignIn();
  }
  return performNativeGoogleSignIn();
}

// ── Web: implicit flow via expo-auth-session ────────────────────────

async function performWebGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const AuthSession = await import("expo-auth-session");
    const WebBrowser = await import("expo-web-browser");

    // Clean up any lingering browser auth sessions
    WebBrowser.maybeCompleteAuthSession();

    // Google OAuth 2.0 endpoints
    const discovery = {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
    };

    // ✅ Dynamic redirect URI — adapts to whatever port Expo picks
    // On web this returns the current window.location.origin (e.g. http://localhost:8081)
    // On native it uses the app scheme
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "portfolio-tracker",
      preferLocalhost: true,
    });

    console.log("[GoogleAuth] ────────────────────────────────────────");
    console.log("[GoogleAuth] Redirect URI:", redirectUri);
    console.log("[GoogleAuth] Client ID:", GOOGLE_WEB_CLIENT_ID.slice(0, 25) + "…");
    console.log("[GoogleAuth] ⚠️  Ensure this URI is in Google Console:");
    console.log("[GoogleAuth]    → APIs & Services → Credentials → OAuth 2.0 Client IDs");
    console.log("[GoogleAuth]    → Edit → Authorized redirect URIs");
    console.log("[GoogleAuth] ────────────────────────────────────────");

    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ["openid", "profile", "email"],
      responseType: AuthSession.ResponseType.Token, // implicit flow
      redirectUri,
      usePKCE: false, // implicit flow doesn't use PKCE
    });

    // Open the Google consent screen
    const result = await request.promptAsync(discovery);
    console.log("[GoogleAuth] Auth result type:", result.type);

    if (result.type === "cancel" || result.type === "dismiss") {
      return { success: false, cancelled: true };
    }

    if (result.type === "success") {
      const accessToken = result.params?.access_token;
      if (!accessToken) {
        console.error("[GoogleAuth] No access_token in response params:", result.params);
        return {
          success: false,
          cancelled: false,
          error: "Google did not return an access token.",
        };
      }
      console.log("[GoogleAuth] ✅ Got access_token (length:", accessToken.length, ")");
      return { success: true, idToken: accessToken };
    }

    console.warn("[GoogleAuth] Unexpected result:", JSON.stringify(result).slice(0, 300));
    return {
      success: false,
      cancelled: false,
      error: `Google Sign-In returned unexpected result: ${result.type}`,
    };
  } catch (err: any) {
    console.error("[GoogleAuth Web] Error:", err);
    return {
      success: false,
      cancelled: false,
      error: err?.message || "Google Sign-In failed unexpectedly.",
    };
  }
}

// ── Native: @react-native-google-signin ─────────────────────────────

async function performNativeGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const { GoogleSignin } = await import(
      "@react-native-google-signin/google-signin"
    );

    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      return {
        success: false,
        cancelled: false,
        error: "Google Sign-In did not return an ID token.",
      };
    }

    console.log("[GoogleAuth Native] ✅ Got id_token");
    return { success: true, idToken };
  } catch (err: any) {
    if (err?.code === "SIGN_IN_CANCELLED") {
      return { success: false, cancelled: true };
    }
    console.error("[GoogleAuth Native] Error:", err);
    return {
      success: false,
      cancelled: false,
      error: err?.message || "Google Sign-In failed on this device.",
    };
  }
}
