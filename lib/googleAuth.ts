/**
 * Cross-platform Google Sign-In helper.
 *
 * - Web: Implicit OAuth 2.0 flow via expo-auth-session.
 *   Returns a Google access_token (the implicit flow does NOT return
 *   id_tokens). The backend accepts both id_token and access_token.
 *
 * - Native (iOS/Android): @react-native-google-signin/google-signin.
 *   Returns a Google id_token.
 */

import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/constants/Config";

// ── Types ───────────────────────────────────────────────────────────

export type GoogleAuthResult =
  | { success: true; idToken: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Public API ──────────────────────────────────────────────────────

export async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.error("[GoogleAuth] GOOGLE_WEB_CLIENT_ID is empty!");
    return {
      success: false,
      cancelled: false,
      error:
        "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
    };
  }

  console.log("[GoogleAuth] Starting sign-in on platform:", Platform.OS);
  console.log("[GoogleAuth] Client ID:", GOOGLE_WEB_CLIENT_ID.slice(0, 20) + "…");

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

    // Google OAuth 2.0 endpoints (explicit — no discovery doc fetch)
    const discovery = {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
    };

    // Build redirect URI — must match what Google Console has
    const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });
    console.log("[GoogleAuth] Redirect URI:", redirectUri);
    console.log("[GoogleAuth] ⚠️  Make sure this EXACT URI is in Google Console → Authorized redirect URIs");

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
      console.log("[GoogleAuth] Got access_token ✅ (length:", accessToken.length, ")");
      // Backend /auth/google accepts both id_token and access_token
      return { success: true, idToken: accessToken };
    }

    // Unexpected result type
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

    console.log("[GoogleAuth Native] Got id_token ✅");
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
