/**
 * Cross-platform Google Sign-In helper.
 *
 * - **Web:** Uses `expo-auth-session` with `AuthRequest` (implicit flow,
 *   `response_type=token`). Returns a Google **access_token** which the
 *   backend verifies via the `/oauth2/v3/userinfo` endpoint.
 *
 * - **Native (iOS/Android):** Uses `@react-native-google-signin/google-signin`
 *   for an OS-native sign-in experience and returns a Google **id_token**.
 *
 * IMPORTANT: `WebBrowser.maybeCompleteAuthSession()` is called at module
 * level in `app/_layout.tsx`. This is required for the OAuth popup to
 * properly relay the token back to the parent window on web.
 */

import { GOOGLE_WEB_CLIENT_ID } from "@/constants/Config";
import { Platform } from "react-native";

// ── Types ───────────────────────────────────────────────────────────

export type GoogleAuthResult =
  | { success: true; idToken: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Standalone entry point (used in register.tsx / login.tsx) ────────

/**
 * Perform Google Sign-In on the current platform.
 *
 * Returns a `GoogleAuthResult`:
 *   - On web  → `{ success: true, idToken: <access_token> }`
 *   - Native  → `{ success: true, idToken: <id_token> }`
 *   - Failure → `{ success: false, cancelled, error }`
 */
export async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    if (__DEV__) console.error("[GoogleAuth] GOOGLE_WEB_CLIENT_ID is empty!");
    return {
      success: false,
      cancelled: false,
      error: "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
    };
  }

  if (__DEV__) console.info("[GoogleAuth] Starting sign-in on platform:", Platform.OS);

  if (Platform.OS === "web") {
    return performWebGoogleSignIn();
  }
  return performNativeGoogleSignIn();
}

// ── Web: implicit flow via expo-auth-session ────────────────────────

async function performWebGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const AuthSession = await import("expo-auth-session");

    // Google OAuth 2.0 endpoints
    const discovery: import("expo-auth-session").DiscoveryDocument = {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
    };

    // ✅ Dynamic redirect URI — adapts to whatever port Expo picks
    // On web this uses the current origin (e.g. http://localhost:8081)
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "portfolio-tracker",
      preferLocalhost: true,
    });

    if (__DEV__) {
      console.info("[GoogleAuth] Redirect URI:", redirectUri);
    }

    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ["openid", "profile", "email"],
      responseType: AuthSession.ResponseType.Token, // implicit flow
      redirectUri,
      usePKCE: false, // implicit flow doesn't use PKCE
    });

    // CSRF protection for the URL-hash redirect fallback path: stash the
    // randomly-generated `state` so `app/_layout.tsx` can verify any
    // returned `#access_token=...&state=...` was issued by *this* request
    // and not injected by an attacker via a crafted link. Use localStorage
    // because Google's full-page redirect can wipe sessionStorage in some
    // browsers / privacy modes.
    if (typeof window !== "undefined" && request.state) {
      try { window.localStorage.setItem("google_oauth_state", request.state); } catch { /* storage may be disabled */ }
    }

    // Open the Google consent screen in a popup
    if (__DEV__) console.info("[GoogleAuth] Opening Google consent screen…");
    const result = await request.promptAsync(discovery);

    if (__DEV__) console.info("[GoogleAuth] Auth result type:", result.type);

    if (result.type === "cancel" || result.type === "dismiss") {
      if (__DEV__) console.info("[GoogleAuth] User cancelled/dismissed the consent screen");
      return { success: false, cancelled: true };
    }

    if (result.type === "success") {
      const accessToken = result.params?.access_token;
      if (!accessToken) {
        if (__DEV__) console.error("[GoogleAuth] ❌ No access_token in response params");
        return {
          success: false,
          cancelled: false,
          error: "Google did not return an access token.",
        };
      }
      if (__DEV__) console.info("[GoogleAuth] ✅ Got access_token");
      // We return it as `idToken` for backward compatibility with the
      // auth store which calls `apiGoogleSignIn(idToken)`. The backend
      // accepts both real ID tokens and access tokens.
      return { success: true, idToken: accessToken };
    }

    // Handle error responses (e.g., access_denied, server_error)
    if (result.type === "error") {
      const errorCode = result.params?.error || "unknown_error";
      const errorDesc = result.params?.error_description || "Google Sign-In returned an error.";
      if (__DEV__) console.error("[GoogleAuth] ❌ Error response:", errorCode);
      return {
        success: false,
        cancelled: false,
        error: `${errorCode}: ${errorDesc}`,
      };
    }

    if (__DEV__) console.warn("[GoogleAuth] ⚠️ Unexpected result type:", result.type);
    return {
      success: false,
      cancelled: false,
      error: `Google Sign-In returned unexpected result: ${result.type}`,
    };
  } catch (err: unknown) {
    if (__DEV__) console.error("[GoogleAuth Web] ❌ Exception:", err);
    return {
      success: false,
      cancelled: false,
      error: err instanceof Error ? err.message : "Google Sign-In failed unexpectedly.",
    };
  }
}

// ── Native: @react-native-google-signin/google-signin ──────────────
//
// Why not expo-auth-session here?
//   On Android the only redirect URI it can produce is a custom scheme
//   like `portfolio-tracker://`, which Google's OAuth Web client rejects
//   ("redirect_uri is not allowed for the given client"). The native SDK
//   sidesteps redirect URIs entirely — Google authorizes the call by
//   matching the app's package name + SHA-1 fingerprint to an Android
//   OAuth client registered in the same Google Cloud project.
//
// Returns a real Google **id_token** (JWT) which the backend verifies
// with Google's token-info endpoint. The audience of that JWT is the
// Web client ID we pass as `webClientId` below.
//
// Requirements (one-time, in Google Cloud Console):
//   1. An **Android** OAuth client must exist with:
//        - package name: com.portfoliotracker.app
//        - SHA-1 fingerprint of the keystore signing the build
//          (run `eas credentials -p android` to view).
//   2. The **Web** OAuth client ID below must be in the SAME project.
//
// This flow does NOT work in Expo Go — requires a dev or production
// build (which the user is already shipping via EAS).

let nativeSdkConfigured = false;

export async function performNativeGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const mod = await import("@react-native-google-signin/google-signin");
    const { GoogleSignin } = mod;

    if (!nativeSdkConfigured) {
      GoogleSignin.configure({
        // `webClientId` is what makes the returned id_token's audience
        // equal to our Web client — which is what the backend validates.
        webClientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ["openid", "profile", "email"],
        offlineAccess: false,
      });
      nativeSdkConfigured = true;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    if (__DEV__) console.info("[GoogleAuth Native] Opening native sign-in…");
    const response = await GoogleSignin.signIn();

    // SDK v13+ returns { type: "success" | "cancelled", data? }; older
    // versions returned the user object directly. Normalise both shapes.
    type SignInUserData = { idToken?: string | null };
    type SignInResponse =
      | { type: "success"; data: SignInUserData }
      | { type: "cancelled" }
      | SignInUserData;
    const r = response as SignInResponse;

    let idToken: string | null | undefined;
    if (typeof r === "object" && r !== null && "type" in r) {
      if (r.type === "cancelled") {
        if (__DEV__) console.info("[GoogleAuth Native] User cancelled");
        return { success: false, cancelled: true };
      }
      if (r.type === "success") {
        idToken = r.data?.idToken;
      }
    } else {
      idToken = (r as SignInUserData)?.idToken;
    }

    if (!idToken) {
      return {
        success: false,
        cancelled: false,
        error: "Google did not return an id_token. Check that an Android OAuth client with this app's SHA-1 exists in Google Cloud Console.",
      };
    }

    if (__DEV__) console.info("[GoogleAuth Native] ✅ Got id_token (length:", idToken.length, ")");
    return { success: true, idToken };
  } catch (err: unknown) {
    if (__DEV__) console.error("[GoogleAuth Native] ❌ Error:", err);

    // Map @react-native-google-signin status codes to friendlier messages.
    const e = err as { code?: string; message?: string };
    try {
      const { statusCodes } = await import("@react-native-google-signin/google-signin");
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, cancelled: true };
      }
      if (e?.code === statusCodes.IN_PROGRESS) {
        return { success: false, cancelled: false, error: "Sign-in already in progress." };
      }
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, cancelled: false, error: "Google Play Services is required." };
      }
      if (e?.code === statusCodes.SIGN_IN_REQUIRED || e?.code === "DEVELOPER_ERROR") {
        return {
          success: false,
          cancelled: false,
          error: "Google rejected this app. The Android OAuth client (package + SHA-1) is missing or the Web client ID is from a different Google Cloud project.",
        };
      }
    } catch {
      /* statusCodes import failed — fall through */
    }

    return {
      success: false,
      cancelled: false,
      error: e?.message || "Google Sign-In failed on this device.",
    };
  }
}
